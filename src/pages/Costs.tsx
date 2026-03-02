import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, TrendingUp, Target, PieChart, BarChart3, Info, DollarSign, Percent, Scale, Edit2, Check, X } from "lucide-react";
import { PieChart as RePie, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine, Area, ComposedChart } from "recharts";

export default function Costs() {
  const { costs, products, sales, addCost, deleteCost } = useApp();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  // ─── Core calculations ───
  const fixedTotal = costs.filter(c => c.type === 'fixo').reduce((s, c) => s + c.value, 0);
  const varTotal = costs.filter(c => c.type === 'variavel').reduce((s, c) => s + c.value, 0);
  const totalCosts = fixedTotal + varTotal;

  // Revenue from sales (last 30 days for analysis)
  const last30 = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return sales.filter(s => new Date(s.created_at) >= cutoff);
  }, [sales]);

  const revenue = last30.reduce((s, v) => s + v.total, 0);

  // Cost of goods sold (purchase price × qty sold)
  const cogs = useMemo(() => {
    return last30.reduce((total, sale) => {
      return total + sale.items.reduce((st, item) => {
        const product = products.find(p => p.id === item.product_id);
        return st + (product ? product.purchase_price * item.quantity : 0);
      }, 0);
    }, 0);
  }, [last30, products]);

  // ─── KPIs ───
  const contributionMargin = revenue - cogs - varTotal;
  const contributionMarginPct = revenue > 0 ? (contributionMargin / revenue) * 100 : 0;
  const breakEvenRevenue = contributionMarginPct > 0 ? (fixedTotal / (contributionMarginPct / 100)) : 0;
  const grossProfit = revenue - cogs;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netProfit = revenue - cogs - totalCosts;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // Average markup across products
  const avgMarkup = useMemo(() => {
    const withPrices = products.filter(p => p.purchase_price > 0);
    if (withPrices.length === 0) return 0;
    const total = withPrices.reduce((s, p) => s + ((p.sale_price - p.purchase_price) / p.purchase_price) * 100, 0);
    return total / withPrices.length;
  }, [products]);

  // ─── ABC Classification (Pareto) ───
  const abcData = useMemo(() => {
    if (costs.length === 0) return [];
    const sorted = [...costs].sort((a, b) => b.value - a.value);
    let cumulative = 0;
    return sorted.map(c => {
      cumulative += c.value;
      const cumulativePct = totalCosts > 0 ? (cumulative / totalCosts) * 100 : 0;
      const classification = cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C';
      return { ...c, cumulativePct, classification };
    });
  }, [costs, totalCosts]);

  const classA = abcData.filter(c => c.classification === 'A');
  const classB = abcData.filter(c => c.classification === 'B');
  const classC = abcData.filter(c => c.classification === 'C');

  // ─── Chart data ───
  const pieData = [
    { name: 'Fixos', value: fixedTotal },
    { name: 'Variáveis', value: varTotal },
  ].filter(d => d.value > 0);

  const abcPieData = [
    { name: 'Classe A', value: classA.reduce((s, c) => s + c.value, 0), count: classA.length },
    { name: 'Classe B', value: classB.reduce((s, c) => s + c.value, 0), count: classB.length },
    { name: 'Classe C', value: classC.reduce((s, c) => s + c.value, 0), count: classC.length },
  ].filter(d => d.value > 0);

  const profitBarData = [
    { name: 'Receita', value: revenue },
    { name: 'CMV', value: cogs },
    { name: 'C. Fixos', value: fixedTotal },
    { name: 'C. Variáveis', value: varTotal },
    { name: 'Lucro Líq.', value: Math.max(0, netProfit) },
  ];

  // ─── Break-even chart data ───
  const breakEvenChartData = useMemo(() => {
    const maxRevenue = Math.max(revenue * 1.5, breakEvenRevenue * 1.3, 1000);
    const steps = 10;
    const cmPct = contributionMarginPct / 100;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const rev = (maxRevenue / steps) * i;
      const totalCostLine = fixedTotal + (cmPct > 0 ? rev * (1 - cmPct) : rev * 0.5);
      return {
        revenue: rev,
        revenueLabel: `R$${(rev / 1000).toFixed(0)}k`,
        receita: rev,
        custoTotal: totalCostLine,
        custoFixo: fixedTotal,
      };
    });
  }, [fixedTotal, contributionMarginPct, revenue, breakEvenRevenue]);

  const fixedCosts = costs.filter(c => c.type === 'fixo');

  const COLORS = [
    'hsl(345, 60%, 55%)', 'hsl(25, 52%, 28%)', 'hsl(38, 92%, 50%)',
    'hsl(142, 60%, 40%)', 'hsl(345, 70%, 75%)',
  ];

  const ABC_COLORS = ['hsl(0, 72%, 51%)', 'hsl(38, 92%, 50%)', 'hsl(142, 60%, 40%)'];

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
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="page-header">Análise de Custos</h1>
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
                <div><Label>Valor (mensal)</Label><Input name="value" type="number" step="0.01" required /></div>
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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Custos Fixos" value={fmt(fixedTotal)} color="text-destructive"
            tooltip="Custos que não mudam com o volume de produção (aluguel, salários, etc.)" />
          <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Custos Variáveis" value={fmt(varTotal)} color="text-warning"
            tooltip="Custos que variam proporcionalmente à produção (embalagens, ingredientes, etc.)" />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Margem Bruta" value={fmtPct(grossMarginPct)} color={grossMarginPct >= 50 ? "text-success" : "text-warning"}
            tooltip="(Receita - CMV) / Receita. Indica quanto sobra após o custo direto dos produtos." />
          <KpiCard icon={<Scale className="h-4 w-4" />} label="Margem de Contribuição" value={fmt(contributionMargin)} color={contributionMargin > 0 ? "text-success" : "text-destructive"}
            tooltip="Receita - CMV - Custos Variáveis. Quanto sobra para cobrir custos fixos e gerar lucro." />
          <KpiCard icon={<Target className="h-4 w-4" />} label="Ponto de Equilíbrio" value={fmt(breakEvenRevenue)} color="text-chocolate"
            tooltip="Faturamento mínimo necessário para cobrir todos os custos. Abaixo disso, há prejuízo." />
          <KpiCard icon={<Percent className="h-4 w-4" />} label="Markup Médio" value={fmtPct(avgMarkup)} color="text-chocolate"
            tooltip="Percentual médio adicionado sobre o custo de compra para formar o preço de venda." />
        </div>

        {/* Lucro Líquido destaque */}
        <Card className={`border-2 ${netProfit >= 0 ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${netProfit >= 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lucro Líquido (últimos 30 dias)</p>
                <p className="text-2xl font-bold font-display">{fmt(netProfit)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Margem Líquida</p>
              <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtPct(netMarginPct)}</p>
            </div>
            {breakEvenRevenue > 0 && (
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">Progresso p/ Equilíbrio</p>
                <p className="text-lg font-bold text-foreground">
                  {revenue >= breakEvenRevenue ? '✅ Atingido' : `${((revenue / breakEvenRevenue) * 100).toFixed(0)}%`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs: Gráficos / Classificação ABC / Lista de Custos */}
        <Tabs defaultValue="fixed">
          <TabsList>
            <TabsTrigger value="fixed"><DollarSign className="h-4 w-4 mr-1" /> Custos Fixos</TabsTrigger>
            <TabsTrigger value="charts"><BarChart3 className="h-4 w-4 mr-1" /> Gráficos</TabsTrigger>
            <TabsTrigger value="abc"><PieChart className="h-4 w-4 mr-1" /> Curva ABC</TabsTrigger>
            <TabsTrigger value="list">Todos os Custos</TabsTrigger>
          </TabsList>

          {/* Fixed Costs Control Tab */}
          <TabsContent value="fixed" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="section-title text-sm flex items-center gap-2">
                    Controle de Custos Fixos Mensais
                    <Tooltip>
                      <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Custos fixos são despesas recorrentes independentes do volume de produção. Monitore-os de perto pois impactam diretamente o ponto de equilíbrio.</p>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fixedCosts.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-8 text-center">Nenhum custo fixo cadastrado. Adicione custos como aluguel, salários, etc.</p>
                  ) : (
                    <div className="space-y-2">
                      {fixedCosts.map(c => (
                        <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border group">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{c.name}</p>
                            {c.product_id && (
                              <p className="text-xs text-muted-foreground">{products.find(p => p.id === c.product_id)?.name}</p>
                            )}
                          </div>
                          <p className="font-bold text-sm shrink-0 text-destructive">{fmt(c.value)}/mês</p>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteCost(c.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-3 border-t mt-3">
                        <p className="font-semibold text-sm">Total Fixos Mensal</p>
                        <p className="font-bold text-lg text-destructive">{fmt(fixedTotal)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Break-even Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="section-title text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" /> Análise do Ponto de Equilíbrio
                    <Tooltip>
                      <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">O ponto onde a linha de receita cruza a linha de custo total. Acima desse ponto, há lucro; abaixo, prejuízo.</p>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {breakEvenRevenue > 0 ? (
                    <div className="space-y-3">
                      <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={breakEvenChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="revenueLabel" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                          <ReTooltip formatter={(v: number) => fmt(v)} />
                          <Line type="monotone" dataKey="receita" stroke="hsl(142, 60%, 40%)" strokeWidth={2} name="Receita" dot={false} />
                          <Line type="monotone" dataKey="custoTotal" stroke="hsl(0, 72%, 51%)" strokeWidth={2} name="Custo Total" dot={false} />
                          <Line type="monotone" dataKey="custoFixo" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} strokeDasharray="5 5" name="Custo Fixo" dot={false} />
                          {breakEvenRevenue > 0 && (
                            <ReferenceLine x={`R$${(breakEvenRevenue / 1000).toFixed(0)}k`} stroke="hsl(var(--foreground))" strokeDasharray="3 3" label={{ value: 'Equilíbrio', position: 'top', fontSize: 11 }} />
                          )}
                          <Legend />
                        </ComposedChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-muted/50">
                          <p className="text-[10px] text-muted-foreground">Ponto de Equilíbrio</p>
                          <p className="font-bold text-sm">{fmt(breakEvenRevenue)}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50">
                          <p className="text-[10px] text-muted-foreground">Receita Atual</p>
                          <p className={`font-bold text-sm ${revenue >= breakEvenRevenue ? 'text-success' : 'text-destructive'}`}>{fmt(revenue)}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50">
                          <p className="text-[10px] text-muted-foreground">{revenue >= breakEvenRevenue ? 'Margem de Segurança' : 'Falta p/ Equilíbrio'}</p>
                          <p className={`font-bold text-sm ${revenue >= breakEvenRevenue ? 'text-success' : 'text-destructive'}`}>
                            {fmt(Math.abs(revenue - breakEvenRevenue))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm py-12 text-center">Cadastre custos e faça vendas para visualizar o ponto de equilíbrio</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* DRE simplificado */}
              <Card>
                <CardHeader><CardTitle className="section-title text-sm">DRE Simplificado (30 dias)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={profitBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <ReTooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {profitBarData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Composição dos Custos */}
              <Card>
                <CardHeader><CardTitle className="section-title text-sm">Composição dos Custos</CardTitle></CardHeader>
                <CardContent className="flex items-center justify-center">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <RePie>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <ReTooltip formatter={(v: number) => fmt(v)} />
                      </RePie>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground text-sm py-12">Cadastre custos para visualizar</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ABC Tab */}
          <TabsContent value="abc" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="section-title text-sm flex items-center gap-2">
                  Classificação ABC (Curva de Pareto)
                  <Tooltip>
                    <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p><strong>Classe A:</strong> ~20% dos itens que representam ~80% dos custos. Exigem maior controle.</p>
                      <p><strong>Classe B:</strong> ~30% dos itens, ~15% dos custos. Controle intermediário.</p>
                      <p><strong>Classe C:</strong> ~50% dos itens, ~5% dos custos. Controle simplificado.</p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* ABC Pie */}
                  <div className="flex items-center justify-center">
                    {abcPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <RePie>
                          <Pie data={abcPieData} cx="50%" cy="50%" outerRadius={80} innerRadius={45} dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {abcPieData.map((_, i) => <Cell key={i} fill={ABC_COLORS[i % ABC_COLORS.length]} />)}
                          </Pie>
                          <ReTooltip formatter={(v: number) => fmt(v)} />
                        </RePie>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-muted-foreground text-sm py-12">Cadastre custos para visualizar</p>
                    )}
                  </div>

                  {/* ABC Summary */}
                  <div className="space-y-3">
                    {[
                      { label: 'Classe A', items: classA, color: 'bg-destructive', desc: 'Alto impacto – controle rigoroso' },
                      { label: 'Classe B', items: classB, color: 'bg-warning', desc: 'Impacto médio – controle moderado' },
                      { label: 'Classe C', items: classC, color: 'bg-success', desc: 'Baixo impacto – controle simples' },
                    ].map(cls => (
                      <div key={cls.label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border">
                        <div className={`w-3 h-3 rounded-full ${cls.color} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{cls.label} <span className="text-muted-foreground font-normal">({cls.items.length} {cls.items.length === 1 ? 'item' : 'itens'})</span></p>
                          <p className="text-xs text-muted-foreground">{cls.desc}</p>
                        </div>
                        <p className="font-bold text-sm shrink-0">{fmt(cls.items.reduce((s, c) => s + c.value, 0))}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ABC Table */}
                <div className="mt-4 rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Classe</TableHead><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>% Acumulado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {abcData.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum custo cadastrado</TableCell></TableRow>}
                      {abcData.map(c => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Badge variant={c.classification === 'A' ? 'destructive' : c.classification === 'B' ? 'default' : 'secondary'}>
                              {c.classification}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell><Badge variant="outline">{c.type === 'fixo' ? 'Fixo' : 'Variável'}</Badge></TableCell>
                          <TableCell>{fmt(c.value)}</TableCell>
                          <TableCell>{fmtPct(c.cumulativePct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* List Tab */}
          <TabsContent value="list">
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
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ─── KPI Card Component ───
function KpiCard({ icon, label, value, color, tooltip }: { icon: React.ReactNode; label: string; value: string; color: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="stat-card border-none cursor-help">
          <div className="flex items-start gap-2">
            <div className={`p-1.5 rounded-lg bg-secondary ${color} shrink-0`}>{icon}</div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
              <p className="text-sm font-bold font-display truncate">{value}</p>
            </div>
          </div>
        </Card>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs"><p className="text-xs">{tooltip}</p></TooltipContent>
    </Tooltip>
  );
}
