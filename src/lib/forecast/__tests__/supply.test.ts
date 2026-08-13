import { describe, it, expect } from "vitest";
import { resolveRoleSupply, matchMeasured, flatSupply, type MeasuredPerson } from "../supply";
import type { ProductionPerson, RolePeaks } from "../types";

const H = 6;

const person = (over: Partial<ProductionPerson> = {}): ProductionPerson => ({
  id: "p1",
  name: "Someone",
  side: "video",
  monthlyCost: 1000,
  startMonthIndex: 0,
  ...over,
});

const measured = (
  name: string,
  role: MeasuredPerson["role"],
  actualPerWeek: number,
): MeasuredPerson => ({ name, role, actualPerWeek });

describe("matchMeasured", () => {
  it("matches a short roster name to the full Fibery display name by prefix", () => {
    // The real case: the roster says "Vaiv", Fibery says "Vaiv Singh".
    expect(matchMeasured("Vaiv", "Video", [measured("Vaiv Singh", "Video", 4)])?.name).toBe(
      "Vaiv Singh",
    );
  });

  it("matches an email-keyed person, which is how Fibery reports some users", () => {
    const hit = matchMeasured("khushboo@fireteam.is", "Video", [
      measured("khushboo@fireteam.is", "Video", 3),
    ]);
    expect(hit?.actualPerWeek).toBe(3);
  });

  it("returns null on an ambiguous prefix rather than picking one", () => {
    // Guessing here is how "Sanchit" silently matched nobody for months.
    expect(
      matchMeasured("San", "Video", [
        measured("Sanchit Singh", "Video", 4),
        measured("Sandra Lee", "Video", 9),
      ]),
    ).toBeNull();
  });

  it("never matches across roles", () => {
    expect(matchMeasured("Erik", "Video", [measured("Erik Furtado", "Design", 6)])).toBeNull();
  });
});

describe("resolveRoleSupply", () => {
  it("falls back to the summed actuals of whoever does the work when nobody is assigned", () => {
    const m = [measured("Niki", "Account", 5), measured("Emily", "Account", 4)];
    const { supply, rolesUsingActuals, actualsByRole } = resolveRoleSupply([], m, H);
    expect(rolesUsingActuals).toContain("Account");
    expect(actualsByRole.Account).toBe(9);
    expect(supply.Account).toEqual(new Array(H).fill(9));
  });

  it("uses the max we set over what the person actually does", () => {
    const team = [person({ name: "Vaiv", role: "Video", capacityPerWeek: 8 })];
    const { supply, perPerson } = resolveRoleSupply(team, [measured("Vaiv Singh", "Video", 4)], H);
    expect(supply.Video).toEqual(new Array(H).fill(8));
    expect(perPerson[0].desiredMax).toBe(8);
    expect(perPerson[0].actualPerWeek).toBe(4);
  });

  it("follows that person's own actual when no max is set", () => {
    const team = [person({ name: "Vaiv", role: "Video" })];
    const { supply, perPerson } = resolveRoleSupply(team, [measured("Vaiv Singh", "Video", 4)], H);
    expect(supply.Video).toEqual(new Array(H).fill(4));
    expect(perPerson[0].desiredMax).toBeUndefined();
    expect(perPerson[0].effective).toBe(4);
  });

  it("steps the ceiling up from a hire's start month, not before it", () => {
    // John joins in month 2 at 8 briefs/wk on top of Shreya's 5.
    const team = [
      person({ id: "s", name: "Shreya", role: "Copywriters", capacityPerWeek: 5 }),
      person({ id: "j", name: "John", role: "Copywriters", capacityPerWeek: 8, startMonthIndex: 2 }),
    ];
    expect(resolveRoleSupply(team, [], H).supply.Copywriters).toEqual([5, 5, 13, 13, 13, 13]);
  });

  it("counts an unmatched person as zero but flags them rather than implying it", () => {
    const team = [person({ name: "Brand New", role: "Video" })];
    const { supply, perPerson } = resolveRoleSupply(team, [], H);
    expect(supply.Video).toEqual(new Array(H).fill(0));
    expect(perPerson[0].matched).toBe(false);
    expect(perPerson[0].actualPerWeek).toBeNull();
  });

  it("lets an unmatched person count once a max is typed", () => {
    // John has no Fibery history at all; a typed number has to work regardless.
    const team = [person({ name: "John", role: "Copywriters", capacityPerWeek: 8 })];
    const { supply, perPerson } = resolveRoleSupply(team, [], H);
    expect(supply.Copywriters).toEqual(new Array(H).fill(8));
    expect(perPerson[0].matched).toBe(false);
  });

  it("ignores a person with no role — they cost money and supply nothing", () => {
    const team = [person({ name: "Mark", capacityPerWeek: 99 })];
    const { perPerson, rolesUsingActuals } = resolveRoleSupply(team, [], H);
    expect(perPerson).toHaveLength(0);
    expect(rolesUsingActuals).toContain("Account");
  });

  it("assigning one person to a role stops that role reading actuals", () => {
    const team = [person({ name: "Vaiv", role: "Video", capacityPerWeek: 1 })];
    const m = [measured("Vaiv Singh", "Video", 4), measured("Alex", "Video", 5)];
    const { supply, rolesUsingActuals, actualsByRole } = resolveRoleSupply(team, m, H);
    expect(rolesUsingActuals).not.toContain("Video");
    // Alex is doing the work but isn't on the roster, so he drops out of the ceiling. The
    // actuals total still shows 9, which is how you notice he's missing.
    expect(supply.Video).toEqual(new Array(H).fill(1));
    expect(actualsByRole.Video).toBe(9);
  });

  it("treats a max of 0 as a real zero, not as 'follow actuals'", () => {
    const team = [person({ name: "Vaiv", role: "Video", capacityPerWeek: 0 })];
    const { supply } = resolveRoleSupply(team, [measured("Vaiv Singh", "Video", 4)], H);
    expect(supply.Video).toEqual(new Array(H).fill(0));
  });

  it("keeps fractional actuals to one decimal instead of compounding rounding", () => {
    const team = [
      person({ id: "a", name: "A", role: "Video" }),
      person({ id: "b", name: "B", role: "Video" }),
    ];
    const m = [measured("A", "Video", 2.5), measured("B", "Video", 1.3)];
    expect(resolveRoleSupply(team, m, H).supply.Video[0]).toBe(3.8);
  });
});

describe("flatSupply", () => {
  it("holds each figure constant across the horizon", () => {
    const peaks: RolePeaks = {
      Account: 9, "Creative Review": 8, Copywriters: 7, Casting: 4, Design: 6, Video: 5,
    };
    expect(flatSupply(peaks, 3).Design).toEqual([6, 6, 6]);
  });
});
