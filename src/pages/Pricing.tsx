import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Minus, Pencil } from "lucide-react";
import BulkSheetDialog from "@/components/BulkSheetDialog";
import PriceHistory from "@/components/PriceHistory";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Pricing() {
  const { products, costs, refresh } = useApp();
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const [editing, setEditing] = useState<{ id: string; name: string; current: number } | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit(p: { id: string; name: string; sale_price: number }) {
    setEditing({ id: p.id, name: p.name, current: p.sale_price });
    setNewPrice(p.sale_price.toFixed(2).replace('.', ','));
  }

  async function savePrice() {
    if (!editing) return;
    const parsed = parseFloat(newPrice.replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) { toast.error('Preço inválido'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('bulk_update_prices', {
      _items: [{ product_id: editing.id, new_price: parsed }],
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Preço de "${editing.name}" atualizado para ${fmt(parsed)}`);
    setEditing(null);
    await refresh();
  }

  function getProductCosts(productId: string) {
    return costs.filter(c => c.product_id === productId).reduce((s, c) => s + c.value, 0);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Precificação</h1>
        <div className="flex gap-2"><BulkSheetDialog mode="price" /></div>
      </div>
      <p className="text-muted-foreground text-sm">Análise de margem de lucro por produto. Custos vinculados são somados ao preço de compra.</p>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Produto</TableHead>
            <TableHead>Custo Base</TableHead>
            <TableHead>Custos Adicionais</TableHead>
            <TableHead>Custo Total</TableHead>
            <TableHead>Preço Venda</TableHead>
            <TableHead>Margem (R$)</TableHead>
            <TableHead>Margem (%)</TableHead>
            <TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {products.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cadastre produtos para ver a precificação</TableCell></TableRow>}
            {products.map(p => {
              const extraCosts = getProductCosts(p.id);
              const totalCost = p.purchase_price + extraCosts;
              const marginValue = p.sale_price - totalCost;
              const marginPercent = totalCost > 0 ? (marginValue / totalCost) * 100 : 0;
              const status = marginPercent >= 30 ? 'healthy' : marginPercent >= 10 ? 'warning' : 'low';

              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{fmt(p.purchase_price)}</TableCell>
                  <TableCell>{fmt(extraCosts)}</TableCell>
                  <TableCell className="font-semibold">{fmt(totalCost)}</TableCell>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-1">
                      {fmt(p.sale_price)}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} title="Alterar preço de venda">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className={marginValue >= 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>
                    {fmt(marginValue)}
                  </TableCell>
                  <TableCell>{marginPercent.toFixed(1)}%</TableCell>
                  <TableCell>
                    {status === 'healthy' && <Badge variant="secondary" className="text-success"><TrendingUp className="h-3 w-3 mr-1" /> Saudável</Badge>}
                    {status === 'warning' && <Badge variant="secondary" className="text-warning"><Minus className="h-3 w-3 mr-1" /> Atenção</Badge>}
                    {status === 'low' && <Badge variant="destructive"><TrendingDown className="h-3 w-3 mr-1" /> Baixa</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PriceHistory />
    </div>
  );
}
