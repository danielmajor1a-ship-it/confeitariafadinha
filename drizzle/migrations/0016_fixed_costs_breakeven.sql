ALTER TABLE public.cash_movements ADD COLUMN expense_type text, ADD COLUMN recurring_cost_id uuid;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_expense_type_check CHECK (expense_type IS NULL OR expense_type IN ('compra_mercadoria','despesa_fixa','despesa_variavel','investimento','retirada_dona'));

CREATE POLICY "Admins can update cash movements" ON public.cash_movements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT UPDATE ON public.cash_movements TO authenticated;

CREATE TABLE public.recurring_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  required_kind text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_costs TO authenticated;
GRANT ALL ON public.recurring_costs TO service_role;
ALTER TABLE public.recurring_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage recurring costs" ON public.recurring_costs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.cost_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  working_days integer NOT NULL DEFAULT 26,
  mei_annual_limit numeric NOT NULL DEFAULT 81000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cost_settings TO authenticated;
GRANT ALL ON public.cost_settings TO service_role;
ALTER TABLE public.cost_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage cost settings" ON public.cost_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));