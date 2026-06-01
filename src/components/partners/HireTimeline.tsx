// src/components/partners/HireTimeline.tsx
import { FORECAST_ROLES, type ForecastResult } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

export function HireTimeline({ result }: { result: ForecastResult }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Hire signal" />
      <div className="space-y-1.5">
        {FORECAST_ROLES.map((role) => {
          const monthIdx = result.hireByRole[role.key];
          const label = monthIdx === null ? null : result.months[monthIdx]?.label;
          return (
            <div key={role.key} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{role.display}</span>
              {label ? (
                <span className="font-mono text-destructive">breaks {label}</span>
              ) : (
                <span className="font-mono text-emerald-500">clear</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
