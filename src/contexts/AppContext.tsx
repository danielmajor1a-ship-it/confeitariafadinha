import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Product, Sale, SaleItem, Client, StockMovement, Recipe, Cost } from '@/types';

interface AppState {
  products: Product[];
  sales: Sale[];
  clients: Client[];
  stockMovements: StockMovement[];
  recipes: Recipe[];
  costs: Cost[];
}

interface AppContextType extends AppState {
  addProduct: (p: Omit<Product, 'id' | 'priceHistory' | 'createdAt'>) => void;
  updateProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;
  addSale: (items: SaleItem[], paymentMethod: Sale['paymentMethod'], clientId?: string) => void;
  addClient: (c: Omit<Client, 'id' | 'totalOwed' | 'createdAt'>) => void;
  updateClient: (c: Client) => void;
  deleteClient: (id: string) => void;
  payClientDebt: (clientId: string, amount: number) => void;
  addStockEntry: (productId: string, quantity: number, reason: string) => void;
  addRecipe: (r: Omit<Recipe, 'id' | 'createdAt'>) => void;
  updateRecipe: (r: Recipe) => void;
  deleteRecipe: (id: string) => void;
  addCost: (c: Omit<Cost, 'id' | 'date'>) => void;
  deleteCost: (id: string) => void;
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const STORAGE_KEY = 'confeitaria-data';

const defaultState: AppState = {
  products: [],
  sales: [],
  clients: [],
  stockMovements: [],
  recipes: [],
  costs: [],
};

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
  } catch {
    return defaultState;
  }
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState(prev => fn(prev)), []);

  const addProduct = useCallback((p: Omit<Product, 'id' | 'priceHistory' | 'createdAt'>) => {
    update(s => ({
      ...s,
      products: [...s.products, {
        ...p,
        id: uid(),
        priceHistory: [{ date: now(), purchasePrice: p.purchasePrice, salePrice: p.salePrice }],
        createdAt: now(),
      }],
    }));
  }, [update]);

  const updateProduct = useCallback((p: Product) => {
    update(s => ({
      ...s,
      products: s.products.map(old => {
        if (old.id !== p.id) return old;
        const priceChanged = old.purchasePrice !== p.purchasePrice || old.salePrice !== p.salePrice;
        return {
          ...p,
          priceHistory: priceChanged
            ? [...old.priceHistory, { date: now(), purchasePrice: p.purchasePrice, salePrice: p.salePrice }]
            : old.priceHistory,
        };
      }),
    }));
  }, [update]);

  const deleteProduct = useCallback((id: string) => {
    update(s => ({ ...s, products: s.products.filter(p => p.id !== id) }));
  }, [update]);

  const addSale = useCallback((items: SaleItem[], paymentMethod: Sale['paymentMethod'], clientId?: string) => {
    const total = items.reduce((sum, i) => sum + i.subtotal, 0);
    const saleId = uid();
    const date = now();

    update(s => {
      const newProducts = s.products.map(p => {
        const item = items.find(i => i.productId === p.id);
        return item ? { ...p, stock: Math.max(0, p.stock - item.quantity) } : p;
      });

      const newMovements = items.map(item => ({
        id: uid(),
        productId: item.productId,
        type: 'saida' as const,
        quantity: item.quantity,
        reason: 'Venda',
        reference: saleId,
        date,
      }));

      const newClients = paymentMethod === 'fiado' && clientId
        ? s.clients.map(c => c.id === clientId ? { ...c, totalOwed: c.totalOwed + total } : c)
        : s.clients;

      return {
        ...s,
        products: newProducts,
        stockMovements: [...s.stockMovements, ...newMovements],
        sales: [...s.sales, {
          id: saleId, items, total, paymentMethod, clientId, date,
          status: paymentMethod === 'fiado' ? 'pendente' as const : 'pago' as const,
        }],
        clients: newClients,
      };
    });
  }, [update]);

  const addClient = useCallback((c: Omit<Client, 'id' | 'totalOwed' | 'createdAt'>) => {
    update(s => ({ ...s, clients: [...s.clients, { ...c, id: uid(), totalOwed: 0, createdAt: now() }] }));
  }, [update]);

  const updateClient = useCallback((c: Client) => {
    update(s => ({ ...s, clients: s.clients.map(old => old.id === c.id ? c : old) }));
  }, [update]);

  const deleteClient = useCallback((id: string) => {
    update(s => ({ ...s, clients: s.clients.filter(c => c.id !== id) }));
  }, [update]);

  const payClientDebt = useCallback((clientId: string, amount: number) => {
    update(s => ({
      ...s,
      clients: s.clients.map(c => c.id === clientId ? { ...c, totalOwed: Math.max(0, c.totalOwed - amount) } : c),
      sales: s.sales.map(sale =>
        sale.clientId === clientId && sale.status === 'pendente' ? { ...sale, status: 'pago' as const } : sale
      ),
    }));
  }, [update]);

  const addStockEntry = useCallback((productId: string, quantity: number, reason: string) => {
    update(s => ({
      ...s,
      products: s.products.map(p => p.id === productId ? { ...p, stock: p.stock + quantity } : p),
      stockMovements: [...s.stockMovements, {
        id: uid(), productId, type: 'entrada', quantity, reason, date: now(),
      }],
    }));
  }, [update]);

  const addRecipe = useCallback((r: Omit<Recipe, 'id' | 'createdAt'>) => {
    update(s => ({ ...s, recipes: [...s.recipes, { ...r, id: uid(), createdAt: now() }] }));
  }, [update]);

  const updateRecipe = useCallback((r: Recipe) => {
    update(s => ({ ...s, recipes: s.recipes.map(old => old.id === r.id ? r : old) }));
  }, [update]);

  const deleteRecipe = useCallback((id: string) => {
    update(s => ({ ...s, recipes: s.recipes.filter(r => r.id !== id) }));
  }, [update]);

  const addCost = useCallback((c: Omit<Cost, 'id' | 'date'>) => {
    update(s => ({ ...s, costs: [...s.costs, { ...c, id: uid(), date: now() }] }));
  }, [update]);

  const deleteCost = useCallback((id: string) => {
    update(s => ({ ...s, costs: s.costs.filter(c => c.id !== id) }));
  }, [update]);

  return (
    <AppContext.Provider value={{
      ...state,
      addProduct, updateProduct, deleteProduct,
      addSale, addClient, updateClient, deleteClient, payClientDebt,
      addStockEntry, addRecipe, updateRecipe, deleteRecipe,
      addCost, deleteCost,
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
