import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, PackageX, ClipboardCopy, FileText, FileSpreadsheet, ShoppingCart, BookOpen } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface AlertItem {
  id: string;
  name: string;
  currentStock: number;
  minStock: number;
  status: "falta" | "alerta";
  source: "produto" | "ingrediente";
  recipeName?: string;
  needed?: number;
}

export default function StockAlerts() {
  const { products, recipes } = useApp();
  const [tab, setTab] = useState("todos");

  // Products with low/zero stock
  const productAlerts = useMemo<AlertItem[]>(() => {
    return products
      .filter(p => p.stock <= p.low_stock_threshold)
      .map(p => ({
        id: p.id,
        name: p.name,
        currentStock: p.stock,
        minStock: p.low_stock_threshold,
        status: p.stock === 0 ? "falta" as const : "alerta" as const,
        source: "produto" as const,
      }));
  }, [products]);

  // Missing ingredients from recipes
  const ingredientAlerts = useMemo<AlertItem[]>(() => {
    const missing: AlertItem[] = [];
    const seen = new Set<string>();
    recipes.forEach(r => {
      r.ingredients.forEach(ing => {
        const product = products.find(p => p.id === ing.product_id);
        if (product && product.stock < ing.quantity && !seen.has(`${product.id}-${r.id}`)) {
          seen.add(`${product.id}-${r.id}`);
          missing.push({
            id: `${product.id}-${r.id}`,
            name: product.name,
            currentStock: product.stock,
            minStock: product.low_stock_threshold,
            status: product.stock === 0 ? "falta" : "alerta",
            source: "ingrediente",
            recipeName: r.name,
            needed: ing.quantity,
          });
        }
      });
    });
    return missing;
  }, [products, recipes]);

  const allAlerts = useMemo(() => {
    const map = new Map<string, AlertItem>();
    productAlerts.forEach(a => map.set(a.id, a));
    ingredientAlerts.forEach(a => { if (!map.has(a.id.split('-')[0])) map.set(a.id, a); });
    return [...productAlerts, ...ingredientAlerts.filter(a => !map.has(a.id))];
  }, [productAlerts, ingredientAlerts]);

  const displayed = tab === "produtos" ? productAlerts : tab === "ingredientes" ? ingredientAlerts : [...productAlerts, ...ingredientAlerts];
  const outOfStock = productAlerts.filter(a => a.status === "falta").length;
  const lowStock = productAlerts.filter(a => a.status === "alerta").length;
  const missingIngredients = ingredientAlerts.length;

  // Build replenishment list
  function buildList() {
    const unique = new Map<string, AlertItem>();
    displayed.forEach(a => {
      const key = a.name;
      if (!unique.has(key)) unique.set(key, a);
    });
    return Array.from(unique.values());
  }

  function copyWhatsApp() {
    const list = buildList();
    if (list.length === 0) { toast.error("Lista vazia"); return; }
    const text = `📋 *Lista de Reposição*\n${new Date().toLocaleDateString('pt-BR')}\n\n` +
      list.map((a, i) => {
        const statusEmoji = a.status === "falta" ? "🔴" : "🟡";
        return `${i + 1}. ${statusEmoji} *${a.name}*\n   Estoque: ${a.currentStock} | Mínimo: ${a.minStock}\n   Status: ${a.status === "falta" ? "Em falta" : "Em alerta"}`;
      }).join("\n\n") +
      `\n\n📊 Total: ${list.length} itens`;
    navigator.clipboard.writeText(text);
    toast.success("Lista copiada para WhatsApp!");
  }

  function copyPlainText() {
    const list = buildList();
    if (list.length === 0) { toast.error("Lista vazia"); return; }
    const text = `Lista de Reposição - ${new Date().toLocaleDateString('pt-BR')}\n\n` +
      list.map((a, i) =>
        `${i + 1}. ${a.name} | Estoque: ${a.currentStock} | Mínimo: ${a.minStock} | ${a.status === "falta" ? "EM FALTA" : "EM ALERTA"}`
      ).join("\n") +
      `\n\nTotal: ${list.length} itens`;
    navigator.clipboard.writeText(text);
    toast.success("Lista copiada como texto!");
  }

  function exportExcel(type: "csv" | "xlsx") {
    const list = buildList();
    if (list.length === 0) { toast.error("Lista vazia"); return; }
    const rows = list.map(a => ({
      "Produto": a.name,
      "Estoque Atual": a.currentStock,
      "Estoque Mínimo": a.minStock,
      "Status": a.status === "falta" ? "Em falta" : "Em alerta",
      "Origem": a.source === "ingrediente" ? `Receita: ${a.recipeName}` : "Produto",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reposição");
    const filename = `lista_reposicao_${new Date().toISOString().slice(0, 10)}`;
    XLSX.writeFile(wb, `${filename}.${type}`, type === "csv" ? { bookType: "csv" } : undefined);
    toast.success("Exportação concluída!");
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Alertas de Estoque</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={copyWhatsApp}>
            <ClipboardCopy className="h-4 w-4 mr-1" /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={copyPlainText}>
            <FileText className="h-4 w-4 mr-1" /> Texto
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel("csv")}>
            <FileText className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel("xlsx")}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-destructive/10 text-destructive"><PackageX className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Em Falta</p><p className="text-xl font-bold font-display">{outOfStock}</p></div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-warning/10 text-warning"><AlertTriangle className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Em Alerta</p><p className="text-xl font-bold font-display">{lowStock}</p></div>
          </div>
        </Card>
        <Card className="stat-card border-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary text-chocolate"><BookOpen className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Ingredientes Faltantes</p><p className="text-xl font-bold font-display">{missingIngredients}</p></div>
          </div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="todos"><ShoppingCart className="h-4 w-4 mr-1" /> Todos ({productAlerts.length + ingredientAlerts.length})</TabsTrigger>
          <TabsTrigger value="produtos"><PackageX className="h-4 w-4 mr-1" /> Produtos ({productAlerts.length})</TabsTrigger>
          <TabsTrigger value="ingredientes"><BookOpen className="h-4 w-4 mr-1" /> Receitas ({ingredientAlerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Estoque Atual</TableHead>
                    <TableHead>Mínimo</TableHead>
                    {tab !== "produtos" && <TableHead>Necessário</TableHead>}
                    <TableHead>Status</TableHead>
                    {tab !== "produtos" && <TableHead>Origem</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum item em alerta 🎉
                    </TableCell></TableRow>
                  )}
                  {displayed.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className={a.currentStock === 0 ? "text-destructive font-bold" : ""}>{a.currentStock}</TableCell>
                      <TableCell>{a.minStock}</TableCell>
                      {tab !== "produtos" && <TableCell>{a.needed ?? "-"}</TableCell>}
                      <TableCell>
                        {a.status === "falta"
                          ? <Badge variant="destructive">Em falta</Badge>
                          : <Badge className="bg-warning/20 text-warning border-warning/30">Em alerta</Badge>}
                      </TableCell>
                      {tab !== "produtos" && (
                        <TableCell>
                          {a.source === "ingrediente"
                            ? <Badge variant="outline">{a.recipeName}</Badge>
                            : <Badge variant="secondary">Produto</Badge>}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
