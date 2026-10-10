export const CATEGORY_LABELS: Record<string, string> = {
  doce: 'Doce',
  encomenda: 'Encomenda',
  balcao: 'Balcão',
  revenda: 'Revenda',
  bebida: 'Bebida',
  outro: 'Outro',
};

export const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Crédito',
  debito: 'Débito',
  fiado: 'Fiado',
  misto: 'Misto',
};

export interface PaymentEntry {
  method: string;
  amount: number;
  installments?: number;
  tax_rate?: number;
  tax_amount?: number;
  net_amount?: number;
}

export const EXPENSE_TYPE_LABELS: Record<string, string> = {
  compra_mercadoria: 'Compra de mercadoria',
  despesa_fixa: 'Despesa fixa',
  despesa_variavel: 'Despesa variável',
  investimento: 'Investimento',
  retirada_dona: 'Retirada da dona',
};
