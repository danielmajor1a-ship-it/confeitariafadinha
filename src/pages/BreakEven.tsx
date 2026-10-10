import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { EXPENSE_TYPE_LABELS } from "@/types";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const num = (s: string) => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const spDate = (d: string | Date) => new Date(new Date(d).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

interface Recurring { id: string; name: string; value: number; active: boolean; required_kind: string | null }
interface Mov { id: string; amount: number; category: string; description: string | null; created_at: string; expense_type: string | null; recurring_cost_id: string | null }

export default function BreakEven() {
  const { isAdmin } = useUserRole();
  const { sales, products } = useApp();
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [purchasesMonth, setPurchasesMonth] = useState(0);
  const [settings, setSettings] = useState<{ id: string; working_days: number; mei_annual_limit: number } | null>(null);

  const load = useCallback(async () => {
    const now = spDate(new Date());
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const [r, m, s, p] = await Promise.all([
      supabase.from("recurring_costs").select("*").order("created_at"),
      supabase.from("cash_movements").select("id,amount,category,description,created_at,expense_type,recurring_cost_id").eq("type", "saida").order("created_at", { ascending: false }),
      supabase.from("cost_settings").select("*").limit(1).maybeSingle(),
      supabase.from("purchases").select("total").eq("status", "confirmada").gte("purchase_date", monthStart),
    ]);
    setRecurring((r.data || []) as any);
    setMovs((m.data || []) as any);
    setSettings(s.data as any);
    setPurchasesMonth((p.data || []).reduce((t: number, x: any) => t + Number(x.total || 0), 0));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!isAdmin) return <p className="text-muted-foreground p-6">Apenas o administrador pode ver esta tela.</p>;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Custos Fixos e Ponto de Equilíbrio</h1>
      <Tabs defaultValue="equilibrio">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="equilibrio">Ponto de Equilíbrio</TabsTrigger>
          <TabsTrigger value="fixos">Custos Fixos</TabsTrigger>
          <TabsTrigger value="classificar">Classificar saídas{movs.filter(needsClass).length > 0 && ` (${movs.filter(needsClass).length})`}</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>
        <TabsContent value="equilibrio">
          <Overview sales={sales} products={products} recurring={recurring} movs={movs} settings={settings} purchasesMonth={purchasesMonth} />
        </TabsContent>
        <TabsContent value="fixos"><FixedCosts recurring={recurring} reload={load} /></TabsContent>
        <TabsContent value="classificar"><Classify movs={movs.filter(needsClass)} reload={load} /></TabsContent>
        <TabsContent value="config"><Settings settings={settings} reload={load} /></TabsContent>
      </Tabs>
    </div>
  );
}

const needsClass = (m: Mov) => !m.expense_type && m.category !== "sangria";

function Overview({ sales, products, recurring, movs, settings, purchasesMonth }: any) {
  const d = useMemo(() => {
    const now = spDate(new Date());
    const y = now.getFullYear(), mo = now.getMonth(), today = now.getDate();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const workingDays = settings?.working_days || 26;
    const meiLimit = Number(settings?.mei_annual_limit || 81000);
    const cost = new Map<string, number>(products.map((p: any) => [p.id, Number(p.purchase_price) || 0]));

    const valid = sales.filter((s: any) => s.status !== "cancelada");
    const monthSales = valid.filter((s: any) => { const dt = spDate(s.created_at); return dt.getFullYear() === y && dt.getMonth() === mo; });
    const yearRevenue = valid.filter((s: any) => spDate(s.created_at).getFullYear() === y).reduce((t: number, s: any) => t + Number(s.total), 0);

    let revenue = 0, itemsTotal = 0, eligRev = 0, eligProfit = 0;
    const byDay = new Array(daysInMonth).fill(0);
    for (const s of monthSales) {
      revenue += Number(s.total);
      byDay[spDate(s.created_at).getDate() - 1] += Number(s.total);
      const items = s.items || [];
      const sub = items.reduce((t: number, i: any) => t + Number(i.subtotal), 0);
      const fees = (s.payments || []).reduce((t: number, p: any) => t + Number(p.card_tax_amount || 0), 0);
      itemsTotal += sub;
      for (const i of items) {
        const c = cost.get(i.product_id) || 0;
        if (c <= 0 || sub <= 0) continue;
        const share = Number(i.subtotal) / sub;
        const r = Number(s.total) * share;
        eligRev += r;
        eligProfit += r - c * i.quantity - fees * share;
      }
    }
    const coverage = itemsTotal > 0 ? eligRev / itemsTotal : 0;
    const mc = eligRev > 0 ? eligProfit / eligRev : 0;

    const activeRec = recurring.filter((r: any) => r.active);
    const recTotal = activeRec.reduce((t: number, r: any) => t + Number(r.value), 0);
    const monthMovs = movs.filter((m: any) => { const dt = spDate(m.created_at); return dt.getFullYear() === y && dt.getMonth() === mo; });
    const extraFixed = monthMovs.filter((m: any) => m.expense_type === "despesa_fixa" && !m.recurring_cost_id).reduce((t: number, m: any) => t + Number(m.amount), 0);
    const fixed = recTotal + extraFixed;
    const be = mc > 0 ? fixed / mc : 0;
    const ticket = monthSales.length ? revenue / monthSales.length : 0;
    const daily = be / workingDays;
    const weekly = daily * 6;
    const expectedToday = be * (today / daysInMonth);
    const reached = expectedToday > 0 ? revenue / expectedToday : 0;
    const status = reached < 0.95 ? "abaixo" : reached <= 1.05 ? "no ritmo" : "acima";

    let acc = 0;
    const chart = byDay.map((v, i) => {
      if (i < today) acc += v;
      return { dia: String(i + 1).padStart(2, "0"), realizado: i < today ? acc : null, equilibrio: be, meta: be * ((i + 1) / daysInMonth) };
    });

    const missingRequired = ["das", "prolabore"].filter((k) => !activeRec.some((r: any) => r.required_kind === k && Number(r.value) > 0));
    const belowCost = products.filter((p: any) => p.sells !== false && Number(p.sale_price) > 0 && Number(p.purchase_price) > Number(p.sale_price));

    const start = new Date(y, 0, 1);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
    const daysInYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
    const projection = (yearRevenue / dayOfYear) * daysInYear;

    return { revenue, fixed, recTotal, extraFixed, mc, coverage, be, ticket, daily, weekly, expectedToday, reached, status, chart, missingRequired, belowCost, yearRevenue, meiLimit, projection, workingDays, monthMovs, count: monthSales.length };
  }, [sales, products, recurring, movs, settings]);

  const investments = d.monthMovs.filter((m: any) => m.expense_type === "investimento").reduce((t: number, m: any) => t + Number(m.amount), 0);
  const meiPct = d.meiLimit > 0 ? d.yearRevenue / d.meiLimit : 0;
  const statusTone = d.status === "abaixo" ? "text-destructive" : d.status === "acima" ? "text-success" : "text-foreground";
  const salesN = (v: number) => (d.ticket > 0 ? Math.ceil(v / d.ticket) : 0);

  return (
    <div className="space-y-4 mt-4">
      {d.coverage < 0.7 && (
        <Alert>Margem pouco confiável: {pct(1 - d.coverage)} do faturamento está sem custo cadastrado. <Link className="underline font-semibold" to="/precificacao">Ver produtos sem custo</Link></Alert>
      )}
      {d.belowCost.length > 0 && (
        <Alert>{d.belowCost.length} produto(s) com custo maior que o preço de venda ({d.belowCost.slice(0, 3).map((p: any) => p.name).join(", ")}{d.belowCost.length > 3 ? "…" : ""}). <Link className="underline font-semibold" to="/precificacao">Revisar</Link></Alert>
      )}
      {d.missingRequired.length > 0 && (
        <Alert>Cadastre o valor de {d.missingRequired.map((k: string) => (k === "das" ? "DAS MEI" : "Pró-labore")).join(" e ")} na aba Custos Fixos — sem isso o ponto de equilíbrio fica menor do que é de verdade.</Alert>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        <Stat label="Custos fixos do mês" value={fmt(d.fixed)} hint={`Cadastrados ${fmt(d.recTotal)} · Lançados no caixa ${fmt(d.extraFixed)}`} />
        <Stat label="Margem de contribuição" value={d.mc > 0 ? pct(d.mc) : "—"} hint={`Cobertura de custo: ${pct(d.coverage)}`} />
        <Stat label="Ponto de equilíbrio do mês" value={d.be > 0 ? fmt(d.be) : "—"} />
        <Stat label="Meta por semana" value={d.be > 0 ? fmt(d.weekly) : "—"} hint={d.ticket > 0 ? `≈ ${salesN(d.weekly)} vendas (ticket ${fmt(d.ticket)})` : undefined} />
        <Stat label="Meta por dia" value={d.be > 0 ? fmt(d.daily) : "—"} hint={d.ticket > 0 ? `≈ ${salesN(d.daily)} vendas · ${d.workingDays} dias/mês` : undefined} />
        <Stat label="Realizado no mês" value={fmt(d.revenue)} tone={statusTone}
          hint={d.be > 0 ? `Meta até hoje ${fmt(d.expectedToday)} · ${pct(d.reached)} · ${d.status}` : `${d.count} vendas`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="section-title">Faturamento acumulado no mês × ponto de equilíbrio</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={d.chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${Math.round(v)}`} />
              <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => `Dia ${l}`} />
              <Line dataKey="realizado" name="Faturamento acumulado" stroke="hsl(var(--success))" strokeWidth={2} dot={false} connectNulls={false} />
              <Line dataKey="equilibrio" name="Ponto de equilíbrio" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              <Line dataKey="meta" name="Meta proporcional" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} />
              <Legend />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="section-title">Limite do MEI no ano</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>Faturado no ano: <b>{fmt(d.yearRevenue)}</b> de {fmt(d.meiLimit)} ({pct(meiPct)})</span>
            <span>Projeção para o fim do ano: <b className={d.projection > d.meiLimit ? "text-destructive" : ""}>{fmt(d.projection)}</b></span>
          </div>
          <Progress value={Math.min(100, meiPct * 100)} />
          {meiPct > 0.8 && <Alert>Atenção: o faturamento do ano já passou de 80% do limite do MEI.</Alert>}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Compras de mercadoria no mês: {fmt(purchasesMonth)} (não entram no cálculo; já estão no custo dos produtos).</p>
        {investments > 0 && <p>Investimentos no mês: {fmt(investments)} (não entram no cálculo).</p>}
        <p>Ponto de equilíbrio = custos fixos ÷ margem de contribuição. Margem calculada com custos atuais e taxas de cartão, considerando apenas produtos com custo cadastrado.</p>
      </div>
    </div>
  );
}

function FixedCosts({ recurring, reload }: { recurring: Recurring[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const total = recurring.filter((r) => r.active).reduce((t, r) => t + Number(r.value), 0);

  async function upd(id: string, patch: Partial<Recurring>) {
    const { error } = await supabase.from("recurring_costs").update(patch).eq("id", id);
    if (error) toast.error(error.message); else reload();
  }
  async function add() {
    if (!name.trim()) { toast.error("Informe o nome"); return; }
    const { error } = await supabase.from("recurring_costs").insert({ name: name.trim(), value: num(value) });
    if (error) { toast.error(error.message); return; }
    setName(""); setValue(""); reload();
  }
  async function del(id: string) {
    if (!confirm("Apagar este custo fixo?")) return;
    const { error } = await supabase.from("recurring_costs").delete().eq("id", id);
    if (error) toast.error(error.message); else reload();
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="section-title">Custos fixos mensais</CardTitle>
        <p className="text-sm text-muted-foreground">Total ativo: <b>{fmt(total)}</b> por mês. DAS e Pró-labore são obrigatórios para o cálculo.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="w-40">Valor mensal</TableHead><TableHead className="w-24">Ativo</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
          <TableBody>
            {recurring.map((r) => (
              <TableRow key={r.id} className={r.required_kind ? "bg-pink/10" : ""}>
                <TableCell className="font-medium">
                  {r.name} {r.required_kind && <Badge variant="outline" className="ml-2 text-xs">Obrigatório</Badge>}
                </TableCell>
                <TableCell>
                  <Input defaultValue={Number(r.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    onBlur={(e) => { const v = num(e.target.value); if (v !== Number(r.value)) upd(r.id, { value: v }); }} />
                </TableCell>
                <TableCell><Switch checked={r.active} onCheckedChange={(v) => upd(r.id, { active: v })} /></TableCell>
                <TableCell>{!r.required_kind && <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]"><Label>Novo custo fixo</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Gás" /></div>
          <div className="w-40"><Label>Valor mensal</Label><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Classify({ movs, reload }: { movs: Mov[]; reload: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [type, setType] = useState("");
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function apply() {
    if (!type || sel.size === 0) { toast.error("Marque as saídas e escolha o tipo"); return; }
    const { error } = await supabase.from("cash_movements").update({ expense_type: type } as any).in("id", [...sel]);
    if (error) { toast.error(error.message); return; }
    toast.success(`${sel.size} saída(s) classificada(s)`);
    setSel(new Set()); reload();
  }

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="section-title">Saídas de caixa sem tipo</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {movs.length === 0 ? <p className="text-muted-foreground text-sm py-6 text-center">Todas as saídas já estão classificadas.</p> : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-60"><SelectValue placeholder="Tipo para as marcadas" /></SelectTrigger>
                <SelectContent>{Object.entries(EXPENSE_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={apply} disabled={sel.size === 0 || !type}>Classificar {sel.size > 0 ? sel.size : ""}</Button>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"><Checkbox checked={sel.size === movs.length} onCheckedChange={(v) => setSel(v ? new Set(movs.map((m) => m.id)) : new Set())} /></TableHead>
                <TableHead>Data</TableHead><TableHead>Categoria</TableHead><TableHead>Observação</TableHead><TableHead className="text-right">Valor</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {movs.map((m) => (
                  <TableRow key={m.id} onClick={() => toggle(m.id)} className="cursor-pointer">
                    <TableCell><Checkbox checked={sel.has(m.id)} /></TableCell>
                    <TableCell>{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{m.category}</TableCell>
                    <TableCell className="max-w-xs truncate">{m.description}</TableCell>
                    <TableCell className="text-right">{fmt(Number(m.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Settings({ settings, reload }: { settings: any; reload: () => void }) {
  const [days, setDays] = useState("");
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (settings) { setDays(String(settings.working_days)); setLimit(Number(settings.mei_annual_limit).toLocaleString("pt-BR", { minimumFractionDigits: 2 })); }
  }, [settings]);
  async function save() {
    const d = parseInt(days);
    if (!d || d < 1 || d > 31) { toast.error("Dias de funcionamento entre 1 e 31"); return; }
    const payload = { working_days: d, mei_annual_limit: num(limit), updated_at: new Date().toISOString() };
    const { error } = settings
      ? await supabase.from("cost_settings").update(payload).eq("id", settings.id)
      : await supabase.from("cost_settings").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Configurações salvas"); reload();
  }
  return (
    <Card className="mt-4 max-w-md">
      <CardHeader><CardTitle className="section-title">Configurações</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div><Label>Dias de funcionamento por mês</Label><Input value={days} onChange={(e) => setDays(e.target.value)} /></div>
        <div><Label>Limite anual de faturamento do MEI (R$)</Label><Input value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
        <Button onClick={save}>Salvar</Button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold whitespace-nowrap ${tone ?? ""}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{hint}</p>}
    </CardContent></Card>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" /><div>{children}</div>
    </div>
  );
}
