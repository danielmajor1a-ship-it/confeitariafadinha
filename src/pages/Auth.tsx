import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cake } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = isLogin ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else if (!isLogin) {
      toast.success("Conta criada! Verifique seu email para confirmar.");
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
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div><Label>Senha</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} /></div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar Conta"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-pink-dark font-semibold hover:underline">
              {isLogin ? "Criar conta" : "Fazer login"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
