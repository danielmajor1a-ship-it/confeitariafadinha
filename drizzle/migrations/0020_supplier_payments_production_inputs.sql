ALTER TABLE public.products ADD COLUMN IF NOT EXISTS production_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS production_only boolean NOT NULL DEFAULT false;

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  supplier text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('caixa','pix_conta','boleto_banco','transferencia','outro')),
  paid_at timestamptz NOT NULL DEFAULT now(),
  cash_movement_id uuid UNIQUE REFERENCES public.cash_movements(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.supplier_payments(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, purchase_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payment_allocations TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
GRANT ALL ON public.supplier_payment_allocations TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view supplier payments" ON public.supplier_payments FOR SELECT TO authenticated USING (public.can_view_purchase_analytics(auth.uid()));
CREATE POLICY "admin manage supplier payments" ON public.supplier_payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "view allocations" ON public.supplier_payment_allocations FOR SELECT TO authenticated USING (public.can_view_purchase_analytics(auth.uid()));
CREATE POLICY "admin manage allocations" ON public.supplier_payment_allocations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.supplier_payments (user_id, supplier, amount, method, paid_at, cash_movement_id, notes)
SELECT user_id, COALESCE(NULLIF(trim(description),''),'(sem nome)'), amount, 'caixa', created_at, id, 'Lançado antes da ligação com notas'
FROM public.cash_movements WHERE category='pagamento_fornecedor' AND type='saida' AND amount > 0;

CREATE OR REPLACE FUNCTION public.purchase_open_amount(_purchase_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.total - COALESCE((SELECT sum(a.amount) FROM public.supplier_payment_allocations a WHERE a.purchase_id = p.id),0)
  FROM public.purchases p WHERE p.id = _purchase_id
$$;

CREATE OR REPLACE FUNCTION public.allocate_supplier_payment(_payment_id uuid, _allocations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.supplier_payments%ROWTYPE; a jsonb; amt numeric; used numeric; openv numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO pay FROM public.supplier_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(_allocations,'[]'::jsonb)) LOOP
    amt := round((a->>'amount')::numeric, 2);
    IF amt <= 0 THEN CONTINUE; END IF;
    PERFORM 1 FROM public.purchases WHERE id = (a->>'purchase_id')::uuid AND status='confirmada' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nota não encontrada ou não confirmada'; END IF;
    openv := public.purchase_open_amount((a->>'purchase_id')::uuid);
    IF amt > openv + 0.01 THEN RAISE EXCEPTION 'Esta nota já está paga ou o valor passa do que falta pagar (falta R$ %)', round(openv,2); END IF;
    INSERT INTO public.supplier_payment_allocations(payment_id, purchase_id, amount)
    VALUES (_payment_id, (a->>'purchase_id')::uuid, amt)
    ON CONFLICT (payment_id, purchase_id) DO UPDATE SET amount = supplier_payment_allocations.amount + EXCLUDED.amount;
  END LOOP;
  SELECT COALESCE(sum(amount),0) INTO used FROM public.supplier_payment_allocations WHERE payment_id = _payment_id;
  IF used > pay.amount + 0.01 THEN RAISE EXCEPTION 'A soma das notas passa do valor do pagamento'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_supplier_payment(_supplier text, _amount numeric, _method text, _paid_at timestamptz, _notes text, _allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reg uuid; mov uuid; pid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas administradores podem pagar fornecedor'; END IF;
  IF COALESCE(trim(_supplier),'') = '' THEN RAISE EXCEPTION 'Informe o fornecedor'; END IF;
  IF COALESCE(_amount,0) <= 0 THEN RAISE EXCEPTION 'Valor deve ser maior que zero'; END IF;
  IF _method = 'caixa' THEN
    SELECT id INTO reg FROM public.cash_registers WHERE status IN ('aberto','conferido') ORDER BY opened_at DESC LIMIT 1;
    IF reg IS NULL THEN RAISE EXCEPTION 'Nenhum caixa aberto'; END IF;
    INSERT INTO public.cash_movements(cash_register_id, user_id, type, category, amount, payment_method, description, expense_type)
    VALUES (reg, auth.uid(), 'saida', 'pagamento_fornecedor', _amount, 'dinheiro', trim(_supplier) || COALESCE(' — ' || NULLIF(trim(_notes),''), ''), 'compra_mercadoria')
    RETURNING id INTO mov;
  END IF;
  INSERT INTO public.supplier_payments(user_id, supplier, amount, method, paid_at, cash_movement_id, notes)
  VALUES (auth.uid(), trim(_supplier), _amount, _method, COALESCE(_paid_at, now()), mov, NULLIF(trim(_notes),''))
  RETURNING id INTO pid;
  PERFORM public.allocate_supplier_payment(pid, _allocations);
  RETURN pid;
END $$;

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
  UPDATE public.purchases SET status = 'confirmada', confirmed_at = now(),
    total = COALESCE((SELECT sum(total_value) FROM public.purchase_items WHERE purchase_id = _purchase_id),0)
  WHERE id = _purchase_id;
  RETURN jsonb_build_object('items', n, 'alerts', alerts);
END $function$;