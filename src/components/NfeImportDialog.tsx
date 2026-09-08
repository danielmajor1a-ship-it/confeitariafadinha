import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";

const NEW_PRODUCT = "__new__";

interface NfeItem {
  key: string;
  description: string;
  brand: string;
  unitPrice: number;
  targetId: string; // product id or NEW_PRODUCT
}

function normalize(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(a: string, b: string) {
  const ta = normalize(a).split(" ").filter(t => t.length > 2);
  const tb = normalize(b).split(" ").filter(t => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  const hits = ta.filter(t => tb.some(u => u.includes(t) || t.includes(u))).length;
  return hits / Math.max(ta.length, tb.length);
}

export default function NfeImportDialog() {
  const { products, refresh } = useApp();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NfeItem[]>([]);
  const [saving, setSaving] = useState(false);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = new DOMParser().parseFromString(String(reader.result), "text/xml");
        if (doc.querySelector("parsererror")) throw new Error("XML inválido");
        const emit = doc.querySelector("emit > xNome")?.textContent?.trim() || "";
        const dets = Array.from(doc.getElementsByTagName("det"));
        if (!dets.length) throw new Error("Nenhum item encontrado na nota");

        const parsed: NfeItem[] = dets.map((det, i) => {
          const get = (tag: string) => det.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
          const description = get("xProd");
          const qty = parseFloat(get("qCom")) || 0;
          const vUn = parseFloat(get("vUnCom"));
          const vProd = parseFloat(get("vProd")) || 0;
          const unitPrice = Number.isFinite(vUn) && vUn > 0 ? vUn : qty > 0 ? vProd / qty : vProd;
          const brand = get("xPed") || emit;

          let bestId = NEW_PRODUCT;
          let best = 0;
          for (const p of products) {
            let s = score(description, p.name);
            if (brand && p.brand && normalize(brand) === normalize(p.brand)) s += 0.15;
            if (s > best) { best = s; bestId = p.id; }
          }
          return {
            key: `${i}-${description}`,
            description,
            brand,
            unitPrice: Math.round(unitPrice * 100) / 100,
            targetId: best >= 0.5 ? bestId : NEW_PRODUCT,
          };
        });
        setItems(parsed);
        setOpen(true);
      } catch (err: any) {
        toast.error(err.message || "Não foi possível ler o arquivo XML");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  async function confirm() {
    if (!user) return;
    setSaving(true);
    try {
      let updated = 0;
      let created = 0;
      for (const it of items) {
        if (it.targetId === NEW_PRODUCT) {
          const { data, error } = await supabase.from("products").insert({
            user_id: user.id,
            name: it.description,
            description: "",
            brand: it.brand || "",
            category: "outro",
            purchase_price: it.unitPrice,
            sale_price: 0,
            stock: 0,
            low_stock_threshold: 5,
            needs_review: true,
          } as any).select("id").single();
          if (error) { toast.error(error.message); continue; }
          await supabase.from("price_history").insert({ product_id: data.id, purchase_price: it.unitPrice, sale_price: 0 });
          created++;
        } else {
          const prod = products.find(p => p.id === it.targetId);
          if (!prod) continue;
          const { error } = await supabase.from("products").update({ purchase_price: it.unitPrice }).eq("id", it.targetId);
          if (error) { toast.error(error.message); continue; }
          await supabase.from("price_history").insert({ product_id: it.targetId, purchase_price: it.unitPrice, sale_price: prod.sale_price });
          updated++;
        }
      }
      await refresh();
      toast.success(`${updated} custo(s) atualizado(s), ${created} produto(s) novo(s) criado(s)`);
      setOpen(false);
      setItems([]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={handleFile} />
      <Button variant="outline" className="min-h-[44px]" onClick={() => fileRef.current?.click()}>
        <FileUp className="h-4 w-4 mr-1" /> Importar NFe (XML)
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!saving) { setOpen(o); if (!o) setItems([]); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Revisão da Nota Fiscal</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confira a associação de cada item. Nada é salvo até você confirmar. Apenas o custo de compra é alterado.
          </p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Item da nota</TableHead>
              <TableHead>Produto do sistema</TableHead>
              <TableHead>Custo atual</TableHead>
              <TableHead>Novo custo</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {items.map((it, idx) => {
                const prod = products.find(p => p.id === it.targetId);
                return (
                  <TableRow key={it.key}>
                    <TableCell className="max-w-[220px]">
                      <p className="font-medium text-sm">{it.description}</p>
                      {it.brand && <p className="text-xs text-muted-foreground">{it.brand}</p>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={it.targetId}
                        onValueChange={v => setItems(prev => prev.map((p, i) => i === idx ? { ...p, targetId: v } : p))}
                      >
                        <SelectTrigger className="min-w-[200px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEW_PRODUCT}>Produto não encontrado — cadastrar novo</SelectItem>
                          {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {it.targetId === NEW_PRODUCT && (
                        <Badge variant="secondary" className="mt-1">Novo produto</Badge>
                      )}
                    </TableCell>
                    <TableCell>{prod ? fmt(prod.purchase_price) : "—"}</TableCell>
                    <TableCell className="font-semibold">{fmt(it.unitPrice)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirm} disabled={saving || items.length === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : "Confirmar e atualizar custos"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
