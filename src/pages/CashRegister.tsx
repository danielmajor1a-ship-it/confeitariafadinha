import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DollarSign, Plus, Minus, Lock, Unlock, ArrowDownCircle, ArrowUpCircle,
  Download, Calendar, Clock, FileSpreadsheet, FileText, ClipboardCheck,
  AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

interface CashRegister {
  id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  initial_amount: number;
  final_amount: number | null;
  counted_amount: number | null;
  status: string;
  period_type: string;
  notes: string | null;
  created_at: string;
}

interface CashMovement {
  id: string;
  cash_register_id: string;
  user_id: string;
  type: string;
  category: string;
  amount: number;
  payment_method: string | null;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

interface CashVerification {
  id: string;
  cash_register_id: string;
  user_id: string;
  expected_amount: number;
  counted_amount: number;
  difference: number;
  notes: string | null;
  total_cash_sales: number;
  total_credit_sales: number;
  total_debit_sales: number;
  total_fiado_received: number;
  total_sangrias: number;
  total_expenses: number;
  created_at: string;
}

const categoryLabels: Record<string, string> = {
  venda: "Venda",
  recebimento_fiado: "Recebimento Fiado",
  despesa: "Despesa",
  sangria: "Sangria",
  ajuste: "Ajuste",
  outro: "Outro",
  entrada_manual: "Entrada Manual",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CashRegisterPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, profile, loading: roleLoading } = useUserRole();
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [verifications, setVerifications] = useState<CashVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRegister, setOpenRegister] = useState<CashRegister | null>(null);

  // Dialog states
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [initialAmount, setInitialAmount] = useState("");
  const [movDialogOpen, setMovDialogOpen] = useState(false);
  const [movType, setMovType] = useState<"entrada" | "saida">("entrada");
  const [movCategory, setMovCategory] = useState("entrada_manual");
  const [movAmount, setMovAmount] = useState("");
  const [movPayment, setMovPayment] = useState("dinheiro");
  const [movDesc, setMovDesc] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closePeriod, setClosePeriod] = useState("diario");
  const [closeNotes, setCloseNotes] = useState("");

  // Verification dialog
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyCountedAmount, setVerifyCountedAmount] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");

  const canClose = isAdmin;

  const refresh = useCallback(async () => {
    if (!user) {
      setRegisters([]);
      setMovements([]);
      setVerifications([]);
      setOpenRegister(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [regRes, movRes, verRes] = await Promise.all([
      supabase.from("cash_registers").select("*").order("opened_at", { ascending: false }),
      supabase.from("cash_movements").select("*").order("created_at", { ascending: false }),
      supabase.from("cash_verifications").select("*").order("created_at", { ascending: false }),
    ]);

    const regs = (regRes.data || []) as CashRegister[];
    setRegisters(regs);
    setMovements((movRes.data || []) as CashMovement[]);
    setVerifications((verRes.data || []) as CashVerification[]);

    const userOpenRegister = regs.find((r) => (r.status === "aberto" || r.status === "conferido") && r.user_id === user.id) || null;
    const adminOpenRegister = isAdmin ? regs.find((r) => r.status === "aberto" || r.status === "conferido") || null : null;
    setOpenRegister(userOpenRegister ?? adminOpenRegister);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    refresh();
  }, [refresh, authLoading, roleLoading]);

  // Computed values for open register
  const currentMovements = openRegister ? movements.filter((m) => m.cash_register_id === openRegister.id) : [];
  const entradas = currentMovements.filter((m) => m.type === "entrada");
  const saidas = currentMovements.filter((m) => m.type === "saida");
  const totalEntradas = entradas.reduce((s, m) => s + m.amount, 0);
  const totalSaidas = saidas.reduce((s, m) => s + m.amount, 0);
  const saldoAtual = (openRegister?.initial_amount || 0) + totalEntradas - totalSaidas;

  const totalDinheiro = entradas.filter((m) => m.payment_method === "dinheiro").reduce((s, m) => s + m.amount, 0);
  const totalPix = entradas.filter((m) => m.payment_method === "pix").reduce((s, m) => s + m.amount, 0);
  const totalCartaoCredito = entradas.filter((m) => m.payment_method === "cartao_credito" || m.payment_method === "credito").reduce((s, m) => s + m.amount, 0);
  const totalCartaoDebito = entradas.filter((m) => m.payment_method === "cartao_debito" || m.payment_method === "debito").reduce((s, m) => s + m.amount, 0);
  const totalCartao = entradas.filter((m) => ["cartao", "cartao_credito", "cartao_debito", "credito", "debito"].includes(m.payment_method || "")).reduce((s, m) => s + m.amount, 0);
  const totalFiado = entradas.filter((m) => m.category === "recebimento_fiado" || m.payment_method === "fiado").reduce((s, m) => s + m.amount, 0);
  const totalSangrias = saidas.filter((m) => m.category === "sangria").reduce((s, m) => s + m.amount, 0);
  const totalDespesas = saidas.filter((m) => m.category === "despesa").reduce((s, m) => s + m.amount, 0);

  // Expected cash in drawer = initial + cash sales + fiado received - sangrias - expenses (cash only)
  const saldoEsperadoDinheiro = (openRegister?.initial_amount || 0) + totalDinheiro + totalFiado - totalSangrias - totalDespesas;

  // === OPEN CASH REGISTER ===
  async function handleOpen() {
    if (!user) return;
    if (openRegister) { toast.error("Já existe um caixa aberto!"); return; }
    const amt = parseFloat(initialAmount.replace(",", ".")) || 0;
    const { error } = await supabase.from("cash_registers").insert({
      user_id: user.id, initial_amount: amt, status: "aberto",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Caixa aberto!");
    setOpenDialogOpen(false);
    setInitialAmount("");
    await refresh();
  }

  // === ADD MOVEMENT ===
  async function handleAddMovement() {
    if (!user || !openRegister) return;
    const amt = parseFloat(movAmount.replace(",", ".")) || 0;
    if (amt <= 0) { toast.error("Valor deve ser maior que zero"); return; }
    const { error } = await supabase.from("cash_movements").insert({
      cash_register_id: openRegister.id, user_id: user.id,
      type: movType, category: movCategory, amount: amt,
      payment_method: movPayment, description: movDesc,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Movimentação registrada!");
    setMovDialogOpen(false);
    setMovAmount(""); setMovDesc("");
    await refresh();
  }

  // === VERIFY (CONFERIR) CASH ===
  async function handleVerify() {
    if (!user || !openRegister) return;
    const counted = parseFloat(verifyCountedAmount.replace(",", "."));
    if (isNaN(counted)) { toast.error("Informe o valor contado"); return; }

    const diff = counted - saldoEsperadoDinheiro;

    const { error } = await supabase.from("cash_verifications").insert({
      cash_register_id: openRegister.id,
      user_id: user.id,
      expected_amount: saldoEsperadoDinheiro,
      counted_amount: counted,
      difference: diff,
      notes: verifyNotes,
      total_cash_sales: totalDinheiro,
      total_credit_sales: totalCartaoCredito,
      total_debit_sales: totalCartaoDebito,
      total_pix_sales: totalPix,
      total_fiado_received: totalFiado,
      total_sangrias: totalSangrias,
      total_expenses: totalDespesas,
    } as any);
    if (error) { toast.error(error.message); return; }

    // If not admin, mark register as "conferido" (awaiting admin finalization)
    if (!isAdmin) {
      await supabase.from("cash_registers").update({
        status: "conferido",
        counted_amount: counted,
      }).eq("id", openRegister.id);
    }

    toast.success(isAdmin ? "Conferência registrada com sucesso!" : "Conferência registrada! Aguardando fechamento pelo administrador.");
    setVerifyDialogOpen(false);
    setVerifyCountedAmount("");
    setVerifyNotes("");
    await refresh();
  }

  // === CLOSE CASH REGISTER (admin only or permitted) ===
  async function handleClose() {
    if (!openRegister || !canClose) return;
    const finalAmount = saldoAtual;

    // Use last verification's counted amount if available
    const regVerifications = verifications.filter(v => v.cash_register_id === openRegister.id);
    const lastVerification = regVerifications[0]; // already sorted desc
    const counted = lastVerification?.counted_amount ?? null;

    const { error } = await supabase.from("cash_registers").update({
      status: "fechado", closed_at: new Date().toISOString(),
      final_amount: finalAmount, counted_amount: counted,
      period_type: closePeriod, notes: closeNotes,
    }).eq("id", openRegister.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Caixa fechado!");
    setCloseDialogOpen(false);
    setCloseNotes("");
    await refresh();
  }

  // === EXPORT ===
  function exportData(type: "csv" | "xlsx") {
    const closedRegs = registers.filter((r) => r.status === "fechado");
    if (closedRegs.length === 0) { toast.error("Nenhum fechamento para exportar"); return; }

    const rows = closedRegs.map((reg) => {
      const regMovs = movements.filter((m) => m.cash_register_id === reg.id);
      const ent = regMovs.filter((m) => m.type === "entrada");
      const sai = regMovs.filter((m) => m.type === "saida");
      const din = ent.filter((m) => m.payment_method === "dinheiro").reduce((s, m) => s + m.amount, 0);
      const car = ent.filter((m) => m.payment_method === "cartao" || m.payment_method === "cartao_credito" || m.payment_method === "cartao_debito").reduce((s, m) => s + m.amount, 0);
      const fia = ent.filter((m) => m.category === "recebimento_fiado").reduce((s, m) => s + m.amount, 0);
      const totalEnt = ent.reduce((s, m) => s + m.amount, 0);
      const totalSai = sai.reduce((s, m) => s + m.amount, 0);
      const diff = reg.counted_amount != null ? reg.counted_amount - (reg.final_amount || 0) : null;

      // Get verifications for this register
      const regVer = verifications.filter(v => v.cash_register_id === reg.id);

      return {
        "Período": reg.period_type,
        "Abertura": format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        "Fechamento": reg.closed_at ? format(new Date(reg.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
        "Valor Inicial": reg.initial_amount,
        "Total Entradas": totalEnt,
        "Total Saídas": totalSai,
        "Total Dinheiro": din,
        "Total Cartão": car,
        "Total Fiado": fia,
        "Saldo Final": reg.final_amount || 0,
        "Valor Contado": reg.counted_amount ?? "",
        "Diferença": diff ?? "",
        "Conferências": regVer.length,
        "Observações": reg.notes || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fechamentos");
    if (type === "xlsx") {
      XLSX.writeFile(wb, `fechamentos_caixa_${format(new Date(), "yyyyMMdd")}.xlsx`);
    } else {
      XLSX.writeFile(wb, `fechamentos_caixa_${format(new Date(), "yyyyMMdd")}.csv`, { bookType: "csv" });
    }
    toast.success("Exportação concluída!");
  }

  if (loading || authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentVerifications = openRegister ? verifications.filter(v => v.cash_register_id === openRegister.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Caixa</h1>
          <p className="text-muted-foreground text-sm">Controle de abertura, conferência e fechamento</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!openRegister ? (
            <Dialog open={openDialogOpen} onOpenChange={setOpenDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Unlock className="h-4 w-4" /> Abrir Caixa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Abrir Caixa</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Valor Inicial (Troco)</Label>
                    <Input placeholder="0,00" value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} />
                  </div>
                  <Button onClick={handleOpen} className="w-full">Confirmar Abertura</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <>
              {/* Movement button */}
              <Dialog open={movDialogOpen} onOpenChange={setMovDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Movimentação</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova Movimentação</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Tipo</Label>
                      <Select value={movType} onValueChange={(v) => {
                        setMovType(v as "entrada" | "saida");
                        setMovCategory(v === "entrada" ? "entrada_manual" : "despesa");
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="saida">Saída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Categoria</Label>
                      <Select value={movCategory} onValueChange={setMovCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {movType === "entrada" ? (
                            <>
                              <SelectItem value="entrada_manual">Entrada Manual</SelectItem>
                              <SelectItem value="venda">Venda</SelectItem>
                              <SelectItem value="recebimento_fiado">Recebimento Fiado</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="despesa">Despesa</SelectItem>
                              <SelectItem value="sangria">Sangria</SelectItem>
                              <SelectItem value="ajuste">Ajuste</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Valor</Label>
                      <Input placeholder="0,00" value={movAmount} onChange={(e) => setMovAmount(e.target.value)} />
                    </div>
                    {movType === "entrada" && (
                      <div>
                        <Label>Forma de Pagamento</Label>
                        <Select value={movPayment} onValueChange={setMovPayment}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dinheiro">Dinheiro</SelectItem>
                            <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                            <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="fiado">Fiado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label>Observação</Label>
                      <Textarea placeholder="Descrição..." value={movDesc} onChange={(e) => setMovDesc(e.target.value)} />
                    </div>
                    <Button onClick={handleAddMovement} className="w-full">Registrar</Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Verify (Conferir) button - available to all */}
              <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="gap-2"><ClipboardCheck className="h-4 w-4" /> Conferir Caixa</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Conferência de Caixa</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    {/* Read-only summary */}
                    <div className="grid grid-cols-2 gap-3">
                      <Card><CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Vendas Dinheiro</p>
                        <p className="font-bold text-sm">{fmt(totalDinheiro)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Cartão Crédito</p>
                        <p className="font-bold text-sm">{fmt(totalCartaoCredito + entradas.filter(m => m.payment_method === "cartao").reduce((s, m) => s + m.amount, 0))}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Cartão Débito</p>
                        <p className="font-bold text-sm">{fmt(totalCartaoDebito)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">PIX</p>
                        <p className="font-bold text-sm">{fmt(totalPix)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Recebido Fiado</p>
                        <p className="font-bold text-sm">{fmt(totalFiado)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Sangrias</p>
                        <p className="font-bold text-sm text-destructive">{fmt(totalSangrias)}</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Despesas</p>
                        <p className="font-bold text-sm text-destructive">{fmt(totalDespesas)}</p>
                      </CardContent></Card>
                    </div>

                    <Card className="border-primary/30 bg-primary/5">
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-muted-foreground">Saldo Esperado em Dinheiro no Caixa</p>
                        <p className="text-2xl font-bold text-primary">{fmt(saldoEsperadoDinheiro)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          (Inicial {fmt(openRegister?.initial_amount || 0)} + Dinheiro + Fiado − Sangrias − Despesas)
                        </p>
                      </CardContent>
                    </Card>

                    {/* Employee input */}
                    <div>
                      <Label className="font-semibold">Valor Contado no Caixa (dinheiro) *</Label>
                      <Input
                        placeholder="0,00"
                        value={verifyCountedAmount}
                        onChange={(e) => setVerifyCountedAmount(e.target.value)}
                        className="text-lg"
                      />
                      {verifyCountedAmount && (() => {
                        const counted = parseFloat(verifyCountedAmount.replace(",", ".")) || 0;
                        const diff = counted - saldoEsperadoDinheiro;
                        return (
                          <div className={`mt-3 p-3 rounded-lg border-2 ${
                            diff === 0 ? "border-green-500 bg-green-50 dark:bg-green-950/20" :
                            diff > 0 ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" :
                            "border-destructive bg-red-50 dark:bg-red-950/20"
                          }`}>
                            <div className="flex items-center gap-2">
                              {diff === 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> :
                               diff > 0 ? <ArrowUpCircle className="h-5 w-5 text-blue-600" /> :
                               <XCircle className="h-5 w-5 text-destructive" />}
                              <div>
                                <p className="font-semibold text-sm">
                                  {diff === 0 ? "Caixa correto" : diff > 0 ? "Sobra de caixa" : "Falta de caixa"}
                                </p>
                                <p className={`text-lg font-bold ${
                                  diff === 0 ? "text-green-600" : diff > 0 ? "text-blue-600" : "text-destructive"
                                }`}>
                                  Diferença: {fmt(diff)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <Label>Observação</Label>
                      <Textarea placeholder="Ex: possível erro de troco..." value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} />
                    </div>

                    <Button onClick={handleVerify} className="w-full gap-2">
                      <ClipboardCheck className="h-4 w-4" /> Registrar Conferência
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Close button - admin or permitted only */}
              {canClose && (
                <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" className="gap-2"><Lock className="h-4 w-4" /> Fechar Caixa</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Fechamento Oficial do Caixa</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas</p><p className="font-bold text-green-600">{fmt(totalEntradas)}</p></CardContent></Card>
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saídas</p><p className="font-bold text-destructive">{fmt(totalSaidas)}</p></CardContent></Card>
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Dinheiro</p><p className="font-bold">{fmt(totalDinheiro)}</p></CardContent></Card>
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Cartão</p><p className="font-bold">{fmt(totalCartao)}</p></CardContent></Card>
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">PIX</p><p className="font-bold">{fmt(totalPix)}</p></CardContent></Card>
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Fiado</p><p className="font-bold">{fmt(totalFiado)}</p></CardContent></Card>
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saldo Final</p><p className="font-bold text-primary">{fmt(saldoAtual)}</p></CardContent></Card>
                      </div>

                      {/* Show latest verification if exists */}
                      {currentVerifications.length > 0 && (() => {
                        const last = currentVerifications[0];
                        return (
                          <Card className={`border-2 ${last.difference === 0 ? "border-green-500" : last.difference > 0 ? "border-blue-500" : "border-destructive"}`}>
                            <CardContent className="p-3">
                              <p className="text-xs text-muted-foreground mb-1">Última Conferência ({format(new Date(last.created_at), "dd/MM HH:mm")})</p>
                              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <div><p className="text-muted-foreground">Esperado</p><p className="font-bold">{fmt(last.expected_amount)}</p></div>
                                <div><p className="text-muted-foreground">Contado</p><p className="font-bold">{fmt(last.counted_amount)}</p></div>
                                <div>
                                  <p className="text-muted-foreground">Diferença</p>
                                  <p className={`font-bold ${last.difference === 0 ? "text-green-600" : last.difference > 0 ? "text-blue-600" : "text-destructive"}`}>
                                    {fmt(last.difference)}
                                  </p>
                                </div>
                              </div>
                              {last.notes && <p className="text-xs text-muted-foreground mt-2">Obs: {last.notes}</p>}
                            </CardContent>
                          </Card>
                        );
                      })()}

                      <div>
                        <Label>Período</Label>
                        <Select value={closePeriod} onValueChange={setClosePeriod}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="diario">Diário</SelectItem>
                            <SelectItem value="semanal">Semanal</SelectItem>
                            <SelectItem value="quinzenal">Quinzenal</SelectItem>
                            <SelectItem value="mensal">Mensal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
                      </div>
                      <Button variant="destructive" onClick={handleClose} className="w-full">Confirmar Fechamento</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status Cards */}
      {openRegister && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-1 bg-green-100 text-green-800">Aberto</Badge>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Abertura</p>
            <p className="text-sm font-medium">{format(new Date(openRegister.opened_at), "dd/MM HH:mm")}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Valor Inicial</p>
            <p className="text-sm font-bold">{fmt(openRegister.initial_amount)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-sm font-bold text-green-600">{fmt(totalEntradas)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-sm font-bold text-destructive">{fmt(totalSaidas)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Saldo Atual</p>
            <p className="text-sm font-bold text-primary">{fmt(saldoAtual)}</p>
          </CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="movimentacoes">
        <TabsList>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          <TabsTrigger value="conferencias">Conferências</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Fechamentos</TabsTrigger>
        </TabsList>

        {/* Movimentações tab */}
        <TabsContent value="movimentacoes" className="space-y-4">
          {!openRegister ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Lock className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum caixa aberto</p>
              <p className="text-sm">Abra o caixa para registrar movimentações</p>
            </CardContent></Card>
          ) : currentMovements.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <p>Nenhuma movimentação registrada neste caixa</p>
            </CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{format(new Date(m.created_at), "HH:mm")}</TableCell>
                      <TableCell>
                        {m.type === "entrada" ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm"><ArrowDownCircle className="h-3 w-3" /> Entrada</span>
                        ) : (
                          <span className="flex items-center gap-1 text-destructive text-sm"><ArrowUpCircle className="h-3 w-3" /> Saída</span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{categoryLabels[m.category] || m.category}</Badge></TableCell>
                      <TableCell className="text-sm capitalize">{m.payment_method?.replace("_", " ") || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.description || "-"}</TableCell>
                      <TableCell className={`text-right font-medium ${m.type === "entrada" ? "text-green-600" : "text-destructive"}`}>
                        {m.type === "entrada" ? "+" : "-"}{fmt(m.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Conferências tab */}
        <TabsContent value="conferencias" className="space-y-4">
          {(() => {
            const allVerifs = isAdmin
              ? verifications
              : verifications.filter(v => v.user_id === user?.id);

            if (allVerifs.length === 0) {
              return (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>Nenhuma conferência registrada</p>
                </CardContent></Card>
              );
            }

            return (
              <div className="space-y-3">
                {allVerifs.map((v) => {
                  const reg = registers.find(r => r.id === v.cash_register_id);
                  return (
                    <Card key={v.id} className={`border-l-4 ${
                      v.difference === 0 ? "border-l-green-500" :
                      v.difference > 0 ? "border-l-blue-500" :
                      "border-l-destructive"
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {v.difference === 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                             v.difference > 0 ? <ArrowUpCircle className="h-4 w-4 text-blue-600" /> :
                             <AlertTriangle className="h-4 w-4 text-destructive" />}
                            <span className="font-medium text-sm">
                              {format(new Date(v.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </span>
                            {reg && (
                              <Badge variant="outline" className="text-xs">
                                Caixa {reg.status === "aberto" ? "Aberto" : "Fechado"} - {format(new Date(reg.opened_at), "dd/MM HH:mm")}
                              </Badge>
                            )}
                          </div>
                          <Badge className={
                            v.difference === 0 ? "bg-green-100 text-green-800" :
                            v.difference > 0 ? "bg-blue-100 text-blue-800" :
                            "bg-red-100 text-red-800"
                          }>
                            {v.difference === 0 ? "Correto" : v.difference > 0 ? "Sobra" : "Falta"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
                          <div><p className="text-muted-foreground">Dinheiro</p><p className="font-bold">{fmt(v.total_cash_sales)}</p></div>
                          <div><p className="text-muted-foreground">Crédito</p><p className="font-bold">{fmt(v.total_credit_sales)}</p></div>
                          <div><p className="text-muted-foreground">Débito</p><p className="font-bold">{fmt(v.total_debit_sales)}</p></div>
                          <div><p className="text-muted-foreground">Fiado</p><p className="font-bold">{fmt(v.total_fiado_received)}</p></div>
                          <div><p className="text-muted-foreground">Sangrias</p><p className="font-bold text-destructive">{fmt(v.total_sangrias)}</p></div>
                          <div><p className="text-muted-foreground">Despesas</p><p className="font-bold text-destructive">{fmt(v.total_expenses)}</p></div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Saldo Esperado</p>
                            <p className="font-bold">{fmt(v.expected_amount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Valor Contado</p>
                            <p className="font-bold">{fmt(v.counted_amount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Diferença</p>
                            <p className={`font-bold text-lg ${
                              v.difference === 0 ? "text-green-600" :
                              v.difference > 0 ? "text-blue-600" :
                              "text-destructive"
                            }`}>{fmt(v.difference)}</p>
                          </div>
                        </div>
                        {v.notes && <p className="text-xs text-muted-foreground mt-2">📝 {v.notes}</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>

        {/* Histórico tab */}
        <TabsContent value="historico" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => exportData("csv")} className="gap-2">
              <FileText className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportData("xlsx")} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </div>

          {registers.filter((r) => r.status === "fechado").length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <p>Nenhum fechamento registrado ainda</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {registers.filter((r) => r.status === "fechado").map((reg) => {
                const regMovs = movements.filter((m) => m.cash_register_id === reg.id);
                const ent = regMovs.filter((m) => m.type === "entrada").reduce((s, m) => s + m.amount, 0);
                const sai = regMovs.filter((m) => m.type === "saida").reduce((s, m) => s + m.amount, 0);
                const din = regMovs.filter((m) => m.type === "entrada" && m.payment_method === "dinheiro").reduce((s, m) => s + m.amount, 0);
                const car = regMovs.filter((m) => m.type === "entrada" && (m.payment_method === "cartao" || m.payment_method === "cartao_credito" || m.payment_method === "cartao_debito")).reduce((s, m) => s + m.amount, 0);
                const fia = regMovs.filter((m) => m.type === "entrada" && m.category === "recebimento_fiado").reduce((s, m) => s + m.amount, 0);
                const diff = reg.counted_amount != null ? reg.counted_amount - (reg.final_amount || 0) : null;
                const regVer = verifications.filter(v => v.cash_register_id === reg.id);

                return (
                  <Card key={reg.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm")} → {reg.closed_at ? format(new Date(reg.closed_at), "dd/MM/yyyy HH:mm") : ""}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {regVer.length > 0 && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <ClipboardCheck className="h-3 w-3" /> {regVer.length} conferência(s)
                            </Badge>
                          )}
                          <Badge variant="outline" className="capitalize">{reg.period_type}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-center text-xs">
                        <div><p className="text-muted-foreground">Inicial</p><p className="font-bold">{fmt(reg.initial_amount)}</p></div>
                        <div><p className="text-muted-foreground">Entradas</p><p className="font-bold text-green-600">{fmt(ent)}</p></div>
                        <div><p className="text-muted-foreground">Saídas</p><p className="font-bold text-destructive">{fmt(sai)}</p></div>
                        <div><p className="text-muted-foreground">Dinheiro</p><p className="font-bold">{fmt(din)}</p></div>
                        <div><p className="text-muted-foreground">Cartão</p><p className="font-bold">{fmt(car)}</p></div>
                        <div><p className="text-muted-foreground">Fiado</p><p className="font-bold">{fmt(fia)}</p></div>
                        <div><p className="text-muted-foreground">Saldo Final</p><p className="font-bold text-primary">{fmt(reg.final_amount || 0)}</p></div>
                      </div>
                      {diff != null && (
                        <p className={`text-xs mt-2 text-center font-medium ${diff >= 0 ? "text-green-600" : "text-destructive"}`}>
                          Diferença: {fmt(diff)}
                        </p>
                      )}
                      {reg.notes && <p className="text-xs text-muted-foreground mt-2 text-center">{reg.notes}</p>}

                      {/* Show verifications for this register (admin view) */}
                      {isAdmin && regVer.length > 0 && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">Conferências:</p>
                          {regVer.map(v => (
                            <div key={v.id} className={`text-xs p-2 rounded border-l-2 ${
                              v.difference === 0 ? "border-l-green-500 bg-green-50 dark:bg-green-950/20" :
                              v.difference > 0 ? "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20" :
                              "border-l-destructive bg-red-50 dark:bg-red-950/20"
                            }`}>
                              <div className="flex justify-between">
                                <span>{format(new Date(v.created_at), "dd/MM HH:mm")}</span>
                                <span className={`font-bold ${
                                  v.difference === 0 ? "text-green-600" : v.difference > 0 ? "text-blue-600" : "text-destructive"
                                }`}>
                                  Esperado: {fmt(v.expected_amount)} | Contado: {fmt(v.counted_amount)} | Diff: {fmt(v.difference)}
                                </span>
                              </div>
                              {v.notes && <p className="text-muted-foreground mt-1">📝 {v.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
