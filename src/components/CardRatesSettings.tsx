import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Save } from "lucide-react";
import { toast } from "sonner";

export interface CardRates {
  credit_rate: number;
  debit_rate: number;
}

export function useCardRates() {
  const { user } = useAuth();
  const [rates, setRates] = useState<CardRates>({ credit_rate: 0, debit_rate: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      // Try to get any card_rates row (admin sets it)
      const { data } = await supabase.from("card_rates").select("*").limit(1).maybeSingle();
      if (data) {
        setRates({ credit_rate: Number(data.credit_rate), debit_rate: Number(data.debit_rate) });
      }
      setLoading(false);
    }
    load();
  }, [user]);

  return { rates, loading };
}

export default function CardRatesSettings() {
  const { user } = useAuth();
  const [creditRate, setCreditRate] = useState("");
  const [debitRate, setDebitRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [rateId, setRateId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data } = await supabase.from("card_rates").select("*").eq("user_id", user!.id).maybeSingle();
      if (data) {
        setCreditRate(String(data.credit_rate));
        setDebitRate(String(data.debit_rate));
        setRateId(data.id);
      }
      setLoading(false);
    }
    load();
  }, [user]);

  async function handleSave() {
    if (!user) return;
    const credit = parseFloat(creditRate.replace(",", ".")) || 0;
    const debit = parseFloat(debitRate.replace(",", ".")) || 0;

    if (rateId) {
      const { error } = await supabase.from("card_rates").update({
        credit_rate: credit, debit_rate: debit, updated_at: new Date().toISOString(),
      }).eq("id", rateId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("card_rates").insert({
        user_id: user.id, credit_rate: credit, debit_rate: debit,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      setRateId(data.id);
    }
    toast.success("Taxas salvas!");
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="section-title text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Taxas de Operadora de Cartão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Configure as taxas cobradas pela operadora de cartão. Esses valores serão usados para calcular o valor líquido recebido.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Taxa Crédito (%)</Label>
            <Input
              placeholder="Ex: 3.5"
              value={creditRate}
              onChange={e => setCreditRate(e.target.value)}
            />
          </div>
          <div>
            <Label>Taxa Débito (%)</Label>
            <Input
              placeholder="Ex: 1.5"
              value={debitRate}
              onChange={e => setDebitRate(e.target.value)}
            />
          </div>
        </div>
        <div className="bg-muted/50 rounded-xl p-3 text-xs space-y-1">
          <p className="font-medium">Exemplo de cálculo:</p>
          <p>Venda no crédito: R$ 100,00</p>
          <p>Taxa: {creditRate || "0"}% → R$ {((parseFloat(creditRate.replace(",", ".")) || 0)).toFixed(2)}</p>
          <p className="font-bold">Líquido: R$ {(100 - (parseFloat(creditRate.replace(",", ".")) || 0)).toFixed(2)}</p>
        </div>
        <Button onClick={handleSave} className="w-full gap-2"><Save className="h-4 w-4" /> Salvar Taxas</Button>
      </CardContent>
    </Card>
  );
}
