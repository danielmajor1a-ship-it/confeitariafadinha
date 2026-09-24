CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('nf_xml','nf_foto','nf_pdf','cupom_foto','manual')),
  document_url text,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','confirmada')),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read purchases" ON public.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own purchases" ON public.purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own draft purchases" ON public.purchases FOR UPDATE TO authenticated USING ((auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) AND status = 'rascunho');
CREATE POLICY "Delete own draft purchases" ON public.purchases FOR DELETE TO authenticated USING ((auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) AND status = 'rascunho');

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  original_description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT '',
  total_value numeric NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read purchase items" ON public.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage items of own draft" ON public.purchase_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND p.status='rascunho' AND (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND p.status='rascunho' AND (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE INDEX ON public.purchase_items(purchase_id);

CREATE TABLE public.cost_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  old_cost numeric NOT NULL,
  new_cost numeric NOT NULL,
  change_pct numeric NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.cost_change_events TO authenticated;
GRANT ALL ON public.cost_change_events TO service_role;
ALTER TABLE public.cost_change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read cost events" ON public.cost_change_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin ack cost events" ON public.cost_change_events FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit_cost numeric;

CREATE OR REPLACE FUNCTION public.confirm_purchase(_purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.purchases%ROWTYPE;
  it record;
  prod public.products%ROWTYPE;
  unit_cost numeric;
  new_cost numeric;
  pct numeric;
  alerts int := 0;
  n int := 0;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada'; END IF;
  IF p.status <> 'rascunho' THEN RAISE EXCEPTION 'Compra já confirmada'; END IF;
  IF p.user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_items WHERE purchase_id = _purchase_id AND product_id IS NULL) THEN
    RAISE EXCEPTION 'Há itens sem produto associado';
  END IF;

  FOR it IN SELECT * FROM public.purchase_items WHERE purchase_id = _purchase_id AND quantity > 0 LOOP
    SELECT * INTO prod FROM public.products WHERE id = it.product_id FOR UPDATE;
    unit_cost := it.total_value / it.quantity;
    IF prod.stock > 0 AND prod.purchase_price > 0 THEN
      new_cost := (prod.stock * prod.purchase_price + it.quantity * unit_cost) / (prod.stock + it.quantity);
    ELSE
      new_cost := unit_cost;
    END IF;
    new_cost := round(new_cost, 4);
    IF prod.purchase_price > 0 THEN
      pct := (new_cost - prod.purchase_price) / prod.purchase_price * 100;
      IF abs(pct) > 5 THEN
        INSERT INTO public.cost_change_events(product_id, purchase_id, old_cost, new_cost, change_pct)
        VALUES (prod.id, _purchase_id, prod.purchase_price, new_cost, round(pct, 2));
        alerts := alerts + 1;
      END IF;
    END IF;
    UPDATE public.products SET purchase_price = new_cost, stock = GREATEST(stock,0) + it.quantity, updated_at = now() WHERE id = prod.id;
    INSERT INTO public.stock_movements(user_id, product_id, type, quantity, reason, reference, unit_cost)
    VALUES (auth.uid(), prod.id, 'compra', it.quantity, 'Compra ' || COALESCE(NULLIF(p.supplier,''), p.source), _purchase_id::text, round(unit_cost,4));
    INSERT INTO public.price_history(product_id, purchase_price, sale_price) VALUES (prod.id, new_cost, prod.sale_price);
    n := n + 1;
  END LOOP;

  UPDATE public.purchases SET status = 'confirmada', confirmed_at = now(),
    total = COALESCE((SELECT sum(total_value) FROM public.purchase_items WHERE purchase_id = _purchase_id),0)
  WHERE id = _purchase_id;
  RETURN jsonb_build_object('items', n, 'alerts', alerts);
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_purchase(uuid) TO authenticated;