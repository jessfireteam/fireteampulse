// src/lib/forecast/runway.ts
import { ROLE_INCIDENCE } from "./engine";
import {
  DEFAULT_HIRE_LEAD_WEEKS,
  DEFAULT_ROLE_RATES,
  FORECAST_ROLES,
  HIRE_TRIGGER_HEADS,
  RUNWAY_DEFAULT_HIRE_UNITS,
  WEEKS_PER_MONTH,
  type ForecastMonth,
  type ForecastRoleKey,
  type ProductionPerson,
  type RoleRates,
  type RoleSupply,
  type RunwayConfig,
} from "./types";

/**
 * Roles the runway prices in hires. Account is deliberately absent: an AM's ceiling is client
 * relationships, not tasks per week, so a per-week hire unit would produce a confidently wrong
 * date. It gets its own client-count model separately.
 */
export const RUNWAY_ROLE_KEYS: ForecastRoleKey[] = [
  "CD Review",
  "AM Review",
  "Copywriters",
  "Casting",
  "Design",
  "Video",
];

export interface RunwayRole {
  role: ForecastRoleKey;
  display: string;
  hireUnit: number;
  /** Where the unit came from, so the number is auditable on the page. */
  hireUnitSource: HireUnitSource;
  /** Surplus/deficit in fractional hires at TODAY'S actual flow (the "are we drowning" column). */
  nowGap: number;
  /** Surplus/deficit per horizon month at plan(+pipeline) demand. */
  monthGaps: number[];
  /** Month label to post a req by (first ≤ −HIRE_TRIGGER_HEADS month minus lead), or null. */
  hireBy: string | null;
  /** The month whose deficit triggered hireBy, for the tooltip/explanation. */
  firstDeficitLabel: string | null;
  blocked: boolean;
  blockedReason?: string;
}

export interface RunwayInput {
  months: ForecastMonth[];
  monthLabels: string[];
  supply: RoleSupply;
  /** Actual deliverables per month right now (trailing window), for the Now column. */
  actualVideosPerMonth: number;
  actualStaticsPerMonth: number;
  team: ProductionPerson[];
  roleRates?: RoleRates;
  config?: RunwayConfig;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type HireUnitSource = "override" | "team" | "default";

/**
 * What one NEW hire adds per week. Resolution order:
 *   1. an explicit override typed on the runway (a belief: "a junior won't match Nicolle"),
 *   2. the median of the typed maxes of the people already in the role — new hires get the
 *      same tooling as the team, so the team's ceiling is the best estimate of a new hire's.
 *      This is what keeps the unit current when efficiency changes: raising a person's max
 *      (which the over-max flags already prompt) moves the hire unit with it, automatically.
 *   3. the frozen default, when nobody in the role has a typed max yet.
 *
 * Deliberately NOT a trailing average of actual output: observed throughput is demand-limited
 * (the editors averaged 4.7/wk against an 8/wk cap because only ~16 edits/wk of work arrived),
 * so an actuals-based unit would shrink in blocked weeks and inflate the hire signal exactly
 * when the problem is a blockage, not capacity.
 */
export function hireUnitFor(
  role: ForecastRoleKey,
  team: ProductionPerson[],
  config?: RunwayConfig,
): { unit: number; source: HireUnitSource } {
  const override = config?.hireUnitPerWeek?.[role];
  if (typeof override === "number" && override > 0) return { unit: override, source: "override" };
  const maxes = team
    .filter((p) => p.role === role && typeof p.capacityPerWeek === "number" && p.capacityPerWeek > 0)
    .map((p) => p.capacityPerWeek as number)
    .sort((a, b) => a - b);
  if (maxes.length > 0) {
    const mid = Math.floor(maxes.length / 2);
    const median = maxes.length % 2 ? maxes[mid] : (maxes[mid - 1] + maxes[mid]) / 2;
    return { unit: median, source: "team" };
  }
  return { unit: RUNWAY_DEFAULT_HIRE_UNITS[role], source: "default" };
}

function demandPerWeekAt(
  role: ForecastRoleKey,
  videosPerMonth: number,
  staticsPerMonth: number,
  roleRates?: RoleRates,
): number {
  const inc = ROLE_INCIDENCE[role];
  const rate = roleRates?.[role] ?? DEFAULT_ROLE_RATES[role] ?? 1;
  return (
    ((videosPerMonth / WEEKS_PER_MONTH) * inc.video +
      (staticsPerMonth / WEEKS_PER_MONTH) * inc.static) *
    rate
  );
}

/**
 * Roles whose supply figure can't be trusted yet, with the reason spelled out. Copywriting is
 * blocked until every assigned copywriter has a typed max, because brief-writing is spread
 * across seven people and the trailing-actuals fallback counts only the copywriters' share of
 * it — the ceiling undercounts and the row would read hot forever. Same logic for AM Review
 * (no AMs on the roster yet, and Mark is uncounted).
 */
function blockedReasonFor(role: ForecastRoleKey, team: ProductionPerson[]): string | undefined {
  if (role !== "Copywriters" && role !== "AM Review") return undefined;
  const assigned = team.filter((p) => p.role === role);
  if (assigned.length === 0) {
    return role === "AM Review"
      ? "no AMs on the roster with a review max — add them (Mark included) and set maxes"
      : "no one assigned — set copywriter maxes";
  }
  if (assigned.some((p) => p.capacityPerWeek == null)) {
    return "set a max for everyone in this role — trailing actuals undercount it because the work is spread across people outside the role";
  }
  return undefined;
}

export function computeRunway(input: RunwayInput): RunwayRole[] {
  const { months, monthLabels, supply, team, roleRates, config } = input;
  const leadWeeks = config?.hireLeadWeeks ?? DEFAULT_HIRE_LEAD_WEEKS;
  const leadMonths = Math.ceil(leadWeeks / WEEKS_PER_MONTH);

  return RUNWAY_ROLE_KEYS.map((role) => {
    const display = FORECAST_ROLES.find((r) => r.key === role)!.display;
    const { unit, source: hireUnitSource } = hireUnitFor(role, team, config);
    const blockedReason = blockedReasonFor(role, team);

    const nowDemand = demandPerWeekAt(
      role,
      input.actualVideosPerMonth,
      input.actualStaticsPerMonth,
      roleRates,
    );
    const nowGap = round1((supply[role]?.[0] ?? 0) / unit - nowDemand / unit);

    const monthGaps = months.map((m, i) =>
      round1((supply[role]?.[i] ?? 0) / unit - m.roles[role].demandPerWeek / unit),
    );

    let hireBy: string | null = null;
    let firstDeficitLabel: string | null = null;
    if (!blockedReason) {
      const firstDeficit = monthGaps.findIndex((g) => g <= -HIRE_TRIGGER_HEADS);
      if (firstDeficit >= 0) {
        firstDeficitLabel = monthLabels[firstDeficit] ?? null;
        hireBy = monthLabels[Math.max(0, firstDeficit - leadMonths)] ?? monthLabels[0];
      }
    }

    return {
      role,
      display,
      hireUnit: unit,
      hireUnitSource,
      nowGap,
      monthGaps,
      hireBy,
      firstDeficitLabel,
      blocked: !!blockedReason,
      blockedReason,
    };
  });
}

export interface FootprintRow {
  role: ForecastRoleKey;
  display: string;
  heads: number;
}

export interface Footprint {
  rows: FootprintRow[];
  /** Role with the deepest resulting deficit at month 0 after absorbing the client, or null. */
  firstToBreak: { role: ForecastRoleKey; display: string; resultingGap: number } | null;
}

/** What one prospective client costs, in fractional hires per role. */
export function clientFootprint(
  deliverablesPerMonth: number,
  videoShare: number,
  runwayRoles: RunwayRole[],
  roleRates?: RoleRates,
): Footprint {
  const videos = deliverablesPerMonth * videoShare;
  const statics = deliverablesPerMonth - videos;
  // Two decimals: a client's per-role cost is often 0.1-0.3 heads, and one decimal would
  // round real differences into ties.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rows = runwayRoles.map((r) => ({
    role: r.role,
    display: r.display,
    heads: round2(demandPerWeekAt(r.role, videos, statics, roleRates) / r.hireUnit),
  }));

  let firstToBreak: Footprint["firstToBreak"] = null;
  for (const r of runwayRoles) {
    if (r.blocked) continue;
    const cost = rows.find((x) => x.role === r.role)!.heads;
    const resulting = round1(r.monthGaps[0] - cost);
    if (resulting < 0 && (firstToBreak === null || resulting < firstToBreak.resultingGap)) {
      firstToBreak = { role: r.role, display: r.display, resultingGap: resulting };
    }
  }
  return { rows, firstToBreak };
}
