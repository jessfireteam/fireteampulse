import { describe, it, expect } from "vitest";
import { runPnL } from "../pnl";
import type { ClientPricing, CostConfig } from "../types";

const pricing: ClientPricing = { minFee: 3000, tiers: [{ upTo: null, rate: 10 }] };
function client(adSpend: number, pct: number, months: number) {
  return { pricing, adSpendByMonth: new Array(months).fill(adSpend), agencyPctByMonth: new Array(months).fill(pct) };
}
function cost(partner: number, rent: number, perDeliv: number, months: number): CostConfig {
  return {
    partnerSalaryByMonth: new Array(months).fill(partner),
    rentByMonth: new Array(months).fill(rent),
    costPerDeliverableByMonth: new Array(months).fill(perDeliv),
  };
}

describe("runPnL", () => {
  const labels = ["Jun", "Jul"];
  it("computes revenue, total cost, net income and margin per month", () => {
    const rows = runPnL({ clients: [client(100_000, 50, 2)], costConfig: cost(35_000, 2_000, 700, 2), deliverablesByMonth: [10, 10], monthLabels: labels });
    expect(rows).toHaveLength(2);
    expect(rows[0].revenue).toBeCloseTo(5000, 2);
    expect(rows[0].totalCost).toBeCloseTo(44000, 2);
    expect(rows[0].netIncome).toBeCloseTo(-39000, 2);
    expect(rows[0].margin).toBeCloseTo(-39000 / 5000, 4);
  });
  it("derives unit economics; cost/deliverable falls as deliverables rise", () => {
    const rows = runPnL({ clients: [client(100_000, 50, 2)], costConfig: cost(35_000, 2_000, 700, 2), deliverablesByMonth: [10, 100], monthLabels: labels });
    expect(rows[0].costPerDeliverable!).toBeCloseTo(4400, 2);
    expect(rows[1].costPerDeliverable!).toBeCloseTo(1070, 2);
    expect(rows[1].costPerDeliverable!).toBeLessThan(rows[0].costPerDeliverable!);
    expect(rows[0].feePerDeliverable!).toBeCloseTo(500, 2);
  });
  it("guards divide-by-zero when there are no deliverables", () => {
    const rows = runPnL({ clients: [client(100_000, 50, 1)], costConfig: cost(35_000, 2_000, 700, 1), deliverablesByMonth: [0], monthLabels: ["Jun"] });
    expect(rows[0].feePerDeliverable).toBeNull();
    expect(rows[0].costPerDeliverable).toBeNull();
    expect(rows[0].variableCost).toBe(0);
  });
  it("margin is 0 when revenue is 0", () => {
    const rows = runPnL({ clients: [], costConfig: cost(35_000, 2_000, 700, 1), deliverablesByMonth: [5], monthLabels: ["Jun"] });
    expect(rows[0].revenue).toBe(0);
    expect(rows[0].margin).toBe(0);
  });
});
