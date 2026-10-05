CREATE TABLE public.cost_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('custo_inicial','ajuste_manual')),
  old_cost numeric NOT NULL,
  new_cost numeric NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cost_adjustments TO authenticated;
GRANT ALL ON public.cost_adjustments TO service_role;
ALTER TABLE public.cost_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cost adjustments" ON public.cost_adjustments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.bulk_update_costs(_items jsonb, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; p record; nc numeric; n_init int := 0; n_adj int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas o administrador pode atualizar custos'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    nc := (it->>'new_cost')::numeric;
    IF nc IS NULL OR nc < 0 THEN RAISE EXCEPTION 'Custo inválido'; END IF;
    SELECT id, purchase_price, sale_price INTO p FROM products WHERE id = (it->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF p.purchase_price = nc THEN CONTINUE; END IF;
    INSERT INTO cost_adjustments(product_id,user_id,kind,old_cost,new_cost,reason)
    VALUES (p.id, auth.uid(), CASE WHEN COALESCE(p.purchase_price,0)=0 THEN 'custo_inicial' ELSE 'ajuste_manual' END, COALESCE(p.purchase_price,0), nc, _reason);
    IF COALESCE(p.purchase_price,0)=0 THEN n_init := n_init+1; ELSE n_adj := n_adj+1; END IF;
    UPDATE products SET purchase_price = nc, updated_at = now() WHERE id = p.id;
    INSERT INTO price_history(product_id,purchase_price,sale_price) VALUES (p.id, nc, p.sale_price);
  END LOOP;
  RETURN jsonb_build_object('initial', n_init, 'adjusted', n_adj);
END $$;

CREATE OR REPLACE FUNCTION public.bulk_update_prices(_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; p record; np numeric; n int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas o administrador pode atualizar preços'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    np := (it->>'new_price')::numeric;
    IF np IS NULL OR np < 0 THEN RAISE EXCEPTION 'Preço inválido'; END IF;
    SELECT id, purchase_price, sale_price INTO p FROM products WHERE id = (it->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF p.sale_price = np THEN CONTINUE; END IF;
    UPDATE products SET sale_price = np, updated_at = now() WHERE id = p.id;
    INSERT INTO price_history(product_id,purchase_price,sale_price) VALUES (p.id, p.purchase_price, np);
    n := n+1;
  END LOOP;
  RETURN jsonb_build_object('updated', n);
END $$;
REVOKE ALL ON FUNCTION public.bulk_update_costs(jsonb,text) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_update_prices(jsonb) FROM anon;