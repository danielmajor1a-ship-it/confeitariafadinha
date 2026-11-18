import { describe, it, expect } from "vitest";
import { separarPedido } from "./encomendas";
describe("separarPedido", () => {
  it("separa quantidade e nome por linha", () => {
    expect(separarPedido("30 coxinhas\n- 20x kibe\n1 kg bolo de ninho\nBrigadeiro 50\nTorta")).toEqual([
      { qtd: "30", nome: "coxinhas" }, { qtd: "20", nome: "kibe" }, { qtd: "1 kg", nome: "bolo de ninho" },
      { qtd: "50", nome: "Brigadeiro" }, { qtd: "1", nome: "Torta" },
    ]);
  });
});
