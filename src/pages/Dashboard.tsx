import { useApp } from "@/contexts/AppContext";
import { useCardRates } from "@/components/CardRatesSettings";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { Package, ShoppingCart, DollarSign, AlertTriangle, TrendingUp, Users, CreditCard, TrendingDown, Smartphone } from "lucide-react";

const COLORS = ["hsl(345,70%,75%)", "hsl(25,52%,28%)", "hsl(345,60%,55%)", "hsl(40,30%,70%)", "hsl(142,60%,40%)", "hsl(38,92%,50%)"];

export default function Dashboard() {
  const { products, sales, clients } = useApp();
  const { rates } = useCardRates();
  const [period, setPeriod] = useState("30");

  const filtered = useMemo(() => {
    const days = parseInt(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return sales.filter(s => new Date(s.created_at) >= cutoff);
  }, [sales, period]);

  // Use sale_payments for accurate breakdowns
  const allPayments = useMemo(() => filtered.flatMap(s => s.payments || []), [filtered]);
  const totalRevenue = filtered.reduce((s, v) => s + v.total, 0);
  const cashTotal = allPayments.filter(p => p.payment_method === 'dinheiro').reduce((s, p) => s + p.amount, 0);
  const pixTotal = allPayments.filter(p => p.payment_method === 'pix').reduce((s, p) => s + p.amount, 0);
  const creditTotal = allPayments.filter(p => p.payment_method === 'credito').reduce((s, p) => s + p.amount, 0);
  const debitTotal = allPayments.filter(p => p.payment_method === 'debito').reduce((s, p) => s + p.amount, 0);
  const fiadoTotal = allPayments.filter(p => p.payment_method === 'fiado').reduce((s, p) => s + p.amount, 0);
  const totalTax = allPayments.reduce((s, p) => s + p.card_tax_amount, 0);
  const lowStock = products.filter(p => p.stock <= p.low_stock_threshold).length;
  const totalDebt = clients.reduce((s, c) => s + c.total_owed, 0);

  const productSales = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    filtered.forEach(sale => sale.items.forEach(item => {
      if (!map[item.product_id]) map[item.product_id] = { name: item.product_name, qty: 0, revenue: 0 };
      map[item.product_id].qty += item.quantity;
      map[item.product_id].revenue += item.subtotal;
    }));
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const top5 = productSales.slice(0, 5);

  const paymentPie = [
    { name: "Dinheiro", value: cashTotal },
    { name: "PIX", value: pixTotal },
    { name: "Crédito", value: creditTotal },
    { name: "Débito", value: debitTotal },
    { name: "Fiado", value: fiadoTotal },
  ].filter(d => d.value > 0);

  const dailyRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(s => {
      const day = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      map[day] = (map[day] || 0) + s.total;
    });
    return Object.entries(map).map(([date, total]) => ({ date, total })).slice(-15);
  }, [filtered]);

  const hourlySales = useMemo(() => {
    const map: Record<number, { total: number; count: number }> = {};
    filtered.forEach(s => {
      const h = new Date(s.created_at).getHours();
      if (!map[h]) map[h] = { total: 0, count: 0 };
      map[h].total += s.total;
      map[h].count += 1;
    });
    const hours = Object.keys(map).map(Number).sort((a, b) => a - b);
    if (hours.length === 0) return [];
    const rows: { hour: string; total: number; count: number }[] = [];
    for (let h = hours[0]; h <= hours[hours.length - 1]; h++) {
      rows.push({ hour: `${String(h).padStart(2, "0")}h`, total: map[h]?.total ?? 0, count: map[h]?.count ?? 0 });
    }
    return rows;
  }, [filtered]);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Dashboard</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        <StatCard icon={DollarSign} label="Faturamento" value={fmt(totalRevenue)} color="text-success" />
        <StatCard icon={ShoppingCart} label="Vendas" value={filtered.length.toString()} color="text-pink" />
        <StatCard icon={DollarSign} label="Dinheiro" value={fmt(cashTotal)} color="text-success" />
        <StatCard icon={Smartphone} label="PIX" value={fmt(pixTotal)} color="text-primary" />
        <StatCard icon={CreditCard} label="Crédito" value={fmt(creditTotal)} color="text-chocolate" />
        <StatCard icon={CreditCard} label="Débito" value={fmt(debitTotal)} color="text-chocolate" />
        <StatCard icon={TrendingDown} label="Taxas Cartão" value={fmt(totalTax)} color="text-destructive" />
        <StatCard icon={Users} label="Vendas no Fiado" value={fmt(fiadoTotal)} color="text-warning" />
        <StatCard icon={AlertTriangle} label="Estoque Baixo" value={lowStock.toString()} color="text-destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="section-title">Evolução de Vendas</CardTitle></CardHeader>
          <CardContent className="h-72">
            {dailyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(345,20%,90%)" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={v => `R$${v}`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="total" stroke="hsl(345,70%,75%)" strokeWidth={2} dot={{ fill: "hsl(25,52%,28%)" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="section-title">Formas de Pagamento</CardTitle></CardHeader>
          <CardContent className="h-72">
            {paymentPie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {paymentPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="section-title">Top 5 Produtos Mais Vendidos</CardTitle></CardHeader>
          <CardContent className="h-72">
            {top5.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5} layout="vertical">
                  <XAxis type="number" fontSize={12} />
                  <YAxis type="category" dataKey="name" fontSize={12} width={120} />
                  <Tooltip formatter={(v: number, name: string) => name === 'revenue' ? fmt(v) : v} />
                  <Bar dataKey="qty" fill="hsl(345,70%,75%)" radius={[0, 6, 6, 0]} name="Quantidade" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="stat-card min-w-0 min-h-[96px] flex items-center">
      <div className="flex items-center gap-4 w-full min-w-0">
        <div className={`p-3 rounded-xl bg-secondary shrink-0 ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground font-medium whitespace-nowrap">{label}</p>
          <p className="text-2xl font-bold font-display whitespace-nowrap leading-tight mt-1">{value}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados para exibir</div>;
}
