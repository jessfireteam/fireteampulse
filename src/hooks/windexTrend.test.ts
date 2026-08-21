import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { processWinnersData, publishableTrendWindows } from "./useWinnersData";
import {
  buildTrendFixtureProjects,
  TREND_FIXTURE_NAMES,
  TREND_FIXTURE_NOW,
} from "./useWinnersData.fixture";

// The window list is derived from "now", so the clock has to be pinned or these
// assertions rot in a month. See the fixture for the shape of the data.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TREND_FIXTURE_NOW));
});
afterAll(() => {
  vi.useRealTimers();
});

const projects = () => buildTrendFixtureProjects();
const dataFor = () => processWinnersData(projects(), "all", new Set<string>());
const findCW = (name: string) => {
  const c = dataFor().contributors.find((x) => x.name === name && x.rolePublicId === "11");
  expect(c, `no CW row for ${name}`).toBeTruthy();
  return c!;
};

describe("publishableTrendWindows", () => {
  it("publishes one window per month from tracking start, oldest first", () => {
    const windows = publishableTrendWindows(projects(), Date.now());
    expect(windows.length).toBeGreaterThan(4);
    expect(windows[0].label).toBe("Sep '25–Nov '25");
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].end).toBe(windows[i - 1].end + 1);
      expect(windows[i].end - windows[i].start).toBe(2); // 3 calendar months
    }
  });

  it("withholds the window holding work too fresh to have been tagged", () => {
    const windows = publishableTrendWindows(projects(), Date.now());
    // The fixture's newest work finished 5 days before the pinned clock, so the
    // Apr-Jun window is ~14% matured and must not be published.
    expect(windows.some((w) => w.label.includes("Jun '26"))).toBe(false);
    expect(windows[windows.length - 1].label).toBe("Mar '26–May '26");
  });
});

describe("contributor W Index trend", () => {
  it("shares one window list across contributors so bars line up", () => {
    const data = dataFor();
    const trend = data.contributors.find((c) => c.name === TREND_FIXTURE_NAMES.trend)!;
    const peer = data.contributors.find((c) => c.name === TREND_FIXTURE_NAMES.peer)!;
    expect(trend.windexTrend!.map((p) => p.label)).toEqual(peer.windexTrend!.map((p) => p.label));
  });

  it("reproduces the headline math inside a single window", () => {
    const t = findCW(TREND_FIXTURE_NAMES.trend);
    const first = t.windexTrend!.find((p) => p.label === "Sep '25–Nov '25")!;
    // 30 projects, 9 winners, peers win 10% -> 3.0 expected -> index 300.
    expect(first.projects).toBe(30);
    expect(first.winners).toBe(9);
    expect(first.expected).toBeCloseTo(3.0, 5);
    expect(first.index).toBe(300);
    // Shrunk with 20 baseline-projects of prior (2.0 expected): (9+2)/(3+2).
    expect(first.adjIndex).toBe(220);
  });

  it("shows the fall from over- to under-performance", () => {
    const t = findCW(TREND_FIXTURE_NAMES.trend);
    const last = t.windexTrend![t.windexTrend!.length - 1];
    expect(last.label).toBe("Mar '26–May '26");
    expect(last.winners).toBe(0);
    expect(last.index).toBe(0);
    // A zero-winner window is pulled well off zero rather than plotted as a
    // total collapse: (0 + 2.0) / (1.0 + 2.0).
    expect(last.adjIndex).toBe(67);
    expect(t.windexTrend![0].adjIndex!).toBeGreaterThan(last.adjIndex!);
  });

  it("excludes fresh work from every published window", () => {
    const t = findCW(TREND_FIXTURE_NAMES.trend);
    // 76 completed projects in total, of which only the 70 mature ones can land
    // in a window. Windows overlap, so check the newest instead of a sum.
    expect(t.totalProjects).toBe(76);
    expect(t.windexTrend!.every((p) => !p.label.includes("Jun '26"))).toBe(true);
    expect(t.windexTrend!.every((p) => !p.settling)).toBe(true);
  });

  it("skips the trend when the headline index is not measurable", () => {
    const solo = findCW(TREND_FIXTURE_NAMES.solo);
    expect(solo.measurable).toBe(false);
    expect(solo.windexTrend).toBeUndefined();
  });
});
