import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cake, Check, X } from "lucide-react";
import { toast } from "sonner";

const PASSWORD_RULES = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Pelo menos uma letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Pelo menos uma letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Pelo menos um número", test: (p: string) => /[0-9]/.test(p) },
];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Check hash for recovery token
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && password.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allRulesPass) {
      toast.error("A senha não atende aos requisitos mínimos.");
      return;
    }
    if (!passwordsMatch) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Senha redefinida com sucesso!");
      navigate("/login");
    }
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto p-3 rounded-2xl bg-secondary w-fit">
              <Cake className="h-8 w-8 text-pink" />
            </div>
            <CardTitle className="text-xl">Link inválido ou expirado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Solicite um novo link de redefinição de senha na tela de login.
            </p>
            <Button onClick={() => navigate("/login")} className="w-full">
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto p-3 rounded-2xl bg-secondary w-fit">
            <Cake className="h-8 w-8 text-pink" />
          </div>
          <CardTitle className="text-2xl font-display">Nova Senha</CardTitle>
          <p className="text-muted-foreground text-sm">Defina sua nova senha abaixo.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Confirmar Senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-destructive text-xs mt-1">As senhas não coincidem.</p>
              )}
            </div>
            <div className="space-y-1">
              {PASSWORD_RULES.map((rule) => {
                const pass = rule.test(password);
                return (
                  <div key={rule.label} className="flex items-center gap-2 text-xs">
                    {pass ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={pass ? "text-green-600" : "text-muted-foreground"}>
                      {rule.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !allRulesPass || !passwordsMatch}>
              {loading ? "Aguarde..." : "Redefinir Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
