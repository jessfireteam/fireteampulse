import { describe, it, expect } from "vitest";
import { runForecast } from "../engine";
import type { ScenarioClient, TypedCalibration, RolePeaks } from "../types";

const calibration: TypedCalibration = {
  video:  { Account: 1, "Creative Review": 1, Copywriters: 1, Design: 0,   Video: 1 },
  static: { Account: 1, "Creative Review": 1, Copywriters: 1, Design: 1,   Video: 0 },
};
const peaks: RolePeaks = {
  Account: 100, "Creative Review": 100, Copywriters: 100, Design: 2, Video: 2,
};

function client(videos: number[], statics: number[], over: Partial<ScenarioClient> = {}): ScenarioClient {
  return { id: "1", name: "C", videosByMonth: videos, staticsByMonth: statics, enabled: true, hypothetical: false, ...over };
}
const flat = (v: number) => new Array(6).fill(v);

describe("runForecast (typed)", () => {
  const ref = new Date(2026, 5, 1);

  it("video volume drives Video role, static volume drives Design role", () => {
    // ~10 videos/week (43.45/mo) and 0 statics
    const result = runForecast([client(flat(43.45), flat(0))], calibration, peaks, 6, ref);
    expect(result.months[0].roles.Video.status).toBe("over");   // 10 vid * 1 / peak 2 = 5x
    expect(result.months[0].roles.Design.status).toBe("ok");    // no statics -> 0 design
  });

  it("statics drive Design but not Video", () => {
    const result = runForecast([client(flat(0), flat(43.45))], calibration, peaks, 6, ref);
    expect(result.months[0].roles.Design.status).toBe("over");
    expect(result.months[0].roles.Video.status).toBe("ok");
  });

  it("reads each month independently and reports first over-month", () => {
    const videos = [0, 43.45, 43.45, 43.45, 43.45, 43.45];
    const result = runForecast([client(videos, flat(0))], calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.hireByRole.Video).toBe(1);
    expect(result.hireByRole.Account).toBeNull();
  });

  it("excludes disabled clients", () => {
    const result = runForecast([client(flat(43.45), flat(43.45), { enabled: false })], calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
  });

  it("labels months forward from the reference month", () => {
    const result = runForecast([], calibration, peaks, 3, ref);
    expect(result.months.map((m) => m.label)).toEqual(["Jun 26", "Jul 26", "Aug 26"]);
  });
});
