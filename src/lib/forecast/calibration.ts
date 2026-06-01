// src/lib/forecast/calibration.ts
import { startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import type { RoleGroup } from "@/hooks/useFiberyData";
import { isExcludedMember, getTaskCategory } from "@/hooks/useFiberyData";
import type { Task } from "@/lib/fibery";
import { FORECAST_ROLES, type Calibration, type RolePeaks, type ForecastRoleKey } from "./types";

const EMPTY_PEAKS = (): RolePeaks => ({
  Account: 0, "Creative Review": 0, Copywriters: 0, Design: 0, Video: 0,
});

export function computeRolePeaks(roleGroups: RoleGroup[]): RolePeaks {
  const peaks = EMPTY_PEAKS();
  roleGroups.forEach((group) => {
    const key = group.role as ForecastRoleKey;
    if (!(key in peaks)) return;
    let sum = 0;
    group.people
      .filter((p) => !isExcludedMember(p.name))
      .forEach((p) => {
        const primary =
          p.taskTypes.find((t) => t.taskType === p.primaryTaskType) ?? p.subtotal;
        sum += primary.maxWeek26;
      });
    peaks[key] = sum;
  });
  return peaks;
}

interface MinimalProject { doneDate: string | null }

/**
 * Parse a Fibery date as a local-midnight Date so date-only strings line up with
 * the local week boundaries date-fns produces (avoids a one-day TZ drift in
 * negative-offset timezones). Datetime strings parse as-is.
 */
function parseLocalDate(d: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
}

export function computeCalibration(
  tasks: Task[],
  projects: MinimalProject[],
  referenceDate: Date,
  windowWeeks: number,
): Calibration {
  const refLocal = new Date(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );
  const windowStart = startOfWeek(subWeeks(refLocal, windowWeeks), { weekStartsOn: 1 });
  const windowEnd = endOfWeek(subWeeks(refLocal, 1), { weekStartsOn: 1 });
  const inWindow = (d: string | null) =>
    !!d && isWithinInterval(parseLocalDate(d), { start: windowStart, end: windowEnd });

  const assetCount = projects.filter((p) => inWindow(p.doneDate)).length;

  const cal: Calibration = {
    Account: 0, "Creative Review": 0, Copywriters: 0, Design: 0, Video: 0,
  };
  if (assetCount === 0) return cal;

  FORECAST_ROLES.forEach((role) => {
    const taskCount = tasks.filter(
      (t) => t.done && inWindow(t.doneDate) && getTaskCategory(t.name) === role.category,
    ).length;
    cal[role.key] = taskCount / assetCount;
  });
  return cal;
}
