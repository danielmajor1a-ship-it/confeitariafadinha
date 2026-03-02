import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Stock from "@/pages/Stock";
import Sales from "@/pages/Sales";
import Clients from "@/pages/Clients";
import Financial from "@/pages/Financial";
import Recipes from "@/pages/Recipes";
import Costs from "@/pages/Costs";
import Pricing from "@/pages/Pricing";
import Auth from "@/pages/Auth";
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
          <Route path="/" element={<Dashboard />} />
          <Route path="/produtos" element={<Products />} />
          <Route path="/estoque" element={<Stock />} />
          <Route path="/vendas" element={<Sales />} />
          <Route path="/clientes" element={<Clients />} />
          <Route path="/financeiro" element={<Financial />} />
          <Route path="/receitas" element={<Recipes />} />
          <Route path="/custos" element={<Costs />} />
          <Route path="/precificacao" element={<Pricing />} />
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
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
