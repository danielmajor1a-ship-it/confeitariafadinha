import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, PackagePlus } from "lucide-react";
import { toast } from "sonner";

export default function Stock() {
  const { products, stockMovements, addStockEntry } = useApp();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("Compra/Reposição");

  function handleEntry() {
    if (!productId) { toast.error("Selecione um produto"); return; }
    addStockEntry(productId, quantity, reason);
    setOpen(false);
    toast.success("Entrada registrada!");
  }

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'Produto removido';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Estoque</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><PackagePlus className="h-4 w-4 mr-1" /> Entrada de Estoque</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Entrada de Estoque</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Produto</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (atual: {p.stock})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Quantidade</Label><Input type="number" min={1} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} /></div>
              <div><Label>Motivo</Label><Input value={reason} onChange={e => setReason(e.target.value)} /></div>
              <Button onClick={handleEntry} className="w-full">Confirmar Entrada</Button>
            </div>
          </DialogContent>
        </Dialog>
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
                      {p.stock <= p.lowStockThreshold
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
                {[...stockMovements].reverse().slice(0, 20).map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{new Date(m.date).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{getProductName(m.productId)}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === 'entrada' ? 'default' : 'secondary'}>
                        {m.type === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                      </Badge>
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
