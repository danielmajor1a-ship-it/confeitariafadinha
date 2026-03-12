export const CATEGORY_LABELS: Record<string, string> = {
  doce: 'Doce',
  salgado: 'Salgado',
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
