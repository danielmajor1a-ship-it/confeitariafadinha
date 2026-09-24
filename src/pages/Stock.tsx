import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

export default function Stock() {
  const { products, stockMovements, addStockEntry } = useApp();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"mais" | "menos">("mais");
  const [saving, setSaving] = useState(false);

  async function handleEntry() {
    if (!productId) { toast.error("Selecione um produto"); return; }
    if (!(quantity > 0)) { toast.error("Informe a quantidade"); return; }
    if (!reason.trim()) { toast.error("Informe o motivo do ajuste"); return; }
    setSaving(true);
    try {
      await addStockEntry(productId, direction === "mais" ? quantity : -quantity, reason.trim());
      setOpen(false); setReason(""); setQuantity(1); setProductId("");
      toast.success("Ajuste registrado!");
    } catch { /* erro já exibido */ } finally { setSaving(false); }
  }

  const TYPE_LABEL: Record<string, string> = {
    compra: "↑ Compra", venda: "↓ Venda", consumo_receita: "↓ Consumo receita",
    ajuste: "± Ajuste", perda: "↓ Perda", ajuste_contagem: "± Contagem",
  };

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'Produto removido';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Estoque</h1>
        <div className="flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="min-h-[44px]"><SlidersHorizontal className="h-4 w-4 mr-1" /> Ajustar estoque</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajustar estoque</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Produto</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (atual: {p.stock})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tipo</Label>
                <Select value={direction} onValueChange={v => setDirection(v as "mais" | "menos")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mais">Somar ao estoque</SelectItem>
                    <SelectItem value="menos">Tirar do estoque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Quantidade</Label><Input type="number" min={1} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} /></div>
              <div><Label>Motivo (obrigatório)</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: correção de contagem" /></div>
              <p className="text-xs text-muted-foreground">Ajuste não altera custo. Para entrada com custo, use a tela Compras.</p>
              <Button onClick={handleEntry} className="w-full" disabled={saving}>{saving ? "Salvando..." : "Confirmar ajuste"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="section-title mb-3">Saldo Atual</h2>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Estoque</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {products.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.stock}</TableCell>
                    <TableCell>
                      {p.stock <= p.low_stock_threshold
                        ? <Badge variant="destructive">Baixo</Badge>
                        : <Badge variant="secondary">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h2 className="section-title mb-3">Movimentações Recentes</h2>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead>Qtd</TableHead></TableRow></TableHeader>
              <TableBody>
                {stockMovements.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma movimentação</TableCell></TableRow>}
                {stockMovements.slice(0, 20).map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{new Date(m.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{getProductName(m.product_id)}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === 'compra' ? 'default' : 'secondary'}>{TYPE_LABEL[m.type] || m.type}</Badge>
                    </TableCell>
                    <TableCell>{m.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
