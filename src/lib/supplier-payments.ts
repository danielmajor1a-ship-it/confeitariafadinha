export const MATCH_TOLERANCE = 0.02;

export const METHOD_LABELS: Record<string, string> = {
  caixa: "Dinheiro do caixa",
  pix_conta: "PIX da conta",
  boleto_banco: "Boleto no banco",
  transferencia: "Transferência",
  outro: "Outro",
};

export const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export type PayStatus = "paga" | "parcial" | "aberta";

export function payStatus(total: number, paid: number): PayStatus {
  if (paid <= 0.009) return "aberta";
  if (paid >= total - 0.01) return "paga";
  return "parcial";
}

export const STATUS_LABELS: Record<PayStatus, string> = { paga: "Paga", parcial: "Paga em parte", aberta: "Em aberto" };

/** Value matches when within 2% of the payment amount. */
export function valueMatches(amount: number, open: number, tol = MATCH_TOLERANCE) {
  if (amount <= 0 || open <= 0) return false;
  return Math.abs(open - amount) <= amount * tol + 1e-9;
}

export function sameSupplier(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}
