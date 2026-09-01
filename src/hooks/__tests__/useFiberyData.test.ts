import { describe, it, expect } from "vitest";
import { getTaskCategory, isRevisionTask, processTasksForCapacity } from "../useFiberyData";
import type { Task } from "@/lib/fibery";

describe("getTaskCategory", () => {
  it("buckets a REVISION-prefixed task by its base name, not into Revisions", () => {
    // The old early-return sent every "revision" to its own bucket, so a revision edit
    // never counted as Video Editing and capacity was measured first-passes-only while
    // demand rates included revisions — different units.
    expect(getTaskCategory("REVISION 1: Edit video")).toBe("Video Editing");
    expect(getTaskCategory("REVISION 2: Review Creative")).toBe("Creative Review");
    expect(getTaskCategory("REVISION 3: Design static")).toBe("Design");
  });

  it("keeps a revision brief in Brief Work exactly once — no double counting", () => {
    // 'write brief' was already checked before 'revision', so copywriting always included
    // revisions. Stripping the prefix must land in the same single bucket.
    expect(getTaskCategory("REVISION 1: Write Brief")).toBe("Brief Work");
    expect(getTaskCategory("REVISION 1: Approve and Send Brief")).toBe("Briefs Sent");
  });

  it("pools a revision whose base name matches no category under Revisions, not Other", () => {
    expect(getTaskCategory("REVISION 1: Approve Creative")).toBe("Revisions");
  });

  it("keeps non-prefixed revision mentions in the Revisions bucket", () => {
    expect(getTaskCategory("Send revisions to client")).toBe("Revisions");
  });

  it("leaves first-pass tasks where they were", () => {
    expect(getTaskCategory("Edit video")).toBe("Video Editing");
    expect(getTaskCategory("Review Creative")).toBe("Creative Review");
    expect(getTaskCategory("Cast Creator")).toBe("Cast Creator");
  });
});

describe("isRevisionTask", () => {
  it("matches only the standard prefix", () => {
    expect(isRevisionTask("REVISION 1: Edit video")).toBe(true);
    expect(isRevisionTask("revision 12: edit video")).toBe(true);
    expect(isRevisionTask("Edit video")).toBe(false);
    expect(isRevisionTask("Send revisions to client")).toBe(false);
  });
});

describe("processTasksForCapacity — revision rounds count as capacity", () => {
  // One fixed completion time ~8 days ago: inside the measured 8-week window, outside the
  // current partial week, and all in the same week so maxWeek26 is deterministic.
  const doneAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  let nextId = 0;
  const task = (assignee: string, name: string): Task => ({
    id: `t${nextId++}`,
    name,
    done: true,
    doneDate: doneAt,
    dueDate: null,
    assignee: { name: assignee },
    taskTemplateRole: null,
    project: { name: "P1", client: { name: "C1" }, status: { name: "Active" } },
  });

  const tasks: Task[] = [
    // Vaiv: 2 first-pass edits + 2 revision edits = 4 total Video Editing tasks.
    task("Vaiv Singh", "Edit video"),
    task("Vaiv Singh", "Edit video"),
    task("Vaiv Singh", "REVISION 1: Edit video"),
    task("Vaiv Singh", "REVISION 2: Edit video"),
    // Niki: 3 first-pass reviews + 2 revision reviews = 5 Creative Review tasks,
    // plus 3 revision approvals that must pool under Revisions, NOT Creative Review.
    task("Niki Brazier", "Review Creative"),
    task("Niki Brazier", "Review Creative"),
    task("Niki Brazier", "Review Creative"),
    task("Niki Brazier", "REVISION 1: Review Creative"),
    task("Niki Brazier", "REVISION 2: Review Creative"),
    task("Niki Brazier", "REVISION 1: Approve Creative"),
    task("Niki Brazier", "REVISION 1: Approve Creative"),
    task("Niki Brazier", "REVISION 1: Approve Creative"),
  ];

  const groups = processTasksForCapacity(tasks, "all");
  const rowFor = (role: string, person: string, taskType: string) =>
    groups
      .find((g) => g.role === role)
      ?.people.find((p) => p.name === person)
      ?.taskTypes.find((t) => t.taskType === taskType);

  const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

  it("folds revision edits into Video Editing totals, with the revision share alongside", () => {
    const row = rowFor("Video", "Vaiv Singh", "Video Editing")!;
    expect(sum(row.weekCounts)).toBe(4);
    expect(sum(row.revisionWeekCounts)).toBe(2);
    expect(row.avg30Day).toBe(4);
    expect(row.revisions30Day).toBe(2);
  });

  it("includes revision rounds in maxWeek26", () => {
    expect(rowFor("Video", "Vaiv Singh", "Video Editing")!.maxWeek26).toBe(4);
  });

  it("counts an AM's revision reviews as Creative Review, but not her revision approvals", () => {
    const review = rowFor("AM Review", "Niki Brazier", "Creative Review")!;
    expect(sum(review.weekCounts)).toBe(5);
    expect(sum(review.revisionWeekCounts)).toBe(2);
    // The unmatched revision approvals stay pooled — visible, but never part of review capacity.
    const revisions = rowFor("AM Review", "Niki Brazier", "Revisions")!;
    expect(sum(revisions.weekCounts)).toBe(3);
  });
});
