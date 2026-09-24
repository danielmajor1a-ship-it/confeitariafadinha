import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileUp, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";

const NEW_PRODUCT = "__new__";
type Source = "nf_xml" | "nf_foto" | "nf_pdf" | "cupom_foto" | "manual";

interface Line {
  key: string;
  description: string;
  quantity: number;
  unit: string;
  total: number;
  targetId: string;
  fromHistory: boolean;
}

export function normalize(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function score(a: string, b: string) {
  const ta = normalize(a).split(" ").filter(t => t.length > 2);
  const tb = normalize(b).split(" ").filter(t => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  const hits = ta.filter(t => tb.some(u => u.includes(t) || t.includes(u))).length;
  return hits / Math.max(ta.length, tb.length);
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function readAs(file: File, mode: "text" | "dataurl") {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    mode === "text" ? r.readAsText(file, "UTF-8") : r.readAsDataURL(file);
  });
}

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML inválido");
  const supplier = doc.querySelector("emit > xNome")?.textContent?.trim() || "";
  const dets = Array.from(doc.getElementsByTagName("det"));
  if (!dets.length) throw new Error("Nenhum item encontrado na nota");
  const items = dets.map(det => {
    const get = (t: string) => det.getElementsByTagName(t)[0]?.textContent?.trim() || "";
    return {
      description: get("xProd"),
      quantity: parseFloat(get("qCom")) || 0,
      unit: get("uCom"),
      total: parseFloat(get("vProd")) || 0,
    };
  });
  return { supplier, items };
}

export default function PurchaseEntry() {
  const { products, refresh } = useApp();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("nf_xml");
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  // Manual purchase
  const [manualOpen, setManualOpen] = useState(false);
  const [mProduct, setMProduct] = useState("");
  const [mQty, setMQty] = useState("");
  const [mTotal, setMTotal] = useState("");

  async function suggest(items: { description: string; quantity: number; unit: string; total: number }[]) {
    // Past matches: confirmed purchase lines with same description
    const { data: hist } = await supabase.from("purchase_items").select("original_description, product_id").not("product_id", "is", null);
    const histMap = new Map<string, string>();
    (hist || []).forEach(h => { if (h.product_id) histMap.set(normalize(h.original_description), h.product_id); });

    return items.map((it, i): Line => {
      const past = histMap.get(normalize(it.description));
      if (past && products.some(p => p.id === past)) {
        return { key: `${i}`, ...it, targetId: past, fromHistory: true };
      }
      let bestId = NEW_PRODUCT, best = 0;
      for (const p of products) {
        const s = score(it.description, p.name);
        if (s > best) { best = s; bestId = p.id; }
      }
      return { key: `${i}`, ...it, targetId: best >= 0.5 ? bestId : NEW_PRODUCT, fromHistory: false };
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true);
    try {
      let result: { supplier: string; items: any[] };
      let src: Source;
      if (file.name.toLowerCase().endsWith(".xml") || file.type.includes("xml")) {
        result = parseXml(await readAs(file, "text"));
        src = "nf_xml";
      } else {
        if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo muito grande (máx. 10 MB)");
        const isPdf = file.type === "application/pdf";
        const { data, error } = await supabase.functions.invoke("parse-purchase-document", {
          body: { fileBase64: await readAs(file, "dataurl"), mimeType: file.type },
        });
        if (error || data?.error) throw new Error(data?.error || "Não foi possível ler a nota");
        result = data;
        src = isPdf ? "nf_pdf" : "nf_foto";
      }
      const items = (result.items || []).filter(i => i.description && i.quantity > 0);
      if (!items.length) throw new Error("Nenhum item encontrado");
      setLines(await suggest(items));
      setSupplier(result.supplier || "");
      setSource(src);
      setOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Não foi possível ler a nota");
    } finally {
      setReading(false);
    }
  }

  function update(idx: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function savePurchase(src: Source, sup: string, rows: Line[]) {
    if (!user) return false;
    // 1. Create new items in one step
    const resolved: { line: Line; productId: string }[] = [];
    for (const l of rows) {
      if (l.targetId !== NEW_PRODUCT) { resolved.push({ line: l, productId: l.targetId }); continue; }
      const { data, error } = await supabase.from("products").insert({
        user_id: user.id, name: l.description, description: "", brand: "", category: "outro",
        purchase_price: 0, sale_price: 0, stock: 0, low_stock_threshold: 5,
        needs_review: true, sells: false, used_in_recipes: true, purchase_unit: l.unit || "un",
      }).select("id").single();
      if (error) { toast.error(error.message); return false; }
      resolved.push({ line: l, productId: data.id });
    }
    // 2. Draft purchase
    const total = rows.reduce((s, l) => s + l.total, 0);
    const { data: purchase, error: pErr } = await supabase.from("purchases").insert({
      user_id: user.id, supplier: sup, source: src, total, status: "rascunho",
    }).select("id").single();
    if (pErr) { toast.error(pErr.message); return false; }
    const { error: iErr } = await supabase.from("purchase_items").insert(resolved.map(r => ({
      purchase_id: purchase.id, product_id: r.productId, original_description: r.line.description,
      quantity: r.line.quantity, unit: r.line.unit, total_value: r.line.total,
    })));
    if (iErr) { toast.error(iErr.message); return false; }
    // 3. Confirm (stock + average cost, atomic)
    const { data: res, error: cErr } = await supabase.rpc("confirm_purchase", { _purchase_id: purchase.id });
    if (cErr) { toast.error(cErr.message); return false; }
    const r = res as { items: number; alerts: number };
    toast.success(`Compra registrada: ${r.items} item(ns) no estoque`);
    if (r.alerts > 0) toast.warning(`${r.alerts} item(ns) mudaram de custo mais de 5%`);
    await refresh();
    return true;
  }

  async function confirm() {
    if (lines.some(l => l.quantity <= 0)) { toast.error("Quantidade deve ser maior que zero"); return; }
    setSaving(true);
    try {
      if (await savePurchase(source, supplier, lines)) { setOpen(false); setLines([]); }
    } finally { setSaving(false); }
  }

  async function confirmManual() {
    const qty = parseFloat(mQty.replace(",", "."));
    const total = parseFloat(mTotal.replace(",", "."));
    const prod = products.find(p => p.id === mProduct);
    if (!prod || !(qty > 0) || !(total >= 0)) { toast.error("Preencha item, quantidade e valor total"); return; }
    setSaving(true);
    try {
      const ok = await savePurchase("manual", "", [{
        key: "m", description: prod.name, quantity: qty, unit: prod.purchase_unit || "", total, targetId: prod.id, fromHistory: false,
      }]);
      if (ok) { setManualOpen(false); setMProduct(""); setMQty(""); setMTotal(""); }
    } finally { setSaving(false); }
  }

  const sourceLabel: Record<Source, string> = {
    nf_xml: "XML da nota", nf_pdf: "PDF da nota", nf_foto: "Foto da nota/cupom", cupom_foto: "Foto do cupom", manual: "Sem nota",
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".xml,text/xml,application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-[44px]" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileUp className="h-4 w-4 mr-1" />}
          {reading ? "Lendo nota..." : "Enviar nota"}
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={() => setManualOpen(true)}>
          <PencilLine className="h-4 w-4 mr-1" /> Compra sem nota
        </Button>
      </div>

      <Dialog open={open} onOpenChange={o => { if (!saving) { setOpen(o); if (!o) setLines([]); } }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Conferir compra</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <Label>Fornecedor</Label>
              <Input value={supplier} onChange={e => setSupplier(e.target.value)} />
            </div>
            <Badge variant="secondary">{sourceLabel[source]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Confira quantidade, valor e o item de cada linha. Nada é salvo até você confirmar. Ao confirmar, o estoque aumenta e o custo médio é recalculado.
          </p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Item da nota</TableHead>
              <TableHead className="w-24">Qtd</TableHead>
              <TableHead className="w-28">Valor total</TableHead>
              <TableHead>Custo un.</TableHead>
              <TableHead>Item cadastrado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lines.map((l, idx) => {
                const prod = products.find(p => p.id === l.targetId);
                const unit = l.quantity > 0 ? l.total / l.quantity : 0;
                return (
                  <TableRow key={l.key}>
                    <TableCell className="max-w-[220px]">
                      <p className="font-medium text-sm">{l.description}</p>
                      {l.unit && <p className="text-xs text-muted-foreground">{l.unit}</p>}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step="any" value={l.quantity}
                        onChange={e => update(idx, { quantity: parseFloat(e.target.value) || 0 })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step="0.01" value={l.total}
                        onChange={e => update(idx, { total: parseFloat(e.target.value) || 0 })} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <p className="font-semibold">{fmt(unit)}</p>
                      {prod && <p className="text-xs text-muted-foreground">atual {fmt(prod.purchase_price)}</p>}
                    </TableCell>
                    <TableCell>
                      <Select value={l.targetId} onValueChange={v => update(idx, { targetId: v, fromHistory: false })}>
                        <SelectTrigger className="min-w-[220px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEW_PRODUCT}>+ Criar item novo com este nome</SelectItem>
                          {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {l.targetId === NEW_PRODUCT && <Badge variant="secondary" className="mt-1">Item novo</Badge>}
                      {l.fromHistory && <Badge variant="outline" className="mt-1">Já usado antes</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex justify-between items-center pt-2">
            <p className="text-sm">Total: <strong>{fmt(lines.reduce((s, l) => s + l.total, 0))}</strong></p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={confirm} disabled={saving || !lines.length}>
                {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : "Confirmar compra"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={o => !saving && setManualOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Compra sem nota</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Item</Label>
              <Select value={mProduct} onValueChange={setMProduct}>
                <SelectTrigger><SelectValue placeholder="Escolha o item" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.purchase_unit ? ` (${p.purchase_unit})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade</Label>
                <Input inputMode="decimal" value={mQty} onChange={e => setMQty(e.target.value)} placeholder="Ex: 2" />
              </div>
              <div>
                <Label>Valor total (R$)</Label>
                <Input inputMode="decimal" value={mTotal} onChange={e => setMTotal(e.target.value)} placeholder="Ex: 36,00" />
              </div>
            </div>
            <Button className="w-full" onClick={confirmManual} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar compra"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
