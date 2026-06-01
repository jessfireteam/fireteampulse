// src/lib/forecast/calibration.ts
import type { RoleGroup } from "@/hooks/useFiberyData";
import { isExcludedMember } from "@/hooks/useFiberyData";
import { type RolePeaks, type ForecastRoleKey } from "./types";

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
