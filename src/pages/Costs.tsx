import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";

export default function Costs() {
  const { costs, products, addCost, deleteCost } = useApp();
  const [open, setOpen] = useState(false);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fixedTotal = costs.filter(c => c.type === 'fixo').reduce((s, c) => s + c.value, 0);
  const varTotal = costs.filter(c => c.type === 'variavel').reduce((s, c) => s + c.value, 0);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await addCost({
      name: fd.get('name') as string,
      type: fd.get('type') as string,
      value: parseFloat(fd.get('value') as string) || 0,
      productId: (fd.get('productId') as string) || undefined,
    });
    setOpen(false);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Custos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo Custo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Custo</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-3">
              <div><Label>Nome</Label><Input name="name" required /></div>
              <div><Label>Tipo</Label>
                <Select name="type" defaultValue="fixo">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixo">Fixo</SelectItem>
                    <SelectItem value="variavel">Variável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input name="value" type="number" step="0.01" required /></div>
              <div><Label>Produto (opcional)</Label>
                <Select name="productId">
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="stat-card"><p className="text-xs text-muted-foreground">Custos Fixos</p><p className="text-xl font-bold font-display">{fmt(fixedTotal)}</p></div>
        <div className="stat-card"><p className="text-xs text-muted-foreground">Custos Variáveis</p><p className="text-xl font-bold font-display">{fmt(varTotal)}</p></div>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Produto</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {costs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum custo cadastrado</TableCell></TableRow>}
            {costs.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><Badge variant="secondary">{c.type === 'fixo' ? 'Fixo' : 'Variável'}</Badge></TableCell>
                <TableCell>{fmt(c.value)}</TableCell>
                <TableCell>{c.product_id ? products.find(p => p.id === c.product_id)?.name : '-'}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => deleteCost(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
