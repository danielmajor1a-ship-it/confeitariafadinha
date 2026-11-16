CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin') OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = _user_id AND is_active);
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['card_rates','cash_movements','cash_registers','clients','price_history','products','recipe_ingredients','recipes','sale_items','sale_payments','sales','stock_movements'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated read %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Active staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "auth read config_producao" ON public.config_producao;
CREATE POLICY "Active staff read config_producao" ON public.config_producao FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "auth all encomendas" ON public.encomendas;
CREATE POLICY "Active staff manage encomendas" ON public.encomendas FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "auth all encomenda_itens" ON public.encomenda_itens;
CREATE POLICY "Active staff manage encomenda_itens" ON public.encomenda_itens FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;
CREATE POLICY "Staff upload own product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND owner = auth.uid() AND public.is_active_staff(auth.uid()));
CREATE POLICY "Owner or admin update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Owner or admin delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));