ALTER TABLE public.clients ADD COLUMN credit_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN can_manage_credit boolean NOT NULL DEFAULT false;

CREATE TABLE public.client_credit_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid,
  kind text NOT NULL,
  amount numeric NOT NULL,
  payment_method text,
  sale_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_credit_movements TO authenticated;
GRANT ALL ON public.client_credit_movements TO service_role;
ALTER TABLE public.client_credit_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view credit movements" ON public.client_credit_movements FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.add_client_credit(_client_id uuid, _amount numeric, _method text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _c record; _abate numeric := 0; _rest numeric; _reg uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=_uid AND p.is_active AND p.can_manage_credit)) THEN
    RAISE EXCEPTION 'Sem permissão para lançar crédito'; END IF;
  IF COALESCE(_amount,0) <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF _method NOT IN ('dinheiro','pix','debito','credito') THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
  SELECT id INTO _reg FROM public.cash_registers WHERE user_id=_uid AND status='aberto' ORDER BY opened_at DESC LIMIT 1;
  IF _reg IS NULL THEN RAISE EXCEPTION 'Abra o caixa antes de lançar crédito'; END IF;
  SELECT * INTO _c FROM public.clients WHERE id=_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  _abate := LEAST(_amount, GREATEST(_c.total_owed,0));
  _rest := _amount - _abate;
  IF _abate > 0 THEN
    UPDATE public.clients SET total_owed = total_owed - _abate, updated_at=now() WHERE id=_client_id;
    IF _c.total_owed - _abate <= 0.001 THEN
      UPDATE public.sales SET status='pago' WHERE client_id=_client_id AND status='pendente';
    END IF;
    INSERT INTO public.cash_movements (cash_register_id,user_id,type,category,amount,payment_method,description)
    VALUES (_reg,_uid,'entrada','recebimento_fiado',_abate,_method,'Recebimento fiado - '||_c.name);
    INSERT INTO public.client_credit_movements (client_id,user_id,kind,amount,payment_method,notes)
    VALUES (_client_id,_uid,'abate_fiado',_abate,_method,'Crédito deixado usado para pagar fiado');
  END IF;
  IF _rest > 0 THEN
    UPDATE public.clients SET credit_balance = credit_balance + _rest, updated_at=now() WHERE id=_client_id;
    INSERT INTO public.cash_movements (cash_register_id,user_id,type,category,amount,payment_method,description)
    VALUES (_reg,_uid,'entrada','credito_cliente',_rest,_method,'Crédito deixado - '||_c.name);
    INSERT INTO public.client_credit_movements (client_id,user_id,kind,amount,payment_method,notes)
    VALUES (_client_id,_uid,'deposito',_rest,_method,_notes);
  END IF;
  RETURN jsonb_build_object('abate_fiado',_abate,'credito',_rest);
END $$;

CREATE OR REPLACE FUNCTION public.adjust_client_credit(_client_id uuid, _new_balance numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _old numeric;
BEGIN
  IF NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Só a administradora pode corrigir o crédito'; END IF;
  IF _new_balance IS NULL OR _new_balance < 0 THEN RAISE EXCEPTION 'Saldo inválido'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
  SELECT credit_balance INTO _old FROM public.clients WHERE id=_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  UPDATE public.clients SET credit_balance=_new_balance, updated_at=now() WHERE id=_client_id;
  INSERT INTO public.client_credit_movements (client_id,user_id,kind,amount,notes)
  VALUES (_client_id,_uid,'ajuste',_new_balance-_old,_reason);
END $$;

-- Sale payments: use credit / auto-abate fiado / restore on delete
CREATE OR REPLACE FUNCTION public.handle_credit_sale_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid; _bal numeric; _owed numeric; _x numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_method NOT IN ('credito_loja','fiado') THEN RETURN NEW; END IF;
    SELECT client_id INTO _cid FROM public.sales WHERE id=NEW.sale_id;
    IF NEW.payment_method='credito_loja' THEN
      IF _cid IS NULL THEN RAISE EXCEPTION 'Selecione o cliente para usar o crédito'; END IF;
      SELECT credit_balance INTO _bal FROM public.clients WHERE id=_cid FOR UPDATE;
      IF COALESCE(_bal,0) + 0.001 < NEW.amount THEN RAISE EXCEPTION 'Crédito insuficiente (saldo %)', to_char(COALESCE(_bal,0),'FM999990D00'); END IF;
      UPDATE public.clients SET credit_balance=credit_balance-NEW.amount, updated_at=now() WHERE id=_cid;
      INSERT INTO public.client_credit_movements (client_id,user_id,kind,amount,sale_id,notes)
      VALUES (_cid,auth.uid(),'uso',NEW.amount,NEW.sale_id,'Compra usando crédito');
    ELSIF _cid IS NOT NULL THEN
      SELECT credit_balance,total_owed INTO _bal,_owed FROM public.clients WHERE id=_cid FOR UPDATE;
      _x := LEAST(COALESCE(_bal,0), GREATEST(COALESCE(_owed,0),0));
      IF _x > 0 THEN
        UPDATE public.clients SET credit_balance=credit_balance-_x, total_owed=total_owed-_x, updated_at=now() WHERE id=_cid;
        INSERT INTO public.client_credit_movements (client_id,user_id,kind,amount,sale_id,notes)
        VALUES (_cid,auth.uid(),'abate_fiado',_x,NEW.sale_id,'Crédito usado para abater compra no fiado');
      END IF;
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.payment_method='credito_loja' THEN
      SELECT client_id INTO _cid FROM public.sales WHERE id=OLD.sale_id;
      IF _cid IS NOT NULL THEN
        UPDATE public.clients SET credit_balance=credit_balance+OLD.amount, updated_at=now() WHERE id=_cid;
        INSERT INTO public.client_credit_movements (client_id,user_id,kind,amount,sale_id,notes)
        VALUES (_cid,auth.uid(),'estorno',OLD.amount,OLD.sale_id,'Venda apagada: crédito devolvido');
      END IF;
    END IF;
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER trg_credit_sale_payment AFTER INSERT OR DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_credit_sale_payment();

-- Using store credit is not new money in the drawer
CREATE OR REPLACE FUNCTION public.skip_credit_cash_movement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category='venda' AND NEW.payment_method='credito_loja' THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_skip_credit_cash_movement BEFORE INSERT ON public.cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.skip_credit_cash_movement();

-- Prevent direct edits of credit_balance from the app
CREATE OR REPLACE FUNCTION public.guard_client_credit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance AND current_user = 'authenticated' THEN
    NEW.credit_balance := OLD.credit_balance;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_client_credit BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_credit();