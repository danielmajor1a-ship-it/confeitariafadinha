
CREATE TABLE public.cash_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  expected_amount NUMERIC NOT NULL DEFAULT 0,
  counted_amount NUMERIC NOT NULL DEFAULT 0,
  difference NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  total_cash_sales NUMERIC NOT NULL DEFAULT 0,
  total_credit_sales NUMERIC NOT NULL DEFAULT 0,
  total_debit_sales NUMERIC NOT NULL DEFAULT 0,
  total_fiado_received NUMERIC NOT NULL DEFAULT 0,
  total_sangrias NUMERIC NOT NULL DEFAULT 0,
  total_expenses NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own verifications" ON public.cash_verifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all verifications" ON public.cash_verifications
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
