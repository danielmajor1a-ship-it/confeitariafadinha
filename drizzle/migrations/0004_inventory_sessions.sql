ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check CHECK (type = ANY (ARRAY['compra','venda','consumo_receita','ajuste','perda','ajuste_contagem','ajuste_inventario']));

CREATE TABLE public.inventory_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','fechado')),
  type text NOT NULL DEFAULT 'total' CHECK (type IN ('total','parcial')),
  category_filter text,
  draft_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  items_adjusted int NOT NULL DEFAULT 0,
  total_divergence_value numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.inventory_sessions TO authenticated;
GRANT ALL ON public.inventory_sessions TO service_role;
ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin le sessoes" ON public.inventory_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin cria sessoes" ON public.inventory_sessions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND user_id = auth.uid() AND status = 'em_andamento');
CREATE POLICY "Admin edita sessao aberta" ON public.inventory_sessions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') AND status = 'em_andamento') WITH CHECK (public.has_role(auth.uid(),'admin') AND status = 'em_andamento');
CREATE UNIQUE INDEX inventory_one_open ON public.inventory_sessions ((true)) WHERE status = 'em_andamento';

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  user_id uuid NOT NULL,
  theoretical_qty numeric NOT NULL,
  counted_qty numeric NOT NULL,
  difference numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin le itens inventario" ON public.inventory_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.close_inventory(_session_id uuid, _counts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.inventory_sessions%ROWTYPE; c record; prod public.products%ROWTYPE;
  n int := 0; val numeric := 0; diff numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas administradores podem fechar inventário'; END IF;
  SELECT * INTO s FROM public.inventory_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;
  IF s.status <> 'em_andamento' THEN RAISE EXCEPTION 'Sessão já fechada — abra uma nova para corrigir'; END IF;
  IF jsonb_typeof(_counts) IS DISTINCT FROM 'array' OR jsonb_array_length(_counts) = 0 THEN RAISE EXCEPTION 'Nenhuma quantidade contada'; END IF;
  FOR c IN SELECT * FROM jsonb_to_recordset(_counts) AS x(product_id uuid, counted numeric) LOOP
    IF c.counted IS NULL OR c.counted < 0 THEN RAISE EXCEPTION 'Quantidade contada inválida'; END IF;
    SELECT * INTO prod FROM public.products WHERE id = c.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    diff := round(c.counted) - prod.stock;
    INSERT INTO public.inventory_items(session_id, product_id, user_id, theoretical_qty, counted_qty, difference, unit_cost)
    VALUES (_session_id, prod.id, auth.uid(), prod.stock, round(c.counted), diff, COALESCE(prod.purchase_price,0));
    IF diff <> 0 THEN
      INSERT INTO public.stock_movements(user_id, product_id, type, quantity, reason, reference)
      VALUES (auth.uid(), prod.id, 'ajuste_inventario', diff::int, 'Inventário', _session_id::text);
      n := n + 1;
      val := val + diff * COALESCE(prod.purchase_price,0);
    END IF;
  END LOOP;
  UPDATE public.inventory_sessions SET status='fechado', closed_at=now(), items_adjusted=n, total_divergence_value=round(val,2), draft_counts='{}'::jsonb WHERE id=_session_id;
  RETURN jsonb_build_object('adjusted', n, 'value', round(val,2));
END $$;