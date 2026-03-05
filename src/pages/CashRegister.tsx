import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  Download, Calendar, Clock, FileSpreadsheet, FileText,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
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
  const { user } = useAuth();
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRegister, setOpenRegister] = useState<CashRegister | null>(null);

  // Open dialog states
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [initialAmount, setInitialAmount] = useState("");

  // Movement dialog
  const [movDialogOpen, setMovDialogOpen] = useState(false);
  const [movType, setMovType] = useState<"entrada" | "saida">("entrada");
  const [movCategory, setMovCategory] = useState("entrada_manual");
  const [movAmount, setMovAmount] = useState("");
  const [movPayment, setMovPayment] = useState("dinheiro");
  const [movDesc, setMovDesc] = useState("");

  // Close dialog
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [countedAmount, setCountedAmount] = useState("");
  const [closePeriod, setClosePeriod] = useState("diario");
  const [closeNotes, setCloseNotes] = useState("");

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [regRes, movRes] = await Promise.all([
      supabase.from("cash_registers").select("*").order("opened_at", { ascending: false }),
      supabase.from("cash_movements").select("*").order("created_at", { ascending: false }),
    ]);
    const regs = (regRes.data || []) as CashRegister[];
    setRegisters(regs);
    setMovements((movRes.data || []) as CashMovement[]);
    setOpenRegister(regs.find((r) => r.status === "aberto") || null);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

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

  // === CLOSE CASH REGISTER ===
  async function handleClose() {
    if (!openRegister) return;
    const regMovs = movements.filter((m) => m.cash_register_id === openRegister.id);
    const totalEntradas = regMovs.filter((m) => m.type === "entrada").reduce((s, m) => s + m.amount, 0);
    const totalSaidas = regMovs.filter((m) => m.type === "saida").reduce((s, m) => s + m.amount, 0);
    const finalAmount = openRegister.initial_amount + totalEntradas - totalSaidas;
    const counted = countedAmount ? parseFloat(countedAmount.replace(",", ".")) : null;

    const { error } = await supabase.from("cash_registers").update({
      status: "fechado", closed_at: new Date().toISOString(),
      final_amount: finalAmount, counted_amount: counted,
      period_type: closePeriod, notes: closeNotes,
    }).eq("id", openRegister.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Caixa fechado!");
    setCloseDialogOpen(false);
    setCountedAmount(""); setCloseNotes("");
    await refresh();
  }

  // === EXPORT ===
  function exportData(type: "csv" | "xlsx") {
    const closedRegs = registers.filter((r) => r.status === "fechado");
    if (closedRegs.length === 0) { toast.error("Nenhum fechamento para exportar"); return; }

    const rows = closedRegs.map((reg) => {
      const regMovs = movements.filter((m) => m.cash_register_id === reg.id);
      const entradas = regMovs.filter((m) => m.type === "entrada");
      const saidas = regMovs.filter((m) => m.type === "saida");
      const totalDinheiro = entradas.filter((m) => m.payment_method === "dinheiro").reduce((s, m) => s + m.amount, 0);
      const totalCartao = entradas.filter((m) => m.payment_method === "cartao").reduce((s, m) => s + m.amount, 0);
      const totalFiado = entradas.filter((m) => m.category === "recebimento_fiado").reduce((s, m) => s + m.amount, 0);
      const totalEntradas = entradas.reduce((s, m) => s + m.amount, 0);
      const totalSaidas = saidas.reduce((s, m) => s + m.amount, 0);
      const diff = reg.counted_amount != null ? reg.counted_amount - (reg.final_amount || 0) : null;

      return {
        "Período": reg.period_type,
        "Abertura": format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        "Fechamento": reg.closed_at ? format(new Date(reg.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
        "Valor Inicial": reg.initial_amount,
        "Total Entradas": totalEntradas,
        "Total Saídas": totalSaidas,
        "Total Dinheiro": totalDinheiro,
        "Total Cartão": totalCartao,
        "Total Fiado": totalFiado,
        "Saldo Final": reg.final_amount || 0,
        "Valor Contado": reg.counted_amount ?? "",
        "Diferença": diff ?? "",
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

  // Computed values for open register
  const currentMovements = openRegister ? movements.filter((m) => m.cash_register_id === openRegister.id) : [];
  const totalEntradas = currentMovements.filter((m) => m.type === "entrada").reduce((s, m) => s + m.amount, 0);
  const totalSaidas = currentMovements.filter((m) => m.type === "saida").reduce((s, m) => s + m.amount, 0);
  const saldoAtual = (openRegister?.initial_amount || 0) + totalEntradas - totalSaidas;
  const totalDinheiro = currentMovements.filter((m) => m.type === "entrada" && m.payment_method === "dinheiro").reduce((s, m) => s + m.amount, 0);
  const totalCartao = currentMovements.filter((m) => m.type === "entrada" && m.payment_method === "cartao").reduce((s, m) => s + m.amount, 0);
  const totalFiado = currentMovements.filter((m) => m.type === "entrada" && m.category === "recebimento_fiado").reduce((s, m) => s + m.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Caixa</h1>
          <p className="text-muted-foreground text-sm">Controle de abertura, movimentações e fechamento</p>
        </div>
        <div className="flex gap-2">
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
                            <SelectItem value="cartao">Cartão</SelectItem>
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

              <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="gap-2"><Lock className="h-4 w-4" /> Fechar Caixa</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Fechar Caixa</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas</p><p className="font-bold text-green-600">{fmt(totalEntradas)}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saídas</p><p className="font-bold text-red-600">{fmt(totalSaidas)}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Dinheiro</p><p className="font-bold">{fmt(totalDinheiro)}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Cartão</p><p className="font-bold">{fmt(totalCartao)}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Fiado</p><p className="font-bold">{fmt(totalFiado)}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saldo Final</p><p className="font-bold text-primary">{fmt(saldoAtual)}</p></CardContent></Card>
                    </div>
                    <div>
                      <Label>Valor Contado (físico)</Label>
                      <Input placeholder="0,00" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} />
                      {countedAmount && (
                        <p className={`text-sm mt-1 font-medium ${(parseFloat(countedAmount.replace(",", ".")) || 0) - saldoAtual >= 0 ? "text-green-600" : "text-red-600"}`}>
                          Diferença: {fmt((parseFloat(countedAmount.replace(",", ".")) || 0) - saldoAtual)}
                        </p>
                      )}
                    </div>
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
            </>
          )}
        </div>
      </div>

      {/* Status Card */}
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
            <p className="text-sm font-bold text-red-600">{fmt(totalSaidas)}</p>
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
          <TabsTrigger value="historico">Histórico de Fechamentos</TabsTrigger>
        </TabsList>

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
                          <span className="flex items-center gap-1 text-red-600 text-sm"><ArrowUpCircle className="h-3 w-3" /> Saída</span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{categoryLabels[m.category] || m.category}</Badge></TableCell>
                      <TableCell className="text-sm capitalize">{m.payment_method || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.description || "-"}</TableCell>
                      <TableCell className={`text-right font-medium ${m.type === "entrada" ? "text-green-600" : "text-red-600"}`}>
                        {m.type === "entrada" ? "+" : "-"}{fmt(m.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

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
                const car = regMovs.filter((m) => m.type === "entrada" && m.payment_method === "cartao").reduce((s, m) => s + m.amount, 0);
                const fia = regMovs.filter((m) => m.type === "entrada" && m.category === "recebimento_fiado").reduce((s, m) => s + m.amount, 0);
                const diff = reg.counted_amount != null ? reg.counted_amount - (reg.final_amount || 0) : null;

                return (
                  <Card key={reg.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm")} → {reg.closed_at ? format(new Date(reg.closed_at), "dd/MM/yyyy HH:mm") : ""}
                        </CardTitle>
                        <Badge variant="outline" className="capitalize">{reg.period_type}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-center text-xs">
                        <div><p className="text-muted-foreground">Inicial</p><p className="font-bold">{fmt(reg.initial_amount)}</p></div>
                        <div><p className="text-muted-foreground">Entradas</p><p className="font-bold text-green-600">{fmt(ent)}</p></div>
                        <div><p className="text-muted-foreground">Saídas</p><p className="font-bold text-red-600">{fmt(sai)}</p></div>
                        <div><p className="text-muted-foreground">Dinheiro</p><p className="font-bold">{fmt(din)}</p></div>
                        <div><p className="text-muted-foreground">Cartão</p><p className="font-bold">{fmt(car)}</p></div>
                        <div><p className="text-muted-foreground">Fiado</p><p className="font-bold">{fmt(fia)}</p></div>
                        <div><p className="text-muted-foreground">Saldo Final</p><p className="font-bold text-primary">{fmt(reg.final_amount || 0)}</p></div>
                      </div>
                      {diff != null && (
                        <p className={`text-xs mt-2 text-center font-medium ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                          Diferença: {fmt(diff)}
                        </p>
                      )}
                      {reg.notes && <p className="text-xs text-muted-foreground mt-2 text-center">{reg.notes}</p>}
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
