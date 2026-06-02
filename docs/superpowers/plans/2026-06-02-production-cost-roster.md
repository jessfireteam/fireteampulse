# Production Cost Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the P&L's single "Variable cost / deliverable" input with a production-team roster (people with monthly costs split video/static), deriving per-video and per-static cost and supporting hire modeling.

**Architecture:** Production cost is the sum of the roster (fixed monthly, stepping up at each hire's start month) — not multiplied by deliverables. Per-video/per-static costs are derived KPIs (side cost ÷ that type's output). The P&L aggregation derives per-month videos/statics from the enabled clients directly, removing the separate deliverables param.

**Tech Stack:** React + Vite + TS + shadcn/ui + vitest. Branch `feat/production-cost-roster` (already created off `main`).

---

## Background

- `src/lib/forecast/pnl.ts` `runPnL` currently takes `{ clients, costConfig, deliverablesByMonth, monthLabels }`. We're dropping `deliverablesByMonth` and deriving videos/statics from `clients`.
- `ScenarioClient` (`types.ts`) has `videosByMonth: number[]`, `staticsByMonth: number[]`, `enabled`, plus revenue fields `pricing`/`adSpendByMonth`/`agencyPctByMonth`.
- `CostConfig` currently `{ partnerSalaryByMonth, rentByMonth, overheadByMonth, costPerDeliverableByMonth }`. `costPerDeliverableByMonth` becomes unused (keep optional, ignored).
- `useScenario` persists `cost_config` jsonb and merges with `emptyCostConfig(HORIZON_MONTHS)` on load (so new fields default).
- `PnlTab.tsx` renders KPIs + a single table (revenue rows, cost rows incl. CostRow components, net/margin). It calls `runPnL`. `Partners.tsx` passes `deliverablesByMonth={result.months.map(m=>m.assets)}` — that prop goes away.
- Verify with `npx tsc -p tsconfig.app.json --noEmit` (REAL type check) and `npx vitest run`. `npm run build` does NOT type-check.
- After merge: this lands via PR to `main`, then deploy from `main` (shared-prod stability rule).

---

## Task 1: Types

**Files:** Modify `src/lib/forecast/types.ts`

- [ ] **Step 1: Add ProductionPerson, extend CostConfig + PnlMonth + emptyCostConfig**

Add:
```typescript
export interface ProductionPerson {
  id: string;
  name: string;
  side: "video" | "static";
  monthlyCost: number;
  startMonthIndex: number; // 0 = active now; >0 = a hire beginning that month
}
```
Add `team` to `CostConfig` (keep `costPerDeliverableByMonth` optional/unused):
```typescript
export interface CostConfig {
  partnerSalaryByMonth: number[];
  rentByMonth: number[];
  overheadByMonth: number[];
  costPerDeliverableByMonth?: number[]; // legacy, unused (kept for back-compat)
  team: ProductionPerson[];
}
```
Update `emptyCostConfig` to add `team: []` (and `costPerDeliverableByMonth` can be dropped from it or kept as `new Array(horizon).fill(0)` — keep it filled for back-compat).
Update `PnlMonth`: remove `variableCost`, add `productionCost`, `videos`, `statics`, `costPerVideo`, `costPerStatic`:
```typescript
export interface PnlMonth {
  monthIndex: number;
  label: string;
  revenue: number;
  fixedCost: number;
  productionCost: number;
  totalCost: number;
  netIncome: number;
  margin: number;
  deliverables: number;
  videos: number;
  statics: number;
  feePerDeliverable: number | null;
  costPerDeliverable: number | null; // all-in = totalCost / deliverables
  costPerVideo: number | null;
  costPerStatic: number | null;
}
```

- [ ] **Step 2: Verify** — `npx tsc -p tsconfig.app.json --noEmit` will fail in pnl.ts/PnlTab (expected, fixed in later tasks). Confirm the error is ONLY about `variableCost`/missing fields in those consumers, not a syntax error in types.ts. (Type-only task; consumers fixed next.)

- [ ] **Step 3: Commit**
```bash
git add src/lib/forecast/types.ts
git commit -m "feat: ProductionPerson type + CostConfig.team + PnlMonth per-type fields"
```

---

## Task 2: P&L aggregation with roster + per-type cost

**Files:** Modify `src/lib/forecast/pnl.ts`, `src/lib/forecast/__tests__/pnl.test.ts`

- [ ] **Step 1: Rewrite the test file**

Replace `src/lib/forecast/__tests__/pnl.test.ts` with:
```typescript
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
    expect(rows[0].productionCost).toBe(12000);     // 8000 + 4000
    expect(rows[0].videos).toBe(10);
    expect(rows[0].statics).toBe(5);
    expect(rows[0].costPerVideo).toBeCloseTo(800, 5);   // 8000 / 10
    expect(rows[0].costPerStatic).toBeCloseTo(800, 5);  // 4000 / 5
    expect(rows[0].deliverables).toBe(15);
  });

  it("a hire (startMonthIndex>0) only counts from its start month", () => {
    const clients = [client({ videosByMonth: [10,10], staticsByMonth: [0,0] })];
    const team = [person({ id:"hire", side:"video", monthlyCost: 9000, startMonthIndex: 1 })];
    const rows = runPnL({ clients, costConfig: cost({ team }), monthLabels: labels });
    expect(rows[0].productionCost).toBe(0);     // not yet started
    expect(rows[1].productionCost).toBe(9000);  // started month 1
  });

  it("folds production into total cost and computes net + margin", () => {
    const clients = [client({ videosByMonth:[10,10], staticsByMonth:[0,0], adSpendByMonth:[100000,100000], agencyPctByMonth:[50,50] })]; // fee: 50,000 managed *10% = 5,000
    const team = [person({ id:"v", side:"video", monthlyCost: 1000, startMonthIndex: 0 })];
    const rows = runPnL({ clients, costConfig: cost({ team, partnerSalaryByMonth:[2000,2000], rentByMonth:[500,500], overheadByMonth:[300,300] }), monthLabels: labels });
    expect(rows[0].revenue).toBeCloseTo(5000, 2);
    expect(rows[0].fixedCost).toBe(2800);       // 2000+500+300
    expect(rows[0].totalCost).toBe(3800);       // fixed 2800 + production 1000
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
    expect(rows[0].videos).toBe(0);            // disabled client excluded
    expect(rows[0].statics).toBe(4);
    expect(rows[0].costPerVideo).toBeNull();   // no videos
    expect(rows[0].costPerStatic).toBeCloseTo(1000, 5); // 4000/4
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `npx vitest run src/lib/forecast/__tests__/pnl.test.ts` (runPnL signature/shape mismatch).

- [ ] **Step 3: Implement** — replace `src/lib/forecast/pnl.ts` with:
```typescript
import { computeFee } from "./fee";
import type { ClientPricing, CostConfig, PnlMonth } from "./types";

interface PnlClient {
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[];
  videosByMonth?: number[];
  staticsByMonth?: number[];
  enabled?: boolean;
}

export function runPnL(params: {
  clients: PnlClient[];
  costConfig: CostConfig;
  monthLabels: string[];
}): PnlMonth[] {
  const { clients, costConfig, monthLabels } = params;
  const active = clients.filter((c) => c.enabled !== false);
  const team = costConfig.team ?? [];

  return monthLabels.map((label, m) => {
    const revenue = active.reduce((sum, c) => {
      if (!c.pricing) return sum;
      return sum + computeFee(c.adSpendByMonth?.[m] ?? 0, c.agencyPctByMonth?.[m] ?? 0, c.pricing);
    }, 0);

    const videos = active.reduce((s, c) => s + (c.videosByMonth?.[m] ?? 0), 0);
    const statics = active.reduce((s, c) => s + (c.staticsByMonth?.[m] ?? 0), 0);
    const deliverables = videos + statics;

    const activeTeam = team.filter((p) => p.startMonthIndex <= m);
    const videoSideCost = activeTeam.filter((p) => p.side === "video").reduce((s, p) => s + p.monthlyCost, 0);
    const staticSideCost = activeTeam.filter((p) => p.side === "static").reduce((s, p) => s + p.monthlyCost, 0);
    const productionCost = videoSideCost + staticSideCost;

    const fixedCost = (costConfig.partnerSalaryByMonth[m] ?? 0) + (costConfig.rentByMonth[m] ?? 0) + (costConfig.overheadByMonth?.[m] ?? 0);
    const totalCost = fixedCost + productionCost;
    const netIncome = revenue - totalCost;

    return {
      monthIndex: m,
      label,
      revenue,
      fixedCost,
      productionCost,
      totalCost,
      netIncome,
      margin: revenue === 0 ? 0 : netIncome / revenue,
      deliverables,
      videos,
      statics,
      feePerDeliverable: deliverables === 0 ? null : revenue / deliverables,
      costPerDeliverable: deliverables === 0 ? null : totalCost / deliverables,
      costPerVideo: videos === 0 ? null : videoSideCost / videos,
      costPerStatic: statics === 0 ? null : staticSideCost / statics,
    };
  });
}
```

- [ ] **Step 4: Run, confirm PASS** — `npx vitest run src/lib/forecast/__tests__/pnl.test.ts` (4 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/forecast/pnl.ts src/lib/forecast/__tests__/pnl.test.ts
git commit -m "feat: P&L production cost from roster + per-video/static cost"
```

---

## Task 3: Persist the team (useScenario)

**Files:** Modify `src/hooks/useScenario.ts`

- [ ] **Step 1: Confirm team round-trips via cost_config**

`useScenario` already loads `cost_config` merged over `emptyCostConfig(HORIZON_MONTHS)` (which now includes `team: []`) and saves `cost_config` in the autosave upsert. Since `team` is part of `CostConfig`, it persists automatically through the existing `updateCost(patch)` path. **Verify** by reading the load + save code: ensure the merge `{ ...emptyCostConfig(HORIZON_MONTHS), ...cc }` is present (so a saved row without `team` defaults to `[]`), and that the autosave writes the whole `costConfig` (including `team`). If the load guard rejects configs lacking some field, make sure it still adopts a config that HAS `team` but is otherwise valid. No new state needed — `updateCost({ team: nextTeam })` is the mutator the UI will call.

- [ ] **Step 2: Verify build + tests** — `npx tsc -p tsconfig.app.json --noEmit` (clean) and `npx vitest run` (all pass). If no code change was needed, note that explicitly.

- [ ] **Step 3: Commit (if changed)**
```bash
git add src/hooks/useScenario.ts
git commit -m "chore: ensure production team persists via cost_config"
```
(If no change was required, skip the commit and note it in the task report.)

---

## Task 4: Production team UI + per-type KPIs

**Files:** Modify `src/components/partners/PnlTab.tsx`, `src/pages/Partners.tsx`, `src/components/partners/__tests__/PnlTab.test.tsx`

- [ ] **Step 1: Update Partners.tsx call**

In `src/pages/Partners.tsx`, the `<PnlTab .../>` call currently passes `deliverablesByMonth={result.months.map((mm) => mm.assets)}`. **Remove that prop** (runPnL now derives from clients). Keep `clients`, `costConfig`, `monthLabels`, `onUpdate`, `onUpdateCost`, `onAddClientWithPricing`. (The capacity `result` is still used for the Capacity tab; just don't pass deliverablesByMonth to PnlTab.)

- [ ] **Step 2: PnlTab — runPnL call + KPIs + cost rows + roster**

In `src/components/partners/PnlTab.tsx`:
1. Change the `runPnL` call to `runPnL({ clients, costConfig, monthLabels })` (drop `deliverablesByMonth`); remove the `deliverablesByMonth` prop from the `Props` interface.
2. **KPI header**: replace the single "All-in cost / deliverable" KPI with **Cost / video** and **Cost / static** (from `cur.costPerVideo`/`cur.costPerStatic`, formatted with `fmtu`), and keep an "All-in cost / deliverable (floor $700)" KPI using `cur.costPerDeliverable`. So header = Net income, Margin, Fee/deliverable, Cost/video, Cost/static, All-in cost/deliverable.
3. **Cost rows**: remove the `CostRow` for `costPerDeliverableByMonth` ("Variable cost / deliverable"). Keep Partner salary, Rent / lease, Operating overhead. Add a **read-only** "Production team" row that shows `rows[m].productionCost` per month (mono, right-aligned, not an input — it's computed from the roster). The Deliverables / Total cost / Net income / Margin rows stay (they read from `rows`).
4. **Production team editor** — add a section below the table titled "PRODUCTION TEAM". For each person in `costConfig.team`, a row: name `<Input>`, a side `<select>` (Video / Static), monthly cost via the existing `MoneyInput`, a start-month `<select>` (options: "Now" = 0, then `monthLabels[i]` → i for i=1..length-1), and a remove `<Button aria-label="Remove person">✕</Button>`. A "+ Add person / hire" button appends a new person. All mutations call `onUpdateCost({ team: nextTeam })` with a fresh array (no mutation). Generate ids with a module-level counter `let pid = 0; const nextPid = () => \`person-${++pid}\`;`. New person default: `{ id: nextPid(), name: "New hire", side: "video", monthlyCost: 0, startMonthIndex: 0 }`.

Edit handlers (pattern):
```tsx
const updatePerson = (id: string, patch: Partial<ProductionPerson>) =>
  onUpdateCost({ team: (costConfig.team ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) });
const addPerson = () =>
  onUpdateCost({ team: [...(costConfig.team ?? []), { id: nextPid(), name: "New hire", side: "video", monthlyCost: 0, startMonthIndex: 0 }] });
const removePerson = (id: string) =>
  onUpdateCost({ team: (costConfig.team ?? []).filter((p) => p.id !== id) });
```
Import `ProductionPerson` from `@/lib/forecast/types`.

- [ ] **Step 3: Render test**

Update `src/components/partners/__tests__/PnlTab.test.tsx`: remove the `deliverablesByMonth` prop from the render; add a `team` to the `emptyCostConfig`-based costConfig (or set `costConfig={{ ...emptyCostConfig(3), team: [{ id:"v", name:"Ed", side:"video", monthlyCost:8000, startMonthIndex:0 }] }}`); the client fixture already has `videosByMonth`/`staticsByMonth` — set them to non-empty (e.g. `[10,10,10]`/`[5,5,5]`) so per-type cost renders. Assert it mounts without throwing.

- [ ] **Step 4: Verify** — `npx tsc -p tsconfig.app.json --noEmit` (exit 0), `npx vitest run` (all pass incl. PnlTab render).

- [ ] **Step 5: Commit**
```bash
git add src/components/partners/PnlTab.tsx src/pages/Partners.tsx src/components/partners/__tests__/PnlTab.test.tsx
git commit -m "feat: production team roster editor + per-video/static KPIs in P&L"
```

---

## Self-Review notes

- **Spec coverage:** roster with side+monthlyCost+startMonth (Task 1); production cost = active roster sum, steps at start month (Task 2); per-video/static derived (Task 2); replaces variable-cost row (Task 4); P&L total includes production (Task 2); KPIs cost/video + cost/static + all-in (Task 4); persistence via cost_config.team (Task 3); hire modeling via start month (Tasks 1/2/4); div-by-zero + disabled-client exclusion (Task 2).
- **Type consistency:** `runPnL({ clients, costConfig, monthLabels })`; `CostConfig.team: ProductionPerson[]`; `PnlMonth` adds `productionCost`/`videos`/`statics`/`costPerVideo`/`costPerStatic`, removes `variableCost`. PnlTab must stop referencing `variableCost`/`costPerDeliverableByMonth`.
- **Deferred:** seeding the real roster (partners enter people + pay; starts empty). The legacy `costPerDeliverableByMonth` stays in the type (optional) but is ignored — no migration needed (cost_config is jsonb).
- **Out of scope:** auto-deriving costs from QuickBooks/payroll; per-project (non-pass-through) marginal cost line.
