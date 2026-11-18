ALTER TABLE public.encomendas ADD COLUMN IF NOT EXISTS linhas jsonb, ADD COLUMN IF NOT EXISTS endereco text, ADD COLUMN IF NOT EXISTS vista_em timestamptz;
UPDATE public.encomendas SET vista_em = now() WHERE vista_em IS NULL;

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
        'tipo', tipo, 'status', status, 'iniciada_em', iniciada_em, 'entregue_em', entregue_em,
        'linhas', linhas, 'endereco', CASE WHEN tipo='entrega' THEN endereco END, 'nova', vista_em IS NULL) ORDER BY data_entrega, hora_entrega)
      FROM public.encomendas
      WHERE (status IN ('agendada','em_producao') AND data_entrega <= hoje + 7)
         OR (status = 'entregue' AND (entregue_em AT TIME ZONE 'America/Sao_Paulo')::date = hoje)), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.get_ficha_encomenda(p_token text, p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.config_producao WHERE id=1 AND painel_token = p_token) THEN RAISE EXCEPTION 'Link inválido'; END IF;
  RETURN (SELECT jsonb_build_object('id', id, 'cliente_nome', split_part(trim(cliente_nome),' ',1), 'descricao', descricao,
    'quantidade', quantidade, 'unidade', unidade, 'observacoes', observacoes, 'data_entrega', data_entrega,
    'hora_entrega', hora_entrega, 'tipo', tipo, 'linhas', linhas, 'endereco', CASE WHEN tipo='entrega' THEN endereco END)
    FROM public.encomendas WHERE id = p_id);
END $$;

CREATE OR REPLACE FUNCTION public.marcar_encomenda_vista(p_token text, p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.config_producao WHERE id=1 AND painel_token = p_token) THEN RAISE EXCEPTION 'Link inválido'; END IF;
  UPDATE public.encomendas SET vista_em = now() WHERE id = p_id AND vista_em IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.marcar_encomenda_vista(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_painel(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ficha_encomenda(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_encomenda_vista(text, uuid) TO anon, authenticated;