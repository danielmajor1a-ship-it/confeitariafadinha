import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;
type PriceHistory = Tables<'price_history'>;
type Sale = Tables<'sales'>;
type SaleItem = Tables<'sale_items'>;
type Client = Tables<'clients'>;
type StockMovement = Tables<'stock_movements'>;
type Recipe = Tables<'recipes'>;
type RecipeIngredient = Tables<'recipe_ingredients'>;
type Cost = Tables<'costs'>;

interface ProductWithHistory extends Product {
  priceHistory: PriceHistory[];
}

interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[];
}

interface SaleWithItems extends Sale {
  items: SaleItem[];
}

interface AppContextType {
  products: ProductWithHistory[];
  sales: SaleWithItems[];
  clients: Client[];
  stockMovements: StockMovement[];
  recipes: RecipeWithIngredients[];
  costs: Cost[];
  loading: boolean;
  addProduct: (p: { name: string; description: string; brand: string; category: string; purchasePrice: number; salePrice: number; stock: number; lowStockThreshold: number }) => Promise<void>;
  updateProduct: (p: ProductWithHistory) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSale: (items: { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number }[], paymentMethod: string, clientId?: string) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  addClient: (c: { name: string; phone: string; email?: string }) => Promise<void>;
  updateClient: (c: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  payClientDebt: (clientId: string, amount: number) => Promise<void>;
  addStockEntry: (productId: string, quantity: number, reason: string) => Promise<void>;
  addRecipe: (r: { name: string; instructions: string; notes: string; ingredients: { productId: string; productName: string; quantity: number; unit: string }[] }) => Promise<void>;
  updateRecipe: (r: RecipeWithIngredients) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  addCost: (c: { name: string; type: string; value: number; productId?: string }) => Promise<void>;
  deleteCost: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductWithHistory[]>([]);
  const [sales, setSales] = useState<SaleWithItems[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [pRes, cRes, sRes, smRes, rRes, costRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('clients').select('*').order('name'),
        supabase.from('sales').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }),
        supabase.from('recipes').select('*').order('name'),
        supabase.from('costs').select('*').order('created_at', { ascending: false }),
      ]);

      const productsData = pRes.data || [];
      // Load price history for all products
      const phRes = await supabase.from('price_history').select('*').in('product_id', productsData.map(p => p.id)).order('recorded_at');
      const phMap: Record<string, PriceHistory[]> = {};
      (phRes.data || []).forEach(ph => {
        if (!phMap[ph.product_id]) phMap[ph.product_id] = [];
        phMap[ph.product_id].push(ph);
      });
      setProducts(productsData.map(p => ({ ...p, priceHistory: phMap[p.id] || [] })));

      setClients(cRes.data || []);

      // Load sale items
      const salesData = sRes.data || [];
      const siRes = await supabase.from('sale_items').select('*').in('sale_id', salesData.map(s => s.id));
      const siMap: Record<string, SaleItem[]> = {};
      (siRes.data || []).forEach(si => {
        if (!siMap[si.sale_id]) siMap[si.sale_id] = [];
        siMap[si.sale_id].push(si);
      });
      setSales(salesData.map(s => ({ ...s, items: siMap[s.id] || [] })));

      setStockMovements(smRes.data || []);

      // Load recipe ingredients
      const recipesData = rRes.data || [];
      const riRes = await supabase.from('recipe_ingredients').select('*').in('recipe_id', recipesData.map(r => r.id));
      const riMap: Record<string, RecipeIngredient[]> = {};
      (riRes.data || []).forEach(ri => {
        if (!riMap[ri.recipe_id]) riMap[ri.recipe_id] = [];
        riMap[ri.recipe_id].push(ri);
      });
      setRecipes(recipesData.map(r => ({ ...r, ingredients: riMap[r.id] || [] })));

      setCosts(costRes.data || []);
    } catch (err) {
      console.error('Refresh error:', err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const addProduct = useCallback(async (p: { name: string; description: string; brand: string; category: string; purchasePrice: number; salePrice: number; stock: number; lowStockThreshold: number }) => {
    if (!user) return;
    const { data, error } = await supabase.from('products').insert({
      user_id: user.id, name: p.name, description: p.description, brand: p.brand,
      category: p.category, purchase_price: p.purchasePrice, sale_price: p.salePrice,
      stock: p.stock, low_stock_threshold: p.lowStockThreshold,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await supabase.from('price_history').insert({ product_id: data.id, purchase_price: p.purchasePrice, sale_price: p.salePrice });
    await refresh();
  }, [user, refresh]);

  const updateProduct = useCallback(async (p: ProductWithHistory) => {
    if (!user) return;
    const old = products.find(o => o.id === p.id);
    const { error } = await supabase.from('products').update({
      name: p.name, description: p.description, brand: p.brand, category: p.category,
      purchase_price: p.purchase_price, sale_price: p.sale_price,
      stock: p.stock, low_stock_threshold: p.low_stock_threshold,
    }).eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    if (old && (old.purchase_price !== p.purchase_price || old.sale_price !== p.sale_price)) {
      await supabase.from('price_history').insert({ product_id: p.id, purchase_price: p.purchase_price, sale_price: p.sale_price });
    }
    await refresh();
  }, [user, products, refresh]);

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [refresh]);

  const addSale = useCallback(async (items: { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number }[], paymentMethod: string, clientId?: string) => {
    if (!user) return;
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    const { data: sale, error } = await supabase.from('sales').insert({
      user_id: user.id, total, payment_method: paymentMethod,
      client_id: clientId || null,
      status: paymentMethod === 'fiado' ? 'pendente' : 'pago',
    }).select().single();
    if (error) { toast.error(error.message); return; }

    // Insert sale items
    await supabase.from('sale_items').insert(items.map(i => ({
      sale_id: sale.id, product_id: i.productId, product_name: i.productName,
      quantity: i.quantity, unit_price: i.unitPrice, subtotal: i.subtotal,
    })));

    // Update stock and create movements
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        await supabase.from('products').update({ stock: Math.max(0, product.stock - item.quantity) }).eq('id', item.productId);
      }
      await supabase.from('stock_movements').insert({
        user_id: user.id, product_id: item.productId, type: 'saida',
        quantity: item.quantity, reason: 'Venda', reference: sale.id,
      });
    }

    // Update client debt if fiado
    if (paymentMethod === 'fiado' && clientId) {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        await supabase.from('clients').update({ total_owed: client.total_owed + total }).eq('id', clientId);
      }
    }

    // Auto-register cash movement if there's an open register
    const { data: openReg } = await supabase.from('cash_registers').select('id').eq('user_id', user.id).eq('status', 'aberto').maybeSingle();
    if (openReg) {
      const movType = paymentMethod === 'fiado' ? 'saida' : 'entrada';
      const category = paymentMethod === 'fiado' ? 'venda' : 'venda';
      await supabase.from('cash_movements').insert({
        cash_register_id: openReg.id, user_id: user.id,
        type: paymentMethod === 'fiado' ? 'entrada' : 'entrada',
        category: 'venda', amount: total,
        payment_method: paymentMethod === 'fiado' ? 'fiado' : paymentMethod,
        description: `Venda #${sale.id.slice(0, 8)}`,
        reference_id: sale.id,
      });
    }

    await refresh();
  }, [user, products, clients, refresh]);

  const deleteSale = useCallback(async (id: string) => {
    if (!user) return;
    const sale = sales.find(s => s.id === id);
    if (!sale) return;
    // Restore stock for each item
    for (const item of sale.items) {
      const product = products.find(p => p.id === item.product_id);
      if (product) {
        await supabase.from('products').update({ stock: product.stock + item.quantity }).eq('id', item.product_id);
      }
    }
    // Restore client debt if fiado
    if (sale.payment_method === 'fiado' && sale.client_id) {
      const client = clients.find(c => c.id === sale.client_id);
      if (client) {
        await supabase.from('clients').update({ total_owed: Math.max(0, client.total_owed - sale.total) }).eq('id', sale.client_id);
      }
    }
    // Delete stock movements, sale items, then sale
    await supabase.from('stock_movements').delete().eq('reference', id);
    await supabase.from('sale_items').delete().eq('sale_id', id);
    await supabase.from('sales').delete().eq('id', id);
    await refresh();
  }, [user, sales, products, clients, refresh]);

  const addClient = useCallback(async (c: { name: string; phone: string; email?: string }) => {
    if (!user) return;
    const { error } = await supabase.from('clients').insert({ user_id: user.id, name: c.name, phone: c.phone, email: c.email || '' });
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [user, refresh]);

  const updateClient = useCallback(async (c: Client) => {
    const { error } = await supabase.from('clients').update({ name: c.name, phone: c.phone, email: c.email }).eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [refresh]);

  const deleteClient = useCallback(async (id: string) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [refresh]);

  const payClientDebt = useCallback(async (clientId: string, amount: number) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const { error } = await supabase.from('clients').update({ total_owed: Math.max(0, client.total_owed - amount) }).eq('id', clientId);
    if (error) { toast.error(error.message); return; }
    // Mark pending sales as paid
    await supabase.from('sales').update({ status: 'pago' }).eq('client_id', clientId).eq('status', 'pendente');
    await refresh();
  }, [clients, refresh]);

  const addStockEntry = useCallback(async (productId: string, quantity: number, reason: string) => {
    if (!user) return;
    const product = products.find(p => p.id === productId);
    if (!product) return;
    await supabase.from('products').update({ stock: product.stock + quantity }).eq('id', productId);
    await supabase.from('stock_movements').insert({ user_id: user.id, product_id: productId, type: 'entrada', quantity, reason });
    await refresh();
  }, [user, products, refresh]);

  const addRecipe = useCallback(async (r: { name: string; instructions: string; notes: string; ingredients: { productId: string; productName: string; quantity: number; unit: string }[] }) => {
    if (!user) return;
    const { data, error } = await supabase.from('recipes').insert({ user_id: user.id, name: r.name, instructions: r.instructions, notes: r.notes }).select().single();
    if (error) { toast.error(error.message); return; }
    if (r.ingredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(r.ingredients.map(i => ({
        recipe_id: data.id, product_id: i.productId, product_name: i.productName, quantity: i.quantity, unit: i.unit,
      })));
    }
    await refresh();
  }, [user, refresh]);

  const updateRecipe = useCallback(async (r: RecipeWithIngredients) => {
    const { error } = await supabase.from('recipes').update({ name: r.name, instructions: r.instructions, notes: r.notes }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    // Replace ingredients
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', r.id);
    if (r.ingredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(r.ingredients.map(i => ({
        recipe_id: r.id, product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, unit: i.unit,
      })));
    }
    await refresh();
  }, [refresh]);

  const deleteRecipe = useCallback(async (id: string) => {
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [refresh]);

  const addCost = useCallback(async (c: { name: string; type: string; value: number; productId?: string }) => {
    if (!user) return;
    const { error } = await supabase.from('costs').insert({
      user_id: user.id, name: c.name, type: c.type, value: c.value, product_id: c.productId || null,
    });
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [user, refresh]);

  const deleteCost = useCallback(async (id: string) => {
    const { error } = await supabase.from('costs').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [refresh]);

  return (
    <AppContext.Provider value={{
      products, sales, clients, stockMovements, recipes, costs, loading,
      addProduct, updateProduct, deleteProduct,
      addSale, deleteSale, addClient, updateClient, deleteClient, payClientDebt,
      addStockEntry, addRecipe, updateRecipe, deleteRecipe,
      addCost, deleteCost, refresh,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
