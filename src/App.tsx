import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import Layout from "@/components/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Stock from "@/pages/Stock";
import Sales from "@/pages/Sales";
import Clients from "@/pages/Clients";
import Financial from "@/pages/Financial";
import Recipes from "@/pages/Recipes";
import Costs from "@/pages/Costs";
import Pricing from "@/pages/Pricing";
import CashRegister from "@/pages/CashRegister";
import StockAlerts from "@/pages/StockAlerts";
import UserManagement from "@/pages/UserManagement";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-pink border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<ProtectedRoute tabKey="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/produtos" element={<ProtectedRoute tabKey="produtos"><Products /></ProtectedRoute>} />
          <Route path="/estoque" element={<ProtectedRoute tabKey="estoque"><Stock /></ProtectedRoute>} />
          <Route path="/vendas" element={<ProtectedRoute tabKey="vendas"><Sales /></ProtectedRoute>} />
          <Route path="/clientes" element={<ProtectedRoute tabKey="clientes"><Clients /></ProtectedRoute>} />
          <Route path="/financeiro" element={<ProtectedRoute tabKey="financeiro"><Financial /></ProtectedRoute>} />
          <Route path="/receitas" element={<ProtectedRoute tabKey="receitas"><Recipes /></ProtectedRoute>} />
          <Route path="/custos" element={<ProtectedRoute tabKey="custos"><Costs /></ProtectedRoute>} />
          <Route path="/precificacao" element={<ProtectedRoute tabKey="precificacao"><Pricing /></ProtectedRoute>} />
          <Route path="/caixa" element={<ProtectedRoute tabKey="caixa"><CashRegister /></ProtectedRoute>} />
          <Route path="/alertas-estoque" element={<ProtectedRoute tabKey="alertas-estoque"><StockAlerts /></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute tabKey="usuarios"><UserManagement /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </AppProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
