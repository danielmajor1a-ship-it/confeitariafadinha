import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";

interface Props {
  sales: any[];
  products: any[];
  costs: any[];
  days: number;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) => (v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`);

export default function BreakEvenPanel({ sales, products, costs, days }: Props) {
  const data = useMemo(() => {
    const valid = sales.filter((s) => s.status !== "cancelada");
    const revenue = valid.reduce((s, v) => s + Number(v.total), 0);
    const priceMap = new Map(products.map((p) => [p.id, Number(p.purchase_price) || 0]));
    const cmv = valid.reduce(
      (t, s) => t + (s.items || []).reduce((st: number, i: any) => st + (priceMap.get(i.product_id) || 0) * i.quantity, 0),
      0,
    );
    const cardFees = valid.reduce(
      (t, s) => t + (s.payments || []).reduce((st: number, p: any) => st + Number(p.card_tax_amount || 0), 0),
      0,
    );
    const factor = days / 30;
    const fixedMonthly = costs.filter((c) => c.type === "fixo").reduce((s, c) => s + Number(c.value), 0);
    const varMonthly = costs.filter((c) => c.type === "variavel").reduce((s, c) => s + Number(c.value), 0);
    const fixed = fixedMonthly * factor;
    const otherVar = varMonthly * factor;
    const variable = cmv + cardFees + otherVar;
    const varRatio = revenue > 0 ? variable / revenue : 0;
    const cmPct = 1 - varRatio;
    const breakEven = cmPct > 0 && revenue > 0 ? fixed / cmPct : 0;
    const result = revenue - variable - fixed;

    const maxX = Math.max(revenue * 1.4, breakEven * 1.3, 100);
    const steps = 20;
    const chart = Array.from({ length: steps + 1 }, (_, i) => {
      const x = (maxX / steps) * i;
      return { x, label: fmtK(x), faturamento: x, custoTotal: fixed + x * varRatio, custoFixo: fixed };
    });
    return { revenue, cmv, cardFees, otherVar, fixed, variable, breakEven, result, chart, cmPct };
  }, [sales, products, costs, days]);

  const above = data.revenue >= data.breakEven && data.breakEven > 0;
  const nearestLabel = (v: number) =>
    data.chart.reduce((a, b) => (Math.abs(b.x - v) < Math.abs(a.x - v) ? b : a)).label;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="section-title">Custos e Ponto de Equilíbrio</CardTitle>
        <p className="text-xs text-muted-foreground">
          Custos fixos cadastrados são mensais e foram ajustados para {days} {days === 1 ? "dia" : "dias"} do período.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          <Box label="Faturamento" value={fmt(data.revenue)} />
          <Box label="Custos fixos" value={fmt(data.fixed)} />
          <Box label="Custos variáveis" value={fmt(data.variable)}
            hint={`Mercadoria ${fmt(data.cmv)} · Taxas cartão ${fmt(data.cardFees)} · Outros ${fmt(data.otherVar)}`} />
          <Box label="Custo total" value={fmt(data.fixed + data.variable)} />
          <Box label="Ponto de equilíbrio" value={data.breakEven > 0 ? fmt(data.breakEven) : "—"} />
          <Box label={data.result >= 0 ? "Lucro do período" : "Prejuízo do período"} value={fmt(Math.abs(data.result))}
            tone={data.result >= 0 ? "text-success" : "text-destructive"} />
        </div>

        {data.revenue > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.chart} margin={{ right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => `Faturamento ${l}`} />
                <Line dataKey="faturamento" name="Faturamento" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                <Line dataKey="custoTotal" name="Custo total" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                <Line dataKey="custoFixo" name="Custo fixo" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} />
                {data.breakEven > 0 && (
                  <ReferenceLine x={nearestLabel(data.breakEven)} stroke="hsl(var(--foreground))" strokeDasharray="3 3"
                    label={{ value: "Equilíbrio", position: "top", fontSize: 11 }} />
                )}
                <ReferenceLine x={nearestLabel(data.revenue)} stroke="hsl(var(--primary))"
                  label={{ value: "Você está aqui", position: "insideTopRight", fontSize: 11 }} />
                <Legend />
              </ComposedChart>
            </ResponsiveContainer>
            {data.breakEven > 0 && (
              <p className={`text-sm font-semibold ${above ? "text-success" : "text-destructive"}`}>
                {above
                  ? `Acima do equilíbrio: sobra ${fmt(data.revenue - data.breakEven)} de faturamento além do necessário.`
                  : `Faltam ${fmt(data.breakEven - data.revenue)} de faturamento para cobrir todos os custos.`}
              </p>
            )}
            {data.cmPct <= 0 && (
              <p className="text-sm text-destructive">Os custos variáveis estão maiores que o faturamento — não há ponto de equilíbrio.</p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm py-10 text-center">Sem vendas no período.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Produtos sem custo de compra cadastrado entram com custo zero, o que pode deixar o resultado otimista.
        </p>
      </CardContent>
    </Card>
  );
}

function Box({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold whitespace-nowrap ${tone ?? ""}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{hint}</p>}
    </div>
  );
}
