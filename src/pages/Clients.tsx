import { AsyncForm } from "@/components/ui/async-form";
import { useState, useEffect, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DollarSign, FileText, MessageCircle, Wallet, SlidersHorizontal } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<'clients'>;

export default function Clients() {
  const { clients, addClient, updateClient, deleteClient, payClientDebt, refresh } = useApp();
  const { isAdmin, profile } = useUserRole();
  const canCredit = isAdmin || !!profile?.can_manage_credit;
  const [creditFor, setCreditFor] = useState<Client | null>(null);
  const [adjustFor, setAdjustFor] = useState<Client | null>(null);
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
            <AsyncForm onSubmit={handleSave} className="space-y-3">
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
            </AsyncForm>
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
          <p className="text-sm text-muted-foreground font-medium">Crédito dos clientes na loja</p>
          <p className="text-2xl font-bold font-display text-success mt-1 whitespace-nowrap">{fmt(clients.reduce((s, c) => s + Number(c.credit_balance || 0), 0))}</p>
        </div>
        <div className="stat-card min-h-[96px]">
          <p className="text-sm text-muted-foreground font-medium">Maior dívida</p>
          <p className="text-2xl font-bold font-display mt-1 whitespace-nowrap">{fmt(Math.max(0, ...clients.map(c => Number(c.total_owed || 0))))}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Fiado (deve)</TableHead><TableHead>Crédito (tem)</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {clients.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente</TableCell></TableRow>}
            {clients.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell className={c.total_owed > 0 ? "text-destructive font-bold" : ""}>{fmt(c.total_owed)}</TableCell>
                <TableCell className={Number(c.credit_balance) > 0 ? "text-success font-bold" : "text-muted-foreground"}>{fmt(Number(c.credit_balance || 0))}</TableCell>
                <TableCell>
                  {c.total_owed > 0
                    ? <Badge variant="destructive">Inadimplente</Badge>
                    : <Badge variant="secondary">Em dia</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {canCredit && <Button variant="ghost" size="icon" title="Adicionar crédito" onClick={() => setCreditFor(c)}><Wallet className="h-4 w-4 text-success" /></Button>}
                  {isAdmin && <Button variant="ghost" size="icon" title="Corrigir crédito" onClick={() => setAdjustFor(c)}><SlidersHorizontal className="h-4 w-4" /></Button>}
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
      <AddCreditDialog client={creditFor} onClose={() => setCreditFor(null)} onDone={refresh} />
      <AdjustCreditDialog client={adjustFor} onClose={() => setAdjustFor(null)} onDone={refresh} />
    </div>
  );
}

type Line = { date: string; kind: 'compra' | 'pagamento' | 'credito_mais' | 'credito_menos'; amount: number; detail: string };
const plus = (k: Line['kind']) => k === 'compra' || k === 'credito_mais';
const kindLabel: Record<Line['kind'], string> = { compra: 'Compra fiado', pagamento: 'Pagamento', credito_mais: 'Crédito', credito_menos: 'Uso do crédito' };

function StatementDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { sales } = useApp();
  const [paymentsRows, setPaymentsRows] = useState<Line[]>([]);
  const [creditRows, setCreditRows] = useState<Line[]>([]);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fdate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (!client) { setPaymentsRows([]); return; }
    supabase.from('cash_movements').select('amount, created_at, description')
      .eq('category', 'recebimento_fiado').eq('description', `Recebimento fiado - ${client.name}`)
      .then(({ data }) => setPaymentsRows((data || []).map(m => ({ date: m.created_at, kind: 'pagamento', amount: Number(m.amount), detail: 'Pagamento recebido' }))));
    supabase.from('client_credit_movements').select('kind, amount, created_at, notes, payment_method').eq('client_id', client.id)
      .then(({ data }) => setCreditRows((data || []).flatMap((m): Line[] => {
        const a = Number(m.amount);
        if (m.kind === 'abate_fiado') return m.notes?.includes('compra no fiado') ? [{ date: m.created_at, kind: 'pagamento', amount: a, detail: 'Fiado pago com crédito da loja' }] : []; // crédito deixado já aparece como pagamento do fiado
        if (m.kind === 'deposito') return [{ date: m.created_at, kind: 'credito_mais', amount: a, detail: `Crédito deixado${m.payment_method ? ` (${m.payment_method})` : ''}${m.notes ? ` — ${m.notes}` : ''}` }];
        if (m.kind === 'uso') return [{ date: m.created_at, kind: 'credito_menos', amount: a, detail: 'Compra usando crédito' }];
        if (m.kind === 'estorno') return [{ date: m.created_at, kind: 'credito_mais', amount: a, detail: 'Venda apagada: crédito devolvido' }];
        return [{ date: m.created_at, kind: a >= 0 ? 'credito_mais' : 'credito_menos', amount: Math.abs(a), detail: `Correção da administradora${m.notes ? ` — ${m.notes}` : ''}` }];
      })));
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
    return [...purchases, ...paymentsRows, ...creditRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [client, sales, paymentsRows, creditRows]);

  function sendWhatsApp() {
    if (!client) return;
    const body = [...lines].reverse().map(l =>
      `${fdate(l.date)} - ${kindLabel[l.kind]}: ${plus(l.kind) ? '' : '-'}${fmt(l.amount)}\n   ${l.detail}`
    ).join('\n');
    const text = `*Confeitaria Fadinha*\nExtrato de fiado - ${client.name}\n\n${body}\n\n*Fiado em aberto: ${fmt(Number(client.total_owed))}*${Number(client.credit_balance) > 0 ? `\n*Crédito disponível: ${fmt(Number(client.credit_balance))}*` : ''}`;
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
        <DialogHeader><DialogTitle>Extrato — {client?.name}</DialogTitle></DialogHeader>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground space-y-0.5"><p>Fiado em aberto: <span className="font-bold text-destructive">{fmt(Number(client?.total_owed || 0))}</span></p><p>Crédito disponível: <span className="font-bold text-success">{fmt(Number(client?.credit_balance || 0))}</span></p></div>
          <Button onClick={sendWhatsApp} disabled={lines.length === 0}><MessageCircle className="h-4 w-4 mr-1" /> Enviar pelo WhatsApp</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {lines.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhum lançamento registrado</TableCell></TableRow>}
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">{fdate(l.date)}</TableCell>
                  <TableCell><span className="text-xs text-muted-foreground block">{kindLabel[l.kind]}</span>{l.detail}</TableCell>
                  <TableCell className={`text-right whitespace-nowrap font-medium ${l.kind.startsWith('credito') ? 'text-success' : l.kind === 'compra' ? 'text-destructive' : 'text-success'}`}>{plus(l.kind) ? '+' : '-'} {fmt(l.amount)}</TableCell>
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

function AddCreditDialog({ client, onClose, onDone }: { client: Client | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('dinheiro');
  const [notes, setNotes] = useState('');
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  useEffect(() => { setAmount(''); setMethod('dinheiro'); setNotes(''); }, [client]);
  const val = parseFloat(amount.replace(',', '.')) || 0;
  const owed = Number(client?.total_owed || 0);
  const abate = Math.min(val, owed);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client || val <= 0) { toast.error('Informe o valor'); return; }
    const { error } = await supabase.rpc('add_client_credit', { _client_id: client.id, _amount: val, _method: method, _notes: notes || null });
    if (error) { toast.error(error.message); return; }
    toast.success(abate > 0 ? `Crédito lançado. ${fmt(abate)} pagou o fiado.` : 'Crédito lançado!');
    await onDone(); onClose();
  }
  return (
    <Dialog open={!!client} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar crédito — {client?.name}</DialogTitle></DialogHeader>
        <AsyncForm onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">O cliente está deixando dinheiro para usar depois. Isso <b>não é fiado</b>.</p>
          <div><Label>Valor deixado</Label><Input autoFocus inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>Como pagou</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem><SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="debito">Débito</SelectItem><SelectItem value="credito">Crédito (cartão)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Observação (opcional)</Label><Input placeholder="Ex.: para o filho usar no lanche" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          {val > 0 && owed > 0 && (
            <p className="text-sm p-2 rounded-lg bg-warning/10">Este cliente deve {fmt(owed)} no fiado. {fmt(abate)} vai pagar o fiado{val - abate > 0 ? ` e ${fmt(val - abate)} fica de crédito` : ''}.</p>
          )}
          <Button type="submit" className="w-full">Lançar crédito</Button>
        </AsyncForm>
      </DialogContent>
    </Dialog>
  );
}

function AdjustCreditDialog({ client, onClose, onDone }: { client: Client | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { setValue(client ? String(Number(client.credit_balance || 0)).replace('.', ',') : ''); setReason(''); }, [client]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    const v = parseFloat(value.replace(',', '.'));
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return; }
    if (!reason.trim()) { toast.error('Informe o motivo'); return; }
    const { error } = await supabase.rpc('adjust_client_credit', { _client_id: client.id, _new_balance: v, _reason: reason.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success('Crédito corrigido');
    await onDone(); onClose();
  }
  return (
    <Dialog open={!!client} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Corrigir crédito — {client?.name}</DialogTitle></DialogHeader>
        <AsyncForm onSubmit={save} className="space-y-3">
          <div><Label>Saldo de crédito correto</Label><Input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /></div>
          <div><Label>Motivo</Label><Input required value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: crédito antigo do caderno" /></div>
          <p className="text-xs text-muted-foreground">A correção fica registrada no extrato do cliente.</p>
          <Button type="submit" className="w-full">Salvar correção</Button>
        </AsyncForm>
      </DialogContent>
    </Dialog>
  );
}
