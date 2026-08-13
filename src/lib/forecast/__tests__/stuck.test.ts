import { describe, it, expect } from "vitest";
import { computeStuckWork, stageOf, STAGES } from "../stuck";
import type { Task } from "@/lib/fibery";

const TODAY = new Date("2026-08-13T12:00:00");

const task = (over: Partial<Task>): Task => ({
  id: "t",
  name: "Edit video",
  done: false,
  doneDate: null,
  dueDate: "2026-08-01",
  assignee: { name: "Someone" },
  taskTemplateRole: null,
  project: { name: "P", client: { name: "C" }, status: { name: "In Progress" } },
  ...over,
});

describe("stageOf", () => {
  it("buckets the pipeline in walking order, dodging the three known keyword traps", () => {
    // Trap 1: a revision of an edit is a revision, not production.
    expect(stageOf("REVISION 1: Edit video")).toBe("revisions");
    // Trap 2: assigning a designer is coordination, not design.
    expect(stageOf("Assign Designer")).toBe("assign");
    // Trap 3: brief approval is upstream QC, not deliverable shipping.
    expect(stageOf("Get client approval on brief")).toBe("briefQc");
    expect(stageOf("Get client approval")).toBe("ship");

    expect(stageOf("Write brief")).toBe("brief");
    expect(stageOf("Approve and send brief to client for approval")).toBe("briefQc");
    expect(stageOf("Cast Creator")).toBe("casting");
    expect(stageOf("Receive/check deliverables")).toBe("casting");
    expect(stageOf("Design Statics")).toBe("produce");
    expect(stageOf("Review creative")).toBe("deliverableQc");
    expect(stageOf("Approve internally")).toBe("deliverableQc");
    expect(stageOf("Upload Final Deliverables")).toBe("ship");
    expect(stageOf("Turn on in Meta")).toBe("ship");
    expect(stageOf("Something unrecognisable")).toBeNull();
  });
});

describe("computeStuckWork", () => {
  it("counts only open tasks past due on live projects", () => {
    const stages = computeStuckWork(
      [
        task({ name: "Edit video", dueDate: "2026-08-01" }), // counts
        task({ name: "Edit video", dueDate: "2026-09-01" }), // future
        task({ name: "Edit video", dueDate: "2026-08-01", done: true }), // done
        task({ name: "Edit video", dueDate: null }), // no due date
        task({ name: "Edit video", dueDate: "2026-08-01", project: { name: "P", client: null, status: { name: "Cancelled" } } }),
        task({ name: "Edit video", dueDate: "2026-08-01", project: { name: "P", client: null, status: { name: "Completed" } } }),
      ],
      TODAY,
    );
    expect(stages.find((s) => s.key === "produce")!.count).toBe(1);
  });

  it("counts unassigned late work separately — the Design Statics finding", () => {
    const stages = computeStuckWork(
      [
        task({ name: "Design Statics", assignee: null, dueDate: "2026-07-27" }),
        task({ name: "Design Statics", assignee: { name: "Reynelle Reid" }, dueDate: "2026-08-10" }),
      ],
      TODAY,
    );
    const produce = stages.find((s) => s.key === "produce")!;
    expect(produce.count).toBe(2);
    expect(produce.unassigned).toBe(1);
  });

  it("reports median days late so zombies read differently from fresh slippage", () => {
    const stages = computeStuckWork(
      [
        task({ name: "Review creative", dueDate: "2026-08-11" }), // 2d
        task({ name: "Review creative", dueDate: "2026-08-08" }), // 5d
        task({ name: "Review creative", dueDate: "2026-06-01" }), // 73d zombie
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
