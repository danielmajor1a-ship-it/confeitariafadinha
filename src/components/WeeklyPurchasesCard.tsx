import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PurchaseRow = { purchase_date: string; total: number; supplier: string; status: string };

type WeekRow = {
  label: string;
  total: number;
  count: number;
  sortKey: number;
  weekStart: Date;
  weekEnd: Date;
};

const WEEKS_TO_SHOW = 8;

export default function WeeklyPurchasesCard() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = format(startOfWeek(subWeeks(new Date(), WEEKS_TO_SHOW - 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const { data } = await supabase
        .from("purchases")
        .select("purchase_date, total, supplier, status")
        .eq("status", "confirmada")
        .gte("purchase_date", since)
        .order("purchase_date");
      setRows((data as PurchaseRow[]) || []);
      setLoading(false);
    })();
  }, []);

  const weeks = useMemo<WeekRow[]>(() => {
    const now = new Date();
    const map: Record<string, WeekRow> = {};
    // Garante que todas as semanas apareçam, mesmo sem compra
    for (let i = WEEKS_TO_SHOW - 1; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const we = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const key = format(ws, "yyyy-MM-dd");
      map[key] = {
        label: `${format(ws, "dd/MM")} – ${format(we, "dd/MM")}`,
        total: 0,
        count: 0,
        sortKey: ws.getTime(),
        weekStart: ws,
        weekEnd: we,
      };
    }
    rows.forEach((p) => {
      const d = new Date(p.purchase_date + "T12:00:00");
      const key = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
      if (map[key]) {
        map[key].total += Number(p.total);
        map[key].count += 1;
      }
    });
    return Object.values(map).sort((a, b) => a.sortKey - b.sortKey);
  }, [rows]);

  const stats = useMemo(() => {
    const withData = weeks.filter((w) => w.total > 0);
    if (withData.length === 0) return null;
    const best = withData.reduce((a, b) => (b.total > a.total ? b : a));
    const worst = withData.reduce((a, b) => (b.total < a.total ? b : a));
    const avg = withData.reduce((s, w) => s + w.total, 0) / withData.length;
    return { best, worst, avg };
  }, [weeks]);

  const topSuppliers = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((p) => {
      const name = p.supplier?.trim() || "Sem fornecedor";
      map[name] = (map[name] || 0) + Number(p.total);
    });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [rows]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="section-title">Compras por Semana</CardTitle>
        <p className="text-sm text-muted-foreground">Semanas de segunda a domingo — últimas {WEEKS_TO_SHOW} semanas</p>
        {stats && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground mt-1">
            <span>Semana com mais compras: <span className="font-semibold text-destructive">{stats.best.label} — {fmt(stats.best.total)}</span></span>
            <span>Semana com menos compras: <span className="font-semibold text-success">{stats.worst.label} — {fmt(stats.worst.total)}</span></span>
            <span>Média por semana: <span className="font-semibold text-foreground">{fmt(stats.avg)}</span></span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-72">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
          ) : weeks.some((w) => w.total > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(345,20%,90%)" />
                <XAxis dataKey="label" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip content={<WeekTooltip avg={stats?.avg ?? 0} />} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} name="Compras">
                  {weeks.map((w, i) => (
                    <Cell
                      key={i}
                      fill={
                        stats && w.total > 0 && w.label === stats.best.label
                          ? "hsl(0,72%,60%)"
                          : stats && w.total > 0 && w.label === stats.worst.label
                            ? "hsl(142,60%,40%)"
                            : "hsl(345,70%,75%)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Nenhuma compra confirmada no período</div>
          )}
        </div>

        {topSuppliers.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Fornecedores que mais receberam no período</p>
            <div className="space-y-1">
              {topSuppliers.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-sm border-b border-border/50 pb-1">
                  <span className="truncate mr-4">{s.name}</span>
                  <span className="font-semibold whitespace-nowrap">{fmt(s.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeekTooltip({ active, payload, avg }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as WeekRow;
  const diff = avg > 0 && row.total > 0 ? ((row.total - avg) / avg) * 100 : 0;
  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="font-bold font-display">Semana {row.label}</p>
      <p className="text-muted-foreground">{fmt(row.total)}</p>
      <p className="text-muted-foreground">{row.count} {row.count === 1 ? "compra" : "compras"}</p>
      {row.total > 0 && avg > 0 && (
        <p className={diff >= 0 ? "text-destructive" : "text-success"}>
          {diff >= 0 ? "+" : ""}{diff.toFixed(0)}% vs média
        </p>
      )}
    </div>
  );
}
