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

import { reconhecerItens } from "./encomendas";
describe("reconhecerItens", () => {
  const prods = [
    { id: "f", name: "Salgado frito festa", sale_price: 0.7, category: "encomenda" },
    { id: "b", name: "Salgado frito ", sale_price: 3, category: "balcao" },
    { id: "c", name: "Bolo churros (médio)", sale_price: 30 },
    { id: "n", name: "Bolo de ninho com morango (kg)", sale_price: 65, sold_by_weight: true },
  ];
  it("soma salgados fritos no produto de festa e reconhece bolos", () => {
    const r = reconhecerItens([
      { qtd: "100", nome: "coxinhas" }, { qtd: "50", nome: "bolinhas de queijo" }, { qtd: "50", nome: "risólis" },
      { qtd: "50", nome: "quibes" }, { qtd: "50", nome: "enroladinhos" }, { qtd: "1", nome: "bolo de churros" },
      { qtd: "2 kg", nome: "bolo de ninho com morango" }, { qtd: "1", nome: "torta x" },
    ], prods);
    expect(r.itens).toEqual([
      { produto_id: "f", quantidade: 300, preco_unitario: 0.7 },
      { produto_id: "c", quantidade: 1, preco_unitario: 30 },
      { produto_id: "n", quantidade: 2000, preco_unitario: 0.065 },
    ]);
    expect(r.naoReconhecidas.map(l => l.nome)).toEqual(["torta x"]);
  });
});
