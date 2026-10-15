import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { db, fichaTexto, fmtData, fmtHora, imprimirViaRawBT, isAndroid } from "@/lib/encomendas";
import { useAuth } from "@/contexts/AuthContext";

export default function OrderTicket() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("t");
  const { user, loading } = useAuth();
  const [e, setE] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token && loading) return;
    (async () => {
      const res = token
        ? await db.rpc("get_ficha_encomenda", { p_token: token, p_id: id })
        : await db.from("encomendas").select("*").eq("id", id).maybeSingle();
      if (res.error || !res.data) { setErr(token ? "Link inválido" : user ? "Encomenda não encontrada" : "Encomenda não encontrada (entre no sistema)"); return; }
      setE(res.data);
      if (sp.get("print") === "1" && !isAndroid()) setTimeout(() => window.print(), 300);
    })();
  }, [id, token, loading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="p-6">{err}</p>;
  if (!e) return <p className="p-6">Carregando...</p>;

  return (
    <div>
      <style>{`
        @page { size: 58mm auto; margin: 0; }
        .ficha { width: 48mm; margin: 0 auto; padding: 2mm 0; font-family: ui-monospace, "Courier New", monospace; font-size: 11px; line-height: 1.3; color: #000; background: #fff; }
        .ficha hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
        @media print { .no-print { display: none !important; } body { background: #fff; } }
      `}</style>
      <div className="no-print flex gap-2 p-3 justify-center">
        <button className="px-4 py-2 rounded bg-chocolate text-primary-foreground" onClick={() => window.print()}>Imprimir ficha</button>
        {isAndroid() && <button className="px-4 py-2 rounded border" onClick={() => imprimirViaRawBT(fichaTexto(e))}>Imprimir via app (Bluetooth)</button>}
      </div>
      <div className="ficha">
        <div style={{ textAlign: "center", fontWeight: 700 }}>CONFEITARIA FADINHA</div>
        <hr />
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13 }}>ENCOMENDA</div>
        <hr />
        <div>Cliente: <b>{e.cliente_nome}</b></div>
        <div style={{ marginTop: 4, fontWeight: 700 }}>{e.descricao}</div>
        <div>Qtd: {e.quantidade} {e.unidade || ""}</div>
        {e.observacoes && <div>Obs: {e.observacoes}</div>}
        <div>Tipo: {e.tipo === "entrega" ? "ENTREGA" : "RETIRADA"}</div>
        <hr />
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 16 }}>{fmtData(e.data_entrega)}<br />{fmtHora(e.hora_entrega)}</div>
        <hr />
      </div>
    </div>
  );
}
