ALTER TABLE public.purchases DROP CONSTRAINT purchases_source_check;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_source_check CHECK (source = ANY (ARRAY['nf_xml','nf_foto','nf_pdf','cupom_foto','cupom_fiscal','manual']));

CREATE POLICY "Admin envia documentos de compra" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'purchase-documents' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin le documentos de compra" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'purchase-documents' AND public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.register_purchase(_supplier text, _source text, _items jsonb, _document_url text, _purchase_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  r := public.register_purchase(_supplier, _source, _items);
  UPDATE public.purchases SET document_url = _document_url, purchase_date = COALESCE(_purchase_date, purchase_date)
  WHERE id = (r->>'purchase_id')::uuid;
  RETURN r;
END $$;