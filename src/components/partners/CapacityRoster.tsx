// src/components/partners/CapacityRoster.tsx
import { Fragment } from "react";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import {
  FORECAST_ROLES,
  ROSTER_ROLE_KEYS,
  type ForecastRoleKey,
  type ProductionPerson,
} from "@/lib/forecast/types";
import { ACTUAL_WINDOW_WEEKS, type PersonSupplyRow, type ResolvedSupply } from "@/lib/forecast/supply";
import { cn } from "@/lib/utils";

interface Props {
  team: ProductionPerson[];
  resolved: ResolvedSupply;
  monthLabels: string[];
  onUpdatePerson: (id: string, patch: Partial<ProductionPerson>) => void;
}

const fmt = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

const roleOf = (k: ForecastRoleKey) => FORECAST_ROLES.find((r) => r.key === k)!;

/**
 * The capacity side of the team: same people as the P&L roster, no money, and one number per
 * person — the most we're willing to run them at per week. Next to it sits what they have
 * actually been completing recently, so "are we above a sustainable load" is a comparison you
 * can read rather than compute.
 *
 * Actuals are a recent average, not a busiest-ever week. Planning at everyone's simultaneous
 * personal record is how a forecast schedules burnout and then reports it as healthy.
 */
export function CapacityRoster({ team, resolved, monthLabels, onUpdatePerson }: Props) {
  const { perPerson, actualsByRole, supply } = resolved;

  const setRole = (p: ProductionPerson, value: string) =>
    onUpdatePerson(p.id, {
      role: (value || undefined) as ProductionPerson["role"],
      // A number entered as videos/week means nothing as briefs/week, so it goes with the role.
      ...(value ? {} : { capacityPerWeek: undefined }),
    });

  const setMax = (p: ProductionPerson, raw: string) =>
    onUpdatePerson(p.id, { capacityPerWeek: raw === "" ? undefined : parseFloat(raw) || 0 });

  const unassigned = team.filter((p) => !p.role);

  const personRow = (p: ProductionPerson, row: PersonSupplyRow | undefined) => {
    const actual = row?.actualPerWeek ?? null;
    const max = p.capacityPerWeek;
    const over = actual !== null && max != null && max > 0 && actual > max;
    return (
      <tr key={p.id} className="border-t border-border/50">
        <td className="px-2 py-1 whitespace-nowrap">
          {p.name}
          {p.startMonthIndex > 0 && (
            <span className="text-[10px] text-muted-foreground/60"> from {monthLabels[p.startMonthIndex]}</span>
          )}
        </td>
        <td className={cn("px-2 py-1 text-right font-mono", over && "text-amber-500")}>{fmt(actual)}</td>
        <td className="px-2 py-1">
          <Input
            type="number"
            min="0"
            step="0.5"
            aria-label={`Max per week for ${p.name}`}
            className="w-16 font-mono text-right h-7"
            placeholder={actual !== null ? fmt(actual) : "—"}
            value={max ?? ""}
            onChange={(e) => setMax(p, e.target.value)}
          />
        </td>
        <td className="px-2 py-1 text-xs">
          {row && !row.matched ? (
            <span
              className="uppercase tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px]"
              title="No Fibery task history matched this name. Either they're new, or the name doesn't match how Fibery reports them."
            >
              no history
            </span>
          ) : over ? (
            <span className="text-amber-500">over the max you set</span>
          ) : max == null ? (
            <span className="text-muted-foreground/60">following actuals</span>
          ) : null}
        </td>
        <td className="px-2 py-1">
          <select
            aria-label={`Role for ${p.name}`}
            className="bg-background border border-input rounded px-2 h-7 text-sm"
            value={p.role ?? ""}
            onChange={(e) => setRole(p, e.target.value)}
          >
            <option value="">Not production</option>
            {ROSTER_ROLE_KEYS.map((k) => (
              <option key={k} value={k}>{roleOf(k).display}</option>
            ))}
          </select>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      <SectionHeader title="Team capacity — actual vs the max we set" />
      <p className="text-xs text-muted-foreground">
        Actual is the average per week over the last {ACTUAL_WINDOW_WEEKS} completed weeks, from
        Fibery. Max is ours to set: the most we're willing to run someone at, not their record
        week. Leave Max blank and that person's own actual is used instead. People marked Not
        production carry cost on the P&amp;L and no capacity here.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left font-medium px-2 py-1">Person</th>
              <th className="text-right font-medium px-2 py-1 whitespace-nowrap">Actual / wk</th>
              <th className="text-left font-medium px-2 py-1 whitespace-nowrap">Max / wk</th>
              <th className="text-left font-medium px-2 py-1" />
              <th className="text-left font-medium px-2 py-1">Role</th>
            </tr>
          </thead>
          <tbody>
            {ROSTER_ROLE_KEYS.map((key) => {
              const people = team.filter((p) => p.role === key);
              const rows = perPerson.filter((r) => r.role === key);
              const declared = supply[key]?.[0] ?? 0;
              const actual = actualsByRole[key] ?? 0;
              return (
                <Fragment key={key}>
                  <tr className="border-t-2 border-border">
                    <td colSpan={5} className="px-2 pt-2 pb-0.5 text-xs font-semibold">
                      {roleOf(key).display}
                      <span className="font-normal text-muted-foreground/60"> · {roleOf(key).unit}</span>
                    </td>
                  </tr>
                  {people.length === 0 ? (
                    <tr className="border-t border-border/50">
                      <td colSpan={5} className="px-2 py-1 text-xs italic text-muted-foreground">
                        Nobody assigned, so this role's ceiling is the {fmt(actual)}/wk that
                        whoever does the work is currently averaging.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {people.map((p) => personRow(p, rows.find((r) => r.id === p.id)))}
                      <tr
                        aria-label={`${roleOf(key).display} ceiling`}
                        className="border-t border-border/50 text-xs text-muted-foreground"
                      >
                        <td className="px-2 py-1">Ceiling this month</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(actual)}</td>
                        <td className="px-2 py-1 font-mono">{fmt(declared)}</td>
                        <td colSpan={2} className="px-2 py-1">
                          {declared > 0 && actual > declared && (
                            <span className="text-amber-500">
                              running {Math.round((actual / declared - 1) * 100)}% above the max we set
                            </span>
                          )}
                        </td>
                      </tr>
                    </>
                  )}
                </Fragment>
              );
            })}
            {unassigned.length > 0 && (
              <>
                <tr className="border-t-2 border-border">
                  <td colSpan={5} className="px-2 pt-2 pb-0.5 text-xs font-semibold text-muted-foreground">
                    Not assigned to a production role
                  </td>
                </tr>
                {unassigned.map((p) => personRow(p, undefined))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
