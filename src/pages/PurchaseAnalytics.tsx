import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_LABELS } from "@/types";
import { startOfWeek, endOfWeek, subWeeks, format, addDays } from "date-fns";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useUserRole } from "@/hooks/useUserRole";
import SupplierPaymentDialog, { ExistingPayment } from "@/components/SupplierPaymentDialog";
import { METHOD_LABELS, STATUS_LABELS, payStatus } from "@/lib/supplier-payments";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Item = { id: string; production_only?: boolean; product_id: string | null; original_description: string; quantity: number; unit: string; total_value: number; products: { name: string; category: string } | null };
type Purchase = { id: string; purchase_date: string; supplier: string; source: string; total: number; purchase_items: Item[] };
type Pay = { id: string; created_at: string; amount: number; description: string | null; method: string; allocated: number };

const SOURCE: Record<string, string> = { nf_xml: "Nota (XML)", nf_pdf: "Nota (PDF)", nf_foto: "Nota (foto)", cupom_foto: "Cupom (foto)", cupom_fiscal: "Cupom fiscal", manual: "Sem nota" };
const weekKey = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

export default function PurchaseAnalytics() {
  const [from, setFrom] = useState(format(startOfWeek(subWeeks(new Date(), 7), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [supplierQ, setSupplierQ] = useState("");
  const [productQ, setProductQ] = useState("");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [paidMap, setPaidMap] = useState<Record<string, number>>({});
  const [newPay, setNewPay] = useState(false);
  const [linkPay, setLinkPay] = useState<ExistingPayment | null>(null);
  const [reload, setReload] = useState(0);
  const { isAdmin } = useUserRole();

  useEffect(() => {
    setLoading(true);
    (async () => {
      const [p, c, a] = await Promise.all([
        supabase.from("purchases").select("id, purchase_date, supplier, source, total, purchase_items(id, production_only, product_id, original_description, quantity, unit, total_value, products(name, category))")
          .eq("status", "confirmada").gte("purchase_date", from).lte("purchase_date", to).order("purchase_date"),
        supabase.from("supplier_payments" as any).select("id, paid_at, amount, supplier, notes, method, supplier_payment_allocations(amount)")
          .gte("paid_at", from + "T00:00:00-03:00").lte("paid_at", to + "T23:59:59-03:00").order("paid_at"),
        supabase.from("supplier_payment_allocations" as any).select("purchase_id, amount"),
      ]);
      setPurchases((p.data as any) || []);
      setPays(((c.data as any[]) || []).map((x) => ({ id: x.id, created_at: x.paid_at, amount: Number(x.amount), description: x.supplier + (x.notes ? ` — ${x.notes}` : ""), method: x.method, allocated: (x.supplier_payment_allocations || []).reduce((t: number, a: any) => t + Number(a.amount), 0) })));
      const pm: Record<string, number> = {};
      ((a.data as any[]) || []).forEach((x) => { pm[x.purchase_id] = (pm[x.purchase_id] || 0) + Number(x.amount); });
      setPaidMap(pm);
      setLoading(false);
    })();
  }, [from, to, reload]);

  const filtered = useMemo(() => {
    const sq = norm(supplierQ), pq = norm(productQ);
    return purchases
      .filter((p) => !sq || norm(p.supplier).includes(sq))
      .map((p) => pq ? { ...p, purchase_items: p.purchase_items.filter((i) => norm(i.products?.name || i.original_description).includes(pq)) } : p)
      .filter((p) => !pq || p.purchase_items.length > 0);
  }, [purchases, supplierQ, productQ]);
  const filteredPays = useMemo(() => pays.filter((x) => !supplierQ || norm(x.description || "").includes(norm(supplierQ))), [pays, supplierQ]);

  const totalOf = (p: Purchase) => productQ ? p.purchase_items.reduce((s, i) => s + Number(i.total_value), 0) : Number(p.total);

  const weeks = useMemo(() => {
    const map: Record<string, { key: string; label: string; total: number; count: number; pays: number; cats: Record<string, number>; list: Purchase[] }> = {};
    let d = startOfWeek(new Date(from + "T12:00:00"), { weekStartsOn: 1 });
    const end = new Date(to + "T12:00:00");
    while (d <= end) {
      const k = format(d, "yyyy-MM-dd");
      map[k] = { key: k, label: `${format(d, "dd/MM")} – ${format(endOfWeek(d, { weekStartsOn: 1 }), "dd/MM")}`, total: 0, count: 0, pays: 0, cats: {}, list: [] };
      d = addDays(d, 7);
    }
    filtered.forEach((p) => {
      const w = map[weekKey(new Date(p.purchase_date + "T12:00:00"))]; if (!w) return;
      w.total += totalOf(p); w.count++; w.list.push(p);
      p.purchase_items.forEach((i) => { const c = i.products?.category || "sem_produto"; w.cats[c] = (w.cats[c] || 0) + Number(i.total_value); });
    });
    filteredPays.forEach((x) => { const w = map[weekKey(new Date(x.created_at))]; if (w) w.pays += Number(x.amount); });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered, filteredPays, from, to, productQ]);

  const grand = weeks.reduce((s, w) => s + w.total, 0);
  const grandPays = weeks.reduce((s, w) => s + w.pays, 0);
  const count = weeks.reduce((s, w) => s + w.count, 0);
  const unlinked = filteredPays.filter((x) => x.amount - x.allocated > 0.01);
  const openNotes = filtered.filter((p) => payStatus(Number(p.total), paidMap[p.id] || 0) !== "paga");
  const openTotal = openNotes.reduce((s, p) => s + Number(p.total) - (paidMap[p.id] || 0), 0);
  const prodInputs = filtered.reduce((s, p) => s + p.purchase_items.filter((i) => i.production_only).reduce((t, i) => t + Number(i.total_value), 0), 0);
  const statusBadge = (p: Purchase) => { const st = payStatus(Number(p.total), paidMap[p.id] || 0); return <Badge variant={st === "paga" ? "default" : st === "parcial" ? "secondary" : "outline"}>{STATUS_LABELS[st]}</Badge>; };
  const catLabel = (c: string) => c === "sem_produto" ? "Sem produto ligado" : (CATEGORY_LABELS as any)[c] || c;

  function exportXlsx() {
    const resumo = weeks.map((w, i) => ({ Semana: w.label, Compras: w.count, Total: w.total, "Variação vs semana anterior (%)": i > 0 ? pct(w.total, weeks[i - 1].total)?.toFixed(1) ?? "" : "", "Pagamentos a fornecedor": w.pays }));
    const itens = filtered.flatMap((p) => p.purchase_items.map((i) => ({ Data: format(new Date(p.purchase_date + "T12:00:00"), "dd/MM/yyyy"), Fornecedor: p.supplier, Origem: SOURCE[p.source] || p.source, Produto: i.products?.name || i.original_description, Categoria: catLabel(i.products?.category || "sem_produto"), Quantidade: Number(i.quantity), Unidade: i.unit, "Custo unitário": Number(i.quantity) ? Number(i.total_value) / Number(i.quantity) : 0, Total: Number(i.total_value) })));
    const pg = filteredPays.map((x) => ({ Data: format(new Date(x.created_at), "dd/MM/yyyy HH:mm"), Fornecedor: x.description || "", Forma: METHOD_LABELS[x.method] || x.method, Valor: Number(x.amount), "Ligado a notas": x.allocated, "Sem nota": x.amount - x.allocated }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo semanal");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itens), "Itens");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pg), "Pagamentos fornecedor");
    XLSX.writeFile(wb, `analise-compras_${from}_a_${to}.xlsx`);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Análise de Compras</h1>
        <div className="flex gap-2">{isAdmin && <Button onClick={() => setNewPay(true)}>Pagamento fora do caixa</Button>}<Button variant="outline" onClick={exportXlsx} disabled={loading}><Download className="h-4 w-4 mr-2" />Exportar Excel</Button></div>
      </div>

      <Card><CardContent className="pt-6 grid gap-4 md:grid-cols-4">
        <label className="text-sm space-y-1"><span>De</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm space-y-1"><span>Até</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm space-y-1"><span>Fornecedor</span><Input placeholder="Buscar fornecedor" value={supplierQ} onChange={(e) => setSupplierQ(e.target.value)} /></label>
        <label className="text-sm space-y-1"><span>Produto</span><Input placeholder="Buscar produto" value={productQ} onChange={(e) => setProductQ(e.target.value)} /></label>
      </CardContent></Card>

      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        <Stat label="Total em compras" value={fmt(grand)} />
        <Stat label="Nº de compras" value={String(count)} />
        <Stat label="Média por semana" value={fmt(weeks.length ? grand / weeks.length : 0)} />
        <Stat label="Pagamentos a fornecedor" value={fmt(grandPays)} />
        <Stat label="Notas a pagar" value={fmt(openTotal)} />
        <Stat label="Insumos de produção" value={fmt(prodInputs)} />
      </div>

      {(unlinked.length > 0 || openNotes.length > 0) && <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="section-title">Pagamentos sem nota ({unlinked.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Dinheiro que saiu para fornecedor e ainda não foi ligado a uma nota.</p></CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-auto">
            {unlinked.length === 0 && <p className="text-sm text-muted-foreground">Todos os pagamentos estão ligados.</p>}
            {unlinked.map((x) => <div key={x.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <div className="flex-1"><b>{x.description}</b><div className="text-muted-foreground">{format(new Date(x.created_at), "dd/MM/yyyy")} · {METHOD_LABELS[x.method] || x.method} · sem nota {fmt(x.amount - x.allocated)} de {fmt(x.amount)}</div></div>
              {isAdmin && <Button size="sm" variant="outline" onClick={() => setLinkPay({ id: x.id, supplier: x.description || "", amount: x.amount, allocated: x.allocated, paid_at: x.created_at })}>Ligar a notas</Button>}
            </div>)}
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="section-title">Notas a pagar ({openNotes.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Notas do período ainda sem pagamento completo.</p></CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-auto">
            {openNotes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma nota em aberto.</p>}
            {openNotes.map((p) => <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer" onClick={() => setDetail(p)}>
              <div className="flex-1"><b>{p.supplier || "—"}</b><div className="text-muted-foreground">{format(new Date(p.purchase_date + "T12:00:00"), "dd/MM/yyyy")} · falta {fmt(Number(p.total) - (paidMap[p.id] || 0))} de {fmt(Number(p.total))}</div></div>
              {statusBadge(p)}
            </div>)}
          </CardContent></Card>
      </div>}

      <Card>
        <CardHeader><CardTitle className="section-title">Compras por semana</CardTitle>
          <p className="text-sm text-muted-foreground">Clique numa semana para ver as compras. Clique numa compra para ver os itens.</p></CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && weeks.map((w, i) => {
            const v = i > 0 ? pct(w.total, weeks[i - 1].total) : null;
            const isOpen = open === w.key;
            return (
              <div key={w.key} className="rounded-xl border">
                <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50" onClick={() => setOpen(isOpen ? null : w.key)}>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-semibold w-32">{w.label}</span>
                  <span className="text-sm text-muted-foreground w-24">{w.count} {w.count === 1 ? "compra" : "compras"}</span>
                  <span className="font-semibold w-32 text-right">{fmt(w.total)}</span>
                  <span className={`text-sm w-28 text-right ${v == null ? "text-muted-foreground" : v > 0 ? "text-destructive" : "text-success"}`}>{v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}% vs anterior`}</span>
                  <span className="text-sm text-muted-foreground ml-auto">Pago a fornecedor: {fmt(w.pays)}</span>
                </button>
                {isOpen && (
                  <div className="p-3 border-t space-y-4">
                    {Object.keys(w.cats).length > 0 && <div className="flex flex-wrap gap-2">
                      {Object.entries(w.cats).sort((a, b) => b[1] - a[1]).map(([c, t]) => <span key={c} className="text-xs rounded-full bg-secondary px-3 py-1">{catLabel(c)}: <b>{fmt(t)}</b></span>)}
                    </div>}
                    {w.list.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma compra nesta semana.</p> : (
                      <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Fornecedor</TableHead><TableHead>Origem</TableHead><TableHead>Itens</TableHead><TableHead>Pagamento</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                        <TableBody>{w.list.map((p) => (
                          <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetail(p)}>
                            <TableCell>{format(new Date(p.purchase_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                            <TableCell>{p.supplier || "—"}</TableCell><TableCell>{SOURCE[p.source] || p.source}</TableCell>
                            <TableCell>{p.purchase_items.length}</TableCell><TableCell>{statusBadge(p)}</TableCell><TableCell className="text-right font-medium">{fmt(totalOf(p))}</TableCell>
                          </TableRow>))}</TableBody></Table>)}
                  </div>)}
              </div>);
          })}
        </CardContent>
      </Card>

      <SupplierPaymentDialog open={newPay} onOpenChange={setNewPay} onDone={() => setReload((r) => r + 1)} />
      <SupplierPaymentDialog open={!!linkPay} onOpenChange={(o) => !o && setLinkPay(null)} existing={linkPay} onDone={() => setReload((r) => r + 1)} />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{detail?.supplier || "Compra"} — {detail && format(new Date(detail.purchase_date + "T12:00:00"), "dd/MM/yyyy")}</DialogTitle></DialogHeader>
          {detail && <div className="max-h-[60vh] overflow-auto"><Table>
            <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Descrição na nota</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Custo un.</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>{detail.purchase_items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.products?.name || <span className="text-muted-foreground">Sem produto ligado</span>}{i.production_only && <Badge variant="secondary" className="ml-2">Só produção</Badge>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{i.original_description}</TableCell>
                <TableCell className="text-right">{Number(i.quantity).toLocaleString("pt-BR")} {i.unit}</TableCell>
                <TableCell className="text-right">{fmt(Number(i.quantity) ? Number(i.total_value) / Number(i.quantity) : 0)}</TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(i.total_value))}</TableCell>
              </TableRow>))}</TableBody></Table>
            <p className="text-right font-semibold mt-3">Total: {fmt(totalOf(detail))}</p></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold whitespace-nowrap">{value}</p></CardContent></Card>;
}
