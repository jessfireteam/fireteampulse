// src/components/partners/RunwayTable.tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { clientFootprint, type RunwayRole } from "@/lib/forecast/runway";
import type { ForecastRoleKey, RoleRates } from "@/lib/forecast/types";
import { cn } from "@/lib/utils";

interface Props {
  roles: RunwayRole[];
  monthLabels: string[];
  roleRates?: RoleRates;
  hireLeadWeeks: number;
  onLeadWeeksChange: (weeks: number) => void;
  /** Pin or clear a per-role hire-unit override; undefined clears back to the team median. */
  onHireUnitChange: (role: ForecastRoleKey, value: number | undefined) => void;
}

const fmtGap = (g: number) => (g > 0 ? `+${g.toFixed(1)}` : g.toFixed(1));

function gapClass(g: number): string {
  if (g >= 0) return "text-emerald-500";
  if (g > -0.3) return "text-amber-500";
  return "text-red-500 font-semibold";
}

/**
 * The hiring question answered in its own unit: fractional hires per role per month, not
 * utilization percentages. "Now" is demand at today's actual production (are we drowning);
 * the months are demand at the full plan plus the new-business pipeline (when does growth
 * break us). A hire-by chip backs the first real deficit off by the hiring lead time.
 */
export function RunwayTable({ roles, monthLabels, roleRates, hireLeadWeeks, onLeadWeeksChange, onHireUnitChange }: Props) {
  const [fpSize, setFpSize] = useState(12);
  const [fpVideoPct, setFpVideoPct] = useState(50);

  const footprint = clientFootprint(fpSize, fpVideoPct / 100, roles, roleRates);

  return (
    <div className="space-y-3">
      <SectionHeader title="Hiring runway — spare people by month" />
      <p className="text-xs text-muted-foreground max-w-3xl">
        Every number is a count of people. +1.1 on Video Editing means one spare editor's worth
        of capacity that month. −0.5 means you are half a hire short. The Now column is what the
        team actually produced last month. The month columns are what every client's plan plus
        the pipeline would demand.
      </p>
      <p className="text-xs text-muted-foreground max-w-3xl flex items-center gap-1 flex-wrap">
        <span>
          When a role goes half a hire short, the last column shows when to start hiring: the
          month it breaks, minus
        </span>
        <Input
          type="number"
          min="0"
          aria-label="Hiring lead time in weeks"
          className="inline-block h-6 w-12 font-mono text-right align-middle"
          value={hireLeadWeeks}
          onChange={(e) => onLeadWeeksChange(parseInt(e.target.value) || 0)}
        />
        <span>weeks to find and onboard someone.</span>
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs w-full min-w-[900px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium px-2 py-1 whitespace-nowrap">Role</th>
              <th className="text-right font-medium px-2 py-1 whitespace-nowrap border-r border-border">
                Now (actual)
              </th>
              {monthLabels.map((l) => (
                <th key={l} className="text-right font-medium px-1.5 py-1 whitespace-nowrap">{l}</th>
              ))}
              <th className="text-left font-medium px-2 py-1 whitespace-nowrap">Start hiring by</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {roles.map((r) => (
              <tr key={r.role} className={cn("border-t border-border/50", r.blocked && "opacity-50")}>
                <td className="px-2 py-1 font-sans whitespace-nowrap">
                  {r.display}
                  <span className="text-muted-foreground/60"> ·1 hire =</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    aria-label={`One hire's weekly output for ${r.display}`}
                    title={
                      r.hireUnitSource === "team"
                        ? "Median of this role's typed maxes — raises itself when you raise the team's maxes (e.g. new tooling). Type here only to pin a different belief about a NEW hire."
                        : r.hireUnitSource === "override"
                          ? "Pinned by hand; revert to follow the team's maxes again"
                          : "Default — nobody in this role has a typed max yet"
                    }
                    className="inline-block h-6 w-14 mx-1 font-mono text-right align-middle"
                    placeholder={String(r.hireUnit)}
                    value={r.hireUnitSource === "override" ? r.hireUnit : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      onHireUnitChange(r.role, raw === "" ? undefined : parseFloat(raw) || 0);
                    }}
                  />
                  <span className="text-muted-foreground/60">/wk</span>
                  {r.hireUnitSource === "override" && (
                    <button
                      type="button"
                      onClick={() => onHireUnitChange(r.role, undefined)}
                      className="ml-1 text-[10px] text-muted-foreground/60 underline hover:text-foreground"
                    >
                      revert
                    </button>
                  )}
                  {r.hireUnitSource === "default" && (
                    <span className="ml-1 text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-500">default</span>
                  )}
                </td>
                {r.blocked ? (
                  <td colSpan={monthLabels.length + 2} className="px-2 py-1 font-sans text-muted-foreground italic">
                    blocked: {r.blockedReason}
                  </td>
                ) : (
                  <>
                    <td className={cn("px-2 py-1 text-right border-r border-border", gapClass(r.nowGap))}>
                      {fmtGap(r.nowGap)}
                    </td>
                    {r.monthGaps.map((g, i) => (
                      <td key={i} className={cn("px-1.5 py-1 text-right", gapClass(g))}>
                        {fmtGap(g)}
                      </td>
                    ))}
                    <td className="px-2 py-1 font-sans whitespace-nowrap">
                      {r.hireBy ? (
                        <span
                          className="text-red-500 font-semibold"
                          title={`Goes half a hire short in ${r.firstDeficitLabel}; starting then leaves no time to hire and onboard`}
                        >
                          {r.hireBy}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border p-3 max-w-xl space-y-2">
        <div className="text-sm font-semibold">What one new client costs</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Input
            type="number"
            min="1"
            aria-label="Prospective client deliverables per month"
            className="h-7 w-16 font-mono text-right"
            value={fpSize}
            onChange={(e) => setFpSize(parseInt(e.target.value) || 0)}
          />
          <span>deliverables/mo,</span>
          <Input
            type="number"
            min="0"
            max="100"
            aria-label="Prospective client video share percent"
            className="h-7 w-16 font-mono text-right"
            value={fpVideoPct}
            onChange={(e) => setFpVideoPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
          />
          <span>% video</span>
        </div>
        <div className="text-xs text-muted-foreground leading-6">
          {footprint.rows
            .filter((r) => r.heads > 0)
            .map((r) => (
              <span key={r.role} className="mr-3 whitespace-nowrap">
                {r.display} <b className="text-foreground font-mono">{r.heads.toFixed(2)}</b>
              </span>
            ))}
        </div>
        <div className="text-xs">
          {footprint.firstToBreak ? (
            <span className="text-red-500">
              Breaks {footprint.firstToBreak.display} first ({fmtGap(footprint.firstToBreak.resultingGap)} after signing).
            </span>
          ) : (
            <span className="text-emerald-500">Absorbable with the current team this month.</span>
          )}
        </div>
      </div>
    </div>
  );
}
