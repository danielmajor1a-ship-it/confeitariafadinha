import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Var({ cur, prev }: { cur: number; prev?: number }) {
  if (prev === undefined || prev === cur) return <span className="text-muted-foreground">—</span>;
  if (prev === 0) return <span className="text-muted-foreground">inicial</span>;
  const pct = ((cur - prev) / prev) * 100;
  return <span className={pct > 0 ? "text-destructive font-medium" : "text-success font-medium"}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
}

export default function PriceHistory() {
  const { products } = useApp();
  const [productId, setProductId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    const list = products.filter(p => productId === "all" || p.id === productId).flatMap(p =>
      p.priceHistory.map((h, i) => ({
        key: h.id, name: p.name, date: h.recorded_at,
        cost: Number(h.purchase_price), price: Number(h.sale_price),
        prevCost: i > 0 ? Number(p.priceHistory[i - 1].purchase_price) : undefined,
        prevPrice: i > 0 ? Number(p.priceHistory[i - 1].sale_price) : undefined,
      })));
    return list
      .filter(r => (!from || r.date.slice(0, 10) >= from) && (!to || r.date.slice(0, 10) <= to))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [products, productId, from, to]);

  return (
    <div className="space-y-3">
      <h2 className="section-title">Histórico de preços</h2>
      <p className="text-muted-foreground text-sm">Apenas consulta. Cada linha é uma mudança de custo ou de preço de venda, com a variação em relação à anterior do mesmo produto.</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-72">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {[...products].sort((a, b) => a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><span className="text-xs text-muted-foreground">De</span><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><span className="text-xs text-muted-foreground">Até</span><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      <div className="rounded-2xl border bg-card overflow-hidden max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Produto</TableHead>
            <TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Var. custo</TableHead>
            <TableHead className="text-right">Preço venda</TableHead><TableHead className="text-right">Var. preço</TableHead>
            <TableHead className="text-right">Margem</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma mudança registrada no período</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.key}>
                <TableCell>{new Date(r.date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right">{fmt(r.cost)}</TableCell>
                <TableCell className="text-right"><Var cur={r.cost} prev={r.prevCost} /></TableCell>
                <TableCell className="text-right">{fmt(r.price)}</TableCell>
                <TableCell className="text-right"><Var cur={r.price} prev={r.prevPrice} /></TableCell>
                <TableCell className="text-right">{r.cost > 0 ? `${(((r.price - r.cost) / r.cost) * 100).toFixed(1)}%` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
