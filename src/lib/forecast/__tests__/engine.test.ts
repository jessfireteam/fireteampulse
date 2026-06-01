// src/lib/forecast/__tests__/engine.test.ts
import { describe, it, expect } from "vitest";
import { runForecast } from "../engine";
import type { ScenarioClient, Calibration, RolePeaks } from "../types";

const calibration: Calibration = {
  Account: 1, "Creative Review": 1, Copywriters: 1, Design: 0.5, Video: 1,
};
const peaks: RolePeaks = {
  Account: 100, "Creative Review": 100, Copywriters: 100, Design: 2, Video: 100,
};

function client(over: Partial<ScenarioClient>): ScenarioClient {
  return { id: "1", name: "C", startMonthIndex: 0, assetsPerMonth: 0, enabled: true, hypothetical: false, ...over };
}

describe("runForecast", () => {
  const ref = new Date("2026-06-01T00:00:00Z");

  it("produces `horizon` months with cumulative active demand", () => {
    const scenario = [client({ assetsPerMonth: 43.45 })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months).toHaveLength(6);
    expect(result.months[0].roles.Design.status).toBe("over");
    expect(result.months[0].roles.Account.status).toBe("ok");
  });

  it("only counts a client from its start month onward", () => {
    const scenario = [client({ assetsPerMonth: 43.45, startMonthIndex: 2 })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.months[2].assets).toBeCloseTo(43.45, 5);
  });

  it("excludes disabled clients", () => {
    const scenario = [client({ assetsPerMonth: 43.45, enabled: false })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
  });

  it("reports the first month each role exceeds peak", () => {
    const scenario = [client({ assetsPerMonth: 43.45, startMonthIndex: 1 })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.hireByRole.Design).toBe(1);
    expect(result.hireByRole.Account).toBeNull();
  });

  it("labels months forward from the reference month", () => {
    const result = runForecast([], calibration, peaks, 3, ref);
    expect(result.months.map((m) => m.label)).toEqual(["Jun 26", "Jul 26", "Aug 26"]);
  });
});
