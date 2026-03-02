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
import { Plus, Pencil, Trash2, History, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type PriceHistory = Tables<'price_history'>;

interface ProductWithHistory extends Tables<'products'> {
  priceHistory: PriceHistory[];
}

export default function Products() {
  const { products, addProduct, updateProduct, deleteProduct } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithHistory | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductWithHistory | null>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const header = "nome;descricao;marca;categoria;preco_compra;preco_venda;estoque;alerta_minimo";
    const example = "Bolo de Chocolate;Bolo artesanal;Minha Marca;doce;15.00;45.00;10;3";
    const blob = new Blob([header + "\n" + example], { type: "text/csv" });
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
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error("Arquivo vazio ou sem dados"); return; }
      const rows = lines.slice(1); // skip header
      let count = 0;
      for (const row of rows) {
        const cols = row.split(";").map(c => c.trim());
        if (cols.length < 6 || !cols[0]) continue;
        await addProduct({
          name: cols[0],
          description: cols[1] || "",
          brand: cols[2] || "",
          category: cols[3] || "doce",
          purchasePrice: parseFloat(cols[4]) || 0,
          salePrice: parseFloat(cols[5]) || 0,
          stock: parseInt(cols[6]) || 0,
          lowStockThreshold: parseInt(cols[7]) || 5,
        });
        count++;
      }
      toast.success(`${count} produto(s) importado(s) com sucesso!`);
    } catch (err) {
      toast.error("Erro ao importar arquivo");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
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
      updateProduct({
        ...editing,
        name: data.name,
        description: data.description,
        brand: data.brand,
        category: data.category,
        purchase_price: data.purchasePrice,
        sale_price: data.salePrice,
        stock: data.stock,
        low_stock_threshold: data.lowStockThreshold,
      });
    } else {
      addProduct(data);
    }
    setEditing(null);
    setOpen(false);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Produtos</h1>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-48" />
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
          <Button variant="outline" onClick={downloadTemplate} disabled={importing}>
            <Download className="h-4 w-4 mr-1" /> Modelo CSV
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" /> {importing ? "Importando..." : "Importar"}
          </Button>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-3">
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
                <Button type="submit" className="w-full">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum produto cadastrado</TableCell></TableRow>
            )}
            {filtered.map(p => (
              <TableRow key={p.id}>
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
                  <Button variant="ghost" size="icon" onClick={() => setHistoryProduct(p)}><History className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteProduct(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
