
-- Cash registers table (abertura/fechamento de caixa)
CREATE TABLE public.cash_registers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  initial_amount NUMERIC NOT NULL DEFAULT 0,
  final_amount NUMERIC,
  counted_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'aberto',
  period_type TEXT NOT NULL DEFAULT 'diario',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cash registers" ON public.cash_registers
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Cash movements table (movimentações)
CREATE TABLE public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'entrada' or 'saida'
  category TEXT NOT NULL, -- 'venda', 'recebimento_fiado', 'despesa', 'sangria', 'ajuste', 'outro'
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'dinheiro',
  description TEXT DEFAULT '',
  reference_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cash movements" ON public.cash_movements
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
