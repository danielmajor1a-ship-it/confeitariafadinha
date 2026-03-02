import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CreditCard, Banknote, AlertCircle } from "lucide-react";

export default function Financial() {
  const { sales, clients } = useApp();
  const [period, setPeriod] = useState("30");

  const filtered = useMemo(() => {
    const days = parseInt(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return sales.filter(s => new Date(s.date) >= cutoff);
  }, [sales, period]);

  const cashTotal = filtered.filter(s => s.paymentMethod === 'dinheiro').reduce((s, v) => s + v.total, 0);
  const cardTotal = filtered.filter(s => s.paymentMethod === 'cartao').reduce((s, v) => s + v.total, 0);
  const fiadoTotal = filtered.filter(s => s.paymentMethod === 'fiado').reduce((s, v) => s + v.total, 0);
  const total = cashTotal + cardTotal + fiadoTotal;
  const totalDebt = clients.reduce((s, c) => s + c.totalOwed, 0);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Financeiro</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="365">1 ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-success"><DollarSign className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Geral</p>
              <p className="text-xl font-bold font-display">{fmt(total)}</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-success"><Banknote className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Dinheiro</p>
              <p className="text-xl font-bold font-display">{fmt(cashTotal)}</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-chocolate"><CreditCard className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Cartão</p>
              <p className="text-xl font-bold font-display">{fmt(cardTotal)}</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-warning"><AlertCircle className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Fiado em Aberto</p>
              <p className="text-xl font-bold font-display">{fmt(totalDebt)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="section-title">Vendas do Período</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Itens</TableHead><TableHead>Pagamento</TableHead><TableHead>Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma venda no período</TableCell></TableRow>}
              {[...filtered].reverse().map(s => (
                <TableRow key={s.id}>
                  <TableCell>{new Date(s.date).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{s.items.map(i => i.productName).join(', ')}</TableCell>
                  <TableCell className="capitalize">{s.paymentMethod}</TableCell>
                  <TableCell className="font-semibold">{fmt(s.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
