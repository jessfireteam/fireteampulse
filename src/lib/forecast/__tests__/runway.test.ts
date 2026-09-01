import { describe, it, expect } from "vitest";
import { computeRunway, clientFootprint, hireUnitFor, RUNWAY_ROLE_KEYS } from "../runway";
import { runForecast } from "../engine";
import { resolveRoleSupply, type MeasuredPerson } from "../supply";
import type { ProductionPerson, ScenarioClient } from "../types";

const H = 6;
const REF = new Date(2026, 7, 1);
const monthLabels = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan"];

// This week's real shape, simplified. Maxes are TOTAL tasks/wk including revision rounds —
// the unit everything counts in now: editors capped at 56/wk total, Nicolle alone on casting
// at 13/wk (casts have no revisions), designers 36/wk, Jess reviewing ~33/wk, copy partially
// set (blocked).
const team: ProductionPerson[] = [
  { id: "v1", name: "Vaiv", side: "video", monthlyCost: 0, startMonthIndex: 0, role: "Video", capacityPerWeek: 15 },
  { id: "v2", name: "Sanchit", side: "video", monthlyCost: 0, startMonthIndex: 0, role: "Video", capacityPerWeek: 15 },
  { id: "v3", name: "Khushboo", side: "video", monthlyCost: 0, startMonthIndex: 0, role: "Video", capacityPerWeek: 15 },
  { id: "v4", name: "Ike", side: "video", monthlyCost: 0, startMonthIndex: 0, role: "Video", capacityPerWeek: 11 },
  { id: "d1", name: "Erik", side: "static", monthlyCost: 0, startMonthIndex: 0, role: "Design", capacityPerWeek: 18 },
  { id: "d2", name: "Reynelle", side: "static", monthlyCost: 0, startMonthIndex: 0, role: "Design", capacityPerWeek: 18 },
  { id: "c1", name: "Nicolle", side: "video", monthlyCost: 0, startMonthIndex: 0, role: "Casting", capacityPerWeek: 13 },
  { id: "r1", name: "Jess", side: "both", monthlyCost: 0, startMonthIndex: 0, role: "CD Review", capacityPerWeek: 33 },
  { id: "w1", name: "John", side: "both", monthlyCost: 0, startMonthIndex: 0, role: "Copywriters", capacityPerWeek: 10 },
  { id: "w2", name: "Shreya", side: "both", monthlyCost: 0, startMonthIndex: 0, role: "Copywriters" }, // no max -> blocks the role
];
const measured: MeasuredPerson[] = [];

// Plan: 125 videos + 93 statics per month, flat — this week's loaded plan.
const clients: ScenarioClient[] = [{
  id: "all", name: "Book", videosByMonth: new Array(H).fill(125), staticsByMonth: new Array(H).fill(93),
  enabled: true, hypothetical: false,
}];

function build(over: { team?: ProductionPerson[]; clients?: ScenarioClient[] } = {}) {
  const t = over.team ?? team;
  const resolved = resolveRoleSupply(t, measured, H);
  const result = runForecast(over.clients ?? clients, resolved.supply, H, REF);
  return computeRunway({
    months: result.months,
    monthLabels,
    supply: resolved.supply,
    actualVideosPerMonth: 64,   // measured actual production
    actualStaticsPerMonth: 69,
    team: t,
    config: { hireLeadWeeks: 6 },
  });
}

const row = (roles: ReturnType<typeof build>, key: string) => roles.find((r) => r.role === key)!;

describe("computeRunway", () => {
  it("prices each role in fractional hires, one decimal", () => {
    const video = row(build(), "Video");
    // Plan: 125/mo videos = 28.8/wk x 1.8 = 51.8 edit tasks/wk; team 56/wk; unit 15
    // -> have 3.73, need 3.45 -> +0.3 (rounded).
    expect(video.monthGaps[0]).toBeCloseTo(0.3, 1);
    // Now: 64/mo = 14.7/wk x 1.8 = 26.5 tasks/wk -> need 1.8 heads; have 3.73 -> +2.0.
    expect(video.nowGap).toBeCloseTo(2.0, 1);
  });

  it("shows the editors relaxed at today's flow and tight at plan — the Angelia reconciliation", () => {
    const video = row(build(), "Video");
    expect(video.nowGap).toBeGreaterThan(1.5);
    expect(Math.abs(video.monthGaps[0])).toBeLessThan(0.5);
    expect(video.hireBy).toBeNull();
  });

  it("flags casting as the real deficit and posts the req with lead time backed off", () => {
    const casting = row(build(), "Casting");
    // Plan: 28.8/wk videos x 0.8 = 23/wk demand; Nicolle 13/wk; unit 13 -> -0.77 heads every month.
    expect(casting.monthGaps[0]).toBeLessThanOrEqual(-0.5);
    expect(casting.firstDeficitLabel).toBe("Aug");
    // 6 weeks lead = 2 months back, clamped to the first column.
    expect(casting.hireBy).toBe("Aug");
  });

  it("backs a later deficit off by the hiring lead time", () => {
    // Ramp: no volumes until month 3, then full plan -> casting first breaks in Nov.
    const ramp: ScenarioClient[] = [{
      id: "r", name: "Ramp",
      videosByMonth: [0, 0, 0, 125, 125, 125], staticsByMonth: [0, 0, 0, 93, 93, 93],
      enabled: true, hypothetical: false,
    }];
    const casting = row(build({ clients: ramp }), "Casting");
    expect(casting.firstDeficitLabel).toBe("Nov");
    expect(casting.hireBy).toBe("Sep"); // Nov minus ceil(6wk / 4.345) = 2 months
  });

  it("a planned roster hire closes the gap from their start month", () => {
    const withHire = [...team, {
      id: "c2", name: "New caster", side: "video" as const, monthlyCost: 0,
      startMonthIndex: 2, role: "Casting" as const, capacityPerWeek: 13,
    }];
    const casting = row(build({ team: withHire }), "Casting");
    expect(casting.monthGaps[1]).toBeLessThanOrEqual(-0.5);
    expect(casting.monthGaps[2]).toBeGreaterThan(0);
  });

  it("blocks copywriting until every assigned copywriter has a typed max", () => {
    const copy = row(build(), "Copywriters");
    expect(copy.blocked).toBe(true);
    expect(copy.blockedReason).toMatch(/set a max/i);
    expect(copy.hireBy).toBeNull();
    const amr = row(build(), "AM Review");
    expect(amr.blocked).toBe(true);
  });

  it("excludes Account entirely", () => {
    expect(RUNWAY_ROLE_KEYS).not.toContain("Account");
    expect(build().map((r) => r.role)).not.toContain("Account");
  });
});

describe("hireUnitFor", () => {
  it("derives the unit from the median of the role's typed maxes", () => {
    // Editors 15/15/15/11 -> median 15. The unit follows the team's ceilings, not their output.
    expect(hireUnitFor("Video", team).unit).toBe(15);
    expect(hireUnitFor("Video", team).source).toBe("team");
  });

  it("moves when the team's maxes move — the efficiency-tool case", () => {
    // Copywriting tooling doubles what a writer clears; Jess raises the maxes; the unit
    // follows without anyone touching the runway.
    const boosted = team.map((p) =>
      p.role === "Copywriters" ? { ...p, capacityPerWeek: 20 } : p,
    );
    expect(hireUnitFor("Copywriters", boosted).unit).toBe(20);
  });

  it("ignores role members with no typed max when deriving", () => {
    // Shreya has no max; John's 10 alone defines the copywriter unit.
    expect(hireUnitFor("Copywriters", team).unit).toBe(10);
  });

  it("falls back to the frozen default when nobody in the role has a max", () => {
    const r = hireUnitFor("AM Review", team);
    expect(r.unit).toBe(20);
    expect(r.source).toBe("default");
  });

  it("lets an explicit override beat the team median", () => {
    const r = hireUnitFor("Casting", team, { hireUnitPerWeek: { Casting: 9 } });
    expect(r.unit).toBe(9);
    expect(r.source).toBe("override");
  });
});

describe("clientFootprint", () => {
  it("prices a video-heavy prospect per role and names the first role it breaks", () => {
    const roles = build();
    const fp = clientFootprint(12, 0.75, roles); // 9v / 3s per month
    const video = fp.rows.find((r) => r.role === "Video")!;
    // 9/mo videos = 2.07/wk x 1.8 = 3.7 edit tasks/wk / 15 per hire = 0.25 heads.
    expect(video.heads).toBeCloseTo(0.25, 2);
    // Casting is already 0.77 heads under water at plan, so it breaks first.
    expect(fp.firstToBreak?.role).toBe("Casting");
  });

  it("reports absorbable when every unblocked role stays non-negative", () => {
    // Tiny client against a relaxed book.
    const relaxed: ScenarioClient[] = [{
      id: "s", name: "Small", videosByMonth: new Array(H).fill(20), staticsByMonth: new Array(H).fill(20),
      enabled: true, hypothetical: false,
    }];
    const fp = clientFootprint(2, 0.5, build({ clients: relaxed }));
    expect(fp.firstToBreak).toBeNull();
  });
});
