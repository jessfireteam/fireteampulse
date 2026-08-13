// src/lib/forecast/engine.ts
import { addMonths, format } from "date-fns";
import { isClientActive } from "./active";
import {
  DEFAULT_ROLE_RATES,
  FORECAST_ROLES,
  WEEKS_PER_MONTH,
  type ForecastMonth,
  type ForecastResult,
  type ForecastRoleKey,
  type RoleMonthCell,
  type RoleRates,
  type RoleSupply,
  type RoleStatus,
  type ScenarioClient,
} from "./types";

/** Fixed: each project generates exactly one task per applicable role. */
const ROLE_INCIDENCE: Record<ForecastRoleKey, { video: number; static: number }> = {
  Account: { video: 1, static: 1 },
  "Creative Review": { video: 1, static: 1 },
  Copywriters: { video: 1, static: 1 },
  // Casting attaches to video only; the share of videos that actually need a creator cast is
  // the role's rate, not its incidence.
  Casting: { video: 1, static: 0 },
  Design: { video: 0, static: 1 },
  Video: { video: 1, static: 0 },
};

function statusFor(utilization: number): RoleStatus {
  if (utilization > 1) return "over";
  if (utilization >= 0.85) return "critical";
  if (utilization >= 0.75) return "warning";
  return "ok";
}

const ROLE_KEYS = FORECAST_ROLES.map((r) => r.key);

export function runForecast(
  scenario: ScenarioClient[],
  /** Per-month ceiling per role; a hire's start month steps it up mid-horizon. */
  supply: RoleSupply,
  horizonMonths: number,
  referenceDate: Date,
  roleRates?: RoleRates,
): ForecastResult {
  const months: ForecastMonth[] = [];
  const hireByRole = ROLE_KEYS.reduce((acc, k) => {
    acc[k] = null;
    return acc;
  }, {} as Record<ForecastRoleKey, number | null>);

  for (let m = 0; m < horizonMonths; m++) {
    const active = scenario.filter((c) => isClientActive(c, m));
    const videos = active.reduce((sum, c) => sum + (c.videosByMonth[m] ?? 0), 0);
    const statics = active.reduce((sum, c) => sum + (c.staticsByMonth[m] ?? 0), 0);
    const assets = videos + statics;
    const videosPerWeek = videos / WEEKS_PER_MONTH;
    const staticsPerWeek = statics / WEEKS_PER_MONTH;

    const roles = {} as Record<ForecastRoleKey, RoleMonthCell>;
    ROLE_KEYS.forEach((key) => {
      const peak = supply[key]?.[m] ?? 0;
      const inc = ROLE_INCIDENCE[key];
      const rate = roleRates?.[key] ?? DEFAULT_ROLE_RATES[key] ?? 1;
      const demandPerWeek =
        (videosPerWeek * inc.video + staticsPerWeek * inc.static) * rate;
      const utilization = peak > 0 ? demandPerWeek / peak : 0;
      const status = statusFor(utilization);
      roles[key] = { role: key, demandPerWeek, peak, utilization, status };
      if (status === "over" && hireByRole[key] === null) hireByRole[key] = m;
    });

    months.push({
      monthIndex: m,
      label: format(addMonths(referenceDate, m), "MMM ''yy"),
      assets,
      roles,
    });
  }

  return { months, hireByRole };
}
