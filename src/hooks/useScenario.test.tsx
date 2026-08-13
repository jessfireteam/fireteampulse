import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ClientPlan } from "@/lib/forecast/types";

/**
 * Guards the load-time clobber vector. The scenario row is shared by every partner and
 * autosaves on a debounce, so merely opening the page must never write. That matters more
 * now that volumes are derived: a Max change in Fibery makes the seeded state differ from
 * the stored row on every load, and if that counted as an edit, one page view would
 * overwrite whatever anyone else had saved.
 */

const SAVED_ROW = {
  clients: [
    {
      id: "old",
      name: "Ground News",
      videosByMonth: new Array(12).fill(9), // stale, flat -> re-derives
      staticsByMonth: new Array(12).fill(4),
      enabled: true,
      hypothetical: false,
    },
  ],
  // A populated cost_config carrying the roster's capacity fields, so this also covers
  // "adding role/capacityPerWeek to a person doesn't make loading the page look like an edit".
  cost_config: {
    partnerSalaryByMonth: new Array(12).fill(0),
    rentByMonth: new Array(12).fill(0),
    nonProdSalaryByMonth: new Array(12).fill(0),
    overheadLines: [],
    // The two deprecated keys are present because the app writes the emptyCostConfig-merged
    // object, so the live row carries them (verified against production). Omitting them here
    // makes the load-time merge re-add them, which counts as a change and fires a save — so a
    // fixture without them tests a state that can't occur and fails for the wrong reason.
    overheadByMonth: new Array(12).fill(0),
    costPerDeliverableByMonth: new Array(12).fill(0),
    team: [
      { id: "k", name: "Khushboo", side: "video", monthlyCost: 2000, startMonthIndex: 0, role: "Video" },
      { id: "j", name: "John", side: "both", monthlyCost: 6250, startMonthIndex: 0, role: "Copywriters", capacityPerWeek: 8 },
    ],
    // A live pipeline config: rows derive from it at seed, and deriving them must not write.
    pipeline: {
      enabled: true,
      everyNMonths: 1,
      firstMonthIndex: 2,
      videosPerMonth: 6,
      staticsPerMonth: 6,
      minFee: 5000,
    },
  },
  updated_at: "2026-08-11T13:59:42.181Z",
};

const update = vi.fn();
const insert = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.maybeSingle = () => Promise.resolve({ data: SAVED_ROW, error: null });
    chain.update = (...args: unknown[]) => {
      update(...args);
      return {
        eq: () => ({
          eq: () => ({
            select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
      };
    };
    chain.insert = (...args: unknown[]) => {
      insert(...args);
      return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) };
    };
    return chain;
  };
  return {
    supabase: {
      from: builder,
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => Promise.resolve(),
    },
  };
});

const { useScenario } = await import("@/hooks/useScenario");

// Ground News' plan moved to 30/mo in Fibery, which disagrees with the stored 9/4.
const plans: ClientPlan[] = [
  {
    client: "Ground News",
    max: 30,
    min: 5,
    videoShare: 0.85,
    mixSource: "client",
    videos: 25,
    statics: 5,
    source: "max",
  },
];

describe("useScenario", () => {
  beforeEach(() => {
    update.mockClear();
    insert.mockClear();
    vi.useRealTimers();
  });

  it("adopts the derived plan over the stale stored volumes", async () => {
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await waitFor(() => expect(result.current.clients.length).toBeGreaterThan(0));
    const gn = result.current.clients.find((c) => c.name === "Ground News")!;
    expect(gn.videosByMonth[0]).toBe(25);
    expect(gn.staticsByMonth[0]).toBe(5);
  });

  it("derives pipeline rows from the stored config at seed, without writing", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await vi.waitFor(() => expect(result.current.clients.length).toBeGreaterThan(0));
    const pipelineRows = result.current.clients.filter((c) => c.pipeline);
    // firstMonthIndex 2, monthly cadence, 12-month horizon -> 10 rows.
    expect(pipelineRows).toHaveLength(10);
    expect(pipelineRows[0].startMonthIndex).toBe(2);
    expect(pipelineRows[0].pricing?.minFee).toBe(5000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does NOT write to the shared row just because the plan changed on load", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await vi.waitFor(() => expect(result.current.clients.length).toBeGreaterThan(0));
    // Push well past the autosave debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(result.current.saveState).not.toBe("saving");
  });

  it("loads the roster's role and capacity fields back intact", async () => {
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await waitFor(() => expect(result.current.costConfig.team).toHaveLength(2));
    const john = result.current.costConfig.team.find((p) => p.id === "j")!;
    expect(john.role).toBe("Copywriters");
    expect(john.capacityPerWeek).toBe(8);
    const khushboo = result.current.costConfig.team.find((p) => p.id === "k")!;
    expect(khushboo.role).toBe("Video");
    expect(khushboo.capacityPerWeek).toBeUndefined();
  });

  it("does NOT seed from a half-loaded plan list, and picks up the real one when it lands", async () => {
    // The 2026-08-13 failure: the client roster query resolves before the Max and project-history
    // queries, so `plans` briefly holds every client at 0/0. Seeding then locked the zeros in and
    // the next edit persisted them, flattening the forecast to ~0% utilization.
    const zeroPlans: ClientPlan[] = [
      { client: "Ground News", max: null, min: null, videoShare: 0.5, mixSource: "agency", videos: 0, statics: 0, source: "runrate" },
    ];
    const { result, rerender } = renderHook(
      ({ p, ready }: { p: ClientPlan[]; ready: boolean }) => useScenario(p, "jess@fireteam.is", ready),
      { initialProps: { p: zeroPlans, ready: false } },
    );
    await waitFor(() => expect(result.current.costConfig.team).toHaveLength(2));
    // Nothing seeded while the data was still in flight.
    expect(result.current.clients).toHaveLength(0);

    rerender({ p: plans, ready: true });
    // Ground News plus the 10 pipeline rows derived from the stored config.
    await waitFor(() => expect(result.current.clients.length).toBeGreaterThan(0));
    const gn = result.current.clients.find((c) => c.name === "Ground News")!;
    expect(gn.videosByMonth[0]).toBe(25);
    expect(gn.staticsByMonth[0]).toBe(5);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a roster capacity edit, which goes through the cost path not the client path", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await vi.waitFor(() => expect(result.current.costConfig.team).toHaveLength(2));
    act(() => {
      result.current.updateCost({
        team: result.current.costConfig.team.map((p) =>
          p.id === "k" ? { ...p, capacityPerWeek: 6 } : p,
        ),
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(update).toHaveBeenCalledTimes(1);
    const sentTeam = update.mock.calls[0][0].cost_config.team;
    expect(sentTeam.find((p: { id: string }) => p.id === "k").capacityPerWeek).toBe(6);
  });

  it("still saves a real edit", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await vi.waitFor(() => expect(result.current.clients.length).toBeGreaterThan(0));
    act(() => {
      result.current.update(result.current.clients[0].id, {
        videosByMonth: new Array(12).fill(18),
        manualVolumes: true,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
