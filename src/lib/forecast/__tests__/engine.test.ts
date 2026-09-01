import { describe, it, expect } from "vitest";
import { runForecast } from "../engine";
import { flatSupply } from "../supply";
import type { ScenarioClient, RolePeaks } from "../types";

const peaks: RolePeaks = {
  Account: 100, "CD Review": 100, "AM Review": 100, Copywriters: 100, Casting: 100, Design: 2, Video: 2,
};
const sup = flatSupply(peaks, 12);
function client(videos: number[], statics: number[], over: Partial<ScenarioClient> = {}): ScenarioClient {
  return { id: "1", name: "C", videosByMonth: videos, staticsByMonth: statics, enabled: true, hypothetical: false, ...over };
}
const flat = (v: number) => new Array(6).fill(v);

describe("runForecast", () => {
  const ref = new Date(2026, 5, 1);

  it("respects a ceiling that steps up mid-horizon when a hire starts", () => {
    // Steady 10 videos/wk (= 18 edit tasks/wk at the 1.8 rate, revisions included) against a
    // Video ceiling that goes 2 -> 40 in month 3. Overloaded until the hire lands, comfortable
    // afterwards, and the hire signal points at month 0 (the first month it breaks), not at
    // the month it gets fixed.
    const stepped = { ...sup, Video: [2, 2, 2, 40, 40, 40] };
    const result = runForecast([client(flat(43.45), flat(0))], stepped, 6, ref);
    expect(result.months[0].roles.Video.status).toBe("over");
    expect(result.months[2].roles.Video.status).toBe("over");
    expect(result.months[3].roles.Video.status).toBe("ok"); // 18 tasks/wk vs 40
    expect(result.months[3].roles.Video.peak).toBe(40);
    expect(result.hireByRole.Video).toBe(0);
  });

  it("casting demand comes from videos only, at the measured share needing a cast", () => {
    // 43.45 videos/mo ~ 10/wk. Casting's measured default of 0.8 (51 casts / 64 videos) gives
    // 8/wk. Statics generate no casting demand at all.
    const videoOnly = runForecast([client(flat(43.45), flat(0))], sup, 6, ref);
    expect(videoOnly.months[0].roles.Casting.demandPerWeek).toBeCloseTo(8, 2);
    const staticOnly = runForecast([client(flat(0), flat(43.45))], sup, 6, ref);
    expect(staticOnly.months[0].roles.Casting.demandPerWeek).toBe(0);
  });

  it("reports a zero-capacity role with demand as OVER, never as clear", () => {
    // The Casting bug: a role with real demand and a ceiling of zero used to read as 0%
    // utilization — the most dangerous state rendered as the safest.
    const noCasting = { ...sup, Casting: [0, 0, 0, 0, 0, 0] };
    const r = runForecast([client(flat(43.45), flat(0))], noCasting, 6, ref);
    expect(r.months[0].roles.Casting.status).toBe("over");
    expect(r.months[0].roles.Casting.utilization).toBe(Number.POSITIVE_INFINITY);
    expect(r.hireByRole.Casting).toBe(0);
    // No demand against no capacity stays quiet.
    const empty = runForecast([client(flat(0), flat(0))], noCasting, 6, ref);
    expect(empty.months[0].roles.Casting.status).toBe("ok");
    expect(empty.months[0].roles.Casting.utilization).toBe(0);
  });

  it("video volume drives Video role; static volume drives Design role", () => {
    const result = runForecast([client(flat(43.45), flat(0))], sup, 6, ref); // ~10 videos/wk
    expect(result.months[0].roles.Video.status).toBe("over");  // 10/wk vs peak 2
    expect(result.months[0].roles.Design.status).toBe("ok");   // no statics
  });

  it("statics drive Design but not Video", () => {
    const result = runForecast([client(flat(0), flat(43.45))], sup, 6, ref);
    expect(result.months[0].roles.Design.status).toBe("over");
    expect(result.months[0].roles.Video.status).toBe("ok");
  });

  it("shared roles get both video and static volume", () => {
    // 5/wk videos + 5/wk statics = 10/wk Account demand vs peak 100 -> 10%
    const result = runForecast([client(flat(21.725), flat(21.725))], sup, 6, ref);
    expect(result.months[0].roles.Account.utilization).toBeCloseTo(0.10, 2);
  });

  it("reads each month independently and reports first over-month", () => {
    const videos = [0, 43.45, 43.45, 43.45, 43.45, 43.45];
    const result = runForecast([client(videos, flat(0))], sup, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.hireByRole.Video).toBe(1);
    expect(result.hireByRole.Account).toBeNull();
  });

  it("excludes disabled clients", () => {
    const result = runForecast([client(flat(43.45), flat(43.45), { enabled: false })], sup, 6, ref);
    expect(result.months[0].assets).toBe(0);
  });

  it("excludes a client's deliverables after its end month", () => {
    const result = runForecast([client(flat(43.45), flat(0), { endMonthIndex: 0 })], sup, 6, ref);
    expect(result.months[0].assets).toBeCloseTo(43.45, 2);
    expect(result.months[1].assets).toBe(0);
  });

  it("excludes a client's deliverables before its start month", () => {
    const result = runForecast([client(flat(43.45), flat(0), { startMonthIndex: 1 })], sup, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.months[1].assets).toBeCloseTo(43.45, 2);
  });

  it("applies per-role tasks-per-deliverable rate to demand", () => {
    // copy rate 0.5 halves Copywriting demand vs the default-1 baseline
    const base = runForecast([client(flat(43.45), flat(0))], sup, 6, ref, { Copywriters: 1 });
    const half = runForecast([client(flat(43.45), flat(0))], sup, 6, ref, { Copywriters: 0.5 });
    expect(half.months[0].roles.Copywriters.demandPerWeek).toBeCloseTo(
      base.months[0].roles.Copywriters.demandPerWeek * 0.5,
      5,
    );
  });

  it("default rates are the measured totals including revisions: copy 1.3x, CD 1.0x, AM 1.8x, video 1.8x, design 1.8x", () => {
    // Measured over 13 weeks Jun–Aug 2026 (490 deliverables), tasks counted by Task Template
    // Role, revision rounds included — the same unit the supply side now counts in.
    const r = runForecast([client(flat(43.45), flat(43.45))], sup, 6, ref);
    const perTypeWk = 43.45 / 4.345; // ~10/wk of each deliverable type at a rate of 1
    expect(r.months[0].roles.Copywriters.demandPerWeek).toBeCloseTo(perTypeWk * 2 * 1.3, 5);
    expect(r.months[0].roles["CD Review"].demandPerWeek).toBeCloseTo(perTypeWk * 2 * 1.0, 5);
    expect(r.months[0].roles["AM Review"].demandPerWeek).toBeCloseTo(perTypeWk * 2 * 1.8, 5);
    // Video applies to videos only, Design to statics only.
    expect(r.months[0].roles.Video.demandPerWeek).toBeCloseTo(perTypeWk * 1.8, 5);
    expect(r.months[0].roles.Design.demandPerWeek).toBeCloseTo(perTypeWk * 1.8, 5);
    // The review split must sum to the measured total review load (~2.8 per deliverable).
    expect(
      r.months[0].roles["CD Review"].demandPerWeek + r.months[0].roles["AM Review"].demandPerWeek,
    ).toBeCloseTo(perTypeWk * 2 * 2.8, 5);
  });

  it("labels months forward from the reference month", () => {
    const result = runForecast([], sup, 3, ref);
    expect(result.months.map((m) => m.label)).toEqual(["Jun '26", "Jul '26", "Aug '26"]);
  });
});
