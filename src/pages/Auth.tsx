import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
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
  { label: "Pelo menos um caractere especial (!@#$%)", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

export default function Auth() {
  const { signIn, signUp, user } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedConfirmEmail = confirmEmail.trim().toLowerCase();
  const emailsMatch = trimmedEmail === trimmedConfirmEmail && trimmedEmail.length > 0;
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password));

  const signupValid = name.trim().length > 0 && emailsMatch && passwordsMatch && allRulesPass;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLogin) {
      if (!emailsMatch) {
        toast.error("Os e-mails não coincidem.");
        return;
      }
      if (!passwordsMatch) {
        toast.error("As senhas não coincidem.");
        return;
      }
      if (!allRulesPass) {
        toast.error("A senha não atende aos requisitos mínimos.");
        return;
      }
    }
    setLoading(true);
    if (isLogin) {
      const { error } = await signIn(email.trim(), password);
      setLoading(false);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { display_name: name.trim() },
        },
      });
      setLoading(false);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto p-3 rounded-2xl bg-secondary w-fit">
            <Cake className="h-8 w-8 text-pink" />
          </div>
          <CardTitle className="text-2xl font-display">Confeitaria</CardTitle>
          <p className="text-muted-foreground text-sm">
            {isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <Label>Nome</Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Seu nome"
                />
              </div>
            )}

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {!isLogin && (
              <div>
                <Label>Confirmar Email</Label>
                <Input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  required
                />
                {confirmEmail && !emailsMatch && (
                  <p className="text-destructive text-xs mt-1">Os e-mails não coincidem.</p>
                )}
              </div>
            )}

            <div>
              <Label>Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isLogin ? 6 : 8}
              />
            </div>

            {!isLogin && (
              <>
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
              </>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || (!isLogin && !signupValid)}
            >
              {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar Conta"}
            </Button>
          </form>
          {isLogin && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              <button
                type="button"
                onClick={async () => {
                  if (!email) {
                    toast.error("Informe seu e-mail primeiro.");
                    return;
                  }
                  const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  if (error) toast.error(error.message);
                  else toast.success("Link de redefinição enviado para seu e-mail!");
                }}
                className="text-pink-dark font-semibold hover:underline"
              >
                Esqueci minha senha
              </button>
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground mt-4">
            {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setConfirmEmail("");
                setConfirmPassword("");
                setName("");
              }}
              className="text-pink-dark font-semibold hover:underline"
            >
              {isLogin ? "Criar conta" : "Fazer login"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
