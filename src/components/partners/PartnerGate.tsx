// src/components/partners/PartnerGate.tsx
import { type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isPartner } from "@/lib/partners";

export function PartnerGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }
  if (!isPartner(user?.email)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Partners only</h1>
          <p className="text-muted-foreground">This view is restricted to FireTeam partners.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
