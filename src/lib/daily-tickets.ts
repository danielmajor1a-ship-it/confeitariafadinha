interface TicketSale {
  created_at: string;
  total: number;
  status: string;
  items: { product_id: string; quantity: number }[];
  payments?: { card_tax_amount: number }[];
}

interface TicketProduct {
  id: string;
  purchase_price: number;
}

export interface DailyTicket {
  day: string;
  date: string;
  count: number;
  revenue: number;
  ticket: number;
  profit: number | null;
  profitPerSale: number | null;
  margin: number | null;
  missingCost: boolean;
}

// Purchase cost is expressed per stock unit, including per gram for weight products.
export function calculateDailyTickets(sales: TicketSale[], products: TicketProduct[]): DailyTicket[] {
  const costs = new Map(products.map(product => [product.id, product.purchase_price]));
  const days = new Map<string, { count: number; revenue: number; cost: number; fees: number; missingCost: boolean }>();
  for (const sale of sales) {
    if (sale.status === 'cancelada' || sale.status === 'cancelado') continue;
    const day = new Date(sale.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const row = days.get(day) ?? { count: 0, revenue: 0, cost: 0, fees: 0, missingCost: false };
    row.count += 1;
    row.revenue += sale.total;
    row.fees += (sale.payments ?? []).reduce((sum, payment) => sum + (payment.card_tax_amount || 0), 0);
    if (sale.items.length === 0) row.missingCost = true;
    for (const item of sale.items) {
      const cost = costs.get(item.product_id);
      if (cost === undefined || cost <= 0) row.missingCost = true;
      else row.cost += cost * item.quantity;
    }
    days.set(day, row);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, row]) => {
    const profit = row.missingCost ? null : row.revenue - row.cost - row.fees;
    const [year, month, date] = day.split('-');
    return {
      day, date: `${date}/${month}/${year}`, count: row.count, revenue: row.revenue,
      ticket: row.revenue / row.count, profit, missingCost: row.missingCost,
      profitPerSale: profit === null ? null : profit / row.count,
      margin: profit === null || row.revenue <= 0 ? null : profit / row.revenue * 100,
    };
  });
}