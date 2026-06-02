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
