ALTER TABLE public.encomendas
  ADD COLUMN IF NOT EXISTS taxa_entrega numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrega_paga_por text NOT NULL DEFAULT 'cliente' CHECK (entrega_paga_por IN ('cliente','loja'));

DROP FUNCTION IF EXISTS public.entregar_encomenda(uuid, jsonb, text, uuid, jsonb);
CREATE FUNCTION public.entregar_encomenda(_encomenda_id uuid, _items jsonb, _payment_method text, _client_id uuid, _payments jsonb, _taxa_metodo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.encomendas%ROWTYPE; _sale uuid; _uid uuid := auth.uid(); _reg uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT * INTO e FROM public.encomendas WHERE id = _encomenda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Encomenda não encontrada'; END IF;
  IF e.status IN ('entregue','cancelada') THEN RAISE EXCEPTION 'Encomenda já está %', e.status; END IF;
  _sale := public.create_sale_with_items(_items, _payment_method, _client_id, _payments);
  IF e.tipo = 'entrega' AND COALESCE(e.taxa_entrega,0) > 0 THEN
    SELECT id INTO _reg FROM public.cash_registers WHERE user_id = _uid AND status = 'aberto' ORDER BY opened_at DESC LIMIT 1;
    IF _reg IS NULL THEN RAISE EXCEPTION 'Abra o caixa para registrar a entrega'; END IF;
    IF e.entrega_paga_por = 'loja' THEN
      INSERT INTO public.cash_movements (cash_register_id, user_id, type, category, amount, payment_method, description, reference_id, expense_type)
      VALUES (_reg, _uid, 'saida', 'despesa', e.taxa_entrega, 'dinheiro', 'Entrega encomenda - ' || e.cliente_nome, _encomenda_id::text, 'despesa_variavel');
    ELSE
      INSERT INTO public.cash_movements (cash_register_id, user_id, type, category, amount, payment_method, description, reference_id)
      VALUES (_reg, _uid, 'entrada', 'taxa_entrega', e.taxa_entrega, COALESCE(NULLIF(_taxa_metodo,''),'dinheiro'), 'Taxa de entrega - ' || e.cliente_nome, _encomenda_id::text);
    END IF;
  END IF;
  UPDATE public.encomendas SET status='entregue', entregue_em=now(), venda_entrega_id=_sale WHERE id=_encomenda_id;
  RETURN _sale;
END $$;
REVOKE ALL ON FUNCTION public.entregar_encomenda(uuid, jsonb, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entregar_encomenda(uuid, jsonb, text, uuid, jsonb, text) TO authenticated, service_role;