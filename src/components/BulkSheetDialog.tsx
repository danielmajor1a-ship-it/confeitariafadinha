import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

type Mode = "cost" | "price";
type Row = { id: string; name: string; current: number; next: number };

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/R\$|\s/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return isNaN(n) ? null : n;
};
// Normaliza títulos de coluna: o Excel pode gravar espaços invisíveis nos
// cabeçalhos (ex.: ao aplicar formato moeda), o que quebrava a leitura.
const normKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export default function BulkSheetDialog({ mode }: { mode: Mode }) {
  const { products, refresh } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const isCost = mode === "cost";
  const curLabel = isCost ? "Custo atual" : "Preço de venda atual";
  const newLabel = isCost ? "Novo custo" : "Novo preço de venda";

  function download() {
    const data = [...products].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({
      ID: p.id, Produto: p.name, Categoria: p.category, Unidade: p.stock_unit || "UN",
      [curLabel]: Number(isCost ? p.purchase_price : p.sale_price), [newLabel]: "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ hidden: true, wch: 10 }, { wch: 45 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isCost ? "Custos" : "Precos");
    XLSX.writeFile(wb, `${isCost ? "custos" : "precos"}-produtos.xlsx`);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const json = raw.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [normKey(k), v])));
      const labelKey = normKey(newLabel);
      const byId = new Map(products.map(p => [p.id, p]));
      const byName = new Map(products.map(p => [p.name.trim().toLowerCase(), p]));
      const out: Row[] = []; let skip = 0;
      for (const r of json) {
        const next = parseNum(r[labelKey]);
        if (next === null) continue;
        const p = byId.get(String(r.id || "")) || byName.get(String(r.produto || "").trim().toLowerCase());
        if (!p || next < 0) { skip++; continue; }
        const current = Number(isCost ? p.purchase_price : p.sale_price);
        if (current === next) continue;
        out.push({ id: p.id, name: p.name, current, next });
      }
      setSkipped(skip); setReason(""); setRows(out);
      if (out.length === 0) toast.info(`Nenhuma alteração encontrada na coluna "${newLabel}".`);
    } catch {
      toast.error("Não consegui ler a planilha. Use o arquivo baixado pelo botão.");
    }
  }

  async function confirm() {
    if (!rows?.length) return;
    if (isCost && rows.some(r => r.current > 0) && !reason.trim()) { toast.error("Informe o motivo do ajuste."); return; }
    setSaving(true);
    const { data, error } = isCost
      ? await supabase.rpc("bulk_update_costs" as any, { _items: rows.map(r => ({ product_id: r.id, new_cost: r.next })), _reason: reason.trim() || "Custo inicial via planilha" })
      : await supabase.rpc("bulk_update_prices" as any, { _items: rows.map(r => ({ product_id: r.id, new_price: r.next })) });
    setSaving(false);
    if (error) { toast.error(error.message || "Nada foi salvo."); return; }
    const d = data as any;
    toast.success(isCost ? `${d.initial} custos iniciais e ${d.adjusted} ajustes manuais salvos.` : `${d.updated} preços atualizados.`);
    setRows(null);
    await refresh();
  }

  const hasAdjust = isCost && rows?.some(r => r.current > 0);

  return (
    <>
      <Button variant="outline" onClick={download}><Download className="h-4 w-4 mr-1" /> Baixar planilha</Button>
      <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Subir planilha</Button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
      <Dialog open={!!rows && rows.length > 0} onOpenChange={o => !o && setRows(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Conferir {isCost ? "custos" : "preços"} da planilha</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {rows?.length} produto(s) com alteração. Nada é salvo até você confirmar.
            {skipped > 0 && ` ${skipped} linha(s) ignorada(s) (produto não encontrado ou valor inválido).`}
          </p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Produto</TableHead><TableHead className="text-right">Atual</TableHead>
              <TableHead className="text-right">Novo</TableHead><TableHead className="text-right">Variação</TableHead>
              {isCost && <TableHead>Tipo</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {rows?.map(r => {
                const pct = r.current > 0 ? ((r.next - r.current) / r.current) * 100 : null;
                const big = pct !== null && Math.abs(pct) > 5;
                return (
                  <TableRow key={r.id} className={big ? "bg-destructive/10" : ""}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt(r.current)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.next)}</TableCell>
                    <TableCell className={`text-right ${big ? "text-destructive font-semibold" : ""}`}>{pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}</TableCell>
                    {isCost && <TableCell>{r.current > 0 ? <Badge variant="destructive">Ajuste manual</Badge> : <Badge variant="secondary">Custo inicial</Badge>}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {hasAdjust && (
            <div className="space-y-1">
              <Label>Motivo do ajuste manual (obrigatório)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: compra na feira sem nota" />
              <p className="text-xs text-muted-foreground">Produtos que já têm custo vindo de compras ficam marcados como ajuste manual no histórico.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRows(null)}>Cancelar</Button>
            <Button onClick={confirm} disabled={saving}>{saving ? "Salvando..." : "Confirmar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
