-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ==================== PRODUCTS ====================
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'doce' CHECK (category IN ('doce', 'salgado', 'bebida', 'outro')),
  purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own products" ON public.products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== PRICE HISTORY ====================
CREATE TABLE public.price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  purchase_price NUMERIC(10,2) NOT NULL,
  sale_price NUMERIC(10,2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own price history" ON public.price_history FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = price_history.product_id AND products.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE products.id = price_history.product_id AND products.user_id = auth.uid()));

-- ==================== CLIENTS ====================
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  total_owed NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own clients" ON public.clients FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== SALES ====================
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'dinheiro' CHECK (payment_method IN ('dinheiro', 'cartao', 'fiado')),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pago' CHECK (status IN ('pago', 'pendente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sales" ON public.sales FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ==================== SALE ITEMS ====================
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sale items" ON public.sale_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid()));

-- ==================== STOCK MOVEMENTS ====================
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  quantity INTEGER NOT NULL,
  reason TEXT DEFAULT '',
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own stock movements" ON public.stock_movements FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ==================== RECIPES ====================
CREATE TABLE public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  instructions TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own recipes" ON public.recipes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== RECIPE INGREDIENTS ====================
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'un'
);
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own recipe ingredients" ON public.recipe_ingredients FOR ALL
  USING (EXISTS (SELECT 1 FROM public.recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()));

-- ==================== COSTS ====================
CREATE TABLE public.costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixo' CHECK (type IN ('fixo', 'variavel')),
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own costs" ON public.costs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);