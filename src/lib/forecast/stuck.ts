// src/lib/forecast/stuck.ts
import type { Task } from "@/lib/fibery";

/**
 * The pipeline in walking order. QC appears twice on purpose — Jess's distinction: QC on the
 * BRIEF is upstream (a late one blocks everything that follows), QC on the DELIVERABLE is
 * downstream (a late one delays shipping but doesn't starve production).
 */
export const STAGES = [
  { key: "brief", label: "Write brief" },
  { key: "briefQc", label: "Brief QC & client OK", note: "upstream QC" },
  { key: "casting", label: "Casting & intake" },
  { key: "assign", label: "Assign" },
  { key: "produce", label: "Produce" },
  { key: "revisions", label: "Revisions" },
  { key: "deliverableQc", label: "Deliverable QC", note: "downstream QC" },
  { key: "ship", label: "Ship" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

/**
 * Bucket a task into its pipeline stage by name. Order of checks matters and three of the
 * traps are already known: "REVISION 1: Edit video" must not count as producing, "Assign
 * Designer" contains "design" but is coordination, and "get client approval on brief" must not
 * fall into the deliverable-approval bucket.
 */
export function stageOf(taskName: string): StageKey | null {
  const n = taskName?.toLowerCase() ?? "";
  if (!n) return null;
  if (n.includes("revision")) return "revisions";
  if (n.includes("write brief") || n.includes("draft brief") || n.includes("fill in concept")) return "brief";
  if (n.includes("approve and send brief") || n.includes("client approval on brief") || n.includes("approve edit notes")) return "briefQc";
  if (n.includes("cast creator") || n.includes("check deliverables")) return "casting";
  if (n.includes("assign")) return "assign";
  if (n.includes("edit video") || n.includes("video edit") || n.includes("design") || n.includes("static")) return "produce";
  if (n.includes("review creative") || n.includes("approve internally")) return "deliverableQc";
  if (
    n.includes("send ad to client") ||
    n.includes("get client approval") ||
    n.includes("upload") ||
    n.includes("name ad") ||
    n.includes("drive links") ||
    n.includes("turn on in meta")
  ) {
    return "ship";
  }
  return null;
}

export interface StuckStage {
  key: StageKey;
  label: string;
  note?: string;
  /** Overdue, not-done tasks sitting in this stage. */
  count: number;
  /** Of those, how many have no assignee at all — work nobody owns yet. */
  unassigned: number;
  /** Median days late, so ten fresh stragglers read differently from ten June zombies. */
  medianDaysLate: number;
}

const DAY_MS = 86_400_000;

export function computeStuckWork(tasks: Task[], today: Date): StuckStage[] {
  const lateness = new Map<StageKey, number[]>();
  const unassigned = new Map<StageKey, number>();

  tasks.forEach((t) => {
    if (t.done || !t.dueDate) return;
    // Live pipeline only: a cancelled or completed project with undone tasks is residue, and
    // counting it would make every stage look permanently jammed.
    const status = t.project?.status?.name?.toLowerCase();
    if (status === "cancelled" || status === "completed") return;
    const due = new Date(t.dueDate + (t.dueDate.length === 10 ? "T00:00:00" : ""));
    if (!(due < today)) return;
    const stage = stageOf(t.name);
    if (!stage) return;
    const daysLate = Math.floor((today.getTime() - due.getTime()) / DAY_MS);
    if (!lateness.has(stage)) lateness.set(stage, []);
    lateness.get(stage)!.push(daysLate);
    if (!t.assignee?.name) unassigned.set(stage, (unassigned.get(stage) ?? 0) + 1);
  });

  return STAGES.map((s) => {
    const late = (lateness.get(s.key) ?? []).sort((a, b) => a - b);
    const median = late.length ? late[Math.floor(late.length / 2)] : 0;
    return {
      key: s.key,
      label: s.label,
      note: "note" in s ? s.note : undefined,
      count: late.length,
      unassigned: unassigned.get(s.key) ?? 0,
      medianDaysLate: median,
    };
  });
}
