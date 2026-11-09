import { describe, it, expect, vi, afterEach } from "vitest";
import { resolvePeriod } from "@/components/PeriodPicker";

afterEach(() => vi.useRealTimers());

describe("resolvePeriod", () => {
  it("semana vai de segunda a domingo", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 6, 12)); // sexta 06/11/2026
    const r = resolvePeriod({ period: "week" })!;
    expect(r.from.getDate()).toBe(2); expect(r.from.getDay()).toBe(1);
    expect(r.to.getDate()).toBe(8); expect(r.to.getDay()).toBe(0);
  });
  it("hoje cobre só o dia de hoje", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 9, 10, 32)); // seg 09/11/2026
    const r = resolvePeriod({ period: "today" })!;
    expect(r.from.getTime()).toBe(new Date(2026, 10, 9, 0, 0, 0, 0).getTime());
    expect(r.to.getTime()).toBe(new Date(2026, 10, 9, 23, 59, 59, 999).getTime());
  });
  it("personalizado sem as duas datas não retorna período", () => {
    expect(resolvePeriod({ period: "custom", start: new Date() })).toBeNull();
  });
});
