-- 1. Tipos aceitos
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
UPDATE public.stock_movements SET type = 'venda' WHERE type = 'saida';
UPDATE public.stock_movements SET type = 'ajuste' WHERE type = 'entrada';
UPDATE public.stock_movements SET type = 'ajuste_contagem' WHERE type = 'contagem';
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('compra','venda','consumo_receita','ajuste','perda','ajuste_contagem'));

-- 2. Sinal de cada movimento
CREATE OR REPLACE FUNCTION public.stock_movement_delta(_type text, _qty numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _type = 'compra' THEN abs(_qty)
    WHEN _type IN ('venda','consumo_receita','perda') THEN -abs(_qty)
    ELSE _qty END
$$;

-- 3. Backfill: saldo atual vira ponto de partida (ajuste_contagem da diferença)
INSERT INTO public.stock_movements (user_id, product_id, type, quantity, reason)
SELECT p.user_id, p.id, 'ajuste_contagem',
       p.stock - COALESCE(s.total, 0), 'Saldo inicial (migração)'
FROM public.products p
LEFT JOIN (SELECT product_id, sum(public.stock_movement_delta(type, quantity)) AS total
           FROM public.stock_movements GROUP BY product_id) s ON s.product_id = p.id
WHERE p.stock - COALESCE(s.total, 0) <> 0;

-- 4. Normaliza tipos antigos enviados por funções legadas
CREATE OR REPLACE FUNCTION public.normalize_stock_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type = 'saida' THEN NEW.type := 'venda';
  ELSIF NEW.type = 'entrada' THEN NEW.type := 'ajuste';
  ELSIF NEW.type = 'contagem' THEN NEW.type := 'ajuste_contagem';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_movements_normalize BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.normalize_stock_movement();

-- 5. Saldo = soma dos movimentos
CREATE OR REPLACE FUNCTION public.recalc_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  PERFORM set_config('app.stock_sync', '1', true);
  UPDATE public.products SET stock = COALESCE((
    SELECT round(sum(public.stock_movement_delta(type, quantity)))::int
    FROM public.stock_movements WHERE product_id = _pid), 0)
  WHERE id = _pid;
  PERFORM set_config('app.stock_sync', '', true);
  RETURN NULL;
END $$;
CREATE TRIGGER stock_movements_recalc AFTER INSERT OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.recalc_product_stock();

-- 6. Bloqueia escrita direta do saldo
CREATE OR REPLACE FUNCTION public.guard_product_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock
     AND COALESCE(current_setting('app.stock_sync', true), '') <> '1' THEN
    NEW.stock := OLD.stock;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_guard_stock BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock();

-- 7. Estoque informado no cadastro vira movimento de ajuste
CREATE OR REPLACE FUNCTION public.product_initial_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _init int := NEW.stock;
BEGIN
  IF _init <> 0 THEN
    PERFORM set_config('app.stock_sync', '1', true);
    UPDATE public.products SET stock = 0 WHERE id = NEW.id;
    PERFORM set_config('app.stock_sync', '', true);
    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, reason)
    VALUES (COALESCE(auth.uid(), NEW.user_id), NEW.id, 'ajuste', _init, 'Saldo inicial no cadastro');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER products_initial_stock AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.product_initial_stock();

-- 8. confirm_purchase sem escrita direta de saldo
CREATE OR REPLACE FUNCTION public.confirm_purchase(_purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  p public.purchases%ROWTYPE; it record; prod public.products%ROWTYPE;
  unit_cost numeric; new_cost numeric; pct numeric; alerts int := 0; n int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas administradores podem confirmar compras'; END IF;
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada'; END IF;
  IF p.status <> 'rascunho' THEN RAISE EXCEPTION 'Compra já confirmada'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_items WHERE purchase_id = _purchase_id AND product_id IS NULL) THEN
    RAISE EXCEPTION 'Há itens sem produto associado';
  END IF;
  FOR it IN SELECT * FROM public.purchase_items WHERE purchase_id = _purchase_id AND quantity > 0 LOOP
    SELECT * INTO prod FROM public.products WHERE id = it.product_id FOR UPDATE;
    unit_cost := it.total_value / it.quantity;
    IF COALESCE(prod.purchase_price,0) > 0 AND prod.stock > 0 THEN
      new_cost := (prod.stock * prod.purchase_price + it.quantity * unit_cost) / (prod.stock + it.quantity);
    ELSE
      new_cost := unit_cost; -- custo desconhecido: não dilui com saldo antigo
    END IF;
    new_cost := round(new_cost, 4);
    IF COALESCE(prod.purchase_price,0) > 0 THEN
      pct := (new_cost - prod.purchase_price) / prod.purchase_price * 100;
      IF abs(pct) > 5 THEN
        INSERT INTO public.cost_change_events(product_id, purchase_id, old_cost, new_cost, change_pct)
        VALUES (prod.id, _purchase_id, prod.purchase_price, new_cost, round(pct, 2));
        alerts := alerts + 1;
      END IF;
    END IF;
    UPDATE public.products SET purchase_price = new_cost, updated_at = now() WHERE id = prod.id;
    INSERT INTO public.stock_movements(user_id, product_id, type, quantity, reason, reference, unit_cost)
    VALUES (auth.uid(), prod.id, 'compra', round(it.quantity)::int, 'Compra ' || COALESCE(NULLIF(p.supplier,''), p.source), _purchase_id::text, round(unit_cost,4));
    INSERT INTO public.price_history(product_id, purchase_price, sale_price) VALUES (prod.id, new_cost, prod.sale_price);
    n := n + 1;
  END LOOP;
  UPDATE public.purchases SET status = 'confirmada', confirmed_at = now(),
    total = COALESCE((SELECT sum(total_value) FROM public.purchase_items WHERE purchase_id = _purchase_id),0)
  WHERE id = _purchase_id;
  RETURN jsonb_build_object('items', n, 'alerts', alerts);
END $function$;

-- 9. Registro de compra completo em uma única transação
CREATE OR REPLACE FUNCTION public.register_purchase(_supplier text, _source text, _items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _pid uuid; _prod uuid; it record; _total numeric := 0;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Apenas administradores podem registrar compras'; END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'A compra não tem itens'; END IF;
  INSERT INTO public.purchases (user_id, supplier, source, total, status)
  VALUES (_uid, COALESCE(_supplier,''), _source, 0, 'rascunho') RETURNING id INTO _pid;
  FOR it IN SELECT * FROM jsonb_to_recordset(_items) AS x(product_id uuid, description text, quantity numeric, unit text, total_value numeric) LOOP
    IF COALESCE(it.quantity,0) <= 0 THEN RAISE EXCEPTION 'Quantidade inválida no item "%"', it.description; END IF;
    IF COALESCE(it.total_value,0) < 0 THEN RAISE EXCEPTION 'Valor inválido no item "%"', it.description; END IF;
    _prod := it.product_id;
    IF _prod IS NULL THEN
      INSERT INTO public.products (user_id, name, description, brand, category, purchase_price, sale_price, stock, low_stock_threshold, needs_review, sells, used_in_recipes, purchase_unit)
      VALUES (_uid, COALESCE(NULLIF(it.description,''),'Item sem nome'), '', '', 'outro', 0, 0, 0, 5, true, false, true, COALESCE(NULLIF(it.unit,''),'un'))
      RETURNING id INTO _prod;
    END IF;
    INSERT INTO public.purchase_items (purchase_id, product_id, original_description, quantity, unit, total_value)
    VALUES (_pid, _prod, COALESCE(it.description,''), it.quantity, COALESCE(it.unit,''), it.total_value);
  END LOOP;
  RETURN public.confirm_purchase(_pid) || jsonb_build_object('purchase_id', _pid);
END $$;

-- 10. Compras e Custos: apenas admin
DROP POLICY IF EXISTS "Insert own purchases" ON public.purchases;
DROP POLICY IF EXISTS "Auth read purchases" ON public.purchases;
DROP POLICY IF EXISTS "Update own draft purchases" ON public.purchases;
DROP POLICY IF EXISTS "Delete own draft purchases" ON public.purchases;
CREATE POLICY "Admin manage purchases" ON public.purchases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Auth read purchase items" ON public.purchase_items;
DROP POLICY IF EXISTS "Manage items of own draft" ON public.purchase_items;
CREATE POLICY "Admin manage purchase items" ON public.purchase_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Auth read cost events" ON public.cost_change_events;
CREATE POLICY "Admin read cost events" ON public.cost_change_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Authenticated read costs" ON public.costs;
DROP POLICY IF EXISTS "Users insert own costs" ON public.costs;
DROP POLICY IF EXISTS "Users delete own costs" ON public.costs;
CREATE POLICY "Admin read costs" ON public.costs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insert costs" ON public.costs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND user_id = auth.uid());
CREATE POLICY "Admin delete costs" ON public.costs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));