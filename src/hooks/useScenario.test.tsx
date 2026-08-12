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
  cost_config: null,
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
    await waitFor(() => expect(result.current.clients).toHaveLength(1));
    expect(result.current.clients[0].videosByMonth[0]).toBe(25);
    expect(result.current.clients[0].staticsByMonth[0]).toBe(5);
  });

  it("does NOT write to the shared row just because the plan changed on load", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await vi.waitFor(() => expect(result.current.clients).toHaveLength(1));
    // Push well past the autosave debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(result.current.saveState).not.toBe("saving");
  });

  it("still saves a real edit", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScenario(plans, "jess@fireteam.is"));
    await vi.waitFor(() => expect(result.current.clients).toHaveLength(1));
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
