ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sells boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS used_in_recipes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_unit text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS usage_unit text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS conversion_factor numeric NOT NULL DEFAULT 1;
ALTER TABLE public.products ADD CONSTRAINT products_conversion_factor_positive CHECK (conversion_factor > 0);
UPDATE public.products p SET used_in_recipes = true
  WHERE EXISTS (SELECT 1 FROM public.recipe_ingredients ri WHERE ri.product_id = p.id);