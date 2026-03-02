export interface Product {
  id: string;
  name: string;
  description: string;
  brand: string;
  category: 'doce' | 'salgado' | 'bebida' | 'outro';
  purchasePrice: number;
  salePrice: number;
  stock: number;
  lowStockThreshold: number;
  priceHistory: PriceEntry[];
  createdAt: string;
}

export interface PriceEntry {
  date: string;
  purchasePrice: number;
  salePrice: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: 'entrada' | 'saida';
  quantity: number;
  reason: string;
  reference?: string;
  date: string;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  paymentMethod: 'dinheiro' | 'cartao' | 'fiado';
  clientId?: string;
  date: string;
  status: 'pago' | 'pendente';
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  totalOwed: number;
  createdAt: string;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  instructions: string;
  notes: string;
  createdAt: string;
}

export interface RecipeIngredient {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}

export interface Cost {
  id: string;
  name: string;
  type: 'fixo' | 'variavel';
  value: number;
  productId?: string;
  date: string;
}

export type CategoryLabel = {
  [key in Product['category']]: string;
};

export const CATEGORY_LABELS: CategoryLabel = {
  doce: 'Doce',
  salgado: 'Salgado',
  bebida: 'Bebida',
  outro: 'Outro',
};

export const PAYMENT_LABELS: Record<Sale['paymentMethod'], string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  fiado: 'Fiado',
};
