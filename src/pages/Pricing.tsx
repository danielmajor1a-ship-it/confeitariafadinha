import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function Pricing() {
  const { products, costs } = useApp();
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function getProductCosts(productId: string) {
    return costs.filter(c => c.productId === productId).reduce((s, c) => s + c.value, 0);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="page-header">Precificação</h1>
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
              const totalCost = p.purchasePrice + extraCosts;
              const marginValue = p.salePrice - totalCost;
              const marginPercent = totalCost > 0 ? (marginValue / totalCost) * 100 : 0;
              const status = marginPercent >= 30 ? 'healthy' : marginPercent >= 10 ? 'warning' : 'low';

              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{fmt(p.purchasePrice)}</TableCell>
                  <TableCell>{fmt(extraCosts)}</TableCell>
                  <TableCell className="font-semibold">{fmt(totalCost)}</TableCell>
                  <TableCell className="font-semibold">{fmt(p.salePrice)}</TableCell>
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
    </div>
  );
}
