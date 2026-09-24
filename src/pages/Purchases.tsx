import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import PurchaseEntry from "@/components/NfeImportDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const SOURCE: Record<string, string> = {
  nf_xml: "Nota (XML)", nf_pdf: "Nota (PDF)", nf_foto: "Nota (foto)", cupom_foto: "Cupom (foto)", manual: "Sem nota",
};
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Row = { id: string; purchase_date: string; created_at: string; supplier: string; source: string; total: number; status: string };

export default function Purchases() {
  const { products } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("purchases").select("id, purchase_date, created_at, supplier, source, total, status").order("created_at", { ascending: false }).limit(200);
    setRows((data as Row[]) || []);
    setLoading(false);
  }, []);

  // Recarrega quando uma compra é confirmada (produtos são atualizados)
  useEffect(() => { load(); }, [load, products]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Compras</h1>
        <PurchaseEntry />
      </div>
      <div>
        <h2 className="section-title mb-3">Histórico de compras</h2>
        <div className="rounded-2xl border bg-card overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Fornecedor</TableHead><TableHead>Origem</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma compra registrada</TableCell></TableRow>}
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{r.supplier || "—"}</TableCell>
                  <TableCell>{SOURCE[r.source] || r.source}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(Number(r.total))}</TableCell>
                  <TableCell><Badge variant={r.status === "confirmada" ? "default" : "secondary"}>{r.status === "confirmada" ? "Confirmada" : "Rascunho"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
