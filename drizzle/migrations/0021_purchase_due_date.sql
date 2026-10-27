ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS cost_date date GENERATED ALWAYS AS (COALESCE(due_date, purchase_date)) STORED;
COMMENT ON COLUMN public.purchases.cost_date IS 'Date the cost counts in analytics: due date for deferred-payment suppliers, else purchase date';