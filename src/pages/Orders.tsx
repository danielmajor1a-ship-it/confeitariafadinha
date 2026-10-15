import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Pencil, Play, PackageCheck, X, Printer, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import OrderFormDialog, { type OrderFormInitial } from "@/components/OrderFormDialog";
import { db, STATUS_LABELS, fmtData, fmtHora, gerarToken, getPrintPref, setPrintPref, imprimirFicha, type ConfigProducao, type Encomenda, type EncomendaItem } from "@/lib/encomendas";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function abrirFicha(id: string) {
  imprimirFicha(id).catch((err) => toast.error(err.message || "Não foi possível imprimir"));
}

export default function Orders() {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [list, setList] = useState<Encomenda[]>([]);
  const [cfg, setCfg] = useState<ConfigProducao | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(iso(new Date()));
  const [form, setForm] = useState<{ open: boolean; initial?: OrderFormInitial }>({ open: false });
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [askPrint, setAskPrint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState({ de: "", ate: "", status: "todos" });

  async function load() {
    const [e, c] = await Promise.all([
      db.from("encomendas").select("*").order("data_entrega").order("hora_entrega"),
      db.from("config_producao").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (e.error) toast.error(e.error.message);
    setList(e.data || []);
    setCfg(c.data || null);
  }
  useEffect(() => { load(); }, []);

  const cap = cfg?.capacidade_diaria || 5;
  const pendByDay = useMemo(() => {
    const m: Record<string, number> = {};
    list.filter(e => e.status === "agendada" || e.status === "em_producao").forEach(e => { m[e.data_entrega] = (m[e.data_entrega] || 0) + 1; });
    return m;
  }, [list]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  const dayList = list.filter(e => e.data_entrega === day).sort((a, b) => a.hora_entrega.localeCompare(b.hora_entrega));

  async function editar(e: Encomenda) {
    const { data } = await db.from("encomenda_itens").select("*").eq("encomenda_id", e.id);
    setForm({ open: true, initial: { encomenda: e, itens: (data || []) as EncomendaItem[] } });
  }

  async function iniciar(e: Encomenda) {
    if (busy) return;
    setBusy(true);
    const { error } = await db.from("encomendas").update({ status: "em_producao", iniciada_em: new Date().toISOString() }).eq("id", e.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Produção iniciada");
    load();
    const pref = getPrintPref();
    if (pref === "sim") abrirFicha(e.id);
    else if (pref === null) setAskPrint(e.id);
  }

  async function cancelar() {
    if (!cancelId || busy) return;
    setBusy(true);
    const { error } = await db.from("encomendas").update({ status: "cancelada" }).eq("id", cancelId);
    setBusy(false);
    setCancelId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Encomenda cancelada");
    load();
  }

  async function salvarCfg(patch: Partial<ConfigProducao>) {
    if (busy) return;
    setBusy(true);
    const { error } = await db.from("config_producao").update(patch).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Configuração salva");
    load();
  }

  const painelUrl = cfg ? `${window.location.origin}/painel/${cfg.painel_token}` : "";
  const histList = list.filter(e =>
    (hist.status === "todos" || e.status === hist.status) &&
    (!hist.de || e.data_entrega >= hist.de) && (!hist.ate || e.data_entrega <= hist.ate)
  ).sort((a, b) => b.data_entrega.localeCompare(a.data_entrega) || b.hora_entrega.localeCompare(a.hora_entrega));

  const statusBadge = (s: Encomenda["status"]) => (
    <Badge variant={s === "cancelada" ? "destructive" : s === "entregue" ? "secondary" : "outline"}
      className={s === "em_producao" ? "border-warning text-warning" : ""}>{STATUS_LABELS[s]}</Badge>
  );

  const card = (e: Encomenda) => {
    const pend = e.status === "agendada" || e.status === "em_producao";
    return (
      <Card key={e.id} className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold text-chocolate">{fmtHora(e.hora_entrega)} · {e.cliente_nome}</p>
            <p className="text-sm">{e.descricao} — {e.quantidade} {e.unidade || ""}</p>
            {e.observacoes && <p className="text-xs text-muted-foreground">Obs: {e.observacoes}</p>}
            <p className="text-xs text-muted-foreground">
              {e.tipo === "entrega" ? "Entrega" : "Retirada"}
              {e.valor_total ? ` · Total ${fmt(Number(e.valor_total))}` : ""}
              {Number(e.valor_sinal) > 0 ? ` · Sinal ${fmt(Number(e.valor_sinal))}` : ""}
            </p>
          </div>
          {statusBadge(e.status)}
        </div>
        <div className="flex flex-wrap gap-2">
          {pend && <Button size="sm" variant="outline" onClick={() => editar(e)}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Button>}
          {e.status === "agendada" && <Button size="sm" variant="outline" disabled={busy} onClick={() => iniciar(e)}><Play className="h-3.5 w-3.5 mr-1" />Iniciar</Button>}
          {pend && <Button size="sm" onClick={() => navigate(`/vendas?encomenda=${e.id}`)}><PackageCheck className="h-3.5 w-3.5 mr-1" />Entregar</Button>}
          <Button size="sm" variant="outline" onClick={() => abrirFicha(e.id)}><Printer className="h-3.5 w-3.5 mr-1" />Imprimir ficha</Button>
          {pend && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelId(e.id)}><X className="h-3.5 w-3.5 mr-1" />Cancelar</Button>}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-header flex items-center gap-2"><CalendarClock className="h-6 w-6 text-pink-dark" /> Encomendas</h1>
        <Button onClick={() => setForm({ open: true, initial: { encomenda: { data_entrega: day } } })}><Plus className="h-4 w-4 mr-1" />Nova encomenda</Button>
      </div>

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="config">Configurações</TabsTrigger>}
        </TabsList>

        <TabsContent value="calendario" className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Button size="icon" variant="ghost" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <p className="font-bold capitalize">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
              <Button size="icon" variant="ghost" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">{WEEK.map(w => <div key={w}>{w}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map(d => {
                const k = iso(d);
                const n = pendByDay[k] || 0;
                const pct = n / cap;
                const tone = n === 0 ? "" : pct <= 0.6 ? "bg-success/15 border-success/40" : pct <= 1 ? "bg-warning/20 border-warning/50" : "bg-destructive/15 border-destructive/50";
                const out = d.getMonth() !== month.getMonth();
                return (
                  <button key={k} onClick={() => setDay(k)}
                    className={`h-16 rounded-lg border text-left p-1.5 transition-colors ${tone} ${out ? "opacity-40" : ""} ${day === k ? "ring-2 ring-pink-dark" : ""}`}>
                    <span className="text-xs font-semibold">{d.getDate()}</span>
                    {n > 0 && <p className="text-sm font-bold">{n} {pct > 1 ? "⚠" : ""}</p>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Capacidade: {cap} por dia. Verde até 60%, amarelo até 100%, vermelho acima (⚠).</p>
          </Card>
          <div className="space-y-3">
            <h2 className="font-bold">{fmtData(day)} — {dayList.length} encomenda(s)</h2>
            {dayList.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma encomenda neste dia.</p>}
            {dayList.map(card)}
          </div>
        </TabsContent>

        <TabsContent value="historico" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div><Label>De</Label><Input type="date" value={hist.de} onChange={e => setHist(h => ({ ...h, de: e.target.value }))} /></div>
            <div><Label>Até</Label><Input type="date" value={hist.ate} onChange={e => setHist(h => ({ ...h, ate: e.target.value }))} /></div>
            <div className="w-44">
              <Label>Status</Label>
              <Select value={hist.status} onValueChange={v => setHist(h => ({ ...h, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr><th className="p-2">Entrega</th><th className="p-2">Cliente</th><th className="p-2">Descrição</th><th className="p-2">Total</th><th className="p-2">Sinal</th><th className="p-2">Status</th></tr></thead>
              <tbody>
                {histList.map(e => (
                  <tr key={e.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{fmtData(e.data_entrega)} {fmtHora(e.hora_entrega)}</td>
                    <td className="p-2">{e.cliente_nome}</td>
                    <td className="p-2">{e.descricao}</td>
                    <td className="p-2">{e.valor_total ? fmt(Number(e.valor_total)) : "—"}</td>
                    <td className="p-2">{Number(e.valor_sinal) > 0 ? fmt(Number(e.valor_sinal)) : "—"}</td>
                    <td className="p-2">{statusBadge(e.status)}</td>
                  </tr>
                ))}
                {histList.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhuma encomenda encontrada.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="config">
            {cfg ? <ConfigForm cfg={cfg} busy={busy} onSave={salvarCfg} painelUrl={painelUrl} /> : <p className="text-sm text-muted-foreground">Carregando...</p>}
          </TabsContent>
        )}
      </Tabs>

      <OrderFormDialog open={form.open} initial={form.initial} onOpenChange={v => setForm(s => ({ ...s, open: v }))} onSaved={load} />

      <AlertDialog open={!!cancelId} onOpenChange={v => !v && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Cancelar encomenda?</AlertDialogTitle>
            <AlertDialogDescription>A encomenda fica no histórico como cancelada. Se houve sinal, a devolução deve ser lançada no caixa.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={cancelar}>Cancelar encomenda</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!askPrint} onOpenChange={v => !v && setAskPrint(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Imprimir ficha?</AlertDialogTitle>
            <AlertDialogDescription>Sua escolha fica lembrada neste aparelho.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPrintPref("nao")}>Não</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPrintPref("sim"); if (askPrint) abrirFicha(askPrint); }}>Sim, imprimir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConfigForm({ cfg, busy, onSave, painelUrl }: { cfg: ConfigProducao; busy: boolean; onSave: (p: Partial<ConfigProducao>) => void; painelUrl: string }) {
  const [v, setV] = useState({ ...cfg });
  useEffect(() => setV({ ...cfg }), [cfg]);
  const n = (k: keyof ConfigProducao) => (e: any) => setV(p => ({ ...p, [k]: parseInt(e.target.value) || 0 }));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4 space-y-3">
        <h3 className="font-bold">Capacidade e termômetro</h3>
        <div><Label>Encomendas por dia (capacidade)</Label><Input type="number" value={v.capacidade_diaria} onChange={n("capacidade_diaria")} /></div>
        <div className="grid grid-cols-3 gap-2">
          <div><Label>Tranquilo acima de (min)</Label><Input type="number" value={v.faixa_tranquilo_min} onChange={n("faixa_tranquilo_min")} /></div>
          <div><Label>Atenção acima de (min)</Label><Input type="number" value={v.faixa_atencao_min} onChange={n("faixa_atencao_min")} /></div>
          <div><Label>Apertado acima de (min)</Label><Input type="number" value={v.faixa_apertado_min} onChange={n("faixa_apertado_min")} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Abaixo de "apertado" fica URGENTE; depois do horário fica ATRASADA.</p>
        <Button disabled={busy} onClick={() => onSave({ capacidade_diaria: v.capacidade_diaria, faixa_tranquilo_min: v.faixa_tranquilo_min, faixa_atencao_min: v.faixa_atencao_min, faixa_apertado_min: v.faixa_apertado_min })}>Salvar</Button>
      </Card>
      <Card className="p-4 space-y-3">
        <h3 className="font-bold">Painel de produção</h3>
        <p className="text-sm text-muted-foreground">Abra este link na TV, tablet ou celular da cozinha. Não precisa entrar no sistema.</p>
        <Input readOnly value={painelUrl} onFocus={e => e.target.select()} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(painelUrl); toast.success("Link copiado"); }}><Copy className="h-4 w-4 mr-1" />Copiar link</Button>
          <Button variant="outline" disabled={busy} onClick={() => { if (confirm("Gerar novo link? O link antigo para de funcionar.")) onSave({ painel_token: gerarToken() }); }}><RefreshCw className="h-4 w-4 mr-1" />Gerar novo token</Button>
        </div>
      </Card>
    </div>
  );
}
