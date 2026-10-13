import { useState, useEffect, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DollarSign, FileText, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<'clients'>;

export default function Clients() {
  const { clients, addClient, updateClient, deleteClient, payClientDebt } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [statement, setStatement] = useState<Client | null>(null);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = { name: fd.get('name') as string, phone: fd.get('phone') as string, email: fd.get('email') as string };
    if (editing) {
      const debtStr = (fd.get('total_owed') as string)?.replace(',', '.');
      const total_owed = Math.max(0, parseFloat(debtStr) || 0);
      updateClient({ ...editing, ...data, total_owed });
    }
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
              {editing && (
                <div>
                  <Label>Valor da dívida (fiado)</Label>
                  <Input name="total_owed" type="number" step="0.01" min="0" defaultValue={editing.total_owed} />
                </div>
              )}
              <Button type="submit" className="w-full">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        <div className="stat-card min-h-[96px]">
          <p className="text-sm text-muted-foreground font-medium">Dívida total em aberto</p>
          <p className="text-2xl font-bold font-display text-destructive mt-1 whitespace-nowrap">{fmt(clients.reduce((s, c) => s + Number(c.total_owed || 0), 0))}</p>
        </div>
        <div className="stat-card min-h-[96px]">
          <p className="text-sm text-muted-foreground font-medium">Clientes devendo</p>
          <p className="text-2xl font-bold font-display mt-1">{clients.filter(c => c.total_owed > 0).length} de {clients.length}</p>
        </div>
        <div className="stat-card min-h-[96px]">
          <p className="text-sm text-muted-foreground font-medium">Maior dívida</p>
          <p className="text-2xl font-bold font-display mt-1 whitespace-nowrap">{fmt(Math.max(0, ...clients.map(c => Number(c.total_owed || 0))))}</p>
        </div>
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
                  <Button variant="ghost" size="icon" title="Extrato" onClick={() => setStatement(c)}><FileText className="h-4 w-4" /></Button>
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

      <StatementDialog client={statement} onClose={() => setStatement(null)} />
    </div>
  );
}

type Line = { date: string; kind: 'compra' | 'pagamento'; amount: number; detail: string };

function StatementDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { sales } = useApp();
  const [paymentsRows, setPaymentsRows] = useState<Line[]>([]);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fdate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (!client) { setPaymentsRows([]); return; }
    supabase.from('cash_movements').select('amount, created_at, description')
      .eq('category', 'recebimento_fiado').eq('description', `Recebimento fiado - ${client.name}`)
      .then(({ data }) => setPaymentsRows((data || []).map(m => ({ date: m.created_at, kind: 'pagamento', amount: Number(m.amount), detail: 'Pagamento recebido' }))));
  }, [client]);

  const lines = useMemo(() => {
    if (!client) return [];
    const purchases: Line[] = sales.filter(s => s.client_id === client.id).map(s => {
      const fiado = s.payments.length
        ? s.payments.filter(p => p.payment_method === 'fiado').reduce((a, p) => a + Number(p.amount), 0)
        : (s.payment_method === 'fiado' ? Number(s.total) : 0);
      const fmtQ = (i: any) => i.quantity;
      return { date: s.created_at, kind: 'compra' as const, amount: fiado, detail: s.items.map(i => `${fmtQ(i)}x ${i.product_name}`).join(', ') };
    }).filter(l => l.amount > 0);
    return [...purchases, ...paymentsRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [client, sales, paymentsRows]);

  function sendWhatsApp() {
    if (!client) return;
    const body = [...lines].reverse().map(l =>
      `${fdate(l.date)} - ${l.kind === 'compra' ? 'Compra' : 'Pagamento'}: ${l.kind === 'compra' ? '' : '-'}${fmt(l.amount)}${l.kind === 'compra' ? `\n   ${l.detail}` : ''}`
    ).join('\n');
    const text = `*Confeitaria Fadinha*\nExtrato de fiado - ${client.name}\n\n${body}\n\n*Saldo em aberto: ${fmt(Number(client.total_owed))}*`;
    const phone = (client.phone || '').replace(/\D/g, '');
    const num = phone ? (phone.length <= 11 ? '55' + phone : phone) : '';
    navigator.clipboard?.writeText(text).then(() => toast.success('Extrato copiado! Se o WhatsApp não abrir, é só colar na conversa.')).catch(() => {});
    const a = document.createElement('a');
    a.href = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Dialog open={!!client} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Extrato do fiado — {client?.name}</DialogTitle></DialogHeader>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Saldo em aberto: <span className="font-bold text-destructive">{fmt(Number(client?.total_owed || 0))}</span></p>
          <Button onClick={sendWhatsApp} disabled={lines.length === 0}><MessageCircle className="h-4 w-4 mr-1" /> Enviar pelo WhatsApp</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {lines.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma compra no fiado registrada no sistema</TableCell></TableRow>}
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">{fdate(l.date)}</TableCell>
                  <TableCell>{l.kind === 'compra' ? l.detail : <span className="text-success font-medium">{l.detail}</span>}</TableCell>
                  <TableCell className={`text-right whitespace-nowrap font-medium ${l.kind === 'compra' ? 'text-destructive' : 'text-success'}`}>{l.kind === 'compra' ? '+' : '-'} {fmt(l.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">Dívidas antigas lançadas direto no valor do cliente não aparecem aqui, só as compras feitas no caixa.</p>
      </DialogContent>
    </Dialog>
  );
}
