
-- Drop existing restrictive policies and replace with shared-read policies

-- PRODUCTS: everyone reads, owner/admin writes
DROP POLICY IF EXISTS "Users manage own products" ON public.products;
CREATE POLICY "Authenticated read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own products" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own products" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own products" ON public.products FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- CLIENTS
DROP POLICY IF EXISTS "Users manage own clients" ON public.clients;
CREATE POLICY "Authenticated read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own clients" ON public.clients FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own clients" ON public.clients FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- SALES
DROP POLICY IF EXISTS "Users manage own sales" ON public.sales;
CREATE POLICY "Authenticated read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sales" ON public.sales FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own sales" ON public.sales FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- SALE_ITEMS
DROP POLICY IF EXISTS "Users view own sale items" ON public.sale_items;
CREATE POLICY "Authenticated read sale_items" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert sale_items" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);
CREATE POLICY "Users delete sale_items" ON public.sale_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND (sales.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
);

-- STOCK_MOVEMENTS
DROP POLICY IF EXISTS "Users manage own stock movements" ON public.stock_movements;
CREATE POLICY "Authenticated read stock_movements" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own stock_movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete stock_movements" ON public.stock_movements FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- RECIPES
DROP POLICY IF EXISTS "Users manage own recipes" ON public.recipes;
CREATE POLICY "Authenticated read recipes" ON public.recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own recipes" ON public.recipes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own recipes" ON public.recipes FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own recipes" ON public.recipes FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- RECIPE_INGREDIENTS
DROP POLICY IF EXISTS "Users view own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Authenticated read recipe_ingredients" ON public.recipe_ingredients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert recipe_ingredients" ON public.recipe_ingredients FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid())
);
CREATE POLICY "Users update recipe_ingredients" ON public.recipe_ingredients FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND (recipes.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
);
CREATE POLICY "Users delete recipe_ingredients" ON public.recipe_ingredients FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND (recipes.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
);

-- COSTS
DROP POLICY IF EXISTS "Users manage own costs" ON public.costs;
CREATE POLICY "Authenticated read costs" ON public.costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own costs" ON public.costs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own costs" ON public.costs FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- PRICE_HISTORY
DROP POLICY IF EXISTS "Users view own price history" ON public.price_history;
CREATE POLICY "Authenticated read price_history" ON public.price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert price_history" ON public.price_history FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM products WHERE products.id = price_history.product_id AND products.user_id = auth.uid())
);

-- CASH_REGISTERS
DROP POLICY IF EXISTS "Users manage own cash registers" ON public.cash_registers;
CREATE POLICY "Authenticated read cash_registers" ON public.cash_registers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own cash_registers" ON public.cash_registers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cash_registers" ON public.cash_registers FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- CASH_MOVEMENTS
DROP POLICY IF EXISTS "Users manage own cash movements" ON public.cash_movements;
CREATE POLICY "Authenticated read cash_movements" ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own cash_movements" ON public.cash_movements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete cash_movements" ON public.cash_movements FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- CARD_RATES: keep admin-only write, but allow all authenticated to read
DROP POLICY IF EXISTS "Users read card rates" ON public.card_rates;
CREATE POLICY "Authenticated read card_rates" ON public.card_rates FOR SELECT TO authenticated USING (true);
