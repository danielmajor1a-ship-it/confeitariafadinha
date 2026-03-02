import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, AlertTriangle, CheckCircle } from "lucide-react";

type RecipeIngredient = Tables<'recipe_ingredients'>;

interface RecipeWithIngredients extends Tables<'recipes'> {
  ingredients: RecipeIngredient[];
}

interface LocalIngredient {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}

export default function Recipes() {
  const { recipes, products, addRecipe, updateRecipe, deleteRecipe } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecipeWithIngredients | null>(null);
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);
  const [selProduct, setSelProduct] = useState("");
  const [ingQty, setIngQty] = useState(1);
  const [ingUnit, setIngUnit] = useState("un");

  function addIngredient() {
    const p = products.find(pr => pr.id === selProduct);
    if (!p) return;
    setIngredients([...ingredients, { productId: p.id, productName: p.name, quantity: ingQty, unit: ingUnit }]);
    setSelProduct("");
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get('name') as string,
      instructions: fd.get('instructions') as string,
      notes: fd.get('notes') as string,
      ingredients,
    };
    if (editing) {
      await updateRecipe({
        ...editing,
        name: data.name,
        instructions: data.instructions,
        notes: data.notes,
        ingredients: ingredients.map(i => ({
          id: '',
          recipe_id: editing.id,
          product_id: i.productId,
          product_name: i.productName,
          quantity: i.quantity,
          unit: i.unit,
        })),
      });
    } else {
      await addRecipe(data);
    }
    setEditing(null);
    setIngredients([]);
    setOpen(false);
  }

  function checkAvailability(recipe: RecipeWithIngredients) {
    return recipe.ingredients.map(ing => {
      const product = products.find(p => p.id === ing.product_id);
      return { ...ing, available: product?.stock || 0, sufficient: (product?.stock || 0) >= ing.quantity };
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Receitas</h1>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setIngredients([]); } }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Receita</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova'} Receita</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-3">
              <div><Label>Nome</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div>
                <Label>Ingredientes</Label>
                <div className="flex gap-2 mb-2">
                  <Select value={selProduct} onValueChange={setSelProduct}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Produto" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" min={1} value={ingQty} onChange={e => setIngQty(parseInt(e.target.value) || 1)} className="w-16" />
                  <Input value={ingUnit} onChange={e => setIngUnit(e.target.value)} className="w-16" placeholder="un" />
                  <Button type="button" onClick={addIngredient} variant="secondary" size="sm">+</Button>
                </div>
                {ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center justify-between bg-muted rounded-lg px-3 py-1 mb-1">
                    <span className="text-sm">{ing.productName} - {ing.quantity} {ing.unit}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div><Label>Modo de Preparo</Label><Textarea name="instructions" defaultValue={editing?.instructions || ''} rows={4} /></div>
              <div><Label>Observações</Label><Input name="notes" defaultValue={editing?.notes || ''} /></div>
              <Button type="submit" className="w-full">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recipes.length === 0 && <p className="text-muted-foreground col-span-2 text-center py-8">Nenhuma receita cadastrada</p>}
        {recipes.map(r => {
          const availability = checkAvailability(r);
          const allAvailable = availability.every(a => a.sufficient);
          return (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-display">{r.name}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => {
                    setEditing(r);
                    setIngredients(r.ingredients.map(i => ({ productId: i.product_id, productName: i.product_name, quantity: i.quantity, unit: i.unit })));
                    setOpen(true);
                  }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteRecipe(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  {allAvailable
                    ? <Badge variant="secondary" className="text-success"><CheckCircle className="h-3 w-3 mr-1" /> Ingredientes disponíveis</Badge>
                    : <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Faltam ingredientes</Badge>}
                </div>
                <div className="text-sm space-y-1">
                  {availability.map((a, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{a.product_name}: {a.quantity} {a.unit}</span>
                      <span className={a.sufficient ? "text-success" : "text-destructive"}>
                        Disp: {a.available}
                      </span>
                    </div>
                  ))}
                </div>
                {r.instructions && <p className="text-sm text-muted-foreground mt-2">{r.instructions}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
