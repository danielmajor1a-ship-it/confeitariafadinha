ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS nfe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_nfe_key_uniq ON public.purchases(nfe_key) WHERE nfe_key IS NOT NULL;