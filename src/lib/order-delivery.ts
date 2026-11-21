export function canDeliverOrder(order: { status: string }) {
  return order.status === "agendada" || order.status === "em_producao";
}

export function overdueOrders<T extends { status: string; data_entrega: string }>(orders: T[], today: string) {
  return orders.filter(order => canDeliverOrder(order) && order.data_entrega < today);
}

/** Only resume an order checkout after login, never an external destination. */
export function orderCheckoutAfterLogin(from: unknown): string {
  return typeof from === "string" && /^\/vendas\?encomenda=[a-f0-9-]{36}$/i.test(from) ? from : "/";
}