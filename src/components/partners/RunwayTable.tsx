// src/components/partners/RunwayTable.tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { clientFootprint, type RunwayRole } from "@/lib/forecast/runway";
import type { RoleRates } from "@/lib/forecast/types";
import { cn } from "@/lib/utils";

interface Props {
  roles: RunwayRole[];
  monthLabels: string[];
  roleRates?: RoleRates;
  hireLeadWeeks: number;
  onLeadWeeksChange: (weeks: number) => void;
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
export function RunwayTable({ roles, monthLabels, roleRates, hireLeadWeeks, onLeadWeeksChange }: Props) {
  const [fpSize, setFpSize] = useState(12);
  const [fpVideoPct, setFpVideoPct] = useState(50);

  const footprint = clientFootprint(fpSize, fpVideoPct / 100, roles, roleRates);

  return (
    <div className="space-y-3">
      <SectionHeader title="Hiring runway — surplus/deficit in people" />
      <p className="text-xs text-muted-foreground">
        Each cell is (team ÷ one hire's weekly output) minus (demand ÷ same), so −0.8 means
        "0.8 of a hire short". Now = today's actual production. The months = every client's
        plan plus the new-business pipeline from the P&amp;L tab. A req date appears when a month
        goes half a person short, backed off by{" "}
        <Input
          type="number"
          min="0"
          aria-label="Hiring lead time in weeks"
          className="inline-block h-6 w-14 mx-1 font-mono text-right align-middle"
          value={hireLeadWeeks}
          onChange={(e) => onLeadWeeksChange(parseInt(e.target.value) || 0)}
        />{" "}
        weeks of hiring lead time.
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium px-2 py-1 whitespace-nowrap">Role</th>
              <th className="text-right font-medium px-2 py-1 whitespace-nowrap border-r border-border">
                Now (actual)
              </th>
              {monthLabels.map((l) => (
                <th key={l} className="text-right font-medium px-1.5 py-1 whitespace-nowrap">{l}</th>
              ))}
              <th className="text-left font-medium px-2 py-1 whitespace-nowrap">Post req by</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {roles.map((r) => (
              <tr key={r.role} className={cn("border-t border-border/50", r.blocked && "opacity-50")}>
                <td className="px-2 py-1 font-sans whitespace-nowrap">
                  {r.display}
                  <span className="text-muted-foreground/60"> ·1 hire = {r.hireUnit}/wk</span>
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
                          title={`First month more than half a hire short: ${r.firstDeficitLabel}`}
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
