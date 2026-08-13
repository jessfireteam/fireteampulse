import { describe, it, expect } from "vitest";
import { computeStuckWork, stageOf, STAGES } from "../stuck";
import type { Task } from "@/lib/fibery";

const TODAY = new Date("2026-08-13T12:00:00");

const task = (over: Partial<Task> & { projectName?: string; clientName?: string }): Task => {
  const { projectName = "P", clientName = "C", ...rest } = over;
  return {
    id: Math.random().toString(36).slice(2),
    name: "Edit video",
    done: false,
    doneDate: null,
    dueDate: "2026-08-01",
    assignee: { name: "Someone" },
    taskTemplateRole: null,
    project: { name: projectName, client: { name: clientName }, status: { name: "In Progress" } },
    ...rest,
  };
};

describe("stageOf", () => {
  it("buckets the pipeline in walking order, dodging the three known keyword traps", () => {
    expect(stageOf("REVISION 1: Edit video")).toBe("revisions");
    expect(stageOf("Assign Designer")).toBe("assign");
    expect(stageOf("Get client approval on brief")).toBe("briefQc");
    expect(stageOf("Get client approval")).toBe("ship");
    expect(stageOf("Write brief")).toBe("brief");
    expect(stageOf("Cast Creator")).toBe("casting");
    expect(stageOf("Receive/check deliverables")).toBe("casting");
    expect(stageOf("Design Statics")).toBe("produce");
    expect(stageOf("Review creative")).toBe("deliverableQc");
    expect(stageOf("Upload Final Deliverables")).toBe("ship");
    expect(stageOf("Something unrecognisable")).toBeNull();
  });
});

describe("computeStuckWork (frontier semantics)", () => {
  it("counts a project ONCE, at its earliest late task — cascade is not re-counted", () => {
    // The Jess critique: one late brief makes the whole chain late. Only the brief counts.
    const stages = computeStuckWork(
      [
        task({ name: "Write brief", dueDate: "2026-07-27", projectName: "Funeral Reply" }),
        task({ name: "Design Statics", dueDate: "2026-08-01", projectName: "Funeral Reply" }),
        task({ name: "Review creative", dueDate: "2026-08-05", projectName: "Funeral Reply" }),
        task({ name: "Upload", dueDate: "2026-08-06", projectName: "Funeral Reply" }),
      ],
      TODAY,
    );
    expect(stages.find((s) => s.key === "brief")!.count).toBe(1);
    expect(stages.find((s) => s.key === "produce")!.count).toBe(0);
    expect(stages.find((s) => s.key === "deliverableQc")!.count).toBe(0);
    expect(stages.find((s) => s.key === "ship")!.count).toBe(0);
  });

  it("treats same-named projects under different clients as different projects", () => {
    const stages = computeStuckWork(
      [
        task({ name: "Write brief", projectName: "Spring Sale", clientName: "A" }),
        task({ name: "Write brief", projectName: "Spring Sale", clientName: "B" }),
      ],
      TODAY,
    );
    expect(stages.find((s) => s.key === "brief")!.count).toBe(2);
  });

  it("ignores done, future-due, and dead-project tasks when picking the blocker", () => {
    const stages = computeStuckWork(
      [
        task({ name: "Write brief", dueDate: "2026-07-01", done: true }),
        task({ name: "Design Statics", dueDate: "2026-08-01" }), // the real blocker
        task({ name: "Review creative", dueDate: "2026-09-01" }), // future
        task({ name: "Write brief", dueDate: "2026-07-01", projectName: "Dead", project: { name: "Dead", client: { name: "C" }, status: { name: "Cancelled" } } }),
      ],
      TODAY,
    );
    expect(stages.find((s) => s.key === "produce")!.count).toBe(1);
    expect(stages.find((s) => s.key === "brief")!.count).toBe(0);
  });

  it("flags unassigned and client-court blockers, counting only the blocker", () => {
    const stages = computeStuckWork(
      [
        task({ name: "Design Statics", assignee: null, dueDate: "2026-07-27", projectName: "P1" }),
        task({ name: "Get client approval", dueDate: "2026-08-01", projectName: "P2" }),
        // Unassigned downstream task in P2 must NOT count as unassigned — it's not the blocker.
        task({ name: "Upload", assignee: null, dueDate: "2026-08-05", projectName: "P2" }),
      ],
      TODAY,
    );
    const produce = stages.find((s) => s.key === "produce")!;
    expect(produce.count).toBe(1);
    expect(produce.unassigned).toBe(1);
    const ship = stages.find((s) => s.key === "ship")!;
    expect(ship.count).toBe(1);
    expect(ship.clientCourt).toBe(1);
    expect(ship.unassigned).toBe(0);
  });

  it("reports median days late of the blockers", () => {
    const stages = computeStuckWork(
      [
        task({ name: "Review creative", dueDate: "2026-08-11", projectName: "A" }), // 2d
        task({ name: "Review creative", dueDate: "2026-08-08", projectName: "B" }), // 5d
        task({ name: "Review creative", dueDate: "2026-06-01", projectName: "Z" }), // 73d zombie
      ],
      TODAY,
    );
    expect(stages.find((s) => s.key === "deliverableQc")!.medianDaysLate).toBe(5);
  });

  it("returns every stage in pipeline order, zeros included", () => {
    const stages = computeStuckWork([], TODAY);
    expect(stages.map((s) => s.key)).toEqual(STAGES.map((s) => s.key));
    expect(stages.every((s) => s.count === 0)).toBe(true);
  });
});
