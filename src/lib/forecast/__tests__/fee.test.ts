import { describe, it, expect } from "vitest";
import { computeFee } from "../fee";
import type { ClientPricing } from "../types";

const pricing: ClientPricing = {
  minFee: 3000,
  tiers: [
    { upTo: 100000, rate: 7 },
    { upTo: 250000, rate: 6 },
    { upTo: null, rate: 5 },
  ],
};

describe("computeFee", () => {
  it("applies the agency % to get managed spend, then marginal tiers", () => {
    expect(computeFee(1_700_000, 20, pricing)).toBeCloseTo(20500, 2);
  });
  it("floors at the minimum fee", () => {
    expect(computeFee(10_000, 10, pricing)).toBe(3000);
  });
  it("handles a single-bracket amount", () => {
    expect(computeFee(100_000, 50, pricing)).toBeCloseTo(3500, 2);
  });
  it("returns the floor for zero spend or zero %", () => {
    expect(computeFee(0, 40, pricing)).toBe(3000);
    expect(computeFee(500_000, 0, pricing)).toBe(3000);
  });
});

describe("computeFee with base fee", () => {
  it("adds the base fee to the tiered amount (FabFitFun-style)", () => {
    const fff = { baseFee: 10000, minFee: 0, tiers: [{ upTo: null, rate: 2.5 }] };
    // 1,700,000 * 20% = 340,000 managed * 2.5% = 8,500 ; + 10,000 base = 18,500
    expect(computeFee(1_700_000, 20, fff)).toBeCloseTo(18500, 2);
  });
  it("base fee plus tiers can exceed a low minimum", () => {
    const p = { baseFee: 10000, minFee: 0, tiers: [{ upTo: null, rate: 2.5 }] };
    // 800,000 managed * 2.5% = 20,000 + 10,000 = 30,000 (base is additive, not a floor)
    expect(computeFee(800_000, 100, p)).toBeCloseTo(30000, 2);
  });
  it("still floors at minFee when base+tiers is below it", () => {
    const p = { baseFee: 0, minFee: 5000, tiers: [{ upTo: 100000, rate: 10 }, { upTo: 200000, rate: 8 }, { upTo: 300000, rate: 6 }, { upTo: null, rate: 5 }] };
    expect(computeFee(10_000, 10, p)).toBe(5000); // tiny managed -> floored
  });
  it("marginal tiers on managed reproduce a known client (Bambu-style)", () => {
    const p = { baseFee: 0, minFee: 5000, tiers: [{ upTo: 100000, rate: 10 }, { upTo: 200000, rate: 8 }, { upTo: 300000, rate: 6 }, { upTo: null, rate: 5 }] };
    // 200,000 * 55% = 110,000 managed -> 100k@10% + 10k@8% = 10,800
    expect(computeFee(200_000, 55, p)).toBeCloseTo(10800, 2);
  });
});
