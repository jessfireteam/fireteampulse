import { describe, it, expect } from "vitest";
import { deriveClientPlans, MIN_MIX_SAMPLE, type PlanClientInput } from "../plan";
import type { ClientHistory } from "../types";

const client = (
  name: string,
  max: number | null = null,
  min: number | null = null,
  status = "Active",
): PlanClientInput => ({
  name,
  status: { name: status },
  maxDeliverablesPerMonth: max,
  minDeliverablesPerMonth: min,
});

/** 3 months of history; videos/statics are totals spread onto the newest month. */
const hist = (name: string, videos: number, statics: number): ClientHistory => ({
  client: name,
  videosByMonth: [0, 0, videos],
  staticsByMonth: [0, 0, statics],
  seedVideos: videos,
  seedStatics: statics,
});

describe("deriveClientPlans", () => {
  it("splits Max by the client's own trailing video share", () => {
    const [p] = deriveClientPlans([client("Ground News", 30)], [hist("Ground News", 24, 6)]);
    expect(p.source).toBe("max");
    expect(p.videos).toBe(24); // 30 * 0.8
    expect(p.statics).toBe(6);
  });

  it("always sums to Max exactly, including when the share rounds", () => {
    // share = 3/9 -> 27 * 0.333 = 8.99 -> rounds to 9, statics takes the remainder
    const [p] = deriveClientPlans([client("FabFitFun", 27)], [hist("FabFitFun", 3, 6)]);
    expect(p.videos + p.statics).toBe(27);
    expect(p.videos).toBe(9);
    expect(p.statics).toBe(18);
  });

  it("ignores a thin sample rather than letting one project define the split", () => {
    // Spacelift's real case: a single completed static in three months against a Max of 16.
    // Its own ratio would say 0% video; the agency mix (8/10 video) is the honest guess.
    const plans = deriveClientPlans(
      [client("Spacelift", 16), client("Busy Co", 10)],
      [hist("Spacelift", 0, 1), hist("Busy Co", 8, 2)],
    );
    const s = plans.find((p) => p.client === "Spacelift")!;
    expect(s.mixSource).toBe("agency");
    expect(s.videos).toBeGreaterThan(0);
    expect(s.videos + s.statics).toBe(16);
  });

  it("trusts a client's own mix once it clears the sample floor", () => {
    const [p] = deriveClientPlans(
      [client("Acme", 10)],
      [hist("Acme", MIN_MIX_SAMPLE, 0)],
    );
    expect(p.mixSource).toBe("client");
    expect(p.videos).toBe(10);
  });

  it("uses each client's own mix, not one agency-wide ratio", () => {
    const plans = deriveClientPlans(
      [client("VideoCo", 10), client("StaticCo", 10)],
      [hist("VideoCo", 9, 1), hist("StaticCo", 1, 9)],
    );
    const v = plans.find((p) => p.client === "VideoCo")!;
    const s = plans.find((p) => p.client === "StaticCo")!;
    expect(v.videos).toBe(9);
    expect(s.videos).toBe(1);
  });

  it("includes an active client that has a Max but no output yet", () => {
    const plans = deriveClientPlans(
      [client("Fresh Signing", 12), client("Established", 10)],
      [hist("Established", 8, 2)],
    );
    const fresh = plans.find((p) => p.client === "Fresh Signing");
    expect(fresh).toBeDefined();
    // No history of its own -> agency-wide share (8/10) applied to its Max.
    expect(fresh!.videos + fresh!.statics).toBe(12);
    expect(fresh!.videos).toBe(10);
  });

  it("falls back to trailing run-rate and flags a client with no Max set", () => {
    const [p] = deriveClientPlans([client("Catalyst", null, 12)], [hist("Catalyst", 4, 3)]);
    expect(p.source).toBe("runrate");
    expect(p.max).toBeNull();
    expect(p.min).toBe(12);
    expect(p.videos).toBe(4);
    expect(p.statics).toBe(3);
  });

  it("treats a client with neither Max nor history as an explicit zero, not a crash", () => {
    const [p] = deriveClientPlans([client("Eyemos")], []);
    expect(p.source).toBe("runrate");
    expect(p.videos).toBe(0);
    expect(p.statics).toBe(0);
  });

  it("treats Max of 0 as a real plan of zero, not as unset", () => {
    const [p] = deriveClientPlans([client("Winding Down", 0)], [hist("Winding Down", 5, 5)]);
    expect(p.source).toBe("max");
    expect(p.videos).toBe(0);
    expect(p.statics).toBe(0);
  });

  it("excludes inactive clients and Fireteam itself", () => {
    const plans = deriveClientPlans(
      [client("Acme", 10), client("Old Co", 10, null, "Stopped"), client("Fireteam", 10)],
      [],
    );
    expect(plans.map((p) => p.client)).toEqual(["Acme"]);
  });

  it("is deterministic, so re-deriving on load can never look like an edit", () => {
    const inputs: PlanClientInput[] = [client("Acme", 20), client("Beta", 12)];
    const histories = [hist("Acme", 6, 4), hist("Beta", 2, 10)];
    expect(deriveClientPlans(inputs, histories)).toEqual(deriveClientPlans(inputs, histories));
  });
});
