import { describe, it, expect } from "vitest";
import { runPnL } from "../pnl";
import type { ClientPricing, CostConfig, ProductionPerson } from "../types";

const pricing: ClientPricing = { minFee: 3000, tiers: [{ upTo: null, rate: 10 }] };
function client(over: Partial<{ pricing: ClientPricing; adSpendByMonth: number[]; agencyPctByMonth: number[]; videosByMonth: number[]; staticsByMonth: number[]; enabled: boolean }>) {
  return { pricing, adSpendByMonth: [], agencyPctByMonth: [], videosByMonth: [], staticsByMonth: [], enabled: true, ...over };
}
function person(over: Partial<ProductionPerson>): ProductionPerson {
  return { id: "p", name: "X", side: "video", monthlyCost: 0, startMonthIndex: 0, ...over };
}
function cost(over: Partial<CostConfig> = {}): CostConfig {
  return { partnerSalaryByMonth: [0,0], rentByMonth: [0,0], overheadByMonth: [0,0], team: [], ...over };
}

describe("runPnL", () => {
  const labels = ["Jun", "Jul"];

  it("production cost = sum of active roster; per-type cost = side cost / that type's output", () => {
    const clients = [client({ videosByMonth: [10,10], staticsByMonth: [5,5], adSpendByMonth:[100000,100000], agencyPctByMonth:[50,50] })];
    const team: ProductionPerson[] = [
      person({ id:"v", side:"video", monthlyCost: 8000, startMonthIndex: 0 }),
      person({ id:"s", side:"static", monthlyCost: 4000, startMonthIndex: 0 }),
    ];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: labels });
    expect(rows[0].productionCost).toBe(12000);
    expect(rows[0].videos).toBe(10);
    expect(rows[0].statics).toBe(5);
    expect(rows[0].costPerVideo).toBeCloseTo(800, 5);
    expect(rows[0].costPerStatic).toBeCloseTo(800, 5);
    expect(rows[0].deliverables).toBe(15);
  });

  it("a hire (startMonthIndex>0) only counts from its start month", () => {
    const clients = [client({ videosByMonth: [10,10], staticsByMonth: [0,0] })];
    const team = [person({ id:"hire", side:"video", monthlyCost: 9000, startMonthIndex: 1 })];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: labels });
    expect(rows[0].productionCost).toBe(0);
    expect(rows[1].productionCost).toBe(9000);
  });

  it("folds production into total cost and computes net + margin", () => {
    const clients = [client({ videosByMonth:[10,10], staticsByMonth:[0,0], adSpendByMonth:[100000,100000], agencyPctByMonth:[50,50] })];
    const team = [person({ id:"v", side:"video", monthlyCost: 1000, startMonthIndex: 0 })];
    const rows = runPnL({ clients, costConfig: cost({ team, partnerSalaryByMonth:[2000,2000], rentByMonth:[500,500], overheadByMonth:[300,300] }), monthLabels: labels });
    expect(rows[0].revenue).toBeCloseTo(5000, 2);
    expect(rows[0].fixedCost).toBe(2800);
    expect(rows[0].totalCost).toBe(3800);
    expect(rows[0].netIncome).toBeCloseTo(1200, 2);
    expect(rows[0].margin).toBeCloseTo(1200/5000, 4);
  });

  it("nulls per-type cost when that type has no output; excludes disabled clients", () => {
    const clients = [
      client({ videosByMonth:[0,0], staticsByMonth:[4,4] }),
      client({ videosByMonth:[99,99], staticsByMonth:[99,99], enabled:false }),
    ];
    const team = [person({ id:"v", side:"video", monthlyCost: 8000 }), person({ id:"s", side:"static", monthlyCost: 4000 })];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: labels });
    expect(rows[0].videos).toBe(0);
    expect(rows[0].statics).toBe(4);
    expect(rows[0].costPerVideo).toBeNull();
    expect(rows[0].costPerStatic).toBeCloseTo(1000, 5);
  });
});
