import { describe, expect, it } from 'vitest';
import { calculateDailyTickets } from './daily-tickets';

const sale = (total: number, quantity = 1) => ({ created_at: '2026-10-10T15:00:00Z', total, status: 'concluida', items: [{ product_id: 'p', quantity }], payments: [{ card_tax_amount: 1 }] });
describe('daily ticket estimates', () => {
  it('uses total revenue divided by sale count and subtracts cost and fees', () => {
    const [day] = calculateDailyTickets([sale(20), sale(10)], [{ id: 'p', purchase_price: 4 }]);
    expect(day.ticket).toBe(15);
    expect(day.profit).toBe(20);
    expect(day.profitPerSale).toBe(10);
  });
  it('does not present missing costs as profit', () => {
    expect(calculateDailyTickets([sale(20)], [{ id: 'p', purchase_price: 0 }])[0].profit).toBeNull();
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