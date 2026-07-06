import { describe, it, expect } from "vitest";
import { processWinnersData } from "./useWinnersData";
import { buildFixtureProjects, FIXTURE_NAMES } from "./useWinnersData.fixture";

// See useWinnersData.fixture.ts for the hand-built dataset and why each row
// exists. Alpha (easy client) has two CWs and two VEs so leave-one-out has a
// real peer baseline; Boss is on every project (full coverage); Kenny is a
// layered-on phantom; Erik is a VE credited on a static.
const projects = buildFixtureProjects();
const data = processWinnersData(projects, "all", new Set<string>());
const find = (name: string, role?: string) =>
  data.contributors.find((c) => c.name === name && (!role || c.rolePublicId === role));

describe("processWinnersData accuracy fixes", () => {
  it("excludes Kenny Fisher entirely (phantom contributor)", () => {
    expect(data.contributors.some((c) => c.name === FIXTURE_NAMES.kenny)).toBe(false);
  });

  it("drops a Video Editor credited on a static project (role/type mismatch)", () => {
    // Erik only appears as a VE on a STATIC here -> no row at all.
    expect(data.contributors.some((c) => c.name === FIXTURE_NAMES.erik)).toBe(false);
  });

  it("marks a full-coverage contributor (CD on every project) as unmeasurable", () => {
    const boss = find(FIXTURE_NAMES.boss, "9");
    expect(boss).toBeTruthy();
    expect(boss!.measurable).toBe(false);
    expect(boss!.performanceIndex).toBeNull();
    expect(boss!.shrunkIndex).toBeNull();
  });

  it("scores a clear over-performer against a leave-one-out baseline, and flags significance", () => {
    const star = find(FIXTURE_NAMES.star, "11");
    expect(star).toBeTruthy();
    expect(star!.measurable).toBe(true);
    // Star wins 5/10; peers on the same client win ~17% -> index well above 100.
    expect(star!.performanceIndex!).toBeGreaterThan(150);
    expect(star!.significant).toBe(true);
    // shrinkage pulls the raw index toward 100 but keeps it clearly above.
    expect(star!.shrunkIndex!).toBeLessThan(star!.performanceIndex!);
    expect(star!.shrunkIndex!).toBeGreaterThan(100);
  });

  it("scores an under-performer below 100", () => {
    const avg = find(FIXTURE_NAMES.avg, "11");
    expect(avg).toBeTruthy();
    expect(avg!.measurable).toBe(true);
    expect(avg!.performanceIndex!).toBeLessThan(100);
    // shrinkage pulls it back up toward 100.
    expect(avg!.shrunkIndex!).toBeGreaterThan(avg!.performanceIndex!);
  });

  it("leave-one-out excludes the person from their own baseline", () => {
    // Star's expected is built from the OTHER writer's win rate, so Star's
    // 5 wins are measured against ~1.7 expected, not against a baseline that
    // includes Star's own 5 wins.
    const star = find(FIXTURE_NAMES.star, "11")!;
    expect(star.expectedWinners).toBeGreaterThan(1);
    expect(star.expectedWinners).toBeLessThan(3);
  });

  it("shrunk index always sits between the raw index and 100", () => {
    data.contributors
      .filter((c) => c.performanceIndex !== null && c.shrunkIndex !== null)
      .forEach((c) => {
        const raw = c.performanceIndex!;
        const shr = c.shrunkIndex!;
        expect(shr).toBeGreaterThanOrEqual(Math.min(raw, 100) - 1);
        expect(shr).toBeLessThanOrEqual(Math.max(raw, 100) + 1);
      });
  });

  it("only publishes an index when most of a person's work is baseline-able", () => {
    data.contributors.forEach((c) => {
      const measProjects = Object.values(c.clientBreakdown)
        .filter((b) => b.measurable)
        .reduce((s, b) => s + b.total, 0);
      const coverage = c.totalProjects > 0 ? measProjects / c.totalProjects : 0;
      if (c.measurable) expect(coverage).toBeGreaterThanOrEqual(0.8);
    });
  });
});
