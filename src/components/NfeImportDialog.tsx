import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileUp, Loader2, PencilLine, Camera, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";

const NEW_PRODUCT = "__new__";
type Source = "nf_xml" | "nf_foto" | "nf_pdf" | "cupom_foto" | "cupom_fiscal" | "manual";

interface Line {
  key: string;
  description: string;
  quantity: number;
  unit: string;
  total: number;
  targetId: string;
  fromHistory: boolean;
  xmlQty?: number;
  xmlUnit?: string;
  tribQty?: number;
  tribUnit?: string;
  stockUnit?: string;
  factor?: string;
  buyUnits?: { unit: string; factor: number }[];
  buyChoice?: string;
  newBuyUnit?: { unit: string; factor: number };
}

const U = (u?: string) => (u || "").trim().toUpperCase();

// Conversão da unidade do XML para a unidade de estoque do produto
function convert(l: Line) {
  const bu = l.buyChoice ? l.buyUnits?.find(b => b.unit === l.buyChoice) : undefined;
  if (bu && bu.factor > 0) {
    const base = l.xmlQty ?? l.quantity;
    return { qty: base * bu.factor, blocked: false, note: `${base} ${bu.unit} × ${bu.factor} → ${base * bu.factor} no estoque` };
  }
  if (l.xmlQty === undefined) return { qty: l.quantity, blocked: false, note: "" };
  const su = U(l.stockUnit), xu = U(l.xmlUnit);
  if (!su || su === xu) return { qty: l.xmlQty, blocked: false, note: "" };
  if (U(l.tribUnit) === su && (l.tribQty || 0) > 0) return { qty: l.tribQty!, blocked: false, note: `${l.xmlQty} ${xu} → ${l.tribQty} ${su} (unidade tributável da nota)` };
  const f = parseFloat((l.factor || "").replace(",", "."));
  if (f > 0) return { qty: l.xmlQty * f, blocked: false, note: `${l.xmlQty} ${xu} × ${f} → ${l.xmlQty * f} ${su}` };
  return { qty: 0, blocked: true, note: `Nota em ${xu}, estoque em ${su}: informe quantos ${su} vêm em 1 ${xu}` };
}

export function normalize(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Prepara a descrição: entende "C/GAS", "S/ GAS", "COM GÁS", volumes ("500ML", "1,5L") etc.
function features(s: string) {
  let t = (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/\b(c\s*\/\s*|com\s+)gas\b/g, " comgas ").replace(/\b(s\s*\/\s*|sem\s+)gas\b/g, " semgas ");
  t = t.replace(/\bgaseificada\b/g, " comgas ");
  const sizes: number[] = [];
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(ml|l|lt|lts|litros?|g|gr|kg)\b/g, (_m, n, u) => {
    const v = parseFloat(n.replace(",", "."));
    sizes.push(/^(l|lt|lts|litro|litros|kg)$/.test(u) ? v * 1000 : v);
    return " ";
  });
  const stop = new Set(["com", "sem", "de", "da", "do", "und", "unid", "pct", "cx", "fd", "pc"]);
  const tokens = t.replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter(x => x.length > 2 && !stop.has(x) && !/^\d+$/.test(x));
  const gas = tokens.includes("comgas") ? "com" : tokens.includes("semgas") ? "sem" : null;
  return { tokens: tokens.filter(x => x !== "comgas" && x !== "semgas"), gas, sizes };
}

function score(a: string, b: string) {
  const fa = features(a), fb = features(b);
  // Com gás x sem gás: nunca é o mesmo produto
  if (fa.gas && fb.gas && fa.gas !== fb.gas) return 0;
  if (!fa.tokens.length || !fb.tokens.length) return 0;
  const same = (t: string, u: string) => u.includes(t) || t.includes(u) || (t.length >= 3 && u.length >= 3 && (u.startsWith(t) || t.startsWith(u)));
  const hits = fa.tokens.filter(t => fb.tokens.some(u => same(t, u))).length;
  let s = hits / Math.max(fa.tokens.length, fb.tokens.length);
  if (fa.gas && fa.gas === fb.gas) s += 0.25;
  if (fa.sizes.length && fb.sizes.length) {
    const close = fa.sizes.some(x => fb.sizes.some(y => Math.abs(x - y) / Math.max(x, y) <= 0.05));
    s += close ? 0.25 : -0.3;
  }
  return s;
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
      xmlQty: parseFloat(get("qCom")) || 0,
      xmlUnit: get("uCom"),
      tribQty: parseFloat(get("qTrib")) || 0,
      tribUnit: get("uTrib"),
    };
  });
  return { supplier, items };
}

export default function PurchaseEntry() {
  const { products, refresh } = useApp();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const cupomRef = useRef<HTMLInputElement>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [docTotal, setDocTotal] = useState<number | null>(null);
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
  const [mUnit, setMUnit] = useState("");

  // Detecta embalagem escrita na nota: "CX/12", "PC/12", "PCT/15" ou "C/12" na descrição
  function detectPack(unitRaw: string, desc: string): { unit: string; factor: number } | null {
    const u = U(unitRaw);
    const m = u.match(/^([A-Z]+)\s*\/\s*(\d+)$/);
    if (m && Number(m[2]) > 1) return { unit: m[1], factor: Number(m[2]) };
    const d = (desc || "").toUpperCase().match(/\b(?:C|CX|COM)\s*\/\s*(\d+)\b/);
    if (d && Number(d[1]) > 1) {
      const base = u.replace(/\s*\/.*$/, "");
      return { unit: base && base !== "UN" ? base : "CX", factor: Number(d[1]) };
    }
    return null;
  }

  function withUnits(l: Line): Line {
    const p: any = products.find(x => x.id === l.targetId);
    const pf = p?.purchase_factor ? String(p.purchase_factor) : "";
    let buyUnits: { unit: string; factor: number }[] = (p?.buy_units || []).filter((b: any) => b.unit && b.factor > 0);
    const rawUnit = l.xmlQty !== undefined ? (l.xmlUnit || "") : l.unit;
    const lu = U(rawUnit).replace(/\s*\/.*$/, "");
    let match = lu && lu !== U(p?.stock_unit || "UN")
      ? buyUnits.find(b => U(b.unit) === lu || U(b.unit).startsWith(lu) || lu.startsWith(U(b.unit).slice(0, 2))) : undefined;
    let newBuyUnit: { unit: string; factor: number } | undefined;
    if (!match) {
      const pack = detectPack(rawUnit, l.description);
      if (pack) {
        const same = buyUnits.find(b => U(b.unit) === pack.unit && b.factor === pack.factor);
        if (same) match = same;
        else {
          const name = buyUnits.some(b => U(b.unit) === pack.unit) ? `${pack.unit} ${pack.factor}` : pack.unit;
          newBuyUnit = { unit: name, factor: pack.factor };
          buyUnits = [...buyUnits, newBuyUnit];
          match = newBuyUnit;
        }
      }
    }
    const buyChoice = match?.unit || "";
    if (l.xmlQty === undefined) return { ...l, buyUnits, buyChoice, newBuyUnit };
    return { ...l, stockUnit: p?.stock_unit || "", factor: pf, buyUnits, buyChoice, newBuyUnit };
  }

  async function suggest(items: { description: string; quantity: number; unit: string; total: number }[]) {
    // Past matches: confirmed purchase lines with same description
    const { data: hist } = await supabase.from("purchase_items").select("original_description, product_id").not("product_id", "is", null);
    const histMap = new Map<string, string>();
    (hist || []).forEach(h => { if (h.product_id) histMap.set(normalize(h.original_description), h.product_id); });

    return items.map((it, i): Line => {
      const past = histMap.get(normalize(it.description));
      if (past && products.some(p => p.id === past)) {
        return withUnits({ key: `${i}`, ...it, targetId: past, fromHistory: true });
      }
      let bestId = NEW_PRODUCT, best = 0;
      for (const p of products) {
        const s = score(it.description, p.name);
        if (s > best) { best = s; bestId = p.id; }
      }
      return withUnits({ key: `${i}`, ...it, targetId: best >= 0.5 ? bestId : NEW_PRODUCT, fromHistory: false });
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

  async function handleCupom(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Foto muito grande (máx. 10 MB)"); return; }
    setReading(true);
    let items: any[] = []; let sup = ""; let date = ""; let total: number | null = null; let failed = false;
    try {
      const { data, error } = await supabase.functions.invoke("parse-purchase-document", {
        body: { fileBase64: await readAs(file, "dataurl"), mimeType: file.type || "image/jpeg" },
      });
      if (error || data?.error) throw new Error(data?.error || "falha");
      items = (data.items || []).filter((i: any) => i.description && i.quantity > 0);
      sup = data.supplier || ""; date = /^\d{4}-\d{2}-\d{2}$/.test(data.date || "") ? data.date : "";
      total = typeof data.document_total === "number" ? data.document_total : null;
      if (data.legible === false || !items.length) failed = true;
    } catch { failed = true; }
    if (failed) toast.warning("Não consegui ler o cupom com segurança. Preencha os itens manualmente.");
    setLines(failed ? [{ key: "n0", description: "", quantity: 1, unit: "UN", total: 0, targetId: NEW_PRODUCT, fromHistory: false }] : await suggest(items));
    setSupplier(failed ? "" : sup); setPurchaseDate(failed ? "" : date); setDocTotal(failed ? null : total);
    setDocFile(file); setSource("cupom_fiscal"); setOpen(true); setReading(false);
  }

  function addLine() {
    setLines(prev => [...prev, { key: `n${Date.now()}`, description: "", quantity: 1, unit: "UN", total: 0, targetId: NEW_PRODUCT, fromHistory: false }]);
  }

  function update(idx: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function savePurchase(src: Source, sup: string, rows: Line[]) {
    if (!user) return false;
    let docPath: string | null = null;
    if (docFile && src === "cupom_fiscal") {
      const ext = (docFile.name.split(".").pop() || "jpg").toLowerCase();
      docPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("purchase-documents").upload(docPath, docFile, { contentType: docFile.type || "image/jpeg" });
      if (upErr) { toast.error(`Não foi possível guardar a foto do cupom (nada foi salvo): ${upErr.message}`); return false; }
    }
    // Grava unidade de estoque e fator definidos na conferência (XML)
    for (const l of rows) {
      if (l.xmlQty === undefined || l.targetId === NEW_PRODUCT) continue;
      const p: any = products.find(x => x.id === l.targetId);
      const f = parseFloat((l.factor || "").replace(",", "."));
      const su = U(l.stockUnit) || null;
      const pf = f > 0 ? f : null;
      if ((p?.stock_unit || null) !== su || (p?.purchase_factor ?? null) !== pf) {
        const { error: uErr } = await supabase.from("products").update({ stock_unit: su, purchase_factor: pf } as any).eq("id", l.targetId);
        if (uErr) { toast.error(`Não foi possível salvar a unidade de ${l.description} (nada foi salvo): ${uErr.message}`); return false; }
      }
    }
    // Embalagem lida da nota (ex.: CX/12) vira unidade alternativa do produto
    for (const l of rows) {
      const nb = l.newBuyUnit;
      if (!nb || l.targetId === NEW_PRODUCT || l.buyChoice !== nb.unit) continue;
      const p: any = products.find(x => x.id === l.targetId);
      const current = (p?.buy_units || []).filter((b: any) => b.unit && b.factor > 0);
      if (current.some((b: any) => U(b.unit) === U(nb.unit))) continue;
      const { error: bErr } = await supabase.from("products").update({ buy_units: [...current, nb] } as any).eq("id", l.targetId);
      if (bErr) { toast.error(`Não foi possível salvar a embalagem de ${l.description} (nada foi salvo): ${bErr.message}`); return false; }
    }
    // Compra, itens novos, itens da compra, movimento de estoque e custo médio: uma única transação
    const { data: res, error } = await supabase.rpc("register_purchase" as any, {
      _supplier: sup, _source: src,
      _items: rows.map(l => ({
        product_id: l.targetId === NEW_PRODUCT ? null : l.targetId,
        description: l.description, quantity: convert(l).qty, unit: l.buyChoice ? (U(l.stockUnit) || "UN") : l.xmlQty !== undefined ? (U(l.stockUnit) || l.unit || "") : (l.unit || ""), total_value: l.total,
      })),
      ...(src === "cupom_fiscal" ? { _document_url: docPath, _purchase_date: purchaseDate || null } : {}),
    } as any);
    if (error) {
      if (docPath) await supabase.storage.from("purchase-documents").remove([docPath]); toast.error(`Compra não registrada (nada foi salvo): ${error.message}`); return false; }
    const r = res as { items: number; alerts: number };
    toast.success(`Compra registrada: ${r.items} item(ns) no estoque`);
    if (r.alerts > 0) toast.warning(`${r.alerts} item(ns) mudaram de custo mais de 5%`);
    await refresh();
    return true;
  }

  async function confirm() {
    if (lines.some(l => convert(l).blocked)) { toast.error("Defina o fator de conversão dos itens destacados antes de confirmar"); return; }
    if (lines.some(l => convert(l).qty <= 0)) { toast.error("Quantidade deve ser maior que zero"); return; }
    if (lines.some(l => !l.description.trim())) { toast.error("Preencha a descrição de todos os itens"); return; }
    setSaving(true);
    try {
      if (await savePurchase(source, supplier, lines)) { setOpen(false); setLines([]); setDocFile(null); }
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
        key: "m", description: prod.name, quantity: qty, unit: (prod as any).stock_unit || "UN", total, targetId: prod.id, fromHistory: false,
        buyUnits: ((prod as any).buy_units || []), buyChoice: mUnit,
      }]);
      if (ok) { setManualOpen(false); setMProduct(""); setMQty(""); setMTotal(""); }
    } finally { setSaving(false); }
  }

  const sourceLabel: Record<Source, string> = {
    nf_xml: "XML da nota", nf_pdf: "PDF da nota", nf_foto: "Foto da nota/cupom", cupom_foto: "Foto do cupom", cupom_fiscal: "Cupom fiscal (foto)", manual: "Sem nota",
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".xml,text/xml,application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      <input ref={cupomRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCupom} />
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-[44px]" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileUp className="h-4 w-4 mr-1" />}
          {reading ? "Lendo nota..." : "Enviar nota"}
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={() => cupomRef.current?.click()} disabled={reading}>
          <Camera className="h-4 w-4 mr-1" /> Lançar por foto de cupom
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={() => setManualOpen(true)}>
          <PencilLine className="h-4 w-4 mr-1" /> Compra sem nota
        </Button>
      </div>

      <Dialog open={open} onOpenChange={o => { if (!saving) { setOpen(o); if (!o) { setLines([]); setDocFile(null); } } }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Conferir compra</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <Label>Fornecedor</Label>
              <Input value={supplier} onChange={e => setSupplier(e.target.value)} />
            </div>
            {source === "cupom_fiscal" && (
              <div className="w-44"><Label>Data da compra</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
              </div>
            )}
            <Badge variant="secondary">{sourceLabel[source]}</Badge>
            {source === "cupom_fiscal" && docTotal !== null && <Badge variant="outline">Total lido no cupom: {fmt(docTotal)}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Confira quantidade, valor e o item de cada linha. Nada é salvo até você confirmar. Ao confirmar, o estoque aumenta e o custo médio é recalculado.
          </p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Item da nota</TableHead>
              <TableHead className="w-24">{source === "nf_xml" ? "Qtd (nota → estoque)" : "Qtd"}</TableHead>
              <TableHead className="w-28">Valor total</TableHead>
              <TableHead>{source === "cupom_fiscal" ? "Valor un." : "Custo un."}</TableHead>
              <TableHead>Item cadastrado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lines.map((l, idx) => {
                const prod = products.find(p => p.id === l.targetId);
                const cv = convert(l);
                const unit = cv.qty > 0 ? l.total / cv.qty : 0;
                const cur = prod?.purchase_price || 0;
                const projected = prod && cur > 0 && prod.stock > 0
                  ? (prod.stock * cur + cv.qty * unit) / (prod.stock + cv.qty) : unit;
                const pct = cur > 0 ? ((projected - cur) / cur) * 100 : 0;
                const bigChange = Math.abs(pct) > 5;
                return (
                  <TableRow key={l.key} className={bigChange || cv.blocked ? "bg-destructive/10" : undefined}>
                    <TableCell className="max-w-[220px]">
                      {source === "cupom_fiscal"
                        ? <Input value={l.description} placeholder="Descrição do item" onChange={e => update(idx, { description: e.target.value })} />
                        : <p className="font-medium text-sm">{l.description}</p>}
                      {l.unit && <p className="text-xs text-muted-foreground">{l.unit}</p>}
                    </TableCell>
                    <TableCell>
                      {l.xmlQty !== undefined ? (
                        <div className="space-y-1 min-w-[150px]">
                          <p className="text-sm">{l.xmlQty} {U(l.xmlUnit)}</p>
                          {prod && (<>
                            <Input value={l.stockUnit || ""} placeholder="Unid. estoque (ex: UN)" className="h-8 text-xs"
                              onChange={e => update(idx, { stockUnit: e.target.value.toUpperCase() })} />
                            {U(l.stockUnit) && U(l.stockUnit) !== U(l.xmlUnit) && U(l.tribUnit) !== U(l.stockUnit) && (
                              <Input inputMode="decimal" value={l.factor || ""} placeholder={`${U(l.stockUnit)} por ${U(l.xmlUnit)}`} className="h-8 text-xs"
                                onChange={e => update(idx, { factor: e.target.value })} />
                            )}
                          </>)}
                          {!!l.buyUnits?.length && (
                            <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={l.buyChoice || ""} onChange={e => update(idx, { buyChoice: e.target.value })}>
                              <option value="">Unidade do estoque</option>
                              {l.buyUnits.map(b => <option key={b.unit} value={b.unit}>{b.unit} (×{b.factor})</option>)}
                            </select>
                          )}
                          {cv.note && <p className={`text-xs ${cv.blocked ? "text-destructive font-medium" : "text-muted-foreground"}`}>{cv.note}</p>}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Input type="number" min={0} step="any" value={l.quantity}
                            onChange={e => update(idx, { quantity: parseFloat(e.target.value) || 0 })} />
                          {!!l.buyUnits?.length && (
                            <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={l.buyChoice || ""} onChange={e => update(idx, { buyChoice: e.target.value })}>
                              <option value="">Unidade do estoque</option>
                              {l.buyUnits.map(b => <option key={b.unit} value={b.unit}>{b.unit} (×{b.factor})</option>)}
                            </select>
                          )}
                          {cv.note && <p className="text-xs text-muted-foreground">{cv.note}</p>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step="0.01" value={l.total}
                        onChange={e => update(idx, { total: parseFloat(e.target.value) || 0 })} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {source === "cupom_fiscal"
                        ? <Input type="number" min={0} step="0.01" value={Number(unit.toFixed(4))} className="w-28 mb-1"
                            onChange={e => update(idx, { total: Math.round((parseFloat(e.target.value) || 0) * cv.qty * 100) / 100 })} />
                        : <p className="font-semibold">{cv.blocked ? "—" : fmt(unit)}{l.xmlQty !== undefined && !cv.blocked && U(l.stockUnit) ? ` / ${U(l.stockUnit)}` : ""}</p>}
                      {prod && <p className="text-xs text-muted-foreground">atual {cur > 0 ? fmt(cur) : "sem custo"} → novo {fmt(projected)}</p>}
                      {bigChange && <Badge variant="destructive" className="mt-1">{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</Badge>}
                    </TableCell>
                    <TableCell>
                      <Select value={l.targetId} onValueChange={v => setLines(prev => prev.map((x, i) => i === idx ? withUnits({ ...x, targetId: v, fromHistory: false }) : x))}>
                        <SelectTrigger className="min-w-[220px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEW_PRODUCT}>+ Criar item novo com este nome</SelectItem>
                          {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {l.targetId === NEW_PRODUCT && <Badge variant="secondary" className="mt-1">Item novo</Badge>}
                      {l.fromHistory && <Badge variant="outline" className="mt-1">Já usado antes</Badge>}
                      {source === "cupom_fiscal" && lines.length > 1 && (
                        <Button variant="ghost" size="sm" className="mt-1" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex justify-between items-center pt-2">
            <div className="flex items-center gap-3">
            {source === "cupom_fiscal" && <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4 mr-1" /> Adicionar item</Button>}
            <p className="text-sm">Total: <strong>{fmt(lines.reduce((s, l) => s + l.total, 0))}</strong></p>
            </div>
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
              <Select value={mProduct} onValueChange={v => { setMProduct(v); setMUnit(""); }}>
                <SelectTrigger><SelectValue placeholder="Escolha o item" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
            {(() => { const mp: any = products.find(p => p.id === mProduct); return mp?.buy_units?.length ? (
              <div><Label>Unidade da quantidade</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={mUnit} onChange={e => setMUnit(e.target.value)}>
                  <option value="">Unidade do estoque</option>
                  {mp.buy_units.map((b: any) => <option key={b.unit} value={b.unit}>{b.unit} (1 = {b.factor} no estoque)</option>)}
                </select>
              </div>) : null; })()}
            <Button className="w-full" onClick={confirmManual} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar compra"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
