import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { db, fmtDuracao, fmtHora, fmtData, minutosRestantes, termometro, type Termo } from "@/lib/encomendas";

interface PItem {
  id: string; cliente: string; descricao: string; quantidade: number; unidade: string | null; observacoes: string | null;
  data_entrega: string; hora_entrega: string; tipo: string; status: string; iniciada_em: string | null; entregue_em: string | null;
}

// Cores fixas do painel (alto contraste para baixa visão), isoladas do tema do sistema
const C = { bg: "#0B0B0F", fg: "#FFFFFF", card: "#17171F", line: "#2A2A35", muted: "#C9C9D6" };
const TERMO: Record<Termo, { label: string; icon: string; color: string; pct: number }> = {
  tranquilo: { label: "TRANQUILO", icon: "✔", color: "#22C55E", pct: 20 },
  atencao: { label: "ATENÇÃO", icon: "!", color: "#FACC15", pct: 50 },
  apertado: { label: "APERTADO", icon: "!!", color: "#FB923C", pct: 75 },
  urgente: { label: "URGENTE", icon: "⚠", color: "#EF4444", pct: 92 },
  atrasada: { label: "ATRASADA", icon: "✖", color: "#DC2626", pct: 100 },
};
const SCALE_KEY = "painel.scale";

export default function ProductionPanel() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<{ faixas: any; hoje: string; encomendas: PItem[] } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [now, setNow] = useState(new Date());
  const [logged, setLogged] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "iniciar" | "entregar"; item: PItem } | null>(null);
  const [printAsk, setPrintAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(() => { try { return Number(localStorage.getItem(SCALE_KEY)) || 1; } catch { return 1; } });
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await db.rpc("get_painel", { p_token: token });
    if (error) { setInvalid(true); return; }
    setInvalid(false);
    setData(data);
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setLogged(!!data.session)); }, []);
  useEffect(() => { try { localStorage.setItem(SCALE_KEY, String(scale)); } catch { /* ignore */ } }, [scale]);

  // Fonte e manifest só nesta tela
  useEffect(() => {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap";
    const man = document.createElement("link");
    man.rel = "manifest"; man.href = "/manifest-painel.webmanifest";
    document.head.append(font, man);
    return () => { font.remove(); man.remove(); };
  }, []);

  // Manter a tela acesa
  useEffect(() => {
    let lock: any = null;
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request("screen"); } catch { /* ignore */ } };
    const vis = () => { if (document.visibilityState === "visible") req(); };
    req();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); try { lock?.release(); } catch { /* ignore */ } };
  }, []);

  // Rolagem automática lenta quando a lista não cabe
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let dir = 1;
    const t = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight + 4) return;
      el.scrollTop += dir;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setTimeout(() => { el.scrollTop = 0; }, 2000); }
    }, 60);
    return () => clearInterval(t);
  }, [data]);

  async function doConfirm() {
    if (!confirm || busy) return;
    if (confirm.kind === "entregar") { navigate(`/vendas?encomenda=${confirm.item.id}`); return; }
    setBusy(true);
    const { error } = await db.rpc("iniciar_encomenda", { p_token: token, p_id: confirm.item.id });
    setBusy(false);
    const id = confirm.item.id;
    setConfirm(null);
    if (!error) { await load(); setPrintAsk(id); }
  }

  const base: React.CSSProperties = {
    background: C.bg, color: C.fg, minHeight: "100vh",
    fontFamily: "'Atkinson Hyperlegible', system-ui, sans-serif", fontSize: `calc(clamp(24px, 1.2vw + 18px, 34px) * ${scale})`,
  };

  if (invalid) return <div style={{ ...base, display: "grid", placeItems: "center" }}><p style={{ fontWeight: 700, fontSize: "1.5em" }}>Link inválido</p></div>;
  if (!data) return <div style={{ ...base, display: "grid", placeItems: "center" }}><p>Carregando...</p></div>;

  const f = data.faixas;
  const hojeStr = data.hoje;
  const pend = data.encomendas.filter(e => e.status === "agendada" || e.status === "em_producao");
  const doDia = pend.filter(e => e.data_entrega <= hojeStr);
  const proxima = doDia[0] || pend[0];
  const restoHoje = doDia.filter(e => e.id !== proxima?.id);
  const amanhaD = new Date(hojeStr + "T12:00:00"); amanhaD.setDate(amanhaD.getDate() + 1);
  const amanhaStr = amanhaD.toISOString().slice(0, 10);
  const amanha = pend.filter(e => e.data_entrega === amanhaStr);
  const futuros = pend.filter(e => e.data_entrega > amanhaStr);
  const entregues = data.encomendas.filter(e => e.status === "entregue");

  const Termometro = ({ e }: { e: PItem }) => {
    const min = minutosRestantes(e.data_entrega, e.hora_entrega, now);
    const t = TERMO[termometro(min, f)];
    const st = termometro(min, f);
    return (
      <div style={{ marginTop: "0.4em" }}>
        <div style={{ height: "0.7em", background: C.line, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${t.pct}%`, height: "100%", background: t.color, animation: st === "urgente" ? "pulse 1s infinite" : undefined }} />
        </div>
        <div style={{ display: "flex", gap: "0.4em", alignItems: "center", fontWeight: 700, color: t.color, marginTop: "0.2em" }}>
          <span aria-hidden style={{ border: `3px solid ${t.color}`, borderRadius: 8, padding: "0 0.3em" }}>{t.icon}</span>
          <span>{t.label}</span>
          <span style={{ color: C.fg, fontWeight: 400 }}>{min < 0 ? `há ${fmtDuracao(min)}` : `faltam ${fmtDuracao(min)}`}</span>
        </div>
      </div>
    );
  };

  const Botoes = ({ e }: { e: PItem }) => (
    <div style={{ display: "flex", gap: "0.5em", marginTop: "0.5em", flexWrap: "wrap" }}>
      {e.status === "agendada" && <button style={btn("#22C55E")} onClick={() => setConfirm({ kind: "iniciar", item: e })}>▶ INICIAR</button>}
      {logged && <button style={btn("#60A5FA")} onClick={() => setConfirm({ kind: "entregar", item: e })}>✓ ENTREGAR</button>}
    </div>
  );

  const Item = ({ e, big }: { e: PItem; big?: boolean }) => (
    <div style={{ background: C.card, border: `2px solid ${C.line}`, borderRadius: 16, padding: "0.6em 0.8em", marginBottom: "0.6em" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5em", alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: big ? "2.2em" : "1.5em" }}>{fmtHora(e.hora_entrega)}{e.data_entrega < hojeStr ? ` (${fmtData(e.data_entrega)})` : ""}</span>
        <span style={{ fontWeight: 700 }}>{e.cliente} · {e.tipo === "entrega" ? "ENTREGA" : "RETIRADA"}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: big ? "1.4em" : "1em" }}>{e.descricao} — {e.quantidade} {e.unidade || ""}</div>
      {e.observacoes && <div style={{ color: C.muted }}>Obs: {e.observacoes}</div>}
      {e.status === "em_producao" && (
        <div style={{ marginTop: "0.3em", fontWeight: 700 }}>
          <span style={{ background: C.fg, color: C.bg, borderRadius: 8, padding: "0 0.4em" }}>EM PRODUÇÃO</span>
          {e.iniciada_em && <span> iniciada há {fmtDuracao(Math.round((now.getTime() - new Date(e.iniciada_em).getTime()) / 60000))}</span>}
        </div>
      )}
      <Termometro e={e} />
      <Botoes e={e} />
    </div>
  );

  return (
    <div style={base}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .pgrid { display: grid; gap: 1em; padding: 0 1em 1em; grid-template-columns: 1fr; }
        .pnext { min-height: 60vh; }
        @media (min-width: 768px) { .pgrid { grid-template-columns: 1fr 1fr; } .pnext { min-height: auto; } .pfut { display: none; } }
        @media (min-width: 1280px) { .pgrid { grid-template-columns: 1.2fr 1fr 0.8fr; } .pfut { display: block; } .pam2 { display: none; } }
        .pclock { font-size: clamp(56px, 7vw, 96px); }
        h2.ph { font-size: 1.1em; font-weight: 700; letter-spacing: .05em; margin: .3em 0; }
      `}</style>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5em 1em", gap: "0.5em", flexWrap: "wrap" }}>
        <div>
          <div className="pclock" style={{ fontWeight: 700, lineHeight: 1 }}>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ textTransform: "capitalize" }}>{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
        <div style={{ display: "flex", gap: "0.4em" }}>
          <button style={btn(C.line)} aria-label="Diminuir letra" onClick={() => setScale(s => Math.max(0.7, +(s - 0.1).toFixed(1)))}>A–</button>
          <button style={btn(C.line)} aria-label="Aumentar letra" onClick={() => setScale(s => Math.min(2, +(s + 0.1).toFixed(1)))}>A+</button>
          <button style={btn(C.line)} onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }}>⛶ Tela cheia</button>
        </div>
      </header>

      <div className="pgrid">
        <section className="pnext">
          <h2 className="ph">PRÓXIMA</h2>
          {proxima ? <Item e={proxima} big /> : <p style={{ fontSize: "1.3em" }}>Nenhuma encomenda pendente 🎉</p>}
        </section>
        <section>
          <h2 className="ph">HOJE</h2>
          <div ref={listRef} style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {restoHoje.length === 0 && <p style={{ color: C.muted }}>Sem outras encomendas hoje.</p>}
            {restoHoje.map(e => <Item key={e.id} e={e} />)}
            <div className="pam2">
              <h2 className="ph">AMANHÃ — {amanha.length}</h2>
              <p>{amanha.map(e => fmtHora(e.hora_entrega)).join(" · ") || "—"}</p>
            </div>
          </div>
        </section>
        <section className="pfut">
          <h2 className="ph">AMANHÃ — {amanha.length}</h2>
          <p>{amanha.map(e => fmtHora(e.hora_entrega)).join(" · ") || "—"}</p>
          <h2 className="ph" style={{ marginTop: "1em" }}>PRÓXIMOS DIAS</h2>
          {futuros.length === 0 && <p style={{ color: C.muted }}>—</p>}
          {futuros.map(e => <p key={e.id}>{fmtData(e.data_entrega).slice(0, 5)} {fmtHora(e.hora_entrega)} · {e.descricao}</p>)}
        </section>
      </div>

      <footer style={{ padding: "0.5em 1em", color: C.muted, fontSize: "0.75em", borderTop: `1px solid ${C.line}` }}>
        Entregues hoje: {entregues.length} {entregues.length > 0 && `— ${entregues.map(e => `${e.cliente} (${fmtHora(e.hora_entrega)})`).join(", ")}`}
      </footer>

      {(confirm || printAsk) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "grid", placeItems: "center", padding: "1em" }}>
          <div style={{ background: C.card, border: `3px solid ${C.fg}`, borderRadius: 20, padding: "1em", maxWidth: 700, width: "100%" }}>
            {confirm ? (<>
              <p style={{ fontWeight: 700, fontSize: "1.2em" }}>{confirm.kind === "iniciar" ? "Iniciar a produção?" : "Ir para o caixa entregar?"}</p>
              <p>{fmtHora(confirm.item.hora_entrega)} · {confirm.item.descricao}</p>
              <div style={{ display: "flex", gap: "0.5em", marginTop: "0.8em" }}>
                <button style={btn(C.line)} onClick={() => setConfirm(null)}>VOLTAR</button>
                <button style={btn("#22C55E")} disabled={busy} onClick={doConfirm}>SIM</button>
              </div>
            </>) : (<>
              <p style={{ fontWeight: 700, fontSize: "1.2em" }}>Imprimir a ficha?</p>
              <div style={{ display: "flex", gap: "0.5em", marginTop: "0.8em" }}>
                <button style={btn(C.line)} onClick={() => setPrintAsk(null)}>NÃO</button>
                <button style={btn("#22C55E")} onClick={() => { window.open(`/encomendas/${printAsk}/ficha?print=1&t=${token}`, "_blank"); setPrintAsk(null); }}>IMPRIMIR</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { background: bg, color: bg === "#FACC15" || bg === "#22C55E" || bg === "#60A5FA" ? "#0B0B0F" : "#FFFFFF", fontWeight: 700, fontSize: "1em", padding: "0.4em 0.9em", borderRadius: 14, border: "2px solid #FFFFFF", minHeight: 56, cursor: "pointer" };
}
