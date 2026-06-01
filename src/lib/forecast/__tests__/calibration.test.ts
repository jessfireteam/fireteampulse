// src/lib/forecast/__tests__/calibration.test.ts
import { describe, it, expect } from "vitest";
import { computeRolePeaks, computeCalibration } from "../calibration";
import type { RoleGroup } from "@/hooks/useFiberyData";
import type { Task } from "@/lib/fibery";

function task(name: string, doneDate: string | null): Task {
  return {
    id: name + doneDate,
    name,
    done: !!doneDate,
    doneDate,
    dueDate: null,
    assignee: { name: "X" },
    taskTemplateRole: null,
    project: { name: "P", client: { name: "C" }, status: null },
  };
}

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

describe("computeCalibration", () => {
  it("computes role-tasks per delivered asset over the window", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const inWindow = "2026-05-15";
    const tasks: Task[] = [
      task("Design the static", inWindow),
      task("Design the static", inWindow),
    ];
    const projects = [{ doneDate: inWindow, client: { name: "C" } }];
    const cal = computeCalibration(tasks, projects, now, 12);
    expect(cal.Design).toBeCloseTo(2, 5);
  });

  it("returns 0 for a role with no completed assets in window", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const cal = computeCalibration([], [], now, 12);
    expect(cal.Design).toBe(0);
  });
});
