// src/lib/forecast/engine.ts
import { addMonths, format } from "date-fns";
import {
  FORECAST_ROLES,
  WEEKS_PER_MONTH,
  type TypedCalibration,
  type ForecastMonth,
  type ForecastResult,
  type ForecastRoleKey,
  type RoleMonthCell,
  type RolePeaks,
  type RoleStatus,
  type ScenarioClient,
} from "./types";

function statusFor(utilization: number): RoleStatus {
  if (utilization > 1) return "over";
  if (utilization >= 0.85) return "critical";
  if (utilization >= 0.75) return "warning";
  return "ok";
}

const ROLE_KEYS = FORECAST_ROLES.map((r) => r.key);

export function runForecast(
  scenario: ScenarioClient[],
  calibration: TypedCalibration,
  peaks: RolePeaks,
  horizonMonths: number,
  referenceDate: Date,
): ForecastResult {
  const months: ForecastMonth[] = [];
  const hireByRole = ROLE_KEYS.reduce((acc, k) => {
    acc[k] = null;
    return acc;
  }, {} as Record<ForecastRoleKey, number | null>);

  for (let m = 0; m < horizonMonths; m++) {
    const enabled = scenario.filter((c) => c.enabled);
    const videos = enabled.reduce((sum, c) => sum + (c.videosByMonth[m] ?? 0), 0);
    const statics = enabled.reduce((sum, c) => sum + (c.staticsByMonth[m] ?? 0), 0);
    const assets = videos + statics;
    const videosPerWeek = videos / WEEKS_PER_MONTH;
    const staticsPerWeek = statics / WEEKS_PER_MONTH;

    const roles = {} as Record<ForecastRoleKey, RoleMonthCell>;
    ROLE_KEYS.forEach((key) => {
      const peak = peaks[key] ?? 0;
      const demandPerWeek =
        videosPerWeek * (calibration.video[key] ?? 0) +
        staticsPerWeek * (calibration.static[key] ?? 0);
      const utilization = peak > 0 ? demandPerWeek / peak : 0;
      const status = statusFor(utilization);
      roles[key] = { role: key, demandPerWeek, peak, utilization, status };
      if (status === "over" && hireByRole[key] === null) hireByRole[key] = m;
    });

    months.push({
      monthIndex: m,
      label: format(addMonths(referenceDate, m), "MMM yy"),
      assets,
      roles,
    });
  }

  return { months, hireByRole };
}
