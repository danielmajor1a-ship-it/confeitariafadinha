import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, Upload, AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";

type Session = {
  id: string; user_id: string; status: string; type: string; category_filter: string | null;
  draft_counts: Record<string, number>; started_at: string; closed_at: string | null;
  items_adjusted: number; total_divergence_value: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function Inventory() {
  const { products, stockMovements, refresh } = useApp();
  const { user } = useAuth();
  const [open, setOpen] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [type, setType] = useState<"total" | "parcial">("total");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ s: Session; items: any[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number>();

  const categories = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("inventory_sessions").select("*").order("started_at", { ascending: false });
    const list = (data || []) as unknown as Session[];
    const cur = list.find(s => s.status === "em_andamento") || null;
    setOpen(cur);
    setHistory(list.filter(s => s.status === "fechado"));
    if (cur) setCounts(Object.fromEntries(Object.entries(cur.draft_counts || {}).map(([k, v]) => [k, String(v)])));
    const ids = [...new Set(list.map(s => s.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
      setNames(Object.fromEntries((profs || []).map(p => [p.user_id, p.display_name])));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const scope = useMemo(() => {
    const base = open ? (open.type === "parcial" ? products.filter(p => p.category === open.category_filter) : products) : products;
    return base;
  }, [open, products]);
  const visible = scope.filter(p => !search || norm(p.name).includes(norm(search)));

  // Produtos com movimentação depois do início da sessão
  const changed = useMemo(() => {
    if (!open) return new Set<string>();
    const t = new Date(open.started_at).getTime();
    return new Set(stockMovements.filter(m => new Date(m.created_at).getTime() > t).map(m => m.product_id));
  }, [open, stockMovements]);

  function setCount(id: string, v: string) {
    const next = { ...counts, [id]: v };
    setCounts(next);
    if (!open) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const draft = Object.fromEntries(Object.entries(next).filter(([, x]) => x !== "" && !isNaN(Number(x))).map(([k, x]) => [k, Number(x)]));
      supabase.from("inventory_sessions").update({ draft_counts: draft }).eq("id", open.id).then(({ error }) => { if (error) toast.error("Não foi possível salvar o rascunho da contagem"); });
    }, 600);
  }

  async function start() {
    if (!user) return;
    if (type === "parcial" && !category) { toast.error("Escolha a categoria"); return; }
    setBusy(true);
    const { error } = await supabase.from("inventory_sessions").insert({ user_id: user.id, type, category_filter: type === "parcial" ? category : null });
    setBusy(false);
    if (error) { toast.error(error.message.includes("inventory_one_open") ? "Já existe um inventário em andamento" : error.message); return; }
    setCounts({});
    toast.success("Inventário iniciado");
    load();
  }

  const lines = scope
    .filter(p => counts[p.id] !== undefined && counts[p.id] !== "" && !isNaN(Number(counts[p.id])))
    .map(p => { const c = Math.round(Number(counts[p.id])); return { p, counted: c, diff: c - p.stock, value: (c - p.stock) * Number(p.purchase_price || 0) }; });
  const totalValue = lines.reduce((s, l) => s + l.value, 0);
  const conflicts = lines.filter(l => changed.has(l.p.id));

  async function confirm() {
    if (!open) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("close_inventory", { _session_id: open.id, _counts: lines.map(l => ({ product_id: l.p.id, counted: l.counted })) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { adjusted: number; value: number };
    toast.success(`Inventário fechado: ${r.adjusted} produto(s) ajustado(s)`);
    setReview(false); setCounts({});
    await Promise.all([load(), refresh()]);
  }

  async function importFile(f: File) {
    const text = await f.text();
    const rows = text.split(/\r?\n/).map(r => r.split(/[;,\t]/).map(c => c.replace(/^"|"$/g, "").trim())).filter(r => r.length >= 2 && r[0]);
    const next = { ...counts }; let ok = 0; const miss: string[] = [];
    for (const [name, qty] of rows) {
      const q = Number(qty.replace(",", "."));
      if (isNaN(q)) continue; // cabeçalho
      const p = scope.find(x => norm(x.name) === norm(name));
      if (p) { next[p.id] = String(q); ok++; } else miss.push(name);
    }
    Object.entries(next).forEach(([k, v]) => setCount(k, v));
    setCounts(next);
    toast.success(`${ok} produto(s) preenchido(s)`);
    if (miss.length) toast.warning(`Não encontrados: ${miss.slice(0, 5).join(", ")}${miss.length > 5 ? "…" : ""}`);
  }

  async function openDetail(s: Session) {
    const { data } = await supabase.from("inventory_items").select("*").eq("session_id", s.id);
    setDetail({ s, items: data || [] });
  }
  const pname = (id: string) => products.find(p => p.id === id)?.name || "Produto removido";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Inventário</h1>
      </div>

      {!open ? (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <h2 className="section-title">Iniciar contagem</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48"><Label>Tipo</Label>
              <Select value={type} onValueChange={v => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="total">Total (todos)</SelectItem><SelectItem value="parcial">Parcial (categoria)</SelectItem></SelectContent>
              </Select>
            </div>
            {type === "parcial" && (
              <div className="w-56"><Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={start} disabled={busy} className="min-h-[44px]"><ClipboardCheck className="h-4 w-4 mr-1" /> Iniciar inventário</Button>
          </div>
          <p className="text-xs text-muted-foreground">A contagem fica salva enquanto estiver aberta. Ao fechar, o estoque passa a ser o valor contado e o custo não muda.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Contagem em andamento</h2>
              <p className="text-sm text-muted-foreground">
                {open.type === "total" ? "Total" : `Parcial: ${open.category_filter}`} · iniciada em {new Date(open.started_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Buscar produto" value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Importar CSV</Button>
              <Button onClick={() => lines.length ? setReview(true) : toast.error("Preencha ao menos uma quantidade")}>Conferir e fechar ({lines.length})</Button>
            </div>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Sistema</TableHead>
                <TableHead className="text-right">Custo médio</TableHead><TableHead className="w-32">Contado</TableHead><TableHead className="text-right">Diferença</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visible.map(p => {
                  const v = counts[p.id] ?? ""; const has = v !== "" && !isNaN(Number(v));
                  const d = has ? Math.round(Number(v)) - p.stock : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}{changed.has(p.id) && <Badge variant="outline" className="ml-2 text-warning border-warning">mexeu depois do início</Badge>}</TableCell>
                      <TableCell className="text-muted-foreground">{p.category}</TableCell>
                      <TableCell className="text-right">{p.stock}</TableCell>
                      <TableCell className="text-right">{brl(Number(p.purchase_price || 0))}</TableCell>
                      <TableCell><Input type="number" min={0} value={v} onChange={e => setCount(p.id, e.target.value)} className="h-9" /></TableCell>
                      <TableCell className={`text-right font-semibold ${d < 0 ? "text-destructive" : d > 0 ? "text-success" : ""}`}>{has ? (d > 0 ? `+${d}` : d) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">CSV: uma linha por produto, com nome e quantidade contada (separados por ; ou ,). Produtos sem quantidade preenchida não são alterados.</p>
        </div>
      )}

      <div>
        <h2 className="section-title mb-3 flex items-center gap-2"><History className="h-5 w-5" /> Inventários anteriores</h2>
        <div className="rounded-2xl border bg-card overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Fechado em</TableHead><TableHead>Usuário</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Itens ajustados</TableHead><TableHead className="text-right">Divergência</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {history.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum inventário fechado</TableCell></TableRow>}
              {history.map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.closed_at ? new Date(s.closed_at).toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell>{names[s.user_id] || "—"}</TableCell>
                  <TableCell>{s.type === "total" ? "Total" : `Parcial: ${s.category_filter}`}</TableCell>
                  <TableCell className="text-right">{s.items_adjusted}</TableCell>
                  <TableCell className={`text-right font-semibold ${Number(s.total_divergence_value) < 0 ? "text-destructive" : ""}`}>{brl(Number(s.total_divergence_value))}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => openDetail(s)}>Ver</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Conferir antes de fechar</DialogTitle></DialogHeader>
          {conflicts.length > 0 && (
            <div className="rounded-xl border border-warning bg-warning/10 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <span>{conflicts.length} produto(s) tiveram venda, compra ou ajuste depois do início da contagem: {conflicts.map(c => c.p.name).join(", ")}. Confira se a contagem ainda está certa. O estoque final será o valor contado.</span>
            </div>
          )}
          <div className="max-h-[50vh] overflow-auto rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {lines.map(l => (
                  <TableRow key={l.p.id}>
                    <TableCell>{l.p.name}</TableCell><TableCell className="text-right">{l.p.stock}</TableCell><TableCell className="text-right">{l.counted}</TableCell>
                    <TableCell className={`text-right font-semibold ${l.diff < 0 ? "text-destructive" : l.diff > 0 ? "text-success" : ""}`}>{l.diff > 0 ? `+${l.diff}` : l.diff}</TableCell>
                    <TableCell className="text-right">{brl(l.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Divergência total: <span className={totalValue < 0 ? "text-destructive" : ""}>{brl(totalValue)}</span></span>
            <Button onClick={confirm} disabled={busy}>{busy ? "Fechando..." : "Confirmar e fechar inventário"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Depois de fechado, o inventário não pode ser reaberto. Correções exigem uma nova contagem.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Inventário de {detail?.s.closed_at && new Date(detail.s.closed_at).toLocaleDateString("pt-BR")}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {detail?.items.map(i => (
                  <TableRow key={i.id}>
                    <TableCell>{pname(i.product_id)}</TableCell><TableCell className="text-right">{Number(i.theoretical_qty)}</TableCell><TableCell className="text-right">{Number(i.counted_qty)}</TableCell>
                    <TableCell className={`text-right ${Number(i.difference) < 0 ? "text-destructive" : ""}`}>{Number(i.difference)}</TableCell>
                    <TableCell className="text-right">{brl(Number(i.difference) * Number(i.unit_cost))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
