import { LayoutDashboard, Package, ShoppingCart, Users, Warehouse, DollarSign, BookOpen, Calculator, TrendingUp, LogOut, Landmark, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import logo from "@/assets/logo.png";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const TAB_TO_KEY: Record<string, string> = {
  "/": "dashboard",
  "/produtos": "produtos",
  "/estoque": "estoque",
  "/vendas": "vendas",
  "/clientes": "clientes",
  "/financeiro": "financeiro",
  "/receitas": "receitas",
  "/custos": "custos",
  "/precificacao": "precificacao",
  "/caixa": "caixa",
  "/alertas-estoque": "alertas-estoque",
  "/usuarios": "usuarios",
};

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, key: "dashboard" },
  { title: "Produtos", url: "/produtos", icon: Package, key: "produtos" },
  { title: "Estoque", url: "/estoque", icon: Warehouse, key: "estoque" },
  { title: "Vendas", url: "/vendas", icon: ShoppingCart, key: "vendas" },
  { title: "Clientes", url: "/clientes", icon: Users, key: "clientes" },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign, key: "financeiro" },
  { title: "Receitas", url: "/receitas", icon: BookOpen, key: "receitas" },
  { title: "Custos", url: "/custos", icon: Calculator, key: "custos" },
  { title: "Precificação", url: "/precificacao", icon: TrendingUp, key: "precificacao" },
  { title: "Caixa", url: "/caixa", icon: Landmark, key: "caixa" },
  { title: "Alertas Estoque", url: "/alertas-estoque", icon: AlertTriangle, key: "alertas-estoque" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin, canAccess, loading } = useUserRole();

  if (loading) {
    return (
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
          <SidebarGroupLabel className="gap-2 text-sm py-4">
              <img src={logo} alt="Confeitaria Fadinha" className={collapsed ? "h-8 w-8 object-contain" : "h-10 object-contain"} />
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[1,2,3,4].map(i => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuButton className="animate-pulse">
                      <div className="h-4 w-4 rounded bg-muted" />
                      {!collapsed && <div className="h-4 w-24 rounded bg-muted" />}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  }

  const visibleItems = items.filter((item) => canAccess(item.key));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="gap-2 text-sm">
            <Cake className="h-5 w-5 text-pink" />
            {!collapsed && <span className="font-display font-semibold text-foreground">Confeitaria</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/70 rounded-lg transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/usuarios"
                      className="hover:bg-sidebar-accent/70 rounded-lg transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Usuários</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => signOut()} className="text-muted-foreground hover:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {!collapsed && <span>Sair</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
