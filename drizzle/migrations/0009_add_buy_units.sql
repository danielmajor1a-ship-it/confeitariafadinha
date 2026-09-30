ALTER TABLE public.products ADD COLUMN IF NOT EXISTS buy_units jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.products SET buy_units = jsonb_build_array(jsonb_build_object('unit', buy_unit, 'factor', purchase_factor)) WHERE buy_unit IS NOT NULL AND purchase_factor > 0;
COMMENT ON COLUMN public.products.buy_unit IS 'DEPRECATED: replaced by buy_units';