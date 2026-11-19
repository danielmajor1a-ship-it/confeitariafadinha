ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS bonificacao boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.confirm_purchase(_purchase_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    IF p.bonificacao THEN
      -- Bonificação: entra no estoque pelo custo atual, sem mexer no custo
      IF prod.production_only THEN
        UPDATE public.purchase_items SET production_only = true WHERE id = it.id;
      ELSE
        INSERT INTO public.stock_movements(user_id, product_id, type, quantity, reason, reference, unit_cost)
        VALUES (auth.uid(), prod.id, 'compra', round(it.quantity)::int, 'Bonificação ' || COALESCE(NULLIF(p.supplier,''), p.source), _purchase_id::text, COALESCE(prod.purchase_price,0));
      END IF;
      n := n + 1;
      CONTINUE;
    END IF;
    unit_cost := it.total_value / it.quantity;
    IF NOT prod.production_only AND COALESCE(prod.purchase_price,0) > 0 AND prod.stock > 0 THEN
      new_cost := (prod.stock * prod.purchase_price + it.quantity * unit_cost) / (prod.stock + it.quantity);
    ELSE
      new_cost := unit_cost;
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
    IF prod.production_only THEN
      UPDATE public.purchase_items SET production_only = true WHERE id = it.id;
    ELSE
      INSERT INTO public.stock_movements(user_id, product_id, type, quantity, reason, reference, unit_cost)
      VALUES (auth.uid(), prod.id, 'compra', round(it.quantity)::int, 'Compra ' || COALESCE(NULLIF(p.supplier,''), p.source), _purchase_id::text, round(unit_cost,4));
    END IF;
    INSERT INTO public.price_history(product_id, purchase_price, sale_price) VALUES (prod.id, new_cost, prod.sale_price);
    n := n + 1;
  END LOOP;
  IF p.bonificacao THEN
    UPDATE public.purchase_items SET total_value = 0 WHERE purchase_id = _purchase_id;
  END IF;
  UPDATE public.purchases SET status = 'confirmada', confirmed_at = now(), due_date = CASE WHEN p.bonificacao THEN NULL ELSE due_date END,
    total = COALESCE((SELECT sum(total_value) FROM public.purchase_items WHERE purchase_id = _purchase_id),0)
  WHERE id = _purchase_id;
  RETURN jsonb_build_object('items', n, 'alerts', alerts);
END $function$;

CREATE OR REPLACE FUNCTION public.register_purchase_bonificacao(_supplier text, _items jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _pid uuid; _prod uuid; it record;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Apenas administradores podem registrar compras'; END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'A nota não tem itens'; END IF;
  INSERT INTO public.purchases (user_id, supplier, source, total, status, bonificacao)
  VALUES (_uid, COALESCE(_supplier,''), 'nf_xml', 0, 'rascunho', true) RETURNING id INTO _pid;
  FOR it IN SELECT * FROM jsonb_to_recordset(_items) AS x(product_id uuid, description text, quantity numeric, unit text) LOOP
    IF COALESCE(it.quantity,0) <= 0 THEN RAISE EXCEPTION 'Quantidade inválida no item "%"', it.description; END IF;
    _prod := it.product_id;
    IF _prod IS NULL THEN
      INSERT INTO public.products (user_id, name, description, brand, category, purchase_price, sale_price, stock, low_stock_threshold, needs_review, sells, used_in_recipes, purchase_unit)
      VALUES (_uid, COALESCE(NULLIF(it.description,''),'Item sem nome'), '', '', 'outro', 0, 0, 0, 5, true, false, true, COALESCE(NULLIF(it.unit,''),'un'))
      RETURNING id INTO _prod;
    END IF;
    INSERT INTO public.purchase_items (purchase_id, product_id, original_description, quantity, unit, total_value)
    VALUES (_pid, _prod, COALESCE(it.description,''), it.quantity, COALESCE(it.unit,''), 0);
  END LOOP;
  RETURN public.confirm_purchase(_pid) || jsonb_build_object('purchase_id', _pid);
END $function$;
REVOKE EXECUTE ON FUNCTION public.register_purchase_bonificacao(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_purchase_bonificacao(text, jsonb) TO authenticated, service_role;