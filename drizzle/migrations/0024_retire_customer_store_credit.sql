CREATE OR REPLACE FUNCTION public.add_client_credit(_client_id uuid, _amount numeric, _method text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 RAISE EXCEPTION 'Crédito de cliente não está disponível no sistema';
END $$;
CREATE OR REPLACE FUNCTION public.adjust_client_credit(_client_id uuid, _new_balance numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 RAISE EXCEPTION 'Crédito de cliente não está disponível no sistema';
END $$;
REVOKE EXECUTE ON FUNCTION public.add_client_credit(uuid,numeric,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_client_credit(uuid,numeric,text) FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_credit_sale_payment ON public.sale_payments;
CREATE OR REPLACE FUNCTION public.handle_credit_sale_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.payment_method = 'credito_loja' THEN
  RAISE EXCEPTION 'Crédito de cliente não está disponível no sistema';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_credit_sale_payment BEFORE INSERT OR UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.handle_credit_sale_payment();
CREATE OR REPLACE FUNCTION public.skip_credit_cash_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.payment_method = 'credito_loja' OR NEW.category = 'credito_cliente' THEN
  RAISE EXCEPTION 'Crédito de cliente não está disponível no sistema';
 END IF;
 RETURN NEW;
END $$;
COMMENT ON TABLE public.client_credit_movements IS 'DEPRECATED: customer credit feature rejected; retained for historical preservation only.';
COMMENT ON COLUMN public.clients.credit_balance IS 'DEPRECATED: customer credit feature retired; no automatic fiado offsets.';
COMMENT ON COLUMN public.profiles.can_manage_credit IS 'DEPRECATED: customer credit operations disabled.';