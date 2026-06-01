import { describe, it, expect } from "vitest";
import { runForecast } from "../engine";
import type { ScenarioClient, Calibration, RolePeaks } from "../types";

const calibration: Calibration = {
  Account: 1, "Creative Review": 1, Copywriters: 1, Design: 0.5, Video: 1,
};
const peaks: RolePeaks = {
  Account: 100, "Creative Review": 100, Copywriters: 100, Design: 2, Video: 100,
};

/** helper: build a client whose every month holds `flat` assets (length 12). */
function flatClient(flat: number, over: Partial<ScenarioClient> = {}): ScenarioClient {
  return { id: "1", name: "C", assetsByMonth: new Array(12).fill(flat), enabled: true, hypothetical: false, ...over };
}

describe("runForecast", () => {
  const ref = new Date(2026, 5, 1); // local June 1 2026

  it("produces `horizon` months and applies per-month demand", () => {
    const scenario = [flatClient(43.45)]; // ~10 assets/week every month
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months).toHaveLength(6);
    expect(result.months[0].roles.Design.status).toBe("over"); // 10*0.5=5 vs peak 2
    expect(result.months[0].roles.Account.status).toBe("ok");
  });

  it("reads each month's value independently (ramp)", () => {
    const assetsByMonth = [0, 0, 43.45, 43.45, 43.45, 43.45];
    const scenario = [flatClient(0, { assetsByMonth })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.months[2].assets).toBeCloseTo(43.45, 5);
  });

  it("excludes disabled clients", () => {
    const scenario = [flatClient(43.45, { enabled: false })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
  });

  it("reports the first month each role exceeds peak", () => {
    const assetsByMonth = [0, 43.45, 43.45, 43.45, 43.45, 43.45];
    const scenario = [flatClient(0, { assetsByMonth })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.hireByRole.Design).toBe(1);
    expect(result.hireByRole.Account).toBeNull();
  });

  it("labels months forward from the reference month", () => {
    const result = runForecast([], calibration, peaks, 3, ref);
    expect(result.months.map((m) => m.label)).toEqual(["Jun 26", "Jul 26", "Aug 26"]);
  });
});
