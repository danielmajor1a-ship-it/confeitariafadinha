-- Módulo de Encomendas
CREATE TABLE public.encomendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  venda_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  venda_entrega_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL,
  cliente_telefone text,
  descricao text NOT NULL,
  quantidade numeric NOT NULL,
  unidade text,
  observacoes text,
  data_entrega date NOT NULL,
  hora_entrega time NOT NULL,
  tipo text NOT NULL DEFAULT 'retirada' CHECK (tipo IN ('retirada','entrega')),
  status text NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','em_producao','entregue','cancelada')),
  iniciada_em timestamptz,
  entregue_em timestamptz,
  valor_total numeric,
  valor_sinal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX encomendas_data_idx ON public.encomendas (data_entrega, hora_entrega);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encomendas TO authenticated;
GRANT ALL ON public.encomendas TO service_role;
ALTER TABLE public.encomendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all encomendas" ON public.encomendas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.encomenda_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encomenda_id uuid NOT NULL REFERENCES public.encomendas(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.products(id),
  quantidade numeric NOT NULL,
  preco_unitario numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encomenda_itens TO authenticated;
GRANT ALL ON public.encomenda_itens TO service_role;
ALTER TABLE public.encomenda_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all encomenda_itens" ON public.encomenda_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.config_producao (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  capacidade_diaria int NOT NULL DEFAULT 5,
  faixa_tranquilo_min int NOT NULL DEFAULT 240,
  faixa_atencao_min int NOT NULL DEFAULT 120,
  faixa_apertado_min int NOT NULL DEFAULT 60,
  painel_token text NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 32)
);
GRANT SELECT, UPDATE ON public.config_producao TO authenticated;
GRANT ALL ON public.config_producao TO service_role;
ALTER TABLE public.config_producao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read config_producao" ON public.config_producao FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update config_producao" ON public.config_producao FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.config_producao (id) VALUES (1) ON CONFLICT DO NOTHING;

-- "Adiantamento" como forma de pagamento na venda de entrega
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check CHECK (payment_method = ANY (ARRAY['dinheiro','credito','debito','cartao','fiado','pix','misto','adiantamento']));

-- Venda: o adiantamento já entrou no caixa como sinal, então não gera nova entrada de caixa
CREATE OR REPLACE FUNCTION public.create_sale_with_items(_items jsonb, _payment_method text, _client_id uuid DEFAULT NULL::uuid, _payments jsonb DEFAULT NULL::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid(); _sale_id uuid; _total numeric := 0; _item record; _payment record;
  _open_register_id uuid; _effective_payment text; _payments_total numeric := 0; _has_fiado boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF NOT (public.has_role(_uid, 'admin'::app_role) OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.user_id = _uid AND p.is_active = true AND p.can_register_sales = true)) THEN
    RAISE EXCEPTION 'Sem permissão para registrar vendas';
  END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Itens da venda inválidos'; END IF;
  FOR _item IN SELECT * FROM jsonb_to_recordset(_items) AS x(product_id uuid, product_name text, quantity integer, unit_price numeric, subtotal numeric) LOOP
    IF _item.product_id IS NULL OR COALESCE(_item.quantity, 0) <= 0 OR COALESCE(_item.unit_price, 0) < 0 THEN RAISE EXCEPTION 'Item inválido na venda'; END IF;
    _total := _total + COALESCE(_item.subtotal, (_item.quantity * _item.unit_price));
  END LOOP;
  IF _payments IS NOT NULL AND jsonb_typeof(_payments) = 'array' AND jsonb_array_length(_payments) > 0 THEN
    IF jsonb_array_length(_payments) = 1 THEN _effective_payment := (_payments->0->>'method'); ELSE _effective_payment := 'misto'; END IF;
    SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(_payments) p WHERE p->>'method' = 'fiado') INTO _has_fiado;
  ELSE
    _effective_payment := COALESCE(NULLIF(_payment_method, ''), 'dinheiro');
    _has_fiado := (_effective_payment = 'fiado');
  END IF;
  INSERT INTO public.sales (user_id, total, payment_method, client_id, status)
  VALUES (_uid, _total, _effective_payment, _client_id, CASE WHEN _has_fiado THEN 'pendente' ELSE 'pago' END)
  RETURNING id INTO _sale_id;
  FOR _item IN SELECT * FROM jsonb_to_recordset(_items) AS x(product_id uuid, product_name text, quantity integer, unit_price numeric, subtotal numeric) LOOP
    UPDATE public.products SET stock = stock - _item.quantity, updated_at = now() WHERE id = _item.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado: %', COALESCE(_item.product_name, _item.product_id::text); END IF;
    INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
    VALUES (_sale_id, _item.product_id, COALESCE(_item.product_name, ''), _item.quantity, _item.unit_price, COALESCE(_item.subtotal, (_item.quantity * _item.unit_price)));
    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, reason, reference)
    VALUES (_uid, _item.product_id, 'saida', _item.quantity, 'Venda', _sale_id::text);
  END LOOP;
  IF _payments IS NOT NULL AND jsonb_typeof(_payments) = 'array' AND jsonb_array_length(_payments) > 0 THEN
    FOR _payment IN SELECT * FROM jsonb_to_recordset(_payments) AS x(method text, amount numeric, installments integer, tax_rate numeric, tax_amount numeric, net_amount numeric) LOOP
      _payments_total := _payments_total + _payment.amount;
      INSERT INTO public.sale_payments (sale_id, payment_method, amount, installments, card_tax_rate, card_tax_amount, net_amount)
      VALUES (_sale_id, _payment.method, _payment.amount, COALESCE(_payment.installments, 1), COALESCE(_payment.tax_rate, 0), COALESCE(_payment.tax_amount, 0), COALESCE(_payment.net_amount, _payment.amount));
      IF _payment.method = 'fiado' AND _client_id IS NOT NULL THEN
        UPDATE public.clients SET total_owed = total_owed + _payment.amount, updated_at = now() WHERE id = _client_id;
      END IF;
    END LOOP;
    IF abs(_payments_total - _total) > 0.01 THEN RAISE EXCEPTION 'Soma dos pagamentos (%) difere do total da venda (%)', _payments_total, _total; END IF;
  ELSE
    INSERT INTO public.sale_payments (sale_id, payment_method, amount, net_amount) VALUES (_sale_id, _effective_payment, _total, _total);
    IF _effective_payment = 'fiado' AND _client_id IS NOT NULL THEN
      UPDATE public.clients SET total_owed = total_owed + _total, updated_at = now() WHERE id = _client_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Cliente de fiado não encontrado'; END IF;
    END IF;
  END IF;
  SELECT id INTO _open_register_id FROM public.cash_registers WHERE user_id = _uid AND status = 'aberto' ORDER BY opened_at DESC LIMIT 1;
  IF _open_register_id IS NOT NULL THEN
    IF _payments IS NOT NULL AND jsonb_typeof(_payments) = 'array' AND jsonb_array_length(_payments) > 0 THEN
      FOR _payment IN SELECT * FROM jsonb_to_recordset(_payments) AS x(method text, amount numeric) LOOP
        CONTINUE WHEN _payment.method = 'adiantamento';
        INSERT INTO public.cash_movements (cash_register_id, user_id, type, category, amount, payment_method, description, reference_id)
        VALUES (_open_register_id, _uid, 'entrada', 'venda', _payment.amount, _payment.method, 'Venda #' || substring(_sale_id::text, 1, 8), _sale_id::text);
      END LOOP;
    ELSIF _effective_payment <> 'adiantamento' THEN
      INSERT INTO public.cash_movements (cash_register_id, user_id, type, category, amount, payment_method, description, reference_id)
      VALUES (_open_register_id, _uid, 'entrada', 'venda', _total, _effective_payment, 'Venda #' || substring(_sale_id::text, 1, 8), _sale_id::text);
    END IF;
  END IF;
  RETURN _sale_id;
END;
$function$;

-- Sinal: entra no caixa como recebimento, não é venda (não baixa estoque nem entra na curva ABC)
CREATE OR REPLACE FUNCTION public.registrar_sinal_encomenda(_encomenda_id uuid, _valor numeric, _metodo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _reg uuid; e public.encomendas%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF COALESCE(_valor,0) <= 0 THEN RAISE EXCEPTION 'Valor do sinal inválido'; END IF;
  SELECT * INTO e FROM public.encomendas WHERE id = _encomenda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Encomenda não encontrada'; END IF;
  SELECT id INTO _reg FROM public.cash_registers WHERE user_id = _uid AND status = 'aberto' ORDER BY opened_at DESC LIMIT 1;
  IF _reg IS NULL THEN RAISE EXCEPTION 'Abra o caixa para receber o sinal'; END IF;
  INSERT INTO public.cash_movements (cash_register_id, user_id, type, category, amount, payment_method, description, reference_id)
  VALUES (_reg, _uid, 'entrada', 'adiantamento_encomenda', _valor, COALESCE(NULLIF(_metodo,''),'dinheiro'),
          'Sinal encomenda - ' || e.cliente_nome, _encomenda_id::text);
  UPDATE public.encomendas SET valor_sinal = COALESCE(valor_sinal,0) + _valor WHERE id = _encomenda_id;
END $$;

-- Entrega: venda única + encomenda marcada como entregue, tudo junto
CREATE OR REPLACE FUNCTION public.entregar_encomenda(_encomenda_id uuid, _items jsonb, _payment_method text, _client_id uuid, _payments jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE e public.encomendas%ROWTYPE; _sale uuid;
BEGIN
  SELECT * INTO e FROM public.encomendas WHERE id = _encomenda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Encomenda não encontrada'; END IF;
  IF e.status IN ('entregue','cancelada') THEN RAISE EXCEPTION 'Encomenda já está %', e.status; END IF;
  _sale := public.create_sale_with_items(_items, _payment_method, _client_id, _payments);
  UPDATE public.encomendas SET status='entregue', entregue_em=now(), venda_entrega_id=_sale WHERE id=_encomenda_id;
  RETURN _sale;
END $$;

-- Painel público (por token)
CREATE OR REPLACE FUNCTION public.get_painel(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.config_producao%ROWTYPE; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO c FROM public.config_producao WHERE id = 1;
  IF c.painel_token IS NULL OR p_token IS DISTINCT FROM c.painel_token THEN RAISE EXCEPTION 'Link inválido'; END IF;
  RETURN jsonb_build_object(
    'faixas', jsonb_build_object('tranquilo', c.faixa_tranquilo_min, 'atencao', c.faixa_atencao_min, 'apertado', c.faixa_apertado_min),
    'hoje', hoje,
    'encomendas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'cliente', split_part(trim(cliente_nome),' ',1), 'descricao', descricao, 'quantidade', quantidade,
        'unidade', unidade, 'observacoes', observacoes, 'data_entrega', data_entrega, 'hora_entrega', hora_entrega,
        'tipo', tipo, 'status', status, 'iniciada_em', iniciada_em, 'entregue_em', entregue_em) ORDER BY data_entrega, hora_entrega)
      FROM public.encomendas
      WHERE (status IN ('agendada','em_producao') AND data_entrega BETWEEN hoje AND hoje + 7)
         OR (status IN ('agendada','em_producao') AND data_entrega < hoje)
         OR (status = 'entregue' AND (entregue_em AT TIME ZONE 'America/Sao_Paulo')::date = hoje)), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.iniciar_encomenda(p_token text, p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.config_producao WHERE id=1 AND painel_token = p_token) THEN RAISE EXCEPTION 'Link inválido'; END IF;
  UPDATE public.encomendas SET status='em_producao', iniciada_em=now() WHERE id=p_id AND status='agendada';
END $$;

CREATE OR REPLACE FUNCTION public.get_ficha_encomenda(p_token text, p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.config_producao WHERE id=1 AND painel_token = p_token) THEN RAISE EXCEPTION 'Link inválido'; END IF;
  RETURN (SELECT jsonb_build_object('id', id, 'cliente_nome', split_part(trim(cliente_nome),' ',1), 'descricao', descricao,
    'quantidade', quantidade, 'unidade', unidade, 'observacoes', observacoes, 'data_entrega', data_entrega,
    'hora_entrega', hora_entrega, 'tipo', tipo) FROM public.encomendas WHERE id = p_id);
END $$;

GRANT EXECUTE ON FUNCTION public.get_painel(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_encomenda(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ficha_encomenda(text, uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_sinal_encomenda(uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entregar_encomenda(uuid, jsonb, text, uuid, jsonb) FROM anon;
