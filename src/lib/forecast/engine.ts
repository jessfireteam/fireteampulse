// src/lib/forecast/engine.ts
import { addMonths, format } from "date-fns";
import {
  FORECAST_ROLES,
  WEEKS_PER_MONTH,
  type Calibration,
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
  calibration: Calibration,
  peaks: RolePeaks,
  horizonMonths: number,
  referenceDate: Date,
): ForecastResult {
  // Anchor labels on the reference calendar day in local time so that a
  // UTC-midnight referenceDate doesn't render the prior month in negative-offset
  // timezones.
  const refLocal = new Date(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  const months: ForecastMonth[] = [];
  const hireByRole = ROLE_KEYS.reduce((acc, k) => {
    acc[k] = null;
    return acc;
  }, {} as Record<ForecastRoleKey, number | null>);

  for (let m = 0; m < horizonMonths; m++) {
    const assets = scenario
      .filter((c) => c.enabled && c.startMonthIndex <= m)
      .reduce((sum, c) => sum + c.assetsPerMonth, 0);
    const assetsPerWeek = assets / WEEKS_PER_MONTH;

    const roles = {} as Record<ForecastRoleKey, RoleMonthCell>;
    ROLE_KEYS.forEach((key) => {
      const peak = peaks[key] ?? 0;
      const demandPerWeek = assetsPerWeek * (calibration[key] ?? 0);
      const utilization = peak > 0 ? demandPerWeek / peak : 0;
      const status = statusFor(utilization);
      roles[key] = { role: key, demandPerWeek, peak, utilization, status };
      if (status === "over" && hireByRole[key] === null) hireByRole[key] = m;
    });

    months.push({
      monthIndex: m,
      label: format(addMonths(refLocal, m), "MMM yy"),
      assets,
      roles,
    });
  }

  return { months, hireByRole };
}
