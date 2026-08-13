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

export function hireUnitFor(role: ForecastRoleKey, config?: RunwayConfig): number {
  return config?.hireUnitPerWeek?.[role] ?? RUNWAY_DEFAULT_HIRE_UNITS[role];
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
    const unit = hireUnitFor(role, config);
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
