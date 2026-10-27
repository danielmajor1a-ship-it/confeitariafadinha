import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { METHOD_LABELS, norm, sameSupplier, valueMatches } from "@/lib/supplier-payments";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

type OpenNote = { id: string; purchase_date: string; supplier: string; total: number; open: number };

export type ExistingPayment = { id: string; supplier: string; amount: number; allocated: number; paid_at: string };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
  /** Fixes the method to the open cash register. */
  fromCash?: boolean;
  /** Link an already-registered payment instead of creating one. */
  existing?: ExistingPayment | null;
}

export default function SupplierPaymentDialog({ open, onOpenChange, onDone, fromCash, existing }: Props) {
  const [notes, setNotes] = useState<OpenNote[]>([]);
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(fromCash ? "caixa" : "pix_conta");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [obs, setObs] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel({}); setObs(""); setSaving(false);
    setSupplier(existing?.supplier || ""); setAmount(existing ? String(existing.amount - existing.allocated).replace(".", ",") : "");
    setMethod(fromCash ? "caixa" : "pix_conta"); setDate(format(new Date(), "yyyy-MM-dd"));
    (async () => {
      const [p, a] = await Promise.all([
        supabase.from("purchases").select("id, purchase_date, supplier, total").eq("status", "confirmada").order("purchase_date", { ascending: false }).limit(500),
        supabase.from("supplier_payment_allocations").select("purchase_id, amount"),
      ]);
      const paid: Record<string, number> = {};
      (a.data || []).forEach((x: any) => { paid[x.purchase_id] = (paid[x.purchase_id] || 0) + Number(x.amount); });
      setNotes(((p.data || []) as any[]).map((x) => ({ ...x, total: Number(x.total), open: Math.round((Number(x.total) - (paid[x.id] || 0)) * 100) / 100 })).filter((x) => x.open > 0.01));
    })();
  }, [open, existing, fromCash]);

  const suppliers = useMemo(() => [...new Set(notes.map((n) => n.supplier).filter(Boolean))].sort(), [notes]);
  const amt = existing ? existing.amount - existing.allocated : num(amount);
  const list = useMemo(() => {
    const filtered = supplier ? notes.filter((n) => sameSupplier(n.supplier, supplier)) : notes;
    const base = filtered.length || !existing ? filtered : notes;
    return base.map((n) => ({ ...n, match: valueMatches(amt, n.open) }))
      .sort((x, y) => Number(y.match) - Number(x.match) || y.purchase_date.localeCompare(x.purchase_date));
  }, [notes, supplier, amt, existing]);
  const allocated = Object.values(sel).reduce((s, v) => s + num(v), 0);
  const left = Math.round((amt - allocated) * 100) / 100;

  function toggle(n: OpenNote) {
    setSel((prev) => {
      const next = { ...prev };
      if (next[n.id] !== undefined) { delete next[n.id]; return next; }
      const rest = Math.max(0, amt - Object.values(prev).reduce((s, v) => s + num(v), 0));
      next[n.id] = String(Math.min(n.open, rest || n.open).toFixed(2)).replace(".", ",");
      return next;
    });
  }

  async function save() {
    if (saving) return;
    if (!existing && !supplier.trim()) return toast.error("Escolha ou escreva o fornecedor");
    if (amt <= 0) return toast.error("Informe o valor");
    if (left < -0.01) return toast.error("A soma das notas passa do valor do pagamento");
    const allocs = Object.entries(sel).map(([purchase_id, v]) => ({ purchase_id, amount: num(v) })).filter((x) => x.amount > 0);
    if (existing && allocs.length === 0) return toast.error("Escolha pelo menos uma nota");
    setSaving(true);
    const { error } = existing
      ? await supabase.rpc("allocate_supplier_payment" as any, { _payment_id: existing.id, _allocations: allocs })
      : await supabase.rpc("register_supplier_payment" as any, { _supplier: supplier.trim(), _amount: amt, _method: method, _paid_at: method === "caixa" ? new Date().toISOString() : new Date(date + "T12:00:00-03:00").toISOString(), _notes: obs, _allocations: allocs });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Pagamento ligado às notas" : "Pagamento registrado");
    onOpenChange(false); onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{existing ? `Ligar pagamento de ${fmt(existing.amount)} às notas` : "Pagamento a fornecedor"}</DialogTitle></DialogHeader>
        <fieldset disabled={saving} className="space-y-4">
          {existing ? (
            <p className="text-sm text-muted-foreground">Observação do pagamento: <b>{existing.supplier}</b> · {format(new Date(existing.paid_at), "dd/MM/yyyy")}{existing.allocated > 0 && ` · já ligado ${fmt(existing.allocated)}`}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Fornecedor *</Label>
                <Input list="suppliers-list" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Escolha ou escreva" />
                <datalist id="suppliers-list">{suppliers.map((s) => <option key={s} value={s} />)}</datalist></div>
              <div><Label>Valor pago *</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
              {!fromCash && <>
                <div><Label>Como foi pago</Label>
                  <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(METHOD_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
                  {method === "caixa" && <p className="text-xs text-muted-foreground mt-1">Sai do caixa aberto.</p>}</div>
                {method !== "caixa" && <div><Label>Data do pagamento</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
              </>}
              <div className="md:col-span-2"><Label>Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: boleto 1 de 3" /></div>
            </div>
          )}

          <div>
            <div className="flex justify-between items-end mb-2">
              <Label>Quais notas este pagamento quita?</Label>
              <span className={`text-sm ${left < -0.01 ? "text-destructive" : "text-muted-foreground"}`}>Sem nota: {fmt(Math.max(0, left))}</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-xl border divide-y">
              {list.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma nota em aberto{supplier ? " deste fornecedor" : ""}.</p>}
              {list.map((n) => {
                const on = sel[n.id] !== undefined;
                return (
                  <div key={n.id} className={`flex items-center gap-3 p-2 ${n.match ? "bg-secondary/60" : ""}`}>
                    <input type="checkbox" className="h-5 w-5 accent-primary" checked={on} onChange={() => toggle(n)} />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{n.supplier || "—"} · {format(new Date(n.purchase_date + "T12:00:00"), "dd/MM/yyyy")}</div>
                      <div className="text-muted-foreground">Nota {fmt(n.total)} · falta pagar {fmt(n.open)}{n.match && <b className="text-foreground"> · valor bate (sugestão)</b>}</div>
                    </div>
                    {on && <Input className="w-28" value={sel[n.id]} onChange={(e) => setSel((p) => ({ ...p, [n.id]: e.target.value }))} />}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Em destaque: notas com valor igual ou até 2% de diferença. Confira antes de salvar.</p>
          </div>
        </fieldset>
        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
