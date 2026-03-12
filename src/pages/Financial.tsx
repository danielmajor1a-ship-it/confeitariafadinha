import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useCardRates } from "@/components/CardRatesSettings";
import { useUserRole } from "@/hooks/useUserRole";
import CardRatesSettings from "@/components/CardRatesSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CreditCard, Banknote, AlertCircle, TrendingDown, Smartphone } from "lucide-react";
import { PAYMENT_LABELS } from "@/types";

export default function Financial() {
  const { sales, clients } = useApp();
  const { rates } = useCardRates();
  const { isAdmin } = useUserRole();
  const [period, setPeriod] = useState("30");

  const filtered = useMemo(() => {
    const days = parseInt(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return sales.filter(s => new Date(s.created_at) >= cutoff);
  }, [sales, period]);

  // Use sale_payments for accurate breakdown
  const allPayments = useMemo(() => filtered.flatMap(s => s.payments || []), [filtered]);
  const cashTotal = allPayments.filter(p => p.payment_method === 'dinheiro').reduce((s, p) => s + p.amount, 0);
  const pixTotal = allPayments.filter(p => p.payment_method === 'pix').reduce((s, p) => s + p.amount, 0);
  const creditTotal = allPayments.filter(p => p.payment_method === 'credito').reduce((s, p) => s + p.amount, 0);
  const debitTotal = allPayments.filter(p => p.payment_method === 'debito').reduce((s, p) => s + p.amount, 0);
  const fiadoTotal = allPayments.filter(p => p.payment_method === 'fiado').reduce((s, p) => s + p.amount, 0);
  const total = filtered.reduce((s, v) => s + v.total, 0);
  const totalDebt = clients.reduce((s, c) => s + c.total_owed, 0);

  // Tax calculations from sale_payments
  const creditTax = allPayments.filter(p => p.payment_method === 'credito').reduce((s, p) => s + p.card_tax_amount, 0);
  const debitTax = allPayments.filter(p => p.payment_method === 'debito').reduce((s, p) => s + p.card_tax_amount, 0);
  const totalTax = creditTax + debitTax;
  const netCard = creditTotal + debitTotal - totalTax;
  const netTotal = total - totalTax;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-success"><DollarSign className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Total Bruto</p><p className="text-xl font-bold font-display">{fmt(total)}</p></div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-success"><Banknote className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Dinheiro</p><p className="text-xl font-bold font-display">{fmt(cashTotal)}</p></div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-primary"><Smartphone className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">PIX</p><p className="text-xl font-bold font-display">{fmt(pixTotal)}</p></div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-chocolate"><CreditCard className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Crédito</p><p className="text-xl font-bold font-display">{fmt(creditTotal)}</p></div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-chocolate"><CreditCard className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Débito</p><p className="text-xl font-bold font-display">{fmt(debitTotal)}</p></div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-warning"><AlertCircle className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Fiado em Aberto</p><p className="text-xl font-bold font-display">{fmt(totalDebt)}</p></div>
          </div>
        </Card>
      </div>

      {/* Tax summary card */}
      {totalTax > 0 && (
        <Card className="border-2 border-warning/20 bg-warning/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-warning/20 text-warning"><TrendingDown className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Resumo de Taxas de Operadora</p>
                <p className="text-lg font-bold font-display">Total Taxas: {fmt(totalTax)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-2 rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Taxa Crédito</p>
                <p className="font-bold text-destructive">{fmt(creditTax)}</p>
              </div>
              <div className="p-2 rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Taxa Débito</p>
                <p className="font-bold text-destructive">{fmt(debitTax)}</p>
              </div>
              <div className="p-2 rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Líquido Cartão</p>
                <p className="font-bold text-success">{fmt(netCard)}</p>
              </div>
              <div className="p-2 rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Líquido Total</p>
                <p className="font-bold text-success">{fmt(netTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="section-title">Vendas do Período</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Itens</TableHead><TableHead>Pagamento</TableHead><TableHead>Bruto</TableHead>
                  {totalTax > 0 && <TableHead>Taxa</TableHead>}
                  {totalTax > 0 && <TableHead>Líquido</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma venda no período</TableCell></TableRow>}
                  {filtered.map(s => {
                    const saleTax = (s.payments || []).reduce((sum, p) => sum + p.card_tax_amount, 0);
                    const saleNet = s.total - saleTax;
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{new Date(s.created_at).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>{s.items.map(i => i.product_name).join(', ')}</TableCell>
                        <TableCell>
                          {s.payments && s.payments.length > 1 ? (
                            <div className="flex flex-wrap gap-1">
                              {s.payments.map((p, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {PAYMENT_LABELS[p.payment_method] || p.payment_method}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <Badge variant="secondary">{PAYMENT_LABELS[s.payment_method] || s.payment_method}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">{fmt(s.total)}</TableCell>
                        {totalTax > 0 && (
                          <TableCell className={saleTax > 0 ? "text-destructive" : "text-muted-foreground"}>
                            {saleTax > 0 ? `-${fmt(saleTax)}` : "-"}
                          </TableCell>
                        )}
                        {totalTax > 0 && (
                          <TableCell className="font-semibold text-success">
                            {saleTax > 0 ? fmt(saleNet) : fmt(s.total)}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {isAdmin && (
          <div>
            <CardRatesSettings />
          </div>
        )}
      </div>
    </div>
  );
}
