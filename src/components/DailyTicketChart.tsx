import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { calculateDailyTickets, type DailyTicket, type DailyTicketProduct } from '@/lib/daily-tickets';

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
type Props = {
  sales: Parameters<typeof calculateDailyTickets>[0];
  products: (Parameters<typeof calculateDailyTickets>[1][number] & { sale_price?: number })[];
};

type Period = {
  key: string; label: string; count: number; revenue: number; gross: number; profit: number;
  ticket: number; profitPerSale: number; margin: number | null; coverage: number | null;
  products: DailyTicketProduct[]; days: string[];
};

const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const spDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildPeriod(key: string, label: string, rows: DailyTicket[], gross: number): Period {
  const count = rows.reduce((s, r) => s + r.count, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const profit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
  const map = new Map<string, DailyTicketProduct>();
  rows.forEach(r => r.products.forEach(p => {
    const cur = map.get(p.id) ?? { ...p, quantity: 0, revenue: 0, profit: 0 };
    cur.quantity += p.quantity; cur.revenue += p.revenue; cur.profit += p.profit;
    map.set(p.id, cur);
  }));
  return {
    key, label, count, revenue, gross, profit,
    ticket: count ? revenue / count : 0,
    profitPerSale: count ? profit / count : 0,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    coverage: gross > 0 ? Math.min(100, (revenue / gross) * 100) : null,
    products: [...map.values()], days: rows.map(r => r.day),
  };
}

type Mode = 'monthly' | 'weekly' | 'daily';

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`;

export default function DailyTicketChart({ sales, products }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('weekly');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sort, setSort] = useState<'profit' | 'margin'>('profit');

  const days = useMemo(() => calculateDailyTickets(sales, products), [sales, products]);
  const grossByDay = useMemo(() => {
    const m = new Map<string, number>();
    sales.forEach(s => {
      if (s.status === 'cancelada' || s.status === 'cancelado') return;
      const d = spDay(s.created_at);
      m.set(d, (m.get(d) ?? 0) + s.total);
    });
    return m;
  }, [sales]);

  const weeks = useMemo(() => {
    const keys = new Set<string>();
    grossByDay.forEach((_, d) => keys.add(mondayOf(d)));
    return [...keys].sort().slice(-8).map(mon => {
      const sun = addDays(mon, 6);
      const rows = days.filter(d => d.day >= mon && d.day <= sun);
      let gross = 0;
      grossByDay.forEach((v, d) => { if (d >= mon && d <= sun) gross += v; });
      return buildPeriod(mon, `${dayLabel(mon)} – ${dayLabel(sun)}`, rows, gross);
    });
  }, [days, grossByDay]);

  const months = useMemo(() => {
    const keys = new Set<string>();
    grossByDay.forEach((_, d) => keys.add(d.slice(0, 7)));
    return [...keys].sort().slice(-12).map(m => {
      const rows = days.filter(d => d.day.startsWith(m));
      let gross = 0;
      grossByDay.forEach((v, d) => { if (d.startsWith(m)) gross += v; });
      return buildPeriod(m, monthLabel(m), rows, gross);
    });
  }, [days, grossByDay]);

  const week = weeks.find(w => w.key === selectedWeek) ?? weeks[weeks.length - 1];
  const dailyPeriods = useMemo(() => {
    if (!week) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(week.key, i))
      .filter(d => grossByDay.has(d))
      .map(d => buildPeriod(d, dayLabel(d), days.filter(r => r.day === d), grossByDay.get(d) ?? 0));
  }, [week, days, grossByDay]);

  const month = months.find(m => m.key === selectedMonth) ?? months[months.length - 1];
  const series = mode === 'monthly' ? months : mode === 'weekly' ? weeks : dailyPeriods;
  const current = mode === 'monthly' ? month : mode === 'weekly' ? week : (dailyPeriods.find(d => d.key === selectedDay) ?? dailyPeriods[dailyPeriods.length - 1]);
  const idx = current ? series.findIndex(p => p.key === current.key) : -1;
  const previous = idx > 0 ? series[idx - 1] : undefined;

  const catalog = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const below = (current?.products ?? []).filter(p => p.profit < 0 && p.quantity > 0);
  const tableRows = useMemo(() => {
    const rows = (current?.products ?? []).map(p => ({ ...p, margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }));
    return rows.sort((a, b) => sort === 'profit' ? b.profit - a.profit : a.margin - b.margin);
  }, [current, sort]);

  const unitLabel = (p: DailyTicketProduct) => p.byWeight ? '/kg' : '/un.';
  const unitPrice = (p: DailyTicketProduct) => (p.revenue / p.quantity) * (p.byWeight ? 1000 : 1);
  const unitCost = (p: DailyTicketProduct) => (catalog.get(p.id)?.purchase_price ?? 0) * (p.byWeight ? 1000 : 1);

  const onChartClick = (e: { activePayload?: { payload: Period }[] } | null) => {
    const key = e?.activePayload?.[0]?.payload.key;
    if (!key) return;
    if (mode === 'monthly') setSelectedMonth(key);
    else if (mode === 'weekly') setSelectedWeek(key);
    else setSelectedDay(key);
  };

  const modeNoun = mode === 'monthly' ? 'mês' : mode === 'weekly' ? 'semana' : 'dia';

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="section-title">Ticket Médio e Lucratividade</CardTitle>
          <Tabs value={mode} onValueChange={v => { setMode(v as Mode); setSelectedDay(null); }}>
            <TabsList aria-label="Agrupamento">
              <TabsTrigger value="monthly">Mensal</TabsTrigger>
              <TabsTrigger value="weekly">Semanal</TabsTrigger>
              <TabsTrigger value="daily">Diário</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {current && <p className="text-sm text-muted-foreground">
          {modeNoun[0].toUpperCase() + modeNoun.slice(1)} selecionad{mode === 'weekly' ? 'a' : 'o'}: <span className="font-semibold text-foreground">{current.label}</span>
          {mode === 'daily' && week && <> · semana {week.label}</>}
        </p>}
      </CardHeader>
      <CardContent className="space-y-5">
        {!current ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Sem vendas no período</div>
        ) : <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Ticket médio" value={currency(current.ticket)} now={current.ticket} prev={previous?.ticket} />
            <Kpi label="Lucro por venda" value={currency(current.profitPerSale)} now={current.profitPerSale} prev={previous?.profitPerSale} />
            <Kpi label="Margem estimada" value={pct(current.margin)} now={current.margin} prev={previous?.margin} points />
            <Kpi label="Nº de vendas" value={current.count.toLocaleString('pt-BR')} now={current.count} prev={previous?.count} />
            <Kpi label="Cobertura de custo" value={pct(current.coverage)} now={current.coverage} prev={previous?.coverage} points />
          </div>

          {current.coverage !== null && current.coverage < 70 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              Margem pouco confiável: {(100 - current.coverage).toFixed(0)}% do faturamento está sem custo cadastrado.
            </div>
          )}

          <div className="h-80 w-full" role="img" aria-label="Ticket médio em barras e margem estimada em linha">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} onClick={onChartClick} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} className="cursor-pointer">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} interval={0} />
                <YAxis yAxisId="left" tickFormatter={v => `R$${v}`} fontSize={11} width={56} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} fontSize={11} width={44} />
                <ReferenceLine yAxisId="right" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Tooltip content={<PeriodTooltip />} />
                <Bar yAxisId="left" dataKey="ticket" name="Ticket médio" radius={[4, 4, 0, 0]}>
                  {series.map(p => (
                    <Cell key={p.key} fill="hsl(var(--muted-foreground))"
                      fillOpacity={(p.count < 10 ? 0.35 : 0.7) + (p.key === current.key ? 0.25 : 0)} />
                  ))}
                </Bar>
                <Line yAxisId="right" dataKey="margin" name="Margem %" stroke="hsl(var(--success))" strokeWidth={2} connectNulls
                  dot={(props: { cx?: number; cy?: number; payload?: Period; index?: number }) => (
                    <circle key={props.index} cx={props.cx} cy={props.cy} r={4}
                      fill={(props.payload?.margin ?? 0) < 0 ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} />
                  )} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">Clique em uma barra ({modeNoun}) para ver os produtos.</p>

          {below.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-semibold text-destructive">{below.length} produto(s) vendido(s) abaixo do custo. Possível erro de cadastro.</p>
              <ul className="mt-2 divide-y divide-destructive/20">
                {below.map(p => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="text-muted-foreground">Vendido {currency(unitPrice(p))}{unitLabel(p)} · Custo {currency(unitCost(p))}{unitLabel(p)}</span>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/produtos?editar=${p.id}`)}>Revisar cadastro</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Tabs value={sort} onValueChange={v => setSort(v as 'profit' | 'margin')}>
              <TabsList>
                <TabsTrigger value="profit">Mais lucro</TabsTrigger>
                <TabsTrigger value="margin">Menor margem</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd vendida</th>
                  <th className="px-3 py-2 text-right font-medium">Faturamento</th>
                  <th className="px-3 py-2 text-right font-medium">Lucro total</th>
                  <th className="py-2 pl-3 text-right font-medium">Margem</th>
                </tr></thead>
                <tbody>{tableRows.map(p => (
                  <tr key={p.id} className="border-b border-border">
                    <td className="min-w-40 py-2 pr-3">{p.name}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{p.quantity.toLocaleString('pt-BR')} {p.byWeight ? 'g' : 'un.'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{currency(p.revenue)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right ${p.profit < 0 ? 'text-destructive' : 'text-success'}`}>{currency(p.profit)}</td>
                    <td className={`whitespace-nowrap py-2 pl-3 text-right ${p.margin < 0 ? 'text-destructive' : 'text-success'}`}>{p.margin.toFixed(1)}%</td>
                  </tr>
                ))}</tbody>
              </table>
              {!tableRows.length && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum produto com custo cadastrado neste período</p>}
            </div>
          </div>
        </>}
        <p className="text-xs text-muted-foreground">Lucro estimado com custos atuais e taxas de cartão, antes de despesas fixas e impostos. Considera apenas produtos com custo cadastrado.</p>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, now, prev, points }: { label: string; value: string; now: number | null; prev?: number | null; points?: boolean }) {
  let delta: number | null = null;
  if (now !== null && prev !== null && prev !== undefined) {
    delta = points ? now - prev : prev !== 0 ? ((now - prev) / Math.abs(prev)) * 100 : null;
  }
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold font-display">{value}</p>
      {delta !== null ? (
        <p className={`mt-1 flex items-center gap-1 text-xs ${up ? 'text-success' : 'text-destructive'}`}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {up ? '+' : ''}{delta.toFixed(1)}{points ? ' p.p.' : '%'} vs anterior
        </p>
      ) : <p className="mt-1 text-xs text-muted-foreground">sem comparação</p>}
    </div>
  );
}

function PeriodTooltip({ active, payload }: { active?: boolean; payload?: { payload: Period }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="space-y-1 rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="font-semibold">{row.label}</p>
      {row.count < 10 && <p className="text-xs text-warning">Amostra pequena</p>}
      <p>{row.count} {row.count === 1 ? 'venda' : 'vendas'}</p>
      <p>Ticket médio: {currency(row.ticket)}</p>
      <p>Faturamento com custo: {currency(row.revenue)}</p>
      <p className={row.profit < 0 ? 'text-destructive' : 'text-success'}>Lucro total: {currency(row.profit)}</p>
      <p>Lucro por venda: {currency(row.profitPerSale)}</p>
      <p>Margem: {pct(row.margin)}</p>
      <p>Cobertura de custo: {pct(row.coverage)}</p>
    </div>
  );
}
