interface TicketSale {
  created_at: string;
  total: number;
  status: string;
  items: { product_id: string; product_name?: string; quantity: number; subtotal: number }[];
  payments?: { card_tax_amount: number }[];
}

interface TicketProduct {
  id: string;
  purchase_price: number;
  name?: string;
  sold_by_weight?: boolean;
}

export interface DailyTicketProduct {
  id: string;
  name: string;
  quantity: number;
  byWeight: boolean;
  revenue: number;
  profit: number;
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
  products: DailyTicketProduct[];
}

// Purchase cost is expressed per stock unit, including per gram for weight products.
export function calculateDailyTickets(sales: TicketSale[], products: TicketProduct[]): DailyTicket[] {
  const catalog = new Map(products.map(product => [product.id, product]));
  const days = new Map<string, { count: number; revenue: number; cost: number; fees: number; products: Map<string, DailyTicketProduct> }>();
  for (const sale of sales) {
    if (sale.status === 'cancelada' || sale.status === 'cancelado') continue;
    const eligible = sale.items.filter(item => {
      const cost = catalog.get(item.product_id)?.purchase_price;
      return cost !== undefined && Number.isFinite(cost) && cost > 0 && item.quantity > 0 && Number.isFinite(item.subtotal) && item.subtotal >= 0;
    });
    if (!eligible.length) continue;
    const subtotal = sale.items.reduce((sum, item) => sum + (Number.isFinite(item.subtotal) ? Math.max(0, item.subtotal) : 0), 0);
    if (subtotal <= 0) continue;
    // Allocate sale-level discounts and recorded fees proportionally to each item.
    const revenueFactor = sale.total / subtotal;
    const feeTotal = (sale.payments ?? []).reduce((sum, payment) => sum + (payment.card_tax_amount || 0), 0);
    const day = new Date(sale.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const row = days.get(day) ?? { count: 0, revenue: 0, cost: 0, fees: 0, products: new Map<string, DailyTicketProduct>() };
    row.count += 1;
    for (const item of eligible) {
      const product = catalog.get(item.product_id);
      if (!product) continue;
      const revenue = item.subtotal * revenueFactor;
      const cost = product.purchase_price * item.quantity;
      const fees = feeTotal * item.subtotal / subtotal;
      row.revenue += revenue;
      row.cost += cost;
      row.fees += fees;
      const detail = row.products.get(item.product_id) ?? {
        id: item.product_id, name: product.name ?? item.product_name ?? 'Produto',
        quantity: 0, byWeight: product.sold_by_weight ?? false, revenue: 0, profit: 0,
      };
      detail.quantity += item.quantity;
      detail.revenue += revenue;
      detail.profit += revenue - cost - fees;
      row.products.set(item.product_id, detail);
    }
    days.set(day, row);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, row]) => {
    const profit = row.revenue - row.cost - row.fees;
    const [year, month, date] = day.split('-');
    return {
      day, date: `${date}/${month}/${year}`, count: row.count, revenue: row.revenue,
      ticket: row.revenue / row.count, profit,
      products: [...row.products.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)),
      profitPerSale: profit === null ? null : profit / row.count,
      margin: profit === null || row.revenue <= 0 ? null : profit / row.revenue * 100,
    };
  });
}