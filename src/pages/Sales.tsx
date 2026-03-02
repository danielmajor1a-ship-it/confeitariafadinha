import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, HandCoins, Receipt, X, History } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABELS } from "@/types";

const PAYMENT_LABELS: Record<string, string> = { dinheiro: 'Dinheiro', cartao: 'Cartão', fiado: 'Fiado' };
const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  dinheiro: <Banknote className="h-5 w-5" />,
  cartao: <CreditCard className="h-5 w-5" />,
  fiado: <HandCoins className="h-5 w-5" />,
};

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  maxStock: number;
}

export default function Sales() {
  const { products, sales, clients, addSale, deleteSale } = useApp();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("dinheiro");
  const [clientId, setClientId] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const total = cart.reduce((s, i) => s + i.subtotal, 0);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "todos" || p.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [products, search, categoryFilter]);

  function addToCart(productId: string) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = cart.find(i => i.productId === productId);
    const currentQty = existing?.quantity || 0;
    if (currentQty >= product.stock) {
      toast.error("Estoque insuficiente!");
      return;
    }
    if (existing) {
      setCart(cart.map(i => i.productId === productId
        ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice }
        : i
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.sale_price,
        subtotal: product.sale_price,
        maxStock: product.stock,
      }]);
    }
  }

  function updateQty(productId: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const newQty = i.quantity + delta;
      if (newQty <= 0) return i;
      if (newQty > i.maxStock) { toast.error("Estoque insuficiente!"); return i; }
      return { ...i, quantity: newQty, subtotal: newQty * i.unitPrice };
    }).filter(i => i.quantity > 0));
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    setPaymentMethod("dinheiro");
    setClientId("");
  }

  async function finalizeSale() {
    if (cart.length === 0) { toast.error("Adicione itens à venda"); return; }
    if (paymentMethod === 'fiado' && !clientId) { toast.error("Selecione um cliente para fiado"); return; }
    await addSale(cart, paymentMethod, clientId || undefined);
    clearCart();
    toast.success("Venda registrada com sucesso!");
  }

  if (showHistory) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="page-header">Histórico de Vendas</h1>
          <Button variant="outline" onClick={() => setShowHistory(false)}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Voltar ao PDV
          </Button>
        </div>
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-semibold">Data</th>
                  <th className="text-left p-3 font-semibold">Itens</th>
                  <th className="text-left p-3 font-semibold">Total</th>
                  <th className="text-left p-3 font-semibold">Pagamento</th>
                  <th className="text-left p-3 font-semibold">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma venda registrada</td></tr>
                )}
                {sales.map(s => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3">{new Date(s.created_at).toLocaleDateString('pt-BR')} {new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-3 max-w-[200px] truncate">{s.items.map(i => `${i.product_name} (${i.quantity})`).join(', ')}</td>
                    <td className="p-3 font-semibold">{fmt(s.total)}</td>
                    <td className="p-3"><Badge variant="secondary">{PAYMENT_LABELS[s.payment_method] || s.payment_method}</Badge></td>
                    <td className="p-3">
                      <Badge variant={s.status === 'pago' ? 'default' : 'destructive'}>
                        {s.status === 'pago' ? 'Pago' : 'Pendente'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
                            <AlertDialogDescription>O estoque será restaurado e a venda será removida permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => { await deleteSale(s.id); toast.success("Venda excluída"); }}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in h-[calc(100vh-5rem)] flex flex-col lg:flex-row gap-4">
      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h1 className="page-header flex items-center gap-2">
            <Receipt className="h-6 w-6 text-pink-dark" /> PDV Caixa
          </h1>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4 mr-1" /> Histórico
          </Button>
        </div>

        {/* Search + Category filter */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button
              size="sm"
              variant={categoryFilter === "todos" ? "default" : "outline"}
              onClick={() => setCategoryFilter("todos")}
              className="text-xs"
            >
              Todos
            </Button>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <Button
                key={k}
                size="sm"
                variant={categoryFilter === k ? "default" : "outline"}
                onClick={() => setCategoryFilter(k)}
                className="text-xs"
              >
                {v}
              </Button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
            {filteredProducts.map(p => {
              const inCart = cart.find(i => i.productId === p.id);
              const outOfStock = p.stock <= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => !outOfStock && addToCart(p.id)}
                  disabled={outOfStock}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-150 
                    ${outOfStock
                      ? 'opacity-40 cursor-not-allowed bg-muted'
                      : 'bg-card hover:shadow-md hover:border-pink-dark/40 hover:scale-[1.02] active:scale-95 cursor-pointer'
                    }
                    ${inCart ? 'ring-2 ring-pink-dark/60 border-pink-dark/40' : ''}
                  `}
                >
                  {inCart && (
                    <span className="absolute -top-2 -right-2 bg-pink-dark text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                      {inCart.quantity}
                    </span>
                  )}
                  <span className="font-semibold text-sm leading-tight line-clamp-2">{p.name}</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] || p.category}
                  </span>
                  <span className="font-bold text-base mt-1" style={{ color: 'hsl(var(--chocolate))' }}>
                    {fmt(p.sale_price)}
                  </span>
                  <span className={`text-xs mt-0.5 ${p.stock <= p.low_stock_threshold ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                    {outOfStock ? 'Sem estoque' : `${p.stock} un`}
                  </span>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-12">
                Nenhum produto encontrado
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Cart / Checkout */}
      <Card className="w-full lg:w-[340px] xl:w-[380px] flex flex-col border-2 border-border shadow-lg rounded-2xl overflow-hidden shrink-0">
        {/* Cart Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-pink-dark" />
            <span className="font-display font-bold text-lg">Carrinho</span>
            {totalItems > 0 && (
              <Badge variant="secondary" className="ml-1">{totalItems}</Badge>
            )}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} className="text-xs text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}
        </div>

        {/* Cart Items */}
        <ScrollArea className="flex-1 min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Carrinho vazio</p>
              <p className="text-xs mt-1">Clique em um produto para adicionar</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {cart.map(item => (
                <div key={item.productId} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} un</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => item.quantity === 1 ? removeFromCart(item.productId) : updateQty(item.productId, -1)}
                    >
                      {item.quantity === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3" />}
                    </Button>
                    <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQty(item.productId, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-bold text-sm w-16 text-right">{fmt(item.subtotal)}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Checkout Section */}
        {cart.length > 0 && (
          <div className="border-t p-4 space-y-3 bg-card">
            {/* Total */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary">
              <span className="font-semibold text-sm">Total</span>
              <span className="text-2xl font-bold font-display" style={{ color: 'hsl(var(--chocolate))' }}>
                {fmt(total)}
              </span>
            </div>

            {/* Payment Method */}
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setPaymentMethod(k)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-xs font-semibold
                    ${paymentMethod === k
                      ? 'border-pink-dark bg-pink-light text-pink-dark'
                      : 'border-border hover:border-muted-foreground/30'
                    }
                  `}
                >
                  {PAYMENT_ICONS[k]}
                  {v}
                </button>
              ))}
            </div>

            {/* Client select for fiado */}
            {paymentMethod === 'fiado' && (
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {/* Finalize Button */}
            <Button onClick={finalizeSale} className="w-full h-12 text-base font-bold" size="lg">
              <Receipt className="h-5 w-5 mr-2" />
              Finalizar {fmt(total)}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
