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

function rowFor(groups: ReturnType<typeof processTasksForCapacity>, role: RoleType, who: string) {
  const person = groups.find((g) => g.role === role)?.people.find((p) => p.name === who);
  return person?.taskTypes.find((t) => t.taskType === person.primaryTaskType);
}

function peakFor(groups: ReturnType<typeof processTasksForCapacity>, role: RoleType, who: string) {
  return rowFor(groups, role, who)?.maxWeek26 ?? 0;
}

function ceilingFor(groups: ReturnType<typeof processTasksForCapacity>, role: RoleType, who: string) {
  return rowFor(groups, role, who)?.ceilingTop3of13 ?? 0;
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

describe("ceilingTop3of13", () => {
  it("averages the three best weeks instead of taking the single best", () => {
    const tasks = [
      ...designWeek("Erik Furtado", 1, 9),
      ...designWeek("Erik Furtado", 2, 7),
      ...designWeek("Erik Furtado", 3, 5),
      ...designWeek("Erik Furtado", 4, 4),
      ...designWeek("Erik Furtado", 5, 3),
    ];

    const groups = processTasksForCapacity(tasks, "all");
    expect(peakFor(groups, "Design", "Erik Furtado")).toBe(9); // (9+7+5)/3
    expect(ceilingFor(groups, "Design", "Erik Furtado")).toBe(7);
  });

  it("does not let one freak week set the ceiling on its own", () => {
    const steady = [4, 5, 4, 5, 4, 5, 4, 5].flatMap((n, i) =>
      designWeek("Erik Furtado", i + 1, n),
    );
    const withSpike = [...steady, ...designWeek("Erik Furtado", 9, 20)];

    const before = processTasksForCapacity(steady, "all");
    const after = processTasksForCapacity(withSpike, "all");

    // A single 20-week quadruples the max. It moves the ceiling by a third of
    // that, because the other two slots are still ordinary good weeks.
    expect(peakFor(before, "Design", "Erik Furtado")).toBe(5);
    expect(peakFor(after, "Design", "Erik Furtado")).toBe(20);
    expect(ceilingFor(before, "Design", "Erik Furtado")).toBe(5);
    expect(ceilingFor(after, "Design", "Erik Furtado")).toBe(10);
  });

  it("ignores anything older than 13 weeks", () => {
    const tasks = [
      ...designWeek("Erik Furtado", 1, 4),
      ...designWeek("Erik Furtado", 2, 4),
      ...designWeek("Erik Furtado", 3, 4),
      ...designWeek("Erik Furtado", 20, 30), // outside the window entirely
    ];

    const groups = processTasksForCapacity(tasks, "all");
    expect(peakFor(groups, "Design", "Erik Furtado")).toBe(30); // max still sees 26w
    expect(ceilingFor(groups, "Design", "Erik Furtado")).toBe(4);
  });

  it("uses only the weeks a new starter has actually worked", () => {
    // Someone four weeks in has nine zero-weeks inside the 13-week window. A mean
    // would divide by those and understate them; taking the top 3 does not.
    const tasks = [
      ...designWeek("Reynelle Reid", 1, 6),
      ...designWeek("Reynelle Reid", 2, 6),
      ...designWeek("Reynelle Reid", 3, 3),
      ...designWeek("Reynelle Reid", 4, 3),
    ];

    expect(ceilingFor(processTasksForCapacity(tasks, "all"), "Design", "Reynelle Reid")).toBe(5);
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
