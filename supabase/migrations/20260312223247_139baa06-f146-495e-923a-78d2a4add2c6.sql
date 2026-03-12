
-- 1. Create sale_payments table for multi-payment support
CREATE TABLE public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  payment_method text NOT NULL DEFAULT 'dinheiro',
  amount numeric NOT NULL DEFAULT 0,
  installments integer DEFAULT 1,
  card_tax_rate numeric DEFAULT 0,
  card_tax_amount numeric DEFAULT 0,
  net_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sale_payments" ON public.sale_payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert sale_payments" ON public.sale_payments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales WHERE sales.id = sale_payments.sale_id AND sales.user_id = auth.uid()
  ));

CREATE POLICY "Users delete sale_payments" ON public.sale_payments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales WHERE sales.id = sale_payments.sale_id AND (sales.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

-- 2. Add credit installment rates to card_rates (jsonb: {"1": 2.5, "2": 3.1, ...})
ALTER TABLE public.card_rates ADD COLUMN IF NOT EXISTS credit_installment_rates jsonb DEFAULT '{}';

-- 3. Add PIX total to cash_verifications
ALTER TABLE public.cash_verifications ADD COLUMN IF NOT EXISTS total_pix_sales numeric NOT NULL DEFAULT 0;

-- 4. Backfill existing sales with sale_payments records
INSERT INTO public.sale_payments (sale_id, payment_method, amount, net_amount)
SELECT id, payment_method, total, total FROM public.sales
WHERE id NOT IN (SELECT sale_id FROM public.sale_payments);

-- 5. Updated create_sale_with_items function with multi-payment support
CREATE OR REPLACE FUNCTION public.create_sale_with_items(
  _items jsonb,
  _payment_method text,
  _client_id uuid DEFAULT NULL,
  _payments jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sale_id uuid;
  _total numeric := 0;
  _item record;
  _payment record;
  _open_register_id uuid;
  _effective_payment text;
  _payments_total numeric := 0;
  _has_fiado boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT (
    public.has_role(_uid, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = _uid AND p.is_active = true AND p.can_register_sales = true
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar vendas';
  END IF;

  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Itens da venda inválidos';
  END IF;

  FOR _item IN
    SELECT * FROM jsonb_to_recordset(_items) AS x(
      product_id uuid, product_name text, quantity integer, unit_price numeric, subtotal numeric
    )
  LOOP
    IF _item.product_id IS NULL OR COALESCE(_item.quantity, 0) <= 0 OR COALESCE(_item.unit_price, 0) < 0 THEN
      RAISE EXCEPTION 'Item inválido na venda';
    END IF;
    _total := _total + COALESCE(_item.subtotal, (_item.quantity * _item.unit_price));
  END LOOP;

  -- Determine effective payment method
  IF _payments IS NOT NULL AND jsonb_typeof(_payments) = 'array' AND jsonb_array_length(_payments) > 0 THEN
    IF jsonb_array_length(_payments) = 1 THEN
      _effective_payment := (_payments->0->>'method');
    ELSE
      _effective_payment := 'misto';
    END IF;
    -- Check if any payment is fiado
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_payments) p WHERE p->>'method' = 'fiado'
    ) INTO _has_fiado;
  ELSE
    _effective_payment := COALESCE(NULLIF(_payment_method, ''), 'dinheiro');
    _has_fiado := (_effective_payment = 'fiado');
  END IF;

  INSERT INTO public.sales (user_id, total, payment_method, client_id, status)
  VALUES (
    _uid, _total, _effective_payment, _client_id,
    CASE WHEN _has_fiado THEN 'pendente' ELSE 'pago' END
  )
  RETURNING id INTO _sale_id;

  -- Process items
  FOR _item IN
    SELECT * FROM jsonb_to_recordset(_items) AS x(
      product_id uuid, product_name text, quantity integer, unit_price numeric, subtotal numeric
    )
  LOOP
    UPDATE public.products
    SET stock = stock - _item.quantity, updated_at = now()
    WHERE id = _item.product_id AND stock >= _item.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto %', COALESCE(_item.product_name, _item.product_id::text);
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
    VALUES (_sale_id, _item.product_id, COALESCE(_item.product_name, ''), _item.quantity, _item.unit_price,
      COALESCE(_item.subtotal, (_item.quantity * _item.unit_price)));

    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, reason, reference)
    VALUES (_uid, _item.product_id, 'saida', _item.quantity, 'Venda', _sale_id::text);
  END LOOP;

  -- Process payments
  IF _payments IS NOT NULL AND jsonb_typeof(_payments) = 'array' AND jsonb_array_length(_payments) > 0 THEN
    FOR _payment IN
      SELECT * FROM jsonb_to_recordset(_payments) AS x(
        method text, amount numeric, installments integer, tax_rate numeric, tax_amount numeric, net_amount numeric
      )
    LOOP
      _payments_total := _payments_total + _payment.amount;

      INSERT INTO public.sale_payments (sale_id, payment_method, amount, installments, card_tax_rate, card_tax_amount, net_amount)
      VALUES (_sale_id, _payment.method, _payment.amount, COALESCE(_payment.installments, 1),
        COALESCE(_payment.tax_rate, 0), COALESCE(_payment.tax_amount, 0), COALESCE(_payment.net_amount, _payment.amount));

      IF _payment.method = 'fiado' AND _client_id IS NOT NULL THEN
        UPDATE public.clients SET total_owed = total_owed + _payment.amount, updated_at = now()
        WHERE id = _client_id;
      END IF;
    END LOOP;

    IF abs(_payments_total - _total) > 0.01 THEN
      RAISE EXCEPTION 'Soma dos pagamentos (%) difere do total da venda (%)', _payments_total, _total;
    END IF;
  ELSE
    INSERT INTO public.sale_payments (sale_id, payment_method, amount, net_amount)
    VALUES (_sale_id, _effective_payment, _total, _total);

    IF _effective_payment = 'fiado' AND _client_id IS NOT NULL THEN
      UPDATE public.clients SET total_owed = total_owed + _total, updated_at = now()
      WHERE id = _client_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Cliente de fiado não encontrado'; END IF;
    END IF;
  END IF;

  -- Register cash movements (one per payment method)
  SELECT id INTO _open_register_id
  FROM public.cash_registers WHERE user_id = _uid AND status = 'aberto'
  ORDER BY opened_at DESC LIMIT 1;

  IF _open_register_id IS NOT NULL THEN
    IF _payments IS NOT NULL AND jsonb_typeof(_payments) = 'array' AND jsonb_array_length(_payments) > 0 THEN
      FOR _payment IN
        SELECT * FROM jsonb_to_recordset(_payments) AS x(method text, amount numeric)
      LOOP
        INSERT INTO public.cash_movements (cash_register_id, user_id, type, category, amount, payment_method, description, reference_id)
        VALUES (_open_register_id, _uid, 'entrada', 'venda', _payment.amount,
          _payment.method, 'Venda #' || substring(_sale_id::text, 1, 8), _sale_id::text);
      END LOOP;
    ELSE
      INSERT INTO public.cash_movements (cash_register_id, user_id, type, category, amount, payment_method, description, reference_id)
      VALUES (_open_register_id, _uid, 'entrada', 'venda', _total,
        CASE WHEN _effective_payment = 'fiado' THEN 'fiado' ELSE _effective_payment END,
        'Venda #' || substring(_sale_id::text, 1, 8), _sale_id::text);
    END IF;
  END IF;

  RETURN _sale_id;
END;
$function$;
