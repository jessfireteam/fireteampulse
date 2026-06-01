// src/lib/forecast/calibration.ts
import { startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import type { RoleGroup } from "@/hooks/useFiberyData";
import { isExcludedMember, getTaskCategory } from "@/hooks/useFiberyData";
import type { Task } from "@/lib/fibery";
import { FORECAST_ROLES, type Calibration, type RolePeaks, type ForecastRoleKey, type TypedCalibration } from "./types";
import { parseLocalDate } from "./dates";
import { classifyAssetType, type AssetType } from "./assetType";

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

export function computeCalibration(
  tasks: Task[],
  projects: MinimalProject[],
  referenceDate: Date,
  windowWeeks: number,
): Calibration {
  const windowStart = startOfWeek(subWeeks(referenceDate, windowWeeks), { weekStartsOn: 1 });
  const windowEnd = endOfWeek(subWeeks(referenceDate, 1), { weekStartsOn: 1 });
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

interface TypedProject {
  doneDate: string | null;
  name: string;
  type: { name: string } | null;
}

const EMPTY_CAL = (): Calibration => ({
  Account: 0, "Creative Review": 0, Copywriters: 0, Design: 0, Video: 0,
});

export function computeTypedCalibration(
  tasks: Task[],
  projects: TypedProject[],
  referenceDate: Date,
  windowWeeks: number,
): TypedCalibration {
  const windowStart = startOfWeek(subWeeks(referenceDate, windowWeeks), { weekStartsOn: 1 });
  const windowEnd = endOfWeek(subWeeks(referenceDate, 1), { weekStartsOn: 1 });
  const inWindow = (d: string | null) =>
    !!d && isWithinInterval(parseLocalDate(d), { start: windowStart, end: windowEnd });

  // Map in-window project NAME -> asset type, and count assets per type.
  const projectType = new Map<string, AssetType>();
  let videoAssets = 0;
  let staticAssets = 0;
  projects.forEach((p) => {
    if (!inWindow(p.doneDate)) return;
    const type = classifyAssetType(p.name, p.type?.name);
    projectType.set(p.name, type);
    if (type === "video") videoAssets += 1;
    else staticAssets += 1;
  });

  const video = EMPTY_CAL();
  const staticCal = EMPTY_CAL();

  FORECAST_ROLES.forEach((role) => {
    let videoTaskCount = 0;
    let staticTaskCount = 0;
    tasks.forEach((t) => {
      if (!t.done || !inWindow(t.doneDate)) return;
      if (getTaskCategory(t.name) !== role.category) return;
      const projName = t.project?.name;
      if (!projName || !projectType.has(projName)) return;
      if (projectType.get(projName) === "video") videoTaskCount += 1;
      else staticTaskCount += 1;
    });
    video[role.key] = videoAssets > 0 ? videoTaskCount / videoAssets : 0;
    staticCal[role.key] = staticAssets > 0 ? staticTaskCount / staticAssets : 0;
  });

  return { video, static: staticCal };
}
