import { describe, it, expect } from "vitest";
import { runPnL } from "../pnl";
import type { ClientPricing, CostConfig, ProductionPerson } from "../types";

const pricing: ClientPricing = { minFee: 3000, tiers: [{ upTo: null, rate: 10 }] };
function client(over: Partial<{ pricing: ClientPricing; adSpendByMonth: number[]; agencyPctByMonth: number[]; videosByMonth: number[]; staticsByMonth: number[]; enabled: boolean; oneOffsByMonth: number[]; startMonthIndex: number; endMonthIndex: number | null }>) {
  return { pricing, adSpendByMonth: [], agencyPctByMonth: [], videosByMonth: [], staticsByMonth: [], enabled: true, ...over };
}
function person(over: Partial<ProductionPerson>): ProductionPerson {
  return { id: "p", name: "X", side: "video", monthlyCost: 0, startMonthIndex: 0, ...over };
}
function cost(over: Partial<CostConfig> = {}): CostConfig {
  return { partnerSalaryByMonth: [0,0], rentByMonth: [0,0], nonProdSalaryByMonth: [0,0], overheadLines: [], overheadByMonth: [0,0], team: [], ...over };
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

  it("adds one-off fees to revenue for that month", () => {
    const clients = [client({ adSpendByMonth:[0,0], agencyPctByMonth:[0,0], oneOffsByMonth:[10000, 0] })]; // pricing min 3000
    const rows = runPnL({ clients, costConfig: cost(), monthLabels: ["Jun","Jul"] });
    // Jun: recurring fee floored to minFee 3000 + one-off 10000 = 13000
    expect(rows[0].revenue).toBeCloseTo(13000, 2);
    // Jul: just the 3000 minimum, no one-off
    expect(rows[1].revenue).toBeCloseTo(3000, 2);
  });

  it("bills a one-off in a pre-start (inactive) month without charging the recurring minimum", () => {
    // Client starts billing in Jul (index 1); a $10k strategy fee lands in Jun (index 0).
    const clients = [client({ adSpendByMonth:[0,0], agencyPctByMonth:[0,0], oneOffsByMonth:[10000, 0], startMonthIndex: 1 })];
    const rows = runPnL({ clients, costConfig: cost(), monthLabels: ["Jun","Jul"] });
    // Jun: not active yet, so NO recurring minimum — only the one-off strategy fee.
    expect(rows[0].revenue).toBeCloseTo(10000, 2);
    // Jul: active, recurring minimum 3000 kicks in, no one-off.
    expect(rows[1].revenue).toBeCloseTo(3000, 2);
  });

  it("splits a 'both'-side person's cost across video and static by output mix", () => {
    const clients = [client({ videosByMonth: [30,30], staticsByMonth: [10,10] })]; // 75% video
    const team = [person({ id:"cw", side:"both", monthlyCost: 9000 })];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: ["Jun","Jul"] });
    expect(rows[0].productionCost).toBe(9000);
    // both-cost allocated by mix: 6750 video / 30 = 225 ; 2250 static / 10 = 225
    expect(rows[0].costPerVideo).toBeCloseTo(225, 5);
    expect(rows[0].costPerStatic).toBeCloseTo(225, 5);
  });

  it("combines side-specific and 'both' costs in per-type figures", () => {
    const clients = [client({ videosByMonth: [10,10], staticsByMonth: [10,10] })]; // 50/50
    const team = [
      person({ id:"v", side:"video", monthlyCost: 1000 }),
      person({ id:"b", side:"both", monthlyCost: 2000 }),
    ];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: ["Jun","Jul"] });
    // video: (1000 + 2000*0.5) / 10 = 200 ; static: (0 + 2000*0.5) / 10 = 100
    expect(rows[0].costPerVideo).toBeCloseTo(200, 5);
    expect(rows[0].costPerStatic).toBeCloseTo(100, 5);
    expect(rows[0].productionCost).toBe(3000);
  });

  it("sums named overhead lines into fixed cost", () => {
    const cc = cost({ overheadLines: [
      { id:"sal", label:"Salary", byMonth:[25000,25000] },
      { id:"sw", label:"Software", byMonth:[7000,7000] },
    ], overheadByMonth:[999,999] /* legacy ignored when lines present */ });
    const rows = runPnL({ clients: [], costConfig: cc, monthLabels: ["Jun","Jul"] });
    expect(rows[0].fixedCost).toBe(32000); // partner 0 + rent 0 + (25000+7000); legacy 999 ignored
  });

  it("falls back to legacy overheadByMonth when no overheadLines", () => {
    const cc = cost({ overheadByMonth:[5000,5000] }); // no overheadLines (empty)
    const rows = runPnL({ clients: [], costConfig: cc, monthLabels: ["Jun","Jul"] });
    expect(rows[0].fixedCost).toBe(5000);
  });

  it("production cost counts ALL producers regardless of employment", () => {
    const team = [
      person({ id:"c", side:"video", monthlyCost:5000, employment:"contractor" }),
      person({ id:"s", side:"static", monthlyCost:6500, employment:"salary" }),
    ];
    const clients = [client({ videosByMonth:[10,10], staticsByMonth:[10,10] })];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: ["Jun","Jul"] });
    expect(rows[0].productionCost).toBe(11500); // both counted, toggle irrelevant here
  });
  it("dedicated non-prod salary nets out salaried producers; total counts each once", () => {
    const team = [person({ id:"s", side:"static", monthlyCost:6500, employment:"salary" })];
    const clients = [client({ videosByMonth:[0,0], staticsByMonth:[10,10] })];
    const rows = runPnL({ clients, costConfig: cost({ team, nonProdSalaryByMonth:[37000,37000], partnerSalaryByMonth:[0,0], rentByMonth:[0,0] }), monthLabels: ["Jun","Jul"] });
    expect(rows[0].nonProdSalaryNet).toBe(30500);  // 37000 - 6500
    expect(rows[0].fixedCost).toBe(30500);          // partner0 + rent0 + salaryNet30500 + overhead0
    expect(rows[0].totalCost).toBe(37000);          // fixed 30500 + production 6500 (counted once)
  });
  it("salary net floors at 0 when salaried producers exceed entered payroll", () => {
    const team = [person({ id:"s", side:"static", monthlyCost:50000, employment:"salary" })];
    const clients = [client({ videosByMonth:[0,0], staticsByMonth:[10,10] })];
    const rows = runPnL({ clients, costConfig: cost({ team, nonProdSalaryByMonth:[37000,37000], partnerSalaryByMonth:[0,0], rentByMonth:[0,0] }), monthLabels: ["Jun","Jul"] });
    expect(rows[0].nonProdSalaryNet).toBe(0);
  });

  it("offboarded client contributes nothing after its end month (no minimum fee, no deliverables)", () => {
    const clients = [client({ endMonthIndex: 0, videosByMonth:[5,5], staticsByMonth:[0,0], adSpendByMonth:[0,0], agencyPctByMonth:[0,0] })]; // pricing min 3000
    const rows = runPnL({ clients, costConfig: cost(), monthLabels: ["Jun","Jul"] });
    expect(rows[0].revenue).toBeCloseTo(3000, 2); // active month: min fee
    expect(rows[0].videos).toBe(5);
    expect(rows[1].revenue).toBe(0);              // offboarded: no min fee
    expect(rows[1].videos).toBe(0);               // no deliverables
  });
  it("client active from a later month contributes nothing before it", () => {
    const clients = [client({ startMonthIndex: 1, videosByMonth:[9,9], staticsByMonth:[0,0] })];
    const rows = runPnL({ clients, costConfig: cost(), monthLabels: ["Jun","Jul"] });
    expect(rows[0].revenue).toBe(0);
    expect(rows[0].videos).toBe(0);
    expect(rows[1].revenue).toBeCloseTo(3000, 2);
    expect(rows[1].videos).toBe(9);
  });
  it("defaults missing employment to contractor (counts in production cost)", () => {
    const clients = [client({ videosByMonth:[5,5], staticsByMonth:[0,0] })];
    const team = [person({ id:"x", side:"video", monthlyCost:2000 })];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: ["Jun","Jul"] });
    expect(rows[0].productionCost).toBe(2000);
  });
});
