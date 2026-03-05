import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, UserPlus, Users } from "lucide-react";

const ALL_TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "produtos", label: "Produtos" },
  { key: "estoque", label: "Estoque" },
  { key: "vendas", label: "Vendas" },
  { key: "clientes", label: "Clientes" },
  { key: "financeiro", label: "Financeiro" },
  { key: "receitas", label: "Receitas" },
  { key: "custos", label: "Custos" },
  { key: "precificacao", label: "Precificação" },
  { key: "caixa", label: "Caixa" },
];

interface UserRow {
  user_id: string;
  display_name: string;
  is_active: boolean;
  allowed_tabs: string[];
  can_edit_prices: boolean;
  can_edit_costs: boolean;
  can_view_dashboard: boolean;
  can_register_sales: boolean;
  can_register_cash: boolean;
  role?: string;
  email?: string;
}

export default function UserManagement() {
  const { isAdmin } = useUserRole();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  async function fetchUsers() {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("*");
    const { data: roles } = await supabase.from("user_roles").select("*");

    if (profiles) {
      const mapped = profiles.map((p: any) => {
        const userRole = roles?.find((r: any) => r.user_id === p.user_id);
        return {
          ...p,
          role: userRole?.role || "funcionario",
        } as UserRow;
      });
      setUsers(mapped);
    }
    setLoading(false);
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleToggleActive(u: UserRow) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !u.is_active })
      .eq("user_id", u.user_id);
    if (error) toast.error(error.message);
    else {
      toast.success(u.is_active ? "Usuário desativado" : "Usuário ativado");
      fetchUsers();
    }
  }

  async function handleSavePermissions(u: UserRow) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        allowed_tabs: u.allowed_tabs,
        can_edit_prices: u.can_edit_prices,
        can_edit_costs: u.can_edit_costs,
        can_view_dashboard: u.can_view_dashboard,
        can_register_sales: u.can_register_sales,
        can_register_cash: u.can_register_cash,
        display_name: u.display_name,
      })
      .eq("user_id", u.user_id);

    if (profileError) {
      toast.error(profileError.message);
      return;
    }

    // Update role
    const currentRole = users.find(x => x.user_id === u.user_id)?.role;
    if (u.role && u.role !== currentRole) {
      // Delete existing role
      await supabase.from("user_roles").delete().eq("user_id", u.user_id);
      if (u.role === "admin") {
        await supabase.from("user_roles").insert({ user_id: u.user_id, role: u.role as any });
      }
    }

    toast.success("Permissões atualizadas!");
    setEditUser(null);
    fetchUsers();
  }

  async function handleResetPassword(userId: string) {
    // Admin sends reset email - we need the user's email
    // Since we can't access auth.users, we use supabase admin functionality via edge function
    // For now, we'll use the profile's associated email from auth metadata
    toast.info("Para resetar a senha, o usuário deve usar 'Esqueci minha senha' na tela de login.");
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-semibold">Acesso Restrito</p>
            <p className="text-muted-foreground text-sm mt-2">Apenas administradores podem acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-pink" /> Gerenciar Usuários
          </h2>
          <p className="text-muted-foreground text-sm">Controle perfis e permissões dos usuários.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4">
          {users.map((u) => (
            <Card key={u.user_id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{u.display_name || "Sem nome"}</span>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "ADMIN" : "FUNCIONÁRIO"}
                    </Badge>
                    {!u.is_active && <Badge variant="destructive">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Abas: {u.allowed_tabs?.join(", ") || "nenhuma"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleToggleActive(u)}>
                    {u.is_active ? "Desativar" : "Ativar"}
                  </Button>
                  <Dialog open={editUser?.user_id === u.user_id} onOpenChange={(open) => !open && setEditUser(null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={() => setEditUser({ ...u })}>Editar</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Editar Permissões — {u.display_name}</DialogTitle>
                      </DialogHeader>
                      {editUser && (
                        <div className="space-y-4">
                          <div>
                            <Label>Nome de Exibição</Label>
                            <Input
                              value={editUser.display_name}
                              onChange={(e) => setEditUser({ ...editUser, display_name: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Perfil</Label>
                            <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">ADMIN</SelectItem>
                                <SelectItem value="funcionario">FUNCIONÁRIO</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {editUser.role !== "admin" && (
                            <>
                              <div>
                                <Label className="mb-2 block">Abas Liberadas</Label>
                                <div className="grid grid-cols-2 gap-2">
                                  {ALL_TABS.map((tab) => (
                                    <label key={tab.key} className="flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={editUser.allowed_tabs?.includes(tab.key)}
                                        onChange={(e) => {
                                          const tabs = e.target.checked
                                            ? [...(editUser.allowed_tabs || []), tab.key]
                                            : (editUser.allowed_tabs || []).filter((t) => t !== tab.key);
                                          setEditUser({ ...editUser, allowed_tabs: tabs });
                                        }}
                                      />
                                      {tab.label}
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-3">
                                <Label>Permissões Adicionais</Label>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">Editar preços</span>
                                  <Switch checked={editUser.can_edit_prices} onCheckedChange={(v) => setEditUser({ ...editUser, can_edit_prices: v })} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">Editar custos</span>
                                  <Switch checked={editUser.can_edit_costs} onCheckedChange={(v) => setEditUser({ ...editUser, can_edit_costs: v })} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">Ver dashboard</span>
                                  <Switch checked={editUser.can_view_dashboard} onCheckedChange={(v) => setEditUser({ ...editUser, can_view_dashboard: v })} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">Registrar vendas</span>
                                  <Switch checked={editUser.can_register_sales} onCheckedChange={(v) => setEditUser({ ...editUser, can_register_sales: v })} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">Registrar caixa</span>
                                  <Switch checked={editUser.can_register_cash} onCheckedChange={(v) => setEditUser({ ...editUser, can_register_cash: v })} />
                                </div>
                              </div>
                            </>
                          )}

                          <Button className="w-full" onClick={() => handleSavePermissions(editUser)}>
                            Salvar Permissões
                          </Button>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
