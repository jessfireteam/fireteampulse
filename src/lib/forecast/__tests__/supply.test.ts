import { describe, it, expect } from "vitest";
import { resolveRoleSupply, matchMeasured, flatSupply, type MeasuredPerson } from "../supply";
import type { ProductionPerson, RolePeaks } from "../types";

const H = 6;

const peaks: RolePeaks = {
  Account: 9, "Creative Review": 8, Copywriters: 7, Design: 6, Video: 5,
};

const person = (over: Partial<ProductionPerson> = {}): ProductionPerson => ({
  id: "p1",
  name: "Someone",
  side: "video",
  monthlyCost: 1000,
  startMonthIndex: 0,
  ...over,
});

const measured = (name: string, role: MeasuredPerson["role"], maxWeek26: number): MeasuredPerson => ({
  name,
  role,
  maxWeek26,
});

describe("matchMeasured", () => {
  it("matches a short roster name to the full Fibery display name by prefix", () => {
    // The real case: the roster says "Vaiv", Fibery says "Vaiv Singh".
    const hit = matchMeasured("Vaiv", "Video", [measured("Vaiv Singh", "Video", 4)]);
    expect(hit?.name).toBe("Vaiv Singh");
  });

  it("matches an email-keyed person, which is how Fibery reports some users", () => {
    const hit = matchMeasured("khushboo@fireteam.is", "Video", [
      measured("khushboo@fireteam.is", "Video", 3),
    ]);
    expect(hit?.maxWeek26).toBe(3);
  });

  it("returns null on an ambiguous prefix rather than picking one", () => {
    // Guessing here is exactly how "Sanchit" silently matched nobody for months.
    const hit = matchMeasured("San", "Video", [
      measured("Sanchit Singh", "Video", 4),
      measured("Sandra Lee", "Video", 9),
    ]);
    expect(hit).toBeNull();
  });

  it("never matches across roles", () => {
    expect(matchMeasured("Erik", "Video", [measured("Erik Furtado", "Design", 6)])).toBeNull();
  });
});

describe("resolveRoleSupply", () => {
  it("falls back to the flat measured peak for a role nobody is assigned to", () => {
    const { supply, rolesUsingMeasured } = resolveRoleSupply([], peaks, [], H);
    expect(rolesUsingMeasured).toContain("Account");
    expect(supply.Account).toEqual(new Array(H).fill(9));
    expect(supply.Video).toEqual(new Array(H).fill(5));
  });

  it("uses declared capacity over the measured figure", () => {
    const team = [person({ name: "Vaiv", role: "Video", capacityPerWeek: 10 })];
    const { supply, perPerson } = resolveRoleSupply(team, peaks, [measured("Vaiv Singh", "Video", 4)], H);
    expect(supply.Video).toEqual(new Array(H).fill(10));
    expect(perPerson[0].declared).toBe(10);
    expect(perPerson[0].measured).toBe(4);
  });

  it("seeds from that person's own measured week when capacity is blank", () => {
    const team = [person({ name: "Vaiv", role: "Video" })];
    const { supply, perPerson } = resolveRoleSupply(team, peaks, [measured("Vaiv Singh", "Video", 4)], H);
    expect(supply.Video).toEqual(new Array(H).fill(4));
    expect(perPerson[0].effective).toBe(4);
    expect(perPerson[0].declared).toBeUndefined();
  });

  it("steps the ceiling up from a hire's start month, not before it", () => {
    // John joins in month 2 writing 8 briefs/wk on top of Shreya's 5.
    const team = [
      person({ id: "s", name: "Shreya", role: "Copywriters", capacityPerWeek: 5 }),
      person({ id: "j", name: "John", role: "Copywriters", capacityPerWeek: 8, startMonthIndex: 2 }),
    ];
    const { supply } = resolveRoleSupply(team, peaks, [], H);
    expect(supply.Copywriters).toEqual([5, 5, 13, 13, 13, 13]);
  });

  it("counts a person with no measured match as zero but flags them unmatched", () => {
    const team = [person({ name: "Brand New", role: "Video" })];
    const { supply, perPerson } = resolveRoleSupply(team, peaks, [], H);
    expect(supply.Video).toEqual(new Array(H).fill(0));
    expect(perPerson[0].matched).toBe(false);
    expect(perPerson[0].measured).toBeNull();
  });

  it("lets an unmatched person still count once a capacity is typed", () => {
    // John has no Fibery history at all; a typed number has to work regardless.
    const team = [person({ name: "John", role: "Copywriters", capacityPerWeek: 8 })];
    const { supply, perPerson } = resolveRoleSupply(team, peaks, [], H);
    expect(supply.Copywriters).toEqual(new Array(H).fill(8));
    expect(perPerson[0].matched).toBe(false);
  });

  it("ignores a person with no role — they cost money and supply nothing", () => {
    const team = [person({ name: "Mark", capacityPerWeek: 99 })];
    const { supply, perPerson, rolesUsingMeasured } = resolveRoleSupply(team, peaks, [], H);
    expect(perPerson).toHaveLength(0);
    expect(rolesUsingMeasured).toContain("Account");
    expect(supply.Account).toEqual(new Array(H).fill(9));
  });

  it("assigning one person to a role stops that role reading measured actuals", () => {
    const team = [person({ name: "Vaiv", role: "Video", capacityPerWeek: 1 })];
    const { supply, rolesUsingMeasured } = resolveRoleSupply(team, peaks, [], H);
    expect(rolesUsingMeasured).not.toContain("Video");
    expect(supply.Video).toEqual(new Array(H).fill(1));
    // Other roles are unaffected.
    expect(supply.Design).toEqual(new Array(H).fill(6));
  });

  it("treats a declared 0 as a real zero, not as 'follow measured'", () => {
    const team = [person({ name: "Vaiv", role: "Video", capacityPerWeek: 0 })];
    const { supply } = resolveRoleSupply(team, peaks, [measured("Vaiv Singh", "Video", 4)], H);
    expect(supply.Video).toEqual(new Array(H).fill(0));
  });
});

describe("flatSupply", () => {
  it("holds each measured peak constant across the horizon", () => {
    expect(flatSupply(peaks, 3).Design).toEqual([6, 6, 6]);
  });
});
