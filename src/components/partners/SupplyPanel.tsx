// src/components/partners/SupplyPanel.tsx
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { FORECAST_ROLES, type RolePeaks, type RoleSupply } from "@/lib/forecast/types";
import type { PersonSupplyRow } from "@/lib/forecast/supply";
import { cn } from "@/lib/utils";

interface Props {
  supply: RoleSupply;
  measuredPeaks: RolePeaks;
  perPerson: PersonSupplyRow[];
  monthLabels: string[];
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Makes the supply ceiling auditable. The old flat peak was a single number with no way to see
 * where it came from; this shows the roster people behind each role, this month versus the end
 * of the horizon (so a hire's step is visible), and the measured actual beside the declared
 * figure so a stale capacity number is obvious rather than silently driving the forecast.
 */
export function SupplyPanel({ supply, measuredPeaks, perPerson, monthLabels }: Props) {
  const last = monthLabels.length - 1;

  return (
    <div className="space-y-3">
      <SectionHeader title="Supply — who makes up each role's ceiling" />
      <p className="text-xs text-muted-foreground">
        Set role and capacity per person on the P&amp;L tab. A role with nobody assigned falls back
        to measured actuals from Fibery, which is where Account still comes from.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left font-medium px-2 py-1">Role</th>
              <th className="text-right font-medium px-2 py-1 whitespace-nowrap">{monthLabels[0]}</th>
              <th className="text-right font-medium px-2 py-1 whitespace-nowrap">{monthLabels[last]}</th>
              <th className="text-right font-medium px-2 py-1 whitespace-nowrap">Measured</th>
              <th className="text-left font-medium px-2 py-1">People</th>
            </tr>
          </thead>
          <tbody>
            {FORECAST_ROLES.map((role) => {
              const people = perPerson.filter((p) => p.role === role.key);
              const now = supply[role.key]?.[0] ?? 0;
              const end = supply[role.key]?.[last] ?? 0;
              const measured = measuredPeaks[role.key] ?? 0;
              const fromMeasured = people.length === 0;
              // Only meaningful when people declared their own numbers; a measured-fallback row
              // is the measured number by definition.
              const drift = !fromMeasured && measured > 0 ? now / measured - 1 : null;
              return (
                <tr key={role.key} className="border-t border-border/50 align-top">
                  <td className="px-2 py-1 whitespace-nowrap">
                    {role.display}
                    <span className="text-[10px] text-muted-foreground/60"> {role.unit}</span>
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(now)}</td>
                  <td className={cn("px-2 py-1 text-right font-mono", end > now && "text-emerald-500")}>
                    {fmt(end)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                    {fmt(measured)}
                    {drift !== null && Math.abs(drift) >= 0.2 && (
                      <span
                        className="ml-1 text-[10px] text-amber-500"
                        title="Declared capacity is more than 20% away from what these people have actually been completing"
                      >
                        {drift > 0 ? "+" : ""}
                        {Math.round(drift * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-xs text-muted-foreground">
                    {fromMeasured ? (
                      <span className="italic">from measured actuals (nobody assigned)</span>
                    ) : (
                      people
                        .map(
                          (p) =>
                            `${p.name} ${fmt(p.effective)}` +
                            (p.startMonthIndex > 0 ? ` (from ${monthLabels[p.startMonthIndex]})` : "") +
                            (p.declared == null ? "*" : ""),
                        )
                        .join(", ")
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground/60">* following measured actuals, not a typed number.</p>
    </div>
  );
}
