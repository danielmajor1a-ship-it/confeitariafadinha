import { useState, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { CATEGORY_LABELS } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, History, Upload, Download, Camera, ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type PriceHistory = Tables<'price_history'>;

interface ProductWithHistory extends Tables<'products'> {
  priceHistory: PriceHistory[];
}

export default function Products() {
  const { products, addProduct, updateProduct, deleteProduct, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithHistory | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductWithHistory | null>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);

  function normalizeCategory(cat: string): string {
    const lower = cat.toLowerCase().trim();
    if (VALID_CATEGORIES.includes(lower)) return lower;
    const map: Record<string, string> = {
      'bebidas': 'bebida', 'doces': 'doce', 'salgados': 'salgado',
      'outros': 'outro', 'mercearia': 'outro', 'limpeza': 'outro',
    };
    return map[lower] || 'outro';
  }

  function parseNumber(value: string): number {
    if (!value || !value.trim()) return 0;
    let cleaned = value.trim().replace(/\s/g, '').replace(/[R$]/g, '');
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  function detectDelimiter(lines: string[]): string {
    const first = lines[0] || '';
    const semicolons = (first.match(/;/g) || []).length;
    const commas = (first.match(/,/g) || []).length;
    const tabs = (first.match(/\t/g) || []).length;
    if (semicolons >= commas && semicolons >= tabs) return ';';
    if (tabs >= commas) return '\t';
    return ',';
  }

  function downloadTemplate() {
    const header = "nome;descricao;marca;categoria;preco_compra;preco_venda;estoque;alerta_minimo";
    const catInfo = `# Categorias validas: ${VALID_CATEGORIES.join(', ')}`;
    const example = "Bolo de Chocolate;Bolo artesanal;Minha Marca;doce;15.00;45.00;10;3";
    const blob = new Blob([header + "\n" + catInfo + "\n" + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_produtos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
      if (lines.length < 2) { toast.error("Arquivo vazio ou sem dados"); setImporting(false); return; }
      const delimiter = detectDelimiter(lines);
      const rows = lines.slice(1);
      let count = 0;
      let errors = 0;
      for (const row of rows) {
        const cols = row.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 2 || !cols[0]) continue;
        try {
          await addProduct({
            name: cols[0],
            description: cols[1] || "",
            brand: cols[2] || "",
            category: normalizeCategory(cols[3] || "outro"),
            purchasePrice: parseNumber(cols[4] || "0"),
            salePrice: parseNumber(cols[5] || "0"),
            stock: parseInt(cols[6]) || 0,
            lowStockThreshold: parseInt(cols[7]) || 5,
          });
          count++;
        } catch {
          errors++;
        }
      }
      if (count > 0) toast.success(`${count} produto(s) importado(s) com sucesso!`);
      if (errors > 0) toast.error(`${errors} produto(s) com erro na importação`);
    } catch (err) {
      toast.error("Erro ao importar arquivo");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 5MB.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadImage(productId: string): Promise<string | null> {
    if (!imageFile) return null;
    setUploadingImage(true);
    try {
      const ext = imageFile.name.split('.').pop() || 'jpg';
      const path = `${productId}.${ext}`;
      // Remove old image if exists
      await supabase.storage.from('product-images').remove([path]);
      const { error } = await supabase.storage.from('product-images').upload(path, imageFile, {
        cacheControl: '3600',
        upsert: true,
      });
      if (error) { toast.error("Erro ao enviar imagem"); return null; }
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      return urlData.publicUrl + '?t=' + Date.now();
    } catch {
      toast.error("Erro ao enviar imagem");
      return null;
    } finally {
      setUploadingImage(false);
    }
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (imageRef.current) imageRef.current.value = "";
  }

  function openDialog(product?: ProductWithHistory) {
    if (product) {
      setEditing(product);
      setImagePreview((product as any).image_url || null);
    } else {
      setEditing(null);
      setImagePreview(null);
    }
    setImageFile(null);
    setOpen(true);
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get('name') as string,
      description: fd.get('description') as string,
      brand: fd.get('brand') as string,
      category: fd.get('category') as string,
      purchasePrice: parseFloat(fd.get('purchasePrice') as string) || 0,
      salePrice: parseFloat(fd.get('salePrice') as string) || 0,
      stock: parseInt(fd.get('stock') as string) || 0,
      lowStockThreshold: parseInt(fd.get('lowStockThreshold') as string) || 5,
    };
    if (editing) {
      let imageUrl = (editing as any).image_url;
      if (imageFile) {
        const url = await uploadImage(editing.id);
        if (url) imageUrl = url;
      }
      const { error } = await supabase.from('products').update({
        name: data.name, description: data.description, brand: data.brand, category: data.category,
        purchase_price: data.purchasePrice, sale_price: data.salePrice,
        stock: data.stock, low_stock_threshold: data.lowStockThreshold,
        image_url: imageUrl,
      }).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      if (editing.purchase_price !== data.purchasePrice || editing.sale_price !== data.salePrice) {
        await supabase.from('price_history').insert({ product_id: editing.id, purchase_price: data.purchasePrice, sale_price: data.salePrice });
      }
      await refresh();
    } else {
      await addProduct(data);
      if (imageFile) {
        const { data: newProducts } = await supabase.from('products').select('id').eq('name', data.name).order('created_at', { ascending: false }).limit(1);
        if (newProducts && newProducts.length > 0) {
          const url = await uploadImage(newProducts[0].id);
          if (url) {
            await supabase.from('products').update({ image_url: url }).eq('id', newProducts[0].id);
            await refresh();
          }
        }
      }
    }
    clearImage();
    setEditing(null);
    setOpen(false);
    toast.success("Produto salvo com sucesso!");
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Produtos</h1>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-48" />
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
          <Button variant="outline" onClick={downloadTemplate} disabled={importing} className="min-h-[44px]">
            <Download className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Modelo CSV</span>
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="min-h-[44px]">
            <Upload className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">{importing ? "Importando..." : "Importar"}</span>
          </Button>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); clearImage(); } }}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()} className="min-h-[44px]"><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-3">
                {/* Image upload */}
                <div>
                  <Label>Foto do Produto</Label>
                  <div className="mt-1 flex flex-col items-center gap-2">
                    {imagePreview ? (
                      <div className="relative w-32 h-32 rounded-xl overflow-hidden border-2 border-border">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={clearImage}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-32 h-32 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        if (imageRef.current) {
                          imageRef.current.removeAttribute('capture');
                          imageRef.current.click();
                        }
                      }} className="min-h-[44px]">
                        <Upload className="h-4 w-4 mr-1" /> Galeria
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        if (imageRef.current) {
                          imageRef.current.setAttribute('capture', 'environment');
                          imageRef.current.click();
                        }
                      }} className="min-h-[44px]">
                        <Camera className="h-4 w-4 mr-1" /> Câmera
                      </Button>
                    </div>
                  </div>
                </div>
                <div><Label>Nome</Label><Input name="name" required defaultValue={editing?.name} /></div>
                <div><Label>Descrição</Label><Input name="description" defaultValue={editing?.description || ''} /></div>
                <div><Label>Marca</Label><Input name="brand" defaultValue={editing?.brand || ''} /></div>
                <div>
                  <Label>Categoria</Label>
                  <Select name="category" defaultValue={editing?.category || 'doce'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Preço Compra</Label><Input name="purchasePrice" type="number" step="0.01" defaultValue={editing?.purchase_price} /></div>
                  <div><Label>Preço Venda</Label><Input name="salePrice" type="number" step="0.01" defaultValue={editing?.sale_price} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Estoque</Label><Input name="stock" type="number" defaultValue={editing?.stock || 0} /></div>
                  <div><Label>Alerta Mínimo</Label><Input name="lowStockThreshold" type="number" defaultValue={editing?.low_stock_threshold || 5} /></div>
                </div>
                <Button type="submit" className="w-full min-h-[48px]" disabled={uploadingImage}>
                  {uploadingImage ? "Enviando imagem..." : "Salvar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mobile/Tablet: Card view. Desktop: Table view */}
      <div className="block md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-8">Nenhum produto cadastrado</div>
        )}
        {filtered.map(p => (
          <div key={p.id} className="rounded-2xl border bg-card p-4 flex gap-3 items-start">
            {(p as any).image_url ? (
              <img src={(p as any).image_url} alt={p.name} className="w-16 h-16 rounded-xl object-cover border border-border shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <Badge variant="secondary" className="mt-1">{CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] || p.category}</Badge>
                </div>
                <span className={`text-sm font-bold shrink-0 ${p.stock <= p.low_stock_threshold ? "text-destructive" : ""}`}>
                  {p.stock} un
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm">
                <span className="text-muted-foreground">Compra: {fmt(p.purchase_price)}</span>
                <span className="font-semibold">Venda: {fmt(p.sale_price)}</span>
              </div>
              <div className="flex gap-1 mt-2">
                <Button variant="ghost" size="sm" onClick={() => setHistoryProduct(p)} className="min-h-[40px]"><History className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => openDialog(p)} className="min-h-[40px]"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => deleteProduct(p.id)} className="min-h-[40px]"><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block rounded-2xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Foto</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Compra</TableHead>
              <TableHead>Venda</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum produto cadastrado</TableCell></TableRow>
            )}
            {filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  {(p as any).image_url ? (
                    <img src={(p as any).image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-border" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><Badge variant="secondary">{CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] || p.category}</Badge></TableCell>
                <TableCell>{fmt(p.purchase_price)}</TableCell>
                <TableCell>{fmt(p.sale_price)}</TableCell>
                <TableCell>
                  <span className={p.stock <= p.low_stock_threshold ? "text-destructive font-bold" : ""}>
                    {p.stock}
                  </span>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => setHistoryProduct(p)} className="min-h-[44px] min-w-[44px]"><History className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openDialog(p)} className="min-h-[44px] min-w-[44px]"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteProduct(p.id)} className="min-h-[44px] min-w-[44px]"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!historyProduct} onOpenChange={() => setHistoryProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Histórico de Preços - {historyProduct?.name}</DialogTitle></DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Compra</TableHead><TableHead>Venda</TableHead></TableRow></TableHeader>
            <TableBody>
              {historyProduct?.priceHistory.map((h, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(h.recorded_at).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{fmt(h.purchase_price)}</TableCell>
                  <TableCell>{fmt(h.sale_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
