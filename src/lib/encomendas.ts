import { supabase } from "@/integrations/supabase/client";

// Tabelas novas ainda não estão nos tipos gerados
export const db = supabase as any;

export type EncomendaStatus = "agendada" | "em_producao" | "entregue" | "cancelada";

export interface Encomenda {
  id: string;
  venda_id: string | null;
  venda_entrega_id: string | null;
  cliente_nome: string;
  cliente_telefone: string | null;
  descricao: string;
  quantidade: number;
  unidade: string | null;
  observacoes: string | null;
  data_entrega: string;
  hora_entrega: string;
  tipo: "retirada" | "entrega";
  status: EncomendaStatus;
  iniciada_em: string | null;
  entregue_em: string | null;
  valor_total: number | null;
  valor_sinal: number;
  linhas?: Linha[] | null;
  endereco?: string | null;
  created_at: string;
}

export interface Linha { qtd: string; nome: string }

/** Itens em linhas ("20 × Coxinha"); encomendas antigas usam a descrição solta. */
export function linhasDe(e: { linhas?: Linha[] | null; descricao: string; quantidade: number; unidade: string | null }): string[] {
  const l = (e.linhas || []).filter(x => x?.nome?.trim());
  if (l.length) return l.map(x => `${String(x.qtd || "").trim() || "1"} × ${x.nome.trim()}`);
  const q = Number(e.quantidade);
  const extra = q && q !== 1 || e.unidade ? ` — ${e.quantidade} ${e.unidade || ""}`.trimEnd() : "";
  return [`${e.descricao}${extra}`];
}

export interface EncomendaItem {
  id?: string;
  encomenda_id?: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
}

export interface ConfigProducao {
  capacidade_diaria: number;
  faixa_tranquilo_min: number;
  faixa_atencao_min: number;
  faixa_apertado_min: number;
  painel_token: string;
}

export const STATUS_LABELS: Record<EncomendaStatus, string> = {
  agendada: "Agendada",
  em_producao: "Em produção",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

export type Termo = "tranquilo" | "atencao" | "apertado" | "urgente" | "atrasada";

export function minutosRestantes(data: string, hora: string, now = new Date()) {
  const [y, m, d] = data.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const alvo = new Date(y, m - 1, d, hh, mm);
  return Math.round((alvo.getTime() - now.getTime()) / 60000);
}

export function termometro(min: number, f: { tranquilo: number; atencao: number; apertado: number }): Termo {
  if (min < 0) return "atrasada";
  if (min > f.tranquilo) return "tranquilo";
  if (min > f.atencao) return "atencao";
  if (min > f.apertado) return "apertado";
  return "urgente";
}

export const fmtHora = (h: string) => h?.slice(0, 5) ?? "";
export const fmtData = (d: string) => d.split("-").reverse().join("/");
export const fmtDuracao = (min: number) => {
  const a = Math.abs(min);
  const h = Math.floor(a / 60), m = a % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
};

export function fichaTexto(e: { cliente_nome: string; descricao: string; quantidade: number; unidade: string | null; observacoes: string | null; tipo: string; data_entrega: string; hora_entrega: string; linhas?: Linha[] | null; endereco?: string | null }) {
  const line = "-".repeat(32);
  return [
    "CONFEITARIA FADINHA", line, "ENCOMENDA", line,
    `Cliente: ${e.cliente_nome}`, "", ...linhasDe(e),
    e.observacoes ? `Obs: ${e.observacoes}` : "",
    `Tipo: ${e.tipo === "entrega" ? "ENTREGA" : "RETIRADA"}`,
    e.tipo === "entrega" && e.endereco ? `End: ${e.endereco}` : "", line,
    `ENTREGA: ${fmtData(e.data_entrega)} ${fmtHora(e.hora_entrega)}`, line, "", "",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export const isAndroid = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

export function imprimirViaRawBT(texto: string) {
  window.location.href = "rawbt:" + encodeURIComponent(texto);
}

const PRINT_KEY = "encomendas.imprimirAoIniciar";
export function getPrintPref(): "sim" | "nao" | null {
  try { return (localStorage.getItem(PRINT_KEY) as any) || null; } catch { return null; }
}
export function setPrintPref(v: "sim" | "nao") {
  try { localStorage.setItem(PRINT_KEY, v); } catch { /* ignore */ }
}

export function gerarToken() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const arr = new Uint32Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, n => chars[n % chars.length]).join("");
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Imprime a ficha na própria tela (sem abrir aba nova, que perde o login na pré-visualização). */
export async function imprimirFicha(id: string) {
  const { data: e, error } = await db.from("encomendas").select("*").eq("id", id).maybeSingle();
  if (error || !e) throw new Error("Encomenda não encontrada");
  if (isAndroid()) { imprimirViaRawBT(fichaTexto(e)); return; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 58mm auto; margin: 0; }
    body { margin: 0; background: #fff; }
    .ficha { width: 48mm; margin: 0 auto; padding: 2mm 0; font-family: ui-monospace, "Courier New", monospace; font-size: 11px; line-height: 1.3; color: #000; }
    hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .c { text-align: center; font-weight: 700; }
  </style></head><body><div class="ficha">
    <div class="c">CONFEITARIA FADINHA</div><hr/>
    <div class="c" style="font-size:13px">ENCOMENDA</div><hr/>
    <div>Cliente: <b>${esc(e.cliente_nome)}</b></div>
    <div style="margin-top:4px;font-weight:700">${linhasDe(e).map(esc).join("<br/>")}</div>
    ${e.observacoes ? `<div>Obs: ${esc(e.observacoes)}</div>` : ""}
    <div>Tipo: ${e.tipo === "entrega" ? "ENTREGA" : "RETIRADA"}</div>
    ${e.tipo === "entrega" && e.endereco ? `<div>End: ${esc(e.endereco)}</div>` : ""}<hr/>
    <div class="c" style="font-size:16px;font-weight:800">${esc(fmtData(e.data_entrega))}<br/>${esc(fmtHora(e.hora_entrega))}</div><hr/>
  </div></body></html>`;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60000);
  }, 250);
}

/** Separa um pedido colado do WhatsApp em linhas (quantidade + nome). */
export function separarPedido(texto: string): Linha[] {
  return texto.split(/\r?\n|;/).map(l => l.replace(/^[\s\-•*·>]+|\s+$/g, "").replace(/^\d+[.)]\s+/, "")).filter(Boolean).map(l => {
    const m = l.match(/^(\d+(?:[.,]\d+)?\s*(?:kg|g|un|und|unid|unidades?|cento|dz|d[uú]zias?)?)\s*(?:x|×|-|:|de\s)?\s*(.+)$/i);
    if (m && m[2].trim()) return { qtd: m[1].trim(), nome: m[2].trim() };
    const f = l.match(/^(.+?)\s*[-:x×]?\s*(\d+(?:[.,]\d+)?\s*(?:kg|g|un|und)?)$/i);
    if (f && f[1].trim()) return { qtd: f[2].trim(), nome: f[1].trim() };
    return { qtd: "1", nome: l };
  });
}

// ---------- Reconhecer produtos a partir das linhas do pedido ----------
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const raiz = (w: string) => w.replace(/(oes|aes|ns|es|s)$/, "");
const PARADAS = new Set(["de", "da", "do", "com", "e", "para", "pra", "kg", "un", "und", "unid", "cento", "dz", "mini", "festa"]);
/** Salgados fritos de festa que no sistema entram como um único produto. */
const FRITOS = ["cox", "quib", "kib", "risol", "risoi", "risori", "bolinha", "enroladinh", "pastel", "croquete", "salsicha", "churrinh"];

export interface ProdutoBase { id: string; name: string; sale_price: number; category?: string; sells?: boolean; sold_by_weight?: boolean }

function quantidadeDe(qtd: string, byW: boolean): number {
  const t = norm(qtd);
  const n = Number((t.match(/\d+(?:[.,]\d+)?/)?.[0] || "1").replace(",", ".")) || 1;
  if (/cento/.test(t)) return n * 100;
  if (/\bdz|duzia/.test(t)) return n * 12;
  if (byW) return /kg/.test(t) ? n * 1000 : /\dg|\bg\b/.test(t) ? n : n * 1000;
  return n;
}

export function reconhecerProduto(nome: string, produtos: ProdutoBase[]): ProdutoBase | null {
  const vendaveis = produtos.filter(p => p.sells !== false);
  const n = norm(nome);
  if (FRITOS.some(k => n.includes(k))) {
    const fritos = vendaveis.filter(p => norm(p.name).includes("salgado frito"));
    return fritos.find(p => p.category === "encomenda") || fritos[0] || null;
  }
  const tokens = n.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !PARADAS.has(w)).map(raiz);
  if (!tokens.length) return null;
  let best: ProdutoBase | null = null, bestScore = 0, empate = false;
  for (const p of vendaveis) {
    const pt = new Set(norm(p.name).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !PARADAS.has(w)).map(raiz));
    if (!pt.size) continue;
    const hits = tokens.filter(t => pt.has(t)).length;
    const score = hits / Math.max(tokens.length, pt.size) + hits / 100;
    if (score > bestScore + 1e-9) { best = p; bestScore = score; empate = false; }
    else if (Math.abs(score - bestScore) < 1e-9) empate = true;
  }
  return best && bestScore >= 0.5 && !empate ? best : null;
}

/** Junta as linhas do pedido em produtos do cadastro (somando quantidades). */
export function reconhecerItens(linhas: Linha[], produtos: ProdutoBase[]) {
  const itens: EncomendaItem[] = [];
  const naoReconhecidas: Linha[] = [];
  for (const l of linhas.filter(x => x.nome?.trim())) {
    const p = reconhecerProduto(l.nome, produtos);
    if (!p) { naoReconhecidas.push(l); continue; }
    const byW = !!p.sold_by_weight;
    const q = quantidadeDe(l.qtd || "1", byW);
    const ex = itens.find(i => i.produto_id === p.id);
    if (ex) ex.quantidade += q;
    else itens.push({ produto_id: p.id, quantidade: q, preco_unitario: byW ? Number(p.sale_price) / 1000 : Number(p.sale_price) });
  }
  return { itens, naoReconhecidas };
}
