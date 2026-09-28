ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_unit text, ADD COLUMN IF NOT EXISTS purchase_factor numeric CHECK (purchase_factor IS NULL OR purchase_factor > 0);
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS xml_quantity numeric, ADD COLUMN IF NOT EXISTS xml_unit text;
COMMENT ON COLUMN public.products.stock_unit IS 'Unidade em que o estoque é controlado (ex: UN, KG)';
COMMENT ON COLUMN public.products.purchase_factor IS 'Quantas unidades de estoque equivalem a 1 unidade de compra do fornecedor';