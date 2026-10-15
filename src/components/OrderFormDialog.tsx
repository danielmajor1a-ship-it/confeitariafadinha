import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { db, isAndroid, type Encomenda, type EncomendaItem } from "@/lib/encomendas";

export interface OrderFormInitial {
  encomenda?: Partial<Encomenda>;
  itens?: EncomendaItem[];
  sinalSugerido?: number;
}

const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OrderFormDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: OrderFormInitial; onSaved?: (id: string) => void;
}) {
  const { products } = useApp();
  const { user } = useAuth();
  const editId = initial?.encomenda?.id;
  const [f, setF] = useState({
    cliente_nome: "", cliente_telefone: "", descricao: "", quantidade: "1", unidade: "", observacoes: "",
    data_entrega: "", hora_entrega: "", tipo: "retirada", valor_total: "",
  });
  const [itens, setItens] = useState<EncomendaItem[]>([]);
  const [sinal, setSinal] = useState("");
  const [sinalMetodo, setSinalMetodo] = useState("dinheiro");
  const [mais, setMais] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addProd, setAddProd] = useState("");

  useEffect(() => {
    if (!open) return;
    const e = initial?.encomenda || {};
    setF({
      cliente_nome: e.cliente_nome || "", cliente_telefone: e.cliente_telefone || "",
      descricao: e.descricao || "", quantidade: String(e.quantidade ?? 1), unidade: e.unidade || "",
      observacoes: e.observacoes || "", data_entrega: e.data_entrega || "",
      hora_entrega: e.hora_entrega?.slice(0, 5) || "", tipo: e.tipo || "retirada",
      valor_total: e.valor_total != null ? String(e.valor_total).replace(".", ",") : "",
    });
    setItens(initial?.itens || []);
    setSinal(initial?.sinalSugerido ? String(initial.sinalSugerido).replace(".", ",") : "");
    setMais(!!(initial?.itens?.length || initial?.sinalSugerido || e.valor_total));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f) => (ev: any) => setF(p => ({ ...p, [k]: ev?.target ? ev.target.value : ev }));
  const somaItens = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);

  function addItem(pid: string) {
    const p = products.find(x => x.id === pid);
    if (!p) return;
    const byW = (p as any).sold_by_weight;
    setItens(prev => [...prev, { produto_id: p.id, quantidade: byW ? 1000 : 1, preco_unitario: byW ? Number(p.sale_price) / 1000 : Number(p.sale_price) }]);
    setAddProd("");
  }

  async function salvar() {
    if (saving) return;
    if (!f.cliente_nome.trim() || !f.descricao.trim() || !f.data_entrega || !f.hora_entrega || num(f.quantidade) <= 0) {
      toast.error("Preencha cliente, descrição, quantidade, data e hora da entrega");
      return;
    }
    const valorSinal = num(sinal);
    setSaving(true);
    try {
      const row: any = {
        cliente_nome: f.cliente_nome.trim(), cliente_telefone: f.cliente_telefone.trim() || null,
        descricao: f.descricao.trim(), quantidade: num(f.quantidade), unidade: f.unidade.trim() || null,
        observacoes: f.observacoes.trim() || null, data_entrega: f.data_entrega, hora_entrega: f.hora_entrega,
        tipo: f.tipo, valor_total: f.valor_total ? num(f.valor_total) : (somaItens > 0 ? Math.round(somaItens * 100) / 100 : null),
      };
      let id = editId;
      if (id) {
        const { error } = await db.from("encomendas").update(row).eq("id", id);
        if (error) throw error;
        await db.from("encomenda_itens").delete().eq("encomenda_id", id);
      } else {
        const { data, error } = await db.from("encomendas").insert({ ...row, user_id: user?.id, valor_sinal: 0 }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (itens.length) {
        const { error } = await db.from("encomenda_itens").insert(itens.map(i => ({ encomenda_id: id, produto_id: i.produto_id, quantidade: i.quantidade, preco_unitario: i.preco_unitario })));
        if (error) throw error;
      }
      if (valorSinal > 0) {
        const { error } = await db.rpc("registrar_sinal_encomenda", { _encomenda_id: id, _valor: valorSinal, _metodo: sinalMetodo });
        if (error) { toast.error("Encomenda salva, mas o sinal não foi registrado: " + error.message); onSaved?.(id!); onOpenChange(false); return; }
      }
      toast.success(editId ? "Encomenda atualizada" : "Encomenda criada");
      if (!editId && !isAndroid()) window.open(`/encomendas/${id}/ficha?print=1`, "_blank");
      onSaved?.(id!);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editId ? "Editar encomenda" : "Nova encomenda"}</DialogTitle></DialogHeader>
        <fieldset disabled={saving} className="space-y-3">
          <div><Label>Cliente *</Label><Input value={f.cliente_nome} onChange={set("cliente_nome")} /></div>
          <div><Label>Descrição *</Label><Textarea rows={2} value={f.descricao} onChange={set("descricao")} placeholder="Ex.: Bolo de ninho com morango, 2 kg" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Quantidade *</Label><Input inputMode="decimal" value={f.quantidade} onChange={set("quantidade")} /></div>
            <div><Label>Data *</Label><Input type="date" value={f.data_entrega} onChange={set("data_entrega")} /></div>
            <div><Label>Hora *</Label><Input type="time" value={f.hora_entrega} onChange={set("hora_entrega")} /></div>
          </div>

          <button type="button" onClick={() => setMais(m => !m)} className="flex items-center gap-1 text-sm font-semibold text-pink-dark">
            {mais ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Mais detalhes
          </button>
          {mais && (
            <div className="space-y-3 border rounded-xl p-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Telefone</Label><Input value={f.cliente_telefone} onChange={set("cliente_telefone")} /></div>
                <div><Label>Unidade</Label><Input value={f.unidade} onChange={set("unidade")} placeholder="kg, un, cento..." /></div>
              </div>
              <div><Label>Observações</Label><Textarea rows={2} value={f.observacoes} onChange={set("observacoes")} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={f.tipo} onValueChange={set("tipo")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="retirada">Retirada</SelectItem><SelectItem value="entrega">Entrega</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Produtos (usados para montar a venda na entrega)</Label>
                {itens.map((it, idx) => {
                  const p = products.find(x => x.id === it.produto_id);
                  const byW = (p as any)?.sold_by_weight;
                  return (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{p?.name || "Produto"}</span>
                      <Input className="w-20 h-8" inputMode="decimal" value={it.quantidade}
                        onChange={e => setItens(prev => prev.map((x, i) => i === idx ? { ...x, quantidade: num(e.target.value) } : x))} />
                      <span className="text-xs text-muted-foreground w-6">{byW ? "g" : "un"}</span>
                      <span className="w-20 text-right">{fmt(it.quantidade * it.preco_unitario)}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setItens(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  );
                })}
                <Select value={addProd} onValueChange={addItem}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={<span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar produto</span>} /></SelectTrigger>
                  <SelectContent>{products.filter(p => (p as any).sells !== false).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Valor total</Label><Input inputMode="decimal" value={f.valor_total} onChange={set("valor_total")} placeholder={somaItens > 0 ? fmt(somaItens) : "0,00"} /></div>
                <div>
                  <Label>{editId ? "Receber sinal adicional" : "Sinal recebido agora"}</Label>
                  <Input inputMode="decimal" value={sinal} onChange={e => setSinal(e.target.value)} placeholder="0,00" />
                </div>
              </div>
              {editId && Number(initial?.encomenda?.valor_sinal || 0) > 0 && (
                <p className="text-xs text-muted-foreground">Sinal já pago: {fmt(Number(initial?.encomenda?.valor_sinal))}</p>
              )}
              {num(sinal) > 0 && (
                <div>
                  <Label>Forma de pagamento do sinal</Label>
                  <Select value={sinalMetodo} onValueChange={setSinalMetodo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem><SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="debito">Débito</SelectItem><SelectItem value="credito">Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">O sinal entra no caixa como adiantamento. Os produtos só são vendidos na entrega.</p>
                </div>
              )}
            </div>
          )}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
