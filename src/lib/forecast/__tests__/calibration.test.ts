// src/lib/forecast/__tests__/calibration.test.ts
import { describe, it, expect } from "vitest";
import { computeRolePeaks } from "../calibration";
import type { RoleGroup } from "@/hooks/useFiberyData";

describe("computeRolePeaks", () => {
  it("sums each person's primary-row maxWeek26 per role, excluding departed", () => {
    const groups: RoleGroup[] = [
      {
        role: "Design",
        people: [
          {
            name: "Erik Furtado",
            role: "Design",
            primaryTaskType: "Design",
            taskTypes: [{ taskType: "Design", avg30Day: 0, weekCounts: [], maxWeek26: 5, inheritedOverdue: 0, trueOverdue: 0, due7Days: 0, due30Days: 0 }],
            subtotal: { taskType: "Subtotal", avg30Day: 0, weekCounts: [], maxWeek26: 5, inheritedOverdue: 0, trueOverdue: 0, due7Days: 0, due30Days: 0 },
          },
        ],
      },
    ];
    const peaks = computeRolePeaks(groups);
    expect(peaks.Design).toBe(5);
  });
});
