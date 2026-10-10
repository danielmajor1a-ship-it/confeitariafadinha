import { describe, expect, it } from 'vitest';
import { calculateDailyTickets } from './daily-tickets';

const sale = (total: number, quantity = 1) => ({ created_at: '2026-10-10T15:00:00Z', total, status: 'concluida', items: [{ product_id: 'p', product_name: 'Produto P', quantity, subtotal: total }], payments: [{ card_tax_amount: 1 }] });
describe('daily ticket estimates', () => {
  it('uses total revenue divided by sale count and subtracts cost and fees', () => {
    const [day] = calculateDailyTickets([sale(20), sale(10)], [{ id: 'p', purchase_price: 4 }]);
    expect(day.ticket).toBe(15);
    expect(day.profit).toBe(20);
    expect(day.profitPerSale).toBe(10);
  });
  it('excludes sales containing only missing-cost products', () => {
    expect(calculateDailyTickets([sale(20)], [{ id: 'p', purchase_price: 0 }])).toEqual([]);
    expect(calculateDailyTickets([sale(20)], [])).toEqual([]);
  });
  it('excludes missing-cost items and allocates discounts and fees in mixed sales', () => {
    const mixed = { ...sale(27), items: [
      { product_id: 'p', product_name: 'Produto P', quantity: 1, subtotal: 20 },
      { product_id: 'unknown', quantity: 1, subtotal: 10 },
    ], payments: [{ card_tax_amount: 3 }] };
    const [day] = calculateDailyTickets([mixed, { ...sale(50), items: [{ product_id: 'unknown', quantity: 1, subtotal: 50 }] }], [{ id: 'p', purchase_price: 4, name: 'Produto com custo' }]);
    expect(day.count).toBe(1);
    expect(day.ticket).toBe(18);
    expect(day.revenue).toBe(18);
    expect(day.profit).toBe(12);
    expect(day.products).toEqual([{ id: 'p', name: 'Produto com custo', quantity: 1, byWeight: false, revenue: 18, profit: 12 }]);
  });
  it('aggregates listed products and excludes invalid costs and empty sales', () => {
    const [day] = calculateDailyTickets([sale(20), sale(10), { ...sale(8), items: [] }], [{ id: 'p', purchase_price: 4 }]);
    expect(day.products[0].quantity).toBe(2);
    expect(day.products[0].profit).toBe(day.profit);
    for (const cost of [-1, NaN, Infinity]) {
      expect(calculateDailyTickets([sale(20)], [{ id: 'p', purchase_price: cost }])).toEqual([]);
    }
  });
  it('uses per-gram stock costs without dividing twice', () => {
    expect(calculateDailyTickets([sale(21, 350)], [{ id: 'p', purchase_price: .04 }])[0].profit).toBe(6);
  });
  it('groups by Sao Paulo date and excludes canceled sales', () => {
    const rows = calculateDailyTickets([{ ...sale(20), created_at: '2026-10-10T01:00:00Z' }, { ...sale(10), status: 'cancelada' }], [{ id: 'p', purchase_price: 4 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('09/10/2026');
  });
});