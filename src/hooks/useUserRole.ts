import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "funcionario";

export interface UserProfile {
  user_id: string;
  display_name: string;
  is_active: boolean;
  allowed_tabs: string[];
  can_edit_prices: boolean;
  can_edit_costs: boolean;
  can_view_dashboard: boolean;
  can_register_sales: boolean;
  can_register_cash: boolean;
}

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    async function fetchRoleAndProfile() {
      const [roleRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user!.id).maybeSingle(),
        supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle(),
      ]);

      setRole((roleRes.data?.role as AppRole) ?? "funcionario");
      if (profileRes.data) {
        setProfile(profileRes.data as unknown as UserProfile);
      }
      setLoading(false);
    }

    fetchRoleAndProfile();
  }, [user]);

  const isAdmin = role === "admin";

  const canAccess = (tab: string): boolean => {
    if (isAdmin) return true;
    if (tab === "usuarios") return false; // Only admins
    if (!profile) return false;
    if (!profile.is_active) return false;
    return profile.allowed_tabs.includes(tab);
  };

  return { role, isAdmin, profile, loading, canAccess };
}
