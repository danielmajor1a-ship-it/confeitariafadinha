import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";

interface ProtectedRouteProps {
  tabKey: string;
  children: React.ReactNode;
}

export default function ProtectedRoute({ tabKey, children }: ProtectedRouteProps) {
  const { isAdmin, canAccess, loading } = useUserRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-pink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccess(tabKey)) {
    // Redirect to first allowed route or vendas as fallback
    return <Navigate to="/vendas" replace />;
  }

  return <>{children}</>;
}
