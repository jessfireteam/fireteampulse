import { describe, it, expect } from "vitest";
import { computeAmTrend } from "./useWinnersData";

// Fixed "now" so the rolling windows are deterministic: with nowMs = 2026-07
// and a 2-month lag, score window = Mar-May '26, baseline = Nov '25-Feb '26.
const NOW = Date.UTC(2026, 6, 6);

let seq = 0;
function proj(
  clientId: string,
  createdDay: string, // "YYYY-MM-DD"
  doneDay: string | null, // "YYYY-MM-DD" — what the trend buckets on
  winner: boolean,
  am?: { id: string; name: string },
) {
  seq++;
  const roles = am
    ? [{ assignee: { id: am.id, name: am.name }, role: { id: "r8", name: "Account Manager (AM)", publicId: "8" } }]
    : [];
  return {
    id: `p${seq}`,
    name: `p${seq}`,
    creationDate: `${createdDay}T00:00:00.000Z`,
    doneDate: doneDay ? `${doneDay}T00:00:00.000Z` : null,
    status: { name: "Completed" },
    client: { id: clientId, name: clientId },
    type: { name: "VIDEO - LoFi" },
    projectRolesInternal: roles,
    projectContractorsExternal: [],
    internalVersions: [
      { id: `v${seq}`, name: "v", winnerDate: winner ? `${doneDay ?? createdDay}T00:00:00.000Z` : null,
        tags: winner ? [{ id: "t", name: `Winner - ${clientId}` }] : [] },
    ],
  };
}

const amOne = { id: "am-one", name: "AM One" };
const amTwo = { id: "am-two", name: "AM Two" };

// Both windows use done dates old enough to be fully matured (>= 85 days
// before NOW), so these cases isolate the trend logic from maturity weighting.
const BASE_DONE = "2025-12-12"; // in Nov '25-Feb '26 baseline
const SCORE_DONE = "2026-03-12"; // in Mar-May '26 score window, 116 days old

function build() {
  seq = 0;
  const rows: ReturnType<typeof proj>[] = [];

  // Anchor client "Big" (AM Two): stable 10% in both windows, so agency drift
  // rises overall while AM Two holds flat.
  for (let i = 0; i < 50; i++) rows.push(proj("Big", "2025-12-10", BASE_DONE, i < 5, amTwo));
  for (let i = 0; i < 50; i++) rows.push(proj("Big", "2026-03-10", SCORE_DONE, i < 5, amTwo));

  // Test client "Cli" (AM One): 10% baseline -> 40% in the score window.
  for (let i = 0; i < 10; i++) rows.push(proj("Cli", "2025-12-10", BASE_DONE, i < 1, amOne));
  for (let i = 0; i < 10; i++) rows.push(proj("Cli", "2026-03-10", SCORE_DONE, i < 4, amOne));

  return rows;
}

describe("computeAmTrend", () => {
  const trend = computeAmTrend(build(), new Set<string>(), NOW);

  it("labels the score and baseline windows from now, at a 2-month lag", () => {
    const one = trend.get("am-one")!;
    expect(one.scoreLabel).toBe("Mar '26–May '26");
    expect(one.baselineLabel).toBe("Nov '25–Feb '26");
  });

  it("an improving book scores well above 100 (client difficulty cancels)", () => {
    const one = trend.get("am-one")!;
    expect(one.projects).toBe(10);
    expect(one.actual).toBe(4);
    // Cli went 10% -> 40%; even after removing agency-wide drift this is a
    // clear improvement, so the index is well above 100.
    expect(one.index!).toBeGreaterThan(150);
  });

  it("a book that only holds flat while the agency rises scores below 100", () => {
    const two = trend.get("am-two")!;
    expect(two.index!).toBeLessThan(100);
  });

  it("reports a rolling series ending at the primary window", () => {
    const one = trend.get("am-one")!;
    expect(one.series).toHaveLength(5);
    // Oldest first, newest last, and the last entry is the headline number.
    expect(one.series[one.series.length - 1].index).toBe(one.index);
    expect(one.series[one.series.length - 1].label).toBe(one.scoreLabel);
    // Labels advance by one month per window.
    const starts = one.series.map((s) => s.label.split("–")[0]);
    expect(starts).toEqual(["Nov '25", "Dec '25", "Jan '26", "Feb '26", "Mar '26"]);
  });
});

describe("computeAmTrend bucketing", () => {
  // A project brainstormed inside the baseline window but not completed until
  // the score window belongs to the score window: it shipped then, and its
  // winner-tagging clock started then. Under the old creation-date bucketing
  // this landed in the baseline instead.
  it("buckets on doneDate, not creationDate", () => {
    seq = 0;
    const rows = [
      // Baseline volume for the client so it has a real trailing rate.
      ...Array.from({ length: 20 }, (_, i) => proj("Cli", "2025-12-10", BASE_DONE, i < 2, amOne)),
      // Created in the baseline window, completed in the score window.
      ...Array.from({ length: 8 }, (_, i) => proj("Cli", "2025-12-20", SCORE_DONE, i < 3, amOne)),
    ];
    const t = computeAmTrend(rows, new Set<string>(), NOW);
    const one = t.get("am-one")!;
    // The 8 late-completing projects are scored, not folded into the baseline.
    expect(one.projects).toBe(8);
    expect(one.actual).toBe(3);
  });

  it("skips retired clients", () => {
    seq = 0;
    const rows = Array.from({ length: 20 }, (_, i) => proj("Gone", "2026-03-10", SCORE_DONE, i < 4, amOne));
    const t = computeAmTrend(rows, new Set<string>(["Gone"]), NOW);
    expect(t.get("am-one")).toBeUndefined();
  });
});

describe("computeAmTrend maturity weighting", () => {
  // Two AMs, same client, same project count, same winner count in the score
  // window — but one's work finished four months ago and the other's finished
  // last month. The recent book has had less exposure to the (monthly, lagging)
  // winner-tagging batch, so it must carry a smaller expectation rather than
  // being counted as a full set of losses.
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => proj("Shared", "2025-12-10", BASE_DONE, i < 4, amOne)),
    ...Array.from({ length: 20 }, (_, i) => proj("Shared", "2026-03-01", "2026-03-05", i < 2, amOne)),
    ...Array.from({ length: 20 }, (_, i) => proj("Shared", "2026-05-01", "2026-05-30", i < 2, amTwo)),
  ];
  const t = computeAmTrend(rows, new Set<string>(), NOW);

  it("charges a recently-completed book less expected than a matured one", () => {
    const matured = t.get("am-one")!;
    const recent = t.get("am-two")!;
    expect(matured.projects).toBe(20);
    expect(recent.projects).toBe(20);
    expect(recent.expected).toBeLessThan(matured.expected);
    // 2026-05-30 is 37 days before NOW, roughly 70% of the tagging tail seen.
    expect(recent.expected / matured.expected).toBeLessThan(0.85);
  });

  it("does not punish the recent book for the same winner count", () => {
    expect(t.get("am-two")!.index!).toBeGreaterThan(t.get("am-one")!.index!);
  });
});
