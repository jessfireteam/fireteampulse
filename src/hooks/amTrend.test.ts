import { describe, it, expect } from "vitest";
import { computeAmTrend } from "./useWinnersData";

// Fixed "now" so the rolling windows are deterministic: with nowMs = 2026-07,
// score window = Jan-Mar '26, baseline = Sep-Dec '25.
const NOW = Date.UTC(2026, 6, 6);

let seq = 0;
function proj(
  clientId: string,
  createdMonth: string, // "YYYY-MM"
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
    creationDate: `${createdMonth}-10T00:00:00.000Z`,
    doneDate: `${createdMonth}-12T00:00:00.000Z`,
    status: { name: "Completed" },
    client: { id: clientId, name: clientId },
    type: { name: "VIDEO - LoFi" },
    projectRolesInternal: roles,
    projectContractorsExternal: [],
    internalVersions: [
      { id: `v${seq}`, name: "v", winnerDate: winner ? `${createdMonth}-20T00:00:00.000Z` : null,
        tags: winner ? [{ id: "t", name: `Winner - ${clientId}` }] : [] },
    ],
  };
}

function build() {
  seq = 0;
  const rows: ReturnType<typeof proj>[] = [];
  const amOne = { id: "am-one", name: "AM One" };
  const amTwo = { id: "am-two", name: "AM Two" };

  // Anchor client "Big" (AM Two): stable ~10% in both windows -> agency drift
  // stays near flat, and AM Two holds flat while the agency rises a bit.
  for (let i = 0; i < 50; i++) rows.push(proj("Big", "2025-10", i < 5, amTwo));
  for (let i = 0; i < 50; i++) rows.push(proj("Big", "2026-02", i < 5, amTwo));

  // Test client "Cli" (AM One): 10% baseline -> 40% in the score window.
  for (let i = 0; i < 10; i++) rows.push(proj("Cli", "2025-10", i < 1, amOne));
  for (let i = 0; i < 10; i++) rows.push(proj("Cli", "2026-02", i < 4, amOne));

  return rows;
}

describe("computeAmTrend", () => {
  const trend = computeAmTrend(build(), new Set<string>(), NOW);

  it("labels the score and baseline windows from now", () => {
    const one = trend.get("am-one")!;
    expect(one.scoreLabel).toBe("Jan '26–Mar '26");
    expect(one.baselineLabel).toBe("Sep '25–Dec '25");
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
});
