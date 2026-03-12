import { useState, useMemo, useEffect } from "react";
import { ImageIcon, AlertTriangle, Calculator, Smartphone, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useCardRates } from "@/components/CardRatesSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, HandCoins, Receipt, X, History, FileText } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABELS, PAYMENT_LABELS } from "@/types";
import type { PaymentEntry } from "@/types";
import ReceiptDialog from "@/components/ReceiptDialog";

const SINGLE_METHODS = ['dinheiro', 'pix', 'debito', 'credito', 'fiado'] as const;

function PaymentIcon({ method, className = "h-5 w-5" }: { method: string; className?: string }) {
  const icons: Record<string, any> = {
    dinheiro: Banknote, pix: Smartphone, debito: CreditCard, credito: CreditCard, fiado: HandCoins,
  };
  const Icon = icons[method];
  return Icon ? <Icon className={className} /> : null;
}

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  maxStock: number;
}

export default function Sales() {
  const { user } = useAuth();
  const { products, sales, clients, addSale, deleteSale, refresh } = useApp();
  const { rates, getCreditRate } = useCardRates();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("dinheiro");
  const [clientId, setClientId] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasOpenRegister, setHasOpenRegister] = useState<boolean | null>(null);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Multi-payment state
  const [paymentMode, setPaymentMode] = useState<'single' | 'multi'>('single');
  const [creditInstallments, setCreditInstallments] = useState(1);
  const [payments, setPayments] = useState<{ method: string; amount: number; installments?: number }[]>([]);
  const [addingMethod, setAddingMethod] = useState('dinheiro');
  const [addingAmount, setAddingAmount] = useState('');
  const [addingInstallments, setAddingInstallments] = useState(1);

  // Change calculator
  const [amountReceived, setAmountReceived] = useState('');

  useEffect(() => {
    async function checkRegister() {
      if (!user) return;
      const { data } = await supabase
        .from("cash_registers")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "aberto")
        .limit(1);
      setHasOpenRegister(data && data.length > 0);
    }
    checkRegister();
  }, [user]);

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
    if (!hasOpenRegister) { toast.error("Abra o caixa antes de registrar vendas"); return; }
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = cart.find(i => i.productId === productId);
    const currentQty = existing?.quantity || 0;
    if (currentQty >= product.stock) { toast.error("Estoque insuficiente!"); return; }
    if (existing) {
      setCart(cart.map(i => i.productId === productId
        ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice } : i));
    } else {
      setCart([...cart, {
        productId: product.id, productName: product.name,
        quantity: 1, unitPrice: product.sale_price, subtotal: product.sale_price,
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

  function removeFromCart(productId: string) { setCart(prev => prev.filter(i => i.productId !== productId)); }

  function clearCart() {
    setCart([]); setPaymentMethod("dinheiro"); setClientId("");
    setPaymentMode('single'); setPayments([]); setAmountReceived('');
    setCreditInstallments(1);
  }

  function buildPaymentsPayload(): PaymentEntry[] {
    if (paymentMode === 'multi') {
      return payments.map(p => {
        const taxRate = p.method === 'credito'
          ? getCreditRate(p.installments || 1)
          : p.method === 'debito' ? rates.debit_rate : 0;
        const taxAmount = p.amount * (taxRate / 100);
        return {
          method: p.method, amount: p.amount,
          installments: p.installments || 1,
          tax_rate: taxRate, tax_amount: taxAmount, net_amount: p.amount - taxAmount,
        };
      });
    } else {
      const taxRate = paymentMethod === 'credito'
        ? getCreditRate(creditInstallments)
        : paymentMethod === 'debito' ? rates.debit_rate : 0;
      const taxAmount = total * (taxRate / 100);
      return [{
        method: paymentMethod, amount: total,
        installments: paymentMethod === 'credito' ? creditInstallments : 1,
        tax_rate: taxRate, tax_amount: taxAmount, net_amount: total - taxAmount,
      }];
    }
  }

  async function finalizeSale() {
    if (isProcessing) return;
    if (!hasOpenRegister) { toast.error("Abra o caixa antes de registrar vendas"); return; }
    if (cart.length === 0) { toast.error("Adicione itens à venda"); return; }

    const effectiveMethod = paymentMode === 'multi'
      ? (payments.length === 1 ? payments[0].method : 'misto')
      : paymentMethod;

    const hasFiado = paymentMode === 'multi'
      ? payments.some(p => p.method === 'fiado')
      : paymentMethod === 'fiado';

    if (hasFiado && !clientId) { toast.error("Selecione um cliente para fiado"); return; }

    if (paymentMode === 'multi') {
      const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(paymentsTotal - total) > 0.01) {
        toast.error("A soma dos pagamentos deve ser igual ao total da venda");
        return;
      }
    }

    const clientName = clientId ? clients.find(c => c.id === clientId)?.name : undefined;
    const receiptItems = cart.map(i => ({
      productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal,
    }));
    const paymentsPayload = buildPaymentsPayload();

    setIsProcessing(true);
    try {
      const success = await addSale(cart, effectiveMethod, clientId || undefined, paymentsPayload);
      if (!success) return;

      setReceiptData({
        date: new Date().toLocaleString('pt-BR'),
        items: receiptItems, total,
        paymentMethod: effectiveMethod,
        payments: paymentsPayload.map(p => ({
          method: p.method, amount: p.amount, installments: p.installments,
        })),
        clientName,
      });
      setShowReceipt(true);
      clearCart();
      toast.success("Venda registrada com sucesso!");
    } finally {
      setIsProcessing(false);
    }
  }

  // ===== HISTORY VIEW =====
  if (showHistory) {
    return (
      <>
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
                      <td className="p-3">
                        {s.payments && s.payments.length > 1 ? (
                          <div className="flex flex-wrap gap-1">
                            {s.payments.map((p, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {PAYMENT_LABELS[p.payment_method] || p.payment_method} {fmt(p.amount)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="secondary">{PAYMENT_LABELS[s.payment_method] || s.payment_method}</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={s.status === 'pago' ? 'default' : 'destructive'}>
                          {s.status === 'pago' ? 'Pago' : 'Pendente'}
                        </Badge>
                      </td>
                      <td className="p-3 flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => {
                          const clientName = s.client_id ? clients.find(c => c.id === s.client_id)?.name : undefined;
                          setReceiptData({
                            date: new Date(s.created_at).toLocaleString('pt-BR'),
                            items: s.items.map(i => ({ productName: i.product_name, quantity: i.quantity, unitPrice: i.unit_price, subtotal: i.subtotal })),
                            total: s.total,
                            paymentMethod: s.payment_method,
                            payments: s.payments?.map(p => ({ method: p.payment_method, amount: p.amount, installments: p.installments })),
                            clientName,
                          });
                          setShowReceipt(true);
                        }}>
                          <FileText className="h-4 w-4" />
                        </Button>
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
        <ReceiptDialog open={showReceipt} onOpenChange={setShowReceipt} data={receiptData} />
      </>
    );
  }

  // ===== MAIN PDV VIEW =====
  const multiPaid = payments.reduce((s, p) => s + p.amount, 0);
  const multiRemaining = total - multiPaid;
  const needsClient = paymentMode === 'multi' ? payments.some(p => p.method === 'fiado') : paymentMethod === 'fiado';

  return (
    <div className="animate-fade-in h-[calc(100vh-5rem)] flex flex-col lg:flex-row gap-4">
      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h1 className="page-header flex items-center gap-2">
            <Receipt className="h-6 w-6 text-pink-dark" /> PDV Caixa
          </h1>
          <Button variant="outline" size="sm" onClick={() => { refresh(); setShowHistory(true); }}>
            <History className="h-4 w-4 mr-1" /> Histórico
          </Button>
        </div>

        {hasOpenRegister === false && (
          <div className="flex items-center gap-3 p-4 mb-3 rounded-xl border-2 border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Caixa fechado</p>
              <p className="text-xs opacity-80">Abra o caixa antes de registrar vendas.</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => window.location.href = '/caixa'}>
              Abrir Caixa
            </Button>
          </div>
        )}

        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant={categoryFilter === "todos" ? "default" : "outline"} onClick={() => setCategoryFilter("todos")} className="text-xs">Todos</Button>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <Button key={k} size="sm" variant={categoryFilter === k ? "default" : "outline"} onClick={() => setCategoryFilter(k)} className="text-xs">{v}</Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredProducts.map(p => {
              const inCart = cart.find(i => i.productId === p.id);
              const outOfStock = p.stock <= 0;
              return (
                <button key={p.id} onClick={() => !outOfStock && addToCart(p.id)} disabled={outOfStock}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-150 min-h-[120px]
                    ${outOfStock ? 'opacity-40 cursor-not-allowed bg-muted' : 'bg-card hover:shadow-md hover:border-pink-dark/40 active:scale-95 cursor-pointer'}
                    ${inCart ? 'ring-2 ring-pink-dark/60 border-pink-dark/40' : ''}
                  `}>
                  {inCart && (
                    <span className="absolute -top-2 -right-2 bg-pink-dark text-primary-foreground text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center z-10">
                      {inCart.quantity}
                    </span>
                  )}
                  {(p as any).image_url ? (
                    <img src={(p as any).image_url} alt={p.name} className="w-12 h-12 rounded-lg object-cover mb-1 border border-border" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-1">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <span className="font-semibold text-sm leading-tight line-clamp-2">{p.name}</span>
                  <span className="font-bold text-base mt-1" style={{ color: 'hsl(var(--chocolate))' }}>{fmt(p.sale_price)}</span>
                  <span className={`text-xs mt-0.5 ${p.stock <= p.low_stock_threshold ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                    {outOfStock ? 'Sem estoque' : `${p.stock} un`}
                  </span>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-12">Nenhum produto encontrado</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Cart / Checkout */}
      <Card className="w-full lg:w-[340px] xl:w-[380px] flex flex-col border-2 border-border shadow-lg rounded-2xl overflow-hidden shrink-0">
        <div className="flex items-center justify-between p-4 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-pink-dark" />
            <span className="font-display font-bold text-lg">Carrinho</span>
            {totalItems > 0 && <Badge variant="secondary" className="ml-1">{totalItems}</Badge>}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} className="text-xs text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}
        </div>

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
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => item.quantity === 1 ? removeFromCart(item.productId) : updateQty(item.productId, -1)}>
                      {item.quantity === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3" />}
                    </Button>
                    <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.productId, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-bold text-sm w-16 text-right">{fmt(item.subtotal)}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* ===== CHECKOUT SECTION ===== */}
        {cart.length > 0 && (
          <div className="border-t p-4 space-y-3 bg-card max-h-[55vh] overflow-y-auto">
            {/* Total */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary">
              <span className="font-semibold text-sm">Total</span>
              <span className="text-2xl font-bold font-display" style={{ color: 'hsl(var(--chocolate))' }}>{fmt(total)}</span>
            </div>

            {/* Payment mode toggle */}
            <div className="flex gap-2">
              <Button variant={paymentMode === 'single' ? 'default' : 'outline'} size="sm" className="flex-1 text-xs"
                onClick={() => { setPaymentMode('single'); setPayments([]); }}>
                Pagamento Único
              </Button>
              <Button variant={paymentMode === 'multi' ? 'default' : 'outline'} size="sm" className="flex-1 text-xs"
                onClick={() => setPaymentMode('multi')}>
                <Layers className="h-3 w-3 mr-1" /> Misto
              </Button>
            </div>

            {paymentMode === 'single' ? (
              <>
                {/* Payment method buttons */}
                <div className="grid grid-cols-5 gap-1.5">
                  {SINGLE_METHODS.map(k => (
                    <button key={k} onClick={() => { setPaymentMethod(k); setAmountReceived(''); }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-[10px] font-semibold
                        ${paymentMethod === k ? 'border-pink-dark bg-pink-light text-pink-dark' : 'border-border hover:border-muted-foreground/30'}
                      `}>
                      <PaymentIcon method={k} className="h-4 w-4" />
                      {PAYMENT_LABELS[k]}
                    </button>
                  ))}
                </div>

                {/* Credit installments */}
                {paymentMethod === 'credito' && (
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Button key={n} size="sm" variant={creditInstallments === n ? 'default' : 'outline'}
                          onClick={() => setCreditInstallments(n)} className="flex-1 text-xs">
                          {n}x
                        </Button>
                      ))}
                    </div>
                    {getCreditRate(creditInstallments) > 0 && (
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
                        Taxa: {getCreditRate(creditInstallments).toFixed(1)}% →
                        Líquido: {fmt(total - total * getCreditRate(creditInstallments) / 100)}
                      </div>
                    )}
                  </div>
                )}

                {/* Debit tax info */}
                {paymentMethod === 'debito' && rates.debit_rate > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
                    Taxa: {rates.debit_rate.toFixed(1)}% → Líquido: {fmt(total - total * rates.debit_rate / 100)}
                  </div>
                )}

                {/* Change calculator for cash */}
                {paymentMethod === 'dinheiro' && (
                  <div className="space-y-2 p-3 rounded-xl bg-muted/50 border">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Calculator className="h-4 w-4" /> Calculadora de Troco
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Valor Recebido</label>
                      <Input placeholder="0,00" value={amountReceived}
                        onChange={e => setAmountReceived(e.target.value)}
                        className="text-lg font-bold" inputMode="decimal" />
                    </div>
                    {amountReceived && (() => {
                      const received = parseFloat(amountReceived.replace(",", ".")) || 0;
                      const change = received - total;
                      return (
                        <div className={`p-2 rounded-lg text-center ${change >= 0 ? 'bg-green-100 dark:bg-green-950/30' : 'bg-red-100 dark:bg-red-950/30'}`}>
                          {change >= 0 ? (
                            <>
                              <p className="text-xs text-muted-foreground">Troco</p>
                              <p className="text-2xl font-bold text-green-600">{fmt(change)}</p>
                            </>
                          ) : (
                            <p className="text-sm font-semibold text-destructive">
                              Valor insuficiente (faltam {fmt(Math.abs(change))})
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-4 gap-1">
                      {[5, 10, 20, 50, 100, 200].map(v => (
                        <Button key={v} size="sm" variant="outline" className="text-xs"
                          onClick={() => setAmountReceived(String(v))}>
                          R${v}
                        </Button>
                      ))}
                      <Button size="sm" variant="outline" className="text-xs col-span-2"
                        onClick={() => setAmountReceived(total.toFixed(2).replace(".", ","))}>
                        Exato
                      </Button>
                    </div>
                  </div>
                )}

                {/* Fiado client selector */}
                {paymentMethod === 'fiado' && (
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </>
            ) : (
              /* ===== MULTI PAYMENT MODE ===== */
              <div className="space-y-2">
                {/* Current payments list */}
                {payments.length > 0 && (
                  <div className="space-y-1">
                    {payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border text-sm">
                        <div className="flex items-center gap-2">
                          <PaymentIcon method={p.method} className="h-4 w-4" />
                          <span className="font-medium text-xs">{PAYMENT_LABELS[p.method]}</span>
                          {p.method === 'credito' && (p.installments || 1) > 1 && (
                            <Badge variant="outline" className="text-[10px]">{p.installments}x</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-sm">{fmt(p.amount)}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Remaining / Status */}
                {multiRemaining > 0.01 ? (
                  <div className="p-2 rounded-lg bg-warning/10 border border-warning/30 text-center">
                    <p className="text-xs text-muted-foreground">Restante</p>
                    <p className="text-lg font-bold text-warning">{fmt(multiRemaining)}</p>
                  </div>
                ) : multiRemaining < -0.01 ? (
                  <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-center">
                    <p className="text-sm font-semibold text-destructive">Excede em {fmt(Math.abs(multiRemaining))}</p>
                  </div>
                ) : payments.length > 0 ? (
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950/30 text-center">
                    <p className="text-sm font-semibold text-green-600">✓ Pagamento completo</p>
                  </div>
                ) : null}

                {/* Add payment form */}
                {multiRemaining > 0.01 && (
                  <div className="space-y-2 p-3 rounded-xl border bg-card">
                    <div className="grid grid-cols-5 gap-1">
                      {SINGLE_METHODS.map(k => (
                        <button key={k} onClick={() => setAddingMethod(k)}
                          className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border text-[10px] font-semibold
                            ${addingMethod === k ? 'border-pink-dark bg-pink-light text-pink-dark' : 'border-border'}
                          `}>
                          <PaymentIcon method={k} className="h-3 w-3" />
                          {PAYMENT_LABELS[k]}
                        </button>
                      ))}
                    </div>
                    {addingMethod === 'credito' && (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Button key={n} size="sm" variant={addingInstallments === n ? 'default' : 'outline'}
                            onClick={() => setAddingInstallments(n)} className="flex-1 text-xs">
                            {n}x
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input placeholder="Valor" value={addingAmount}
                        onChange={e => setAddingAmount(e.target.value)} inputMode="decimal" className="flex-1" />
                      <Button size="sm" onClick={() => {
                        const amt = parseFloat(addingAmount.replace(",", ".")) || 0;
                        if (amt <= 0) { toast.error("Informe um valor válido"); return; }
                        if (amt > multiRemaining + 0.01) { toast.error("Valor excede o restante"); return; }
                        setPayments(prev => [...prev, {
                          method: addingMethod, amount: amt,
                          installments: addingMethod === 'credito' ? addingInstallments : 1,
                        }]);
                        setAddingAmount("");
                      }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button size="sm" variant="outline" className="w-full text-xs"
                      onClick={() => {
                        setPayments(prev => [...prev, {
                          method: addingMethod,
                          amount: parseFloat(multiRemaining.toFixed(2)),
                          installments: addingMethod === 'credito' ? addingInstallments : 1,
                        }]);
                        setAddingAmount("");
                      }}>
                      Usar restante ({fmt(multiRemaining)})
                    </Button>
                  </div>
                )}

                {/* Fiado client selector */}
                {payments.some(p => p.method === 'fiado') && (
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cliente (fiado)" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Finalize Button */}
            <Button onClick={finalizeSale} className="w-full h-12 text-base font-bold" size="lg"
              disabled={isProcessing || (paymentMode === 'multi' && Math.abs(multiRemaining) > 0.01)}>
              {isProcessing ? <span className="animate-spin mr-2">⏳</span> : <Receipt className="h-5 w-5 mr-2" />}
              {isProcessing ? 'Processando...' : `Finalizar ${fmt(total)}`}
            </Button>
          </div>
        )}
      </Card>
      <ReceiptDialog open={showReceipt} onOpenChange={setShowReceipt} data={receiptData} />
    </div>
  );
}
