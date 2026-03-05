-- Função transacional para registrar venda e manter estoque/caixa/fiado consistentes
CREATE OR REPLACE FUNCTION public.create_sale_with_items(
  _items jsonb,
  _payment_method text,
  _client_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _sale_id uuid;
  _total numeric := 0;
  _item record;
  _open_register_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT (
    public.has_role(_uid, 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = _uid
        AND p.is_active = true
        AND p.can_register_sales = true
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar vendas';
  END IF;

  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Itens da venda inválidos';
  END IF;

  FOR _item IN
    SELECT *
    FROM jsonb_to_recordset(_items) AS x(
      product_id uuid,
      product_name text,
      quantity integer,
      unit_price numeric,
      subtotal numeric
    )
  LOOP
    IF _item.product_id IS NULL OR COALESCE(_item.quantity, 0) <= 0 OR COALESCE(_item.unit_price, 0) < 0 THEN
      RAISE EXCEPTION 'Item inválido na venda';
    END IF;

    _total := _total + COALESCE(_item.subtotal, (_item.quantity * _item.unit_price));
  END LOOP;

  INSERT INTO public.sales (user_id, total, payment_method, client_id, status)
  VALUES (
    _uid,
    _total,
    COALESCE(NULLIF(_payment_method, ''), 'dinheiro'),
    _client_id,
    CASE WHEN _payment_method = 'fiado' THEN 'pendente' ELSE 'pago' END
  )
  RETURNING id INTO _sale_id;

  FOR _item IN
    SELECT *
    FROM jsonb_to_recordset(_items) AS x(
      product_id uuid,
      product_name text,
      quantity integer,
      unit_price numeric,
      subtotal numeric
    )
  LOOP
    UPDATE public.products
    SET
      stock = stock - _item.quantity,
      updated_at = now()
    WHERE id = _item.product_id
      AND stock >= _item.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto %', COALESCE(_item.product_name, _item.product_id::text);
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
    VALUES (
      _sale_id,
      _item.product_id,
      COALESCE(_item.product_name, ''),
      _item.quantity,
      _item.unit_price,
      COALESCE(_item.subtotal, (_item.quantity * _item.unit_price))
    );

    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, reason, reference)
    VALUES (_uid, _item.product_id, 'saida', _item.quantity, 'Venda', _sale_id::text);
  END LOOP;

  IF _payment_method = 'fiado' AND _client_id IS NOT NULL THEN
    UPDATE public.clients
    SET total_owed = total_owed + _total,
        updated_at = now()
    WHERE id = _client_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente de fiado não encontrado';
    END IF;
  END IF;

  SELECT id
  INTO _open_register_id
  FROM public.cash_registers
  WHERE user_id = _uid
    AND status = 'aberto'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF _open_register_id IS NOT NULL THEN
    INSERT INTO public.cash_movements (
      cash_register_id,
      user_id,
      type,
      category,
      amount,
      payment_method,
      description,
      reference_id
    )
    VALUES (
      _open_register_id,
      _uid,
      'entrada',
      'venda',
      _total,
      CASE WHEN _payment_method = 'fiado' THEN 'fiado' ELSE _payment_method END,
      'Venda #' || substring(_sale_id::text, 1, 8),
      _sale_id::text
    );
  END IF;

  RETURN _sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_with_items(jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_with_items(jsonb, text, uuid) TO authenticated;