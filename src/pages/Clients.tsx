import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<'clients'>;

export default function Clients() {
  const { clients, addClient, updateClient, deleteClient, payClientDebt } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = { name: fd.get('name') as string, phone: fd.get('phone') as string, email: fd.get('email') as string };
    if (editing) updateClient({ ...editing, ...data });
    else addClient(data);
    setEditing(null);
    setOpen(false);
  }

  function handlePay() {
    if (payOpen && payAmount > 0) {
      payClientDebt(payOpen, payAmount);
      setPayOpen(null);
      toast.success("Pagamento registrado!");
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Clientes</h1>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo Cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} Cliente</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-3">
              <div><Label>Nome</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div><Label>Telefone</Label><Input name="phone" defaultValue={editing?.phone || ''} /></div>
              <div><Label>Email</Label><Input name="email" type="email" defaultValue={editing?.email || ''} /></div>
              <Button type="submit" className="w-full">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Dívida</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {clients.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cliente</TableCell></TableRow>}
            {clients.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell className={c.total_owed > 0 ? "text-destructive font-bold" : ""}>{fmt(c.total_owed)}</TableCell>
                <TableCell>
                  {c.total_owed > 0
                    ? <Badge variant="destructive">Inadimplente</Badge>
                    : <Badge variant="secondary">Em dia</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {c.total_owed > 0 && (
                    <Button variant="ghost" size="icon" onClick={() => { setPayOpen(c.id); setPayAmount(c.total_owed); }}>
                      <DollarSign className="h-4 w-4 text-success" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteClient(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!payOpen} onOpenChange={() => setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Valor</Label><Input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} /></div>
            <Button onClick={handlePay} className="w-full">Confirmar Pagamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
