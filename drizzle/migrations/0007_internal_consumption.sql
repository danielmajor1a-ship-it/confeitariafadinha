ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check CHECK (type = ANY (ARRAY['compra','venda','consumo_receita','consumo_interno','ajuste','perda','ajuste_contagem','ajuste_inventario']));

CREATE OR REPLACE FUNCTION public.stock_movement_delta(_type text, _qty numeric)
 RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _type = 'compra' THEN abs(_qty)
    WHEN _type IN ('venda','consumo_receita','consumo_interno','perda') THEN -abs(_qty)
    ELSE _qty END
$$;

CREATE OR REPLACE FUNCTION public.register_internal_consumption(_product_id uuid, _quantity integer, _date date, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); prod public.products%ROWTYPE; _id uuid; _ts timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF COALESCE(_quantity,0) <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
  SELECT * INTO prod FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF prod.stock < _quantity THEN RAISE EXCEPTION 'Estoque insuficiente (atual: %)', prod.stock; END IF;
  _ts := CASE WHEN _date IS NULL OR _date = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN now()
              ELSE (_date::timestamp + interval '12 hours') AT TIME ZONE 'America/Sao_Paulo' END;
  INSERT INTO public.stock_movements(user_id, product_id, type, quantity, reason, unit_cost, created_at)
  VALUES (_uid, prod.id, 'consumo_interno', _quantity, trim(_reason), COALESCE(prod.purchase_price,0), _ts)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.register_internal_consumption(uuid, integer, date, text) TO authenticated;