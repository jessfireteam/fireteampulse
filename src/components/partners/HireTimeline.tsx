import { FORECAST_ROLES, type ForecastResult } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { cn } from "@/lib/utils";

/** Shows the first month each role's projected demand crosses its peak. */
export function HireTimeline({ result }: { result: ForecastResult }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Hire signal" />
      <div className="flex flex-wrap gap-2">
        {FORECAST_ROLES.map((role) => {
          const monthIdx = result.hireByRole[role.key];
          const label = monthIdx === null ? null : result.months[monthIdx]?.label;
          return (
            <span
              key={role.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                label ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-400",
              )}
            >
              {role.display}
              <span className="font-mono">{label ? `breaks ${label}` : "clear"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
