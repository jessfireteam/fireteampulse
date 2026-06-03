import { describe, it, expect } from "vitest";
import { runForecast } from "../engine";
import type { ScenarioClient, RolePeaks } from "../types";

const peaks: RolePeaks = {
  Account: 100, "Creative Review": 100, Copywriters: 100, Design: 2, Video: 2,
};
function client(videos: number[], statics: number[], over: Partial<ScenarioClient> = {}): ScenarioClient {
  return { id: "1", name: "C", videosByMonth: videos, staticsByMonth: statics, enabled: true, hypothetical: false, ...over };
}
const flat = (v: number) => new Array(6).fill(v);

describe("runForecast", () => {
  const ref = new Date(2026, 5, 1);

  it("video volume drives Video role; static volume drives Design role", () => {
    const result = runForecast([client(flat(43.45), flat(0))], peaks, 6, ref); // ~10 videos/wk
    expect(result.months[0].roles.Video.status).toBe("over");  // 10/wk vs peak 2
    expect(result.months[0].roles.Design.status).toBe("ok");   // no statics
  });

  it("statics drive Design but not Video", () => {
    const result = runForecast([client(flat(0), flat(43.45))], peaks, 6, ref);
    expect(result.months[0].roles.Design.status).toBe("over");
    expect(result.months[0].roles.Video.status).toBe("ok");
  });

  it("shared roles get both video and static volume", () => {
    // 5/wk videos + 5/wk statics = 10/wk Account demand vs peak 100 -> 10%
    const result = runForecast([client(flat(21.725), flat(21.725))], peaks, 6, ref);
    expect(result.months[0].roles.Account.utilization).toBeCloseTo(0.10, 2);
  });

  it("reads each month independently and reports first over-month", () => {
    const videos = [0, 43.45, 43.45, 43.45, 43.45, 43.45];
    const result = runForecast([client(videos, flat(0))], peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.hireByRole.Video).toBe(1);
    expect(result.hireByRole.Account).toBeNull();
  });

  it("excludes disabled clients", () => {
    const result = runForecast([client(flat(43.45), flat(43.45), { enabled: false })], peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
  });

  it("excludes a client's deliverables after its end month", () => {
    const result = runForecast([client(flat(43.45), flat(0), { endMonthIndex: 0 })], peaks, 6, ref);
    expect(result.months[0].assets).toBeCloseTo(43.45, 2);
    expect(result.months[1].assets).toBe(0);
  });

  it("excludes a client's deliverables before its start month", () => {
    const result = runForecast([client(flat(43.45), flat(0), { startMonthIndex: 1 })], peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.months[1].assets).toBeCloseTo(43.45, 2);
  });

  it("applies per-role tasks-per-deliverable rate to demand", () => {
    // copy rate 0.5 halves Copywriting demand vs the default-1 baseline
    const base = runForecast([client(flat(43.45), flat(0))], peaks, 6, ref, { Copywriters: 1 });
    const half = runForecast([client(flat(43.45), flat(0))], peaks, 6, ref, { Copywriters: 0.5 });
    expect(half.months[0].roles.Copywriters.demandPerWeek).toBeCloseTo(
      base.months[0].roles.Copywriters.demandPerWeek * 0.5,
      5,
    );
  });

  it("defaults halve Copywriters and double Creative Review vs old flat-1", () => {
    // old flat-1 demand for videos at 43.45/mo ~ 10/wk
    const r = runForecast([client(flat(43.45), flat(0))], peaks, 6, ref);
    const flatOne = (43.45 / 4.345) * 1; // ~10/wk, old behavior
    expect(r.months[0].roles.Copywriters.demandPerWeek).toBeCloseTo(flatOne * 0.5, 5);
    expect(r.months[0].roles["Creative Review"].demandPerWeek).toBeCloseTo(flatOne * 2, 5);
  });

  it("labels months forward from the reference month", () => {
    const result = runForecast([], peaks, 3, ref);
    expect(result.months.map((m) => m.label)).toEqual(["Jun '26", "Jul '26", "Aug '26"]);
  });
});
