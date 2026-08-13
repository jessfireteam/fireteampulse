import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// recharts ResponsiveContainer renders nothing at 0x0 in jsdom, so the inner
// chart (and ReferenceAreas) never mount and a crash wouldn't surface. Mock it
// to inject a fixed size onto the chart, forcing a real mount + scale compute.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 300 }),
  };
});

import { ForecastChart } from "../ForecastChart";
import { runForecast } from "@/lib/forecast/engine";
import { flatSupply } from "@/lib/forecast/supply";
import type { ScenarioClient, RolePeaks } from "@/lib/forecast/types";

const peaks: RolePeaks = { Account: 100, "Creative Review": 100, Copywriters: 100, Casting: 100, Design: 2, Video: 2 };
const scenario: ScenarioClient[] = [{
  id: "1", name: "C",
  videosByMonth: new Array(12).fill(40),   // pushes Video utilization well over 100% to exercise the red band + >100 domain
  staticsByMonth: new Array(12).fill(40),
  enabled: true, hypothetical: false,
}];
const sup = flatSupply(peaks, 12);

describe("ForecastChart", () => {
  it("mounts with capacity bands and an over-100% line without throwing", () => {
    const result = runForecast(scenario, sup, 12, new Date(2026, 5, 1));
    expect(() => render(<ForecastChart result={result} />)).not.toThrow();
  });
});
