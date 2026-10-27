import { describe, it, expect } from "vitest";
import { valueMatches, payStatus } from "./supplier-payments";

describe("supplier payment rules", () => {
  it("accepts up to 2% difference", () => {
    expect(valueMatches(100, 102)).toBe(true);
    expect(valueMatches(100, 98)).toBe(true);
  });
  it("rejects more than 2% difference", () => {
    expect(valueMatches(100, 102.5)).toBe(false);
  });
  it("status paid / partial / open", () => {
    expect(payStatus(120, 120)).toBe("paga");
    expect(payStatus(120, 60)).toBe("parcial");
    expect(payStatus(120, 0)).toBe("aberta");
  });
});

import { isDeferredSupplier } from "./supplier-payments";
describe("isDeferredSupplier", () => {
  it("Sorocaba Refrescos é pago depois", () => {
    expect(isDeferredSupplier("SOROCABA REFRESCOS S.A.")).toBe(true);
    expect(isDeferredSupplier("Sorocaba Refresco SA")).toBe(true);
  });
  it("outros fornecedores pagam na hora", () => {
    expect(isDeferredSupplier("Ameripan")).toBe(false);
    expect(isDeferredSupplier("")).toBe(false);
  });
});
