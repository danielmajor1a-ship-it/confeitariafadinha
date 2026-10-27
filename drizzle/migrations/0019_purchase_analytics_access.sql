CREATE OR REPLACE FUNCTION public.can_view_purchase_analytics(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin') OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id=_user_id AND p.is_active AND 'analise-compras' = ANY(p.allowed_tabs));
$$;
CREATE POLICY "Analytics read purchases" ON public.purchases FOR SELECT TO authenticated USING (public.can_view_purchase_analytics(auth.uid()));
CREATE POLICY "Analytics read purchase items" ON public.purchase_items FOR SELECT TO authenticated USING (public.can_view_purchase_analytics(auth.uid()));