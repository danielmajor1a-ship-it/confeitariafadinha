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
  credit_installment_rates: Record<string, number>;
}

export function useCardRates() {
  const { user } = useAuth();
  const [rates, setRates] = useState<CardRates>({ credit_rate: 0, debit_rate: 0, credit_installment_rates: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data } = await supabase.from("card_rates").select("*").limit(1).maybeSingle();
      if (data) {
        setRates({
          credit_rate: Number(data.credit_rate),
          debit_rate: Number(data.debit_rate),
          credit_installment_rates: (data as any).credit_installment_rates || {},
        });
      }
      setLoading(false);
    }
    load();
  }, [user]);

  function getCreditRate(installments: number): number {
    const key = String(installments);
    if (rates.credit_installment_rates[key] != null) {
      return Number(rates.credit_installment_rates[key]);
    }
    return rates.credit_rate;
  }

  return { rates, loading, getCreditRate };
}

export default function CardRatesSettings() {
  const { user } = useAuth();
  const [creditRate, setCreditRate] = useState("");
  const [debitRate, setDebitRate] = useState("");
  const [installmentRates, setInstallmentRates] = useState<Record<string, string>>({
    "1": "", "2": "", "3": "", "4": "", "5": "",
  });
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
        const ir = (data as any).credit_installment_rates || {};
        setInstallmentRates({
          "1": ir["1"] != null ? String(ir["1"]) : "",
          "2": ir["2"] != null ? String(ir["2"]) : "",
          "3": ir["3"] != null ? String(ir["3"]) : "",
          "4": ir["4"] != null ? String(ir["4"]) : "",
          "5": ir["5"] != null ? String(ir["5"]) : "",
        });
      }
      setLoading(false);
    }
    load();
  }, [user]);

  async function handleSave() {
    if (!user) return;
    const credit = parseFloat(creditRate.replace(",", ".")) || 0;
    const debit = parseFloat(debitRate.replace(",", ".")) || 0;

    const irParsed: Record<string, number> = {};
    Object.entries(installmentRates).forEach(([k, v]) => {
      const val = parseFloat(v.replace(",", "."));
      if (!isNaN(val) && val > 0) irParsed[k] = val;
    });

    const payload = {
      credit_rate: credit,
      debit_rate: debit,
      credit_installment_rates: irParsed,
      updated_at: new Date().toISOString(),
    };

    if (rateId) {
      const { error } = await supabase.from("card_rates").update(payload as any).eq("id", rateId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("card_rates").insert({
        user_id: user.id, ...payload,
      } as any).select().single();
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
          Configure as taxas cobradas pela operadora. Usadas para calcular o valor líquido recebido.
        </p>

        <div>
          <Label>Taxa Débito (%)</Label>
          <Input placeholder="Ex: 1.5" value={debitRate} onChange={e => setDebitRate(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label className="font-semibold">Taxas Crédito por Parcela (%)</Label>
          <p className="text-xs text-muted-foreground">
            Defina a taxa para cada número de parcelas. Campos vazios usarão a taxa geral.
          </p>
          <div>
            <Label className="text-xs">Taxa Geral Crédito (fallback)</Label>
            <Input placeholder="Ex: 3.5" value={creditRate} onChange={e => setCreditRate(e.target.value)} />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {["1", "2", "3", "4", "5"].map(n => (
              <div key={n}>
                <Label className="text-xs text-center block">{n}x</Label>
                <Input
                  placeholder={creditRate || "0"}
                  value={installmentRates[n]}
                  onChange={e => setInstallmentRates(prev => ({ ...prev, [n]: e.target.value }))}
                  className="text-center text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-3 text-xs space-y-1">
          <p className="font-medium">Exemplo de cálculo (venda R$ 100,00):</p>
          <p>Débito ({debitRate || "0"}%): Líquido {(100 - (parseFloat(debitRate.replace(",", ".")) || 0)).toFixed(2)}</p>
          {["1", "2", "3"].map(n => {
            const rate = parseFloat((installmentRates[n] || creditRate || "0").replace(",", ".")) || 0;
            return <p key={n}>Crédito {n}x ({rate}%): Líquido {(100 - rate).toFixed(2)}</p>;
          })}
        </div>

        <Button onClick={handleSave} className="w-full gap-2"><Save className="h-4 w-4" /> Salvar Taxas</Button>
      </CardContent>
    </Card>
  );
}
