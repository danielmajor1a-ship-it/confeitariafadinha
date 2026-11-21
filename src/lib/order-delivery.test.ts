import { describe, expect, it } from "vitest";
import { canDeliverOrder, overdueOrders, orderCheckoutAfterLogin } from "./order-delivery";

describe("entrega de encomendas atrasadas", () => {
  const order = { status: "em_producao", data_entrega: "2026-11-20", hora_entrega: "07:00:00" };
  it("mantém disponível a entrega mesmo após 27 horas e 54 minutos de atraso", () => {
    expect(canDeliverOrder(order)).toBe(true);
    expect(overdueOrders([order], "2026-11-21")).toEqual([order]);
  });
  it("permite entrega de agendadas, mas não de entregues ou canceladas", () => {
    expect(canDeliverOrder({ status: "agendada" })).toBe(true);
    expect(canDeliverOrder({ status: "entregue" })).toBe(false);
    expect(canDeliverOrder({ status: "cancelada" })).toBe(false);
  });
  it("não mistura encomendas de hoje com as pendentes de dias anteriores", () => {
    expect(overdueOrders([{ ...order, data_entrega: "2026-11-21" }], "2026-11-21")).toEqual([]);
  });
  it("retoma somente a entrega da encomenda após entrar na conta", () => {
    const path = "/vendas?encomenda=c2b63059-0892-4fbe-b92f-d625ae66b292";
    expect(orderCheckoutAfterLogin(path)).toBe(path);
    expect(orderCheckoutAfterLogin("https://example.com")).toBe("/");
    expect(orderCheckoutAfterLogin(undefined)).toBe("/");
  });
});