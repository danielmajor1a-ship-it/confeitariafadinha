import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { SaleItem, PAYMENT_LABELS } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Sales() {
  const { products, sales, clients, addSale } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'cartao' | 'fiado'>('dinheiro');
  const [clientId, setClientId] = useState("");

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const total = items.reduce((s, i) => s + i.subtotal, 0);

  function addItem() {
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;
    if (product.stock < qty) { toast.error("Estoque insuficiente!"); return; }
    const existing = items.find(i => i.productId === product.id);
    if (existing) {
      setItems(items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + qty, subtotal: (i.quantity + qty) * i.unitPrice } : i));
    } else {
      setItems([...items, { productId: product.id, productName: product.name, quantity: qty, unitPrice: product.salePrice, subtotal: qty * product.salePrice }]);
    }
    setSelectedProduct("");
    setQty(1);
  }

  function finalizeSale() {
    if (items.length === 0) { toast.error("Adicione itens à venda"); return; }
    if (paymentMethod === 'fiado' && !clientId) { toast.error("Selecione um cliente para fiado"); return; }
    addSale(items, paymentMethod, clientId || undefined);
    setItems([]);
    setOpen(false);
    toast.success("Venda registrada com sucesso!");
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Vendas</h1>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setItems([]); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova Venda</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova Venda</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Produto" /></SelectTrigger>
                  <SelectContent>
                    {products.filter(p => p.stock > 0).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.stock} un) - {fmt(p.salePrice)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} className="w-20" />
                <Button onClick={addItem} variant="secondary">Add</Button>
              </div>

              {items.length > 0 && (
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead>Subtotal</TableHead><TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {items.map(item => (
                        <TableRow key={item.productId}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{fmt(item.subtotal)}</TableCell>
                          <TableCell><Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.productId !== item.productId))}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-secondary rounded-xl">
                <span className="font-semibold">Total:</span>
                <span className="text-xl font-bold font-display">{fmt(total)}</span>
              </div>

              <div><Label>Pagamento</Label>
                <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'fiado' && (
                <div><Label>Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={finalizeSale} className="w-full" size="lg">
                <ShoppingCart className="h-4 w-4 mr-2" /> Finalizar Venda
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Itens</TableHead><TableHead>Total</TableHead><TableHead>Pagamento</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {sales.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma venda registrada</TableCell></TableRow>}
            {[...sales].reverse().map(s => (
              <TableRow key={s.id}>
                <TableCell>{new Date(s.date).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell>{s.items.map(i => `${i.productName} (${i.quantity})`).join(', ')}</TableCell>
                <TableCell className="font-semibold">{fmt(s.total)}</TableCell>
                <TableCell><Badge variant="secondary">{PAYMENT_LABELS[s.paymentMethod]}</Badge></TableCell>
                <TableCell>
                  <Badge variant={s.status === 'pago' ? 'default' : 'destructive'}>
                    {s.status === 'pago' ? 'Pago' : 'Pendente'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
