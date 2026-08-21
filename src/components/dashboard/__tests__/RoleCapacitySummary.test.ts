import { describe, it, expect } from "vitest";
import { subDays, startOfWeek, format } from "date-fns";
import {
  processTasksForCapacity,
  ROLE_ASSIGNMENTS,
  type RoleType,
} from "@/hooks/useFiberyData";
import { ROLE_BARS } from "../RoleCapacitySummary";
import type { Task } from "@/lib/fibery";

// A completed task for `who`, done in the week `weeksAgo` weeks back.
function task(id: string, who: string, name: string, weeksAgo: number): Task {
  const weekStart = startOfWeek(subDays(new Date(), weeksAgo * 7), { weekStartsOn: 1 });
  return {
    id,
    name,
    done: true,
    // Wednesday of that week, so no timezone wobble can push it into a neighbour.
    doneDate: format(subDays(weekStart, -2), "yyyy-MM-dd"),
    dueDate: null,
    assignee: { name: who },
    taskTemplateRole: null,
    project: { name: "P", client: { name: "C" }, status: { name: "Done" } },
  };
}

function designWeek(who: string, weeksAgo: number, count: number): Task[] {
  return Array.from({ length: count }, (_, i) =>
    task(`${who}-${weeksAgo}-${i}`, who, "Design static", weeksAgo),
  );
}

function peakFor(groups: ReturnType<typeof processTasksForCapacity>, role: RoleType, who: string) {
  const person = groups.find((g) => g.role === role)?.people.find((p) => p.name === who);
  const row = person?.taskTypes.find((t) => t.taskType === person.primaryTaskType);
  return row?.maxWeek26 ?? 0;
}

describe("Role Capacity ceiling", () => {
  // The bug this guards: the proxy capped `tasks` at 3000 rows with no paging, so
  // processTasksForCapacity only ever saw the newest ~4 weeks. maxWeek26 then
  // reported a 4-week peak under a 26-week name, and every utilisation bar read
  // far hotter than reality. Nothing errored — the data just wasn't there.
  it("finds a peak week that sits outside the last month", () => {
    const tasks = [
      ...designWeek("Erik Furtado", 20, 11), // the real ceiling, 20 weeks back
      ...designWeek("Erik Furtado", 3, 5),
      ...designWeek("Erik Furtado", 2, 4),
      ...designWeek("Erik Furtado", 1, 5),
    ];

    expect(peakFor(processTasksForCapacity(tasks, "all"), "Design", "Erik Furtado")).toBe(11);
  });

  it("reports a lower ceiling when history is truncated, which is what truncation looked like", () => {
    const recentOnly = [
      ...designWeek("Erik Furtado", 3, 5),
      ...designWeek("Erik Furtado", 2, 4),
      ...designWeek("Erik Furtado", 1, 5),
    ];

    // Same person, same recent weeks, older history missing: the ceiling collapses
    // from 11 to 5. This is the shape of the failure, asserted so a future change
    // that quietly shortens the window fails here instead of on the dashboard.
    expect(peakFor(processTasksForCapacity(recentOnly, "all"), "Design", "Erik Furtado")).toBe(5);
  });

  it("counts only the primary task type toward a person's ceiling", () => {
    const tasks = [
      ...designWeek("Erik Furtado", 5, 6),
      // Review work in the same week must not inflate the Design ceiling.
      ...Array.from({ length: 9 }, (_, i) =>
        task(`rev-${i}`, "Erik Furtado", "Review creative", 5),
      ),
    ];

    expect(peakFor(processTasksForCapacity(tasks, "all"), "Design", "Erik Furtado")).toBe(6);
  });
});

describe("ROLE_BARS", () => {
  // The bug this guards: ROLE_BARS used to name a role, "Creative Review", that
  // had been split into "CD Review" and "AM Review". The lookup missed, the bar
  // silently stopped rendering, and nobody noticed for weeks. The tuple type now
  // makes a bad key a compile error; this makes an ORPHANED key a test failure.
  it("names only roles that someone is actually assigned to", () => {
    const staffed = new Set<RoleType>(
      Object.values(ROLE_ASSIGNMENTS).flatMap((rs) => rs.map((r) => r.role)),
    );

    const orphaned = ROLE_BARS.filter(([key]) => !staffed.has(key)).map(([key]) => key);
    expect(orphaned).toEqual([]);
  });

  it("does not render the same role twice", () => {
    const keys = ROLE_BARS.map(([key]) => key);
    expect(keys).toHaveLength(new Set(keys).size);
  });
});
