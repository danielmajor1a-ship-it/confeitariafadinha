import { describe, expect, it } from 'vitest';
import { SALE_PAYMENT_METHODS } from '@/types';

describe('Métodos de pagamento após retirada do crédito de cliente', () => {
  it('não permite crédito de cliente como pagamento', () => {
    expect(SALE_PAYMENT_METHODS).not.toContain('credito_loja');
  });

  it('mantém fiado e crédito de cartão', () => {
    expect(SALE_PAYMENT_METHODS).toContain('fiado');
    expect(SALE_PAYMENT_METHODS).toContain('credito');
  });
});