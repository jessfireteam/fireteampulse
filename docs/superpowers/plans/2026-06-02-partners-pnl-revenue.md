# Partners P&L (Revenue + Profit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a P&L tab to `/partners` — per-client fee projection + a fixed/variable cost model — yielding monthly revenue, net income, margin, and fee/cost-per-deliverable unit economics.

**Architecture:** Pure functions for the fee engine and P&L aggregation, fed by the existing capacity scenario (deliverables) and the FB-Ads `client-months` data (actual ad spend). Revenue inputs live on the shared scenario clients; agency-level cost config lives on the same Supabase row. UI mirrors the capacity grid with a tab toggle.

**Tech Stack:** React + Vite + TS + shadcn/ui + recharts + vitest. Supabase (`bmuqjchslhgnxgiugoyx`) for persistence; FB-Ads spend via the `fibery-proxy` `client-months` query.

---

## Background the engineer must know

- This stacks on the Partners Capacity Forecast (branch `spec/partners-pnl` off `spec/partners-capacity-forecast`). Reuse its conventions.
- `src/lib/forecast/types.ts`: `ScenarioClient = { id, name, videosByMonth:number[], staticsByMonth:number[], enabled, hypothetical }` (arrays length `HORIZON_MONTHS=12`). `HISTORY_MONTHS=3`, `WEEKS_PER_MONTH=4.345`.
- Capacity `runForecast(...)` (`src/lib/forecast/engine.ts`) returns `{ months: { monthIndex, label, assets, roles }[] , hireByRole }`. **`months[i].assets` = videos+statics that month = deliverables.** This is the deliverables bridge for cost + unit economics.
- `useScenario(histories, userEmail)` (`src/hooks/useScenario.ts`) holds the shared scenario, autosaves to Supabase table `partner_forecast_scenario` (row id `'default'`, `clients jsonb`). `mergeScenario` (`src/lib/forecast/mergeScenario.ts`) reconciles saved data with the live roster by client name.
- Actual ad spend: `useClientMonthsData()` (`src/hooks/useFiberyData.ts`) → `ClientMonthsResponse.findClientMonths: { name, client:{name}, totalSpend, fireTeamSpend }[]`. `name` is month-prefixed `"YYYY-MM …"`. `totalSpend` = client's total ad spend that month.
- shadcn `Tabs` exists at `src/components/ui/tabs.tsx`. `Dialog` at `src/components/ui/dialog.tsx`. `Input`/`Button` available.
- **Agency % is stored as a percent number 0–100.** Tier `rate` is a percent number too.
- Verify with `npm run build` (real type check) and `npx vitest run`. Bare `tsc --noEmit` is hollow here (project-refs tsconfig).

---

## File Structure

**Create:**
- `src/lib/forecast/fee.ts` — `computeFee` (marginal tiers + min floor) + pricing types.
- `src/lib/forecast/__tests__/fee.test.ts`
- `src/lib/forecast/pnl.ts` — `runPnL` (monthly revenue/cost/profit/unit-economics).
- `src/lib/forecast/__tests__/pnl.test.ts`
- `src/lib/forecast/adSpendActuals.ts` — parse `client-months` → per-client per-month actual ad spend.
- `src/lib/forecast/__tests__/adSpendActuals.test.ts`
- `src/components/partners/PnlTab.tsx` — the P&L view (grid + KPIs).
- `src/components/partners/PricingModal.tsx` — add/edit client pricing.
- `src/components/partners/__tests__/PnlTab.test.tsx` — mount/render test.

**Modify:**
- `src/lib/forecast/types.ts` — add `PricingTier`, `ClientPricing`, `CostConfig`, `PnlMonth`, cost-floor constants; extend `ScenarioClient` with optional revenue fields.
- `src/lib/forecast/mergeScenario.ts` — preserve revenue fields by name; default cost config.
- `src/hooks/useScenario.ts` — load/save `costConfig` alongside `clients`; expose it.
- `src/pages/Partners.tsx` — Capacity | P&L tab toggle; render `PnlTab`.

---

## Task 1: Revenue + cost types

**Files:** Modify `src/lib/forecast/types.ts`

- [ ] **Step 1: Add the types and constants**

Append to `src/lib/forecast/types.ts`:

```typescript
/** A pricing tier; upTo is the upper bound of MANAGED spend for this bracket (null = "and above"). rate is a percent. */
export interface PricingTier {
  upTo: number | null;
  rate: number;
}

export interface ClientPricing {
  minFee: number;
  tiers: PricingTier[];
}

/** Agency-level cost config; arrays length HORIZON_MONTHS (future months). */
export interface CostConfig {
  partnerSalaryByMonth: number[];
  rentByMonth: number[];
  costPerDeliverableByMonth: number[];
}

/** Break-even / practical cost-per-deliverable reference floors (USD). */
export const BREAKEVEN_FLOOR = 700;
export const PRACTICAL_FLOOR = 1000;

export interface PnlMonth {
  monthIndex: number;
  label: string;
  revenue: number;
  fixedCost: number;
  variableCost: number;
  totalCost: number;
  netIncome: number;
  margin: number; // netIncome / revenue, 0 when revenue is 0
  deliverables: number;
  feePerDeliverable: number | null; // null when deliverables === 0
  costPerDeliverable: number | null;
}

export function emptyCostConfig(horizon: number): CostConfig {
  return {
    partnerSalaryByMonth: new Array(horizon).fill(0),
    rentByMonth: new Array(horizon).fill(0),
    costPerDeliverableByMonth: new Array(horizon).fill(0),
  };
}
```

Extend the existing `ScenarioClient` interface — add these optional fields (do not remove existing ones):

```typescript
  /** Revenue plan (future months, length HORIZON_MONTHS). Optional until set. */
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[]; // percent 0-100
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/forecast/types.ts
git commit -m "feat: P&L revenue + cost config types"
```

---

## Task 2: Fee engine (marginal tiers + min floor)

**Files:** Create `src/lib/forecast/fee.ts`, Test `src/lib/forecast/__tests__/fee.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/forecast/__tests__/fee.test.ts
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
    // adSpend 1,700,000 * 20% = 340,000 managed
    // 100,000@7% = 7,000 ; next 150,000@6% = 9,000 ; remaining 90,000@5% = 4,500 => 20,500
    expect(computeFee(1_700_000, 20, pricing)).toBeCloseTo(20500, 2);
  });

  it("floors at the minimum fee", () => {
    // 10,000 * 10% = 1,000 managed * 7% = 70 -> floored to 3000
    expect(computeFee(10_000, 10, pricing)).toBe(3000);
  });

  it("handles a single-bracket amount", () => {
    // 50,000 managed (e.g. 100k spend * 50%) -> 50,000@7% = 3,500
    expect(computeFee(100_000, 50, pricing)).toBeCloseTo(3500, 2);
  });

  it("returns the floor for zero spend or zero %", () => {
    expect(computeFee(0, 40, pricing)).toBe(3000);
    expect(computeFee(500_000, 0, pricing)).toBe(3000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/forecast/__tests__/fee.test.ts`
Expected: FAIL — `computeFee` not defined.

- [ ] **Step 3: Implement**

```typescript
// src/lib/forecast/fee.ts
import type { ClientPricing } from "./types";

/**
 * Fee = marginal tiered rate on managed spend (adSpend * agencyPct%),
 * floored at the client's minimum fee. Tiers are walked bracket-by-bracket;
 * each tier.upTo is the upper bound of MANAGED spend for that bracket.
 */
export function computeFee(adSpend: number, agencyPct: number, pricing: ClientPricing): number {
  const managed = adSpend * (agencyPct / 100);
  let fee = 0;
  let lower = 0;
  for (const tier of pricing.tiers) {
    if (managed <= lower) break;
    const ceil = tier.upTo ?? Infinity;
    const slice = Math.min(managed, ceil) - lower;
    if (slice > 0) fee += slice * (tier.rate / 100);
    lower = ceil;
  }
  return Math.max(fee, pricing.minFee);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/forecast/__tests__/fee.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/fee.ts src/lib/forecast/__tests__/fee.test.ts
git commit -m "feat: fee engine with marginal tiers and min-fee floor"
```

---

## Task 3: P&L aggregation

**Files:** Create `src/lib/forecast/pnl.ts`, Test `src/lib/forecast/__tests__/pnl.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/forecast/__tests__/pnl.test.ts
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
    // one client: 100,000 spend * 50% = 50,000 managed * 10% = 5,000 fee
    // cost: partner 35,000 + rent 2,000 + (700 * 10 deliverables = 7,000) = 44,000
    const rows = runPnL({
      clients: [client(100_000, 50, 2)],
      costConfig: cost(35_000, 2_000, 700, 2),
      deliverablesByMonth: [10, 10],
      monthLabels: labels,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].revenue).toBeCloseTo(5000, 2);
    expect(rows[0].totalCost).toBeCloseTo(44000, 2);
    expect(rows[0].netIncome).toBeCloseTo(-39000, 2);
    expect(rows[0].margin).toBeCloseTo(-39000 / 5000, 4);
  });

  it("derives unit economics; cost/deliverable falls as deliverables rise (fixed spread)", () => {
    const rows = runPnL({
      clients: [client(100_000, 50, 2)],
      costConfig: cost(35_000, 2_000, 700, 2),
      deliverablesByMonth: [10, 100],
      monthLabels: labels,
    });
    // month0: cost 44,000 / 10 = 4,400 ; month1: (37,000 + 70,000)=107,000 / 100 = 1,070
    expect(rows[0].costPerDeliverable!).toBeCloseTo(4400, 2);
    expect(rows[1].costPerDeliverable!).toBeCloseTo(1070, 2);
    expect(rows[1].costPerDeliverable!).toBeLessThan(rows[0].costPerDeliverable!);
    expect(rows[0].feePerDeliverable!).toBeCloseTo(500, 2); // 5000 / 10
  });

  it("guards divide-by-zero when there are no deliverables", () => {
    const rows = runPnL({
      clients: [client(100_000, 50, 1)],
      costConfig: cost(35_000, 2_000, 700, 1),
      deliverablesByMonth: [0],
      monthLabels: ["Jun"],
    });
    expect(rows[0].feePerDeliverable).toBeNull();
    expect(rows[0].costPerDeliverable).toBeNull();
    expect(rows[0].variableCost).toBe(0);
  });

  it("margin is 0 when revenue is 0", () => {
    const rows = runPnL({
      clients: [],
      costConfig: cost(35_000, 2_000, 700, 1),
      deliverablesByMonth: [5],
      monthLabels: ["Jun"],
    });
    expect(rows[0].revenue).toBe(0);
    expect(rows[0].margin).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/forecast/__tests__/pnl.test.ts`
Expected: FAIL — `runPnL` not defined.

- [ ] **Step 3: Implement**

```typescript
// src/lib/forecast/pnl.ts
import { computeFee } from "./fee";
import type { ClientPricing, CostConfig, PnlMonth } from "./types";

interface PnlClient {
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[];
}

export function runPnL(params: {
  clients: PnlClient[];
  costConfig: CostConfig;
  deliverablesByMonth: number[];
  monthLabels: string[];
}): PnlMonth[] {
  const { clients, costConfig, deliverablesByMonth, monthLabels } = params;
  return monthLabels.map((label, m) => {
    const revenue = clients.reduce((sum, c) => {
      if (!c.pricing) return sum;
      const adSpend = c.adSpendByMonth?.[m] ?? 0;
      const pct = c.agencyPctByMonth?.[m] ?? 0;
      return sum + computeFee(adSpend, pct, c.pricing);
    }, 0);

    const deliverables = deliverablesByMonth[m] ?? 0;
    const fixedCost = (costConfig.partnerSalaryByMonth[m] ?? 0) + (costConfig.rentByMonth[m] ?? 0);
    const variableCost = (costConfig.costPerDeliverableByMonth[m] ?? 0) * deliverables;
    const totalCost = fixedCost + variableCost;
    const netIncome = revenue - totalCost;

    return {
      monthIndex: m,
      label,
      revenue,
      fixedCost,
      variableCost,
      totalCost,
      netIncome,
      margin: revenue === 0 ? 0 : netIncome / revenue,
      deliverables,
      feePerDeliverable: deliverables === 0 ? null : revenue / deliverables,
      costPerDeliverable: deliverables === 0 ? null : totalCost / deliverables,
    };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/forecast/__tests__/pnl.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/pnl.ts src/lib/forecast/__tests__/pnl.test.ts
git commit -m "feat: P&L aggregation with unit economics"
```

---

## Task 4: Actual ad-spend mapping

**Files:** Create `src/lib/forecast/adSpendActuals.ts`, Test `src/lib/forecast/__tests__/adSpendActuals.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/forecast/__tests__/adSpendActuals.test.ts
import { describe, it, expect } from "vitest";
import { actualAdSpendByClientMonth } from "../adSpendActuals";

const rows = [
  { name: "2026-05 Bambu Earth", client: { name: "Bambu Earth" }, totalSpend: 200000, fireTeamSpend: null },
  { name: "2026-04 Bambu Earth", client: { name: "Bambu Earth" }, totalSpend: 180000, fireTeamSpend: null },
  { name: "2026-05 Rejuvia", client: { name: "Rejuvia" }, totalSpend: 400000, fireTeamSpend: null },
  { name: "bad", client: null, totalSpend: 999, fireTeamSpend: null },
];

describe("actualAdSpendByClientMonth", () => {
  it("indexes total ad spend by client name and YYYY-MM month key", () => {
    const map = actualAdSpendByClientMonth(rows);
    expect(map.get("bambu earth")?.get("2026-05")).toBe(200000);
    expect(map.get("bambu earth")?.get("2026-04")).toBe(180000);
    expect(map.get("rejuvia")?.get("2026-05")).toBe(400000);
  });
  it("skips rows with no client or unparseable month", () => {
    const map = actualAdSpendByClientMonth(rows);
    expect(map.has("")).toBe(false);
    expect([...map.keys()]).not.toContain("bad");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/forecast/__tests__/adSpendActuals.test.ts`
Expected: FAIL — not defined.

- [ ] **Step 3: Implement**

```typescript
// src/lib/forecast/adSpendActuals.ts
interface ClientMonthRow {
  name: string;
  client: { name: string } | null;
  totalSpend: number | null;
}

/** Map client-name (lowercased) -> ("YYYY-MM" -> total ad spend). */
export function actualAdSpendByClientMonth(rows: ClientMonthRow[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const client = r.client?.name?.trim().toLowerCase();
    const monthKey = r.name?.match(/(\d{4}-\d{2})/)?.[1];
    if (!client || !monthKey) continue;
    if (!out.has(client)) out.set(client, new Map());
    out.get(client)!.set(monthKey, r.totalSpend ?? 0);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/forecast/__tests__/adSpendActuals.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/adSpendActuals.ts src/lib/forecast/__tests__/adSpendActuals.test.ts
git commit -m "feat: parse client-months into actual ad spend lookup"
```

---

## Task 5: Persist revenue fields + cost config

**Files:** Modify `src/lib/forecast/mergeScenario.ts`, `src/hooks/useScenario.ts`

- [ ] **Step 1: Add a merge test for revenue-field preservation**

Append to `src/lib/forecast/__tests__/mergeScenario.test.ts`:

```typescript
it("preserves saved revenue fields (pricing/adSpend/agencyPct) by client name", () => {
  const v = new Array(H).fill(0);
  const pricing = { minFee: 3000, tiers: [{ upTo: null, rate: 5 }] };
  const r = mergeScenario(
    [hist("Acme", 5, 2)],
    [saved("Acme", { pricing, adSpendByMonth: new Array(H).fill(100000), agencyPctByMonth: new Array(H).fill(40) })],
    H,
    makeId,
  );
  expect(r[0].pricing).toEqual(pricing);
  expect(r[0].adSpendByMonth).toEqual(new Array(H).fill(100000));
  expect(r[0].agencyPctByMonth).toEqual(new Array(H).fill(40));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/forecast/__tests__/mergeScenario.test.ts`
Expected: FAIL — revenue fields are dropped by the current merge.

- [ ] **Step 3: Carry revenue fields through the merge**

In `src/lib/forecast/mergeScenario.ts`, where a seeded active client matches a `prior` saved entry, copy the revenue fields onto the returned object. In the `seeded` map's returned object add:

```typescript
      pricing: prior?.pricing,
      adSpendByMonth: prior && Array.isArray(prior.adSpendByMonth) && prior.adSpendByMonth.length === horizon ? prior.adSpendByMonth : undefined,
      agencyPctByMonth: prior && Array.isArray(prior.agencyPctByMonth) && prior.agencyPctByMonth.length === horizon ? prior.agencyPctByMonth : undefined,
```

And for the carried-over hypotheticals, copy `pricing`, `adSpendByMonth`, `agencyPctByMonth` from `c` the same way (guard array length === horizon; else undefined).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/forecast/__tests__/mergeScenario.test.ts`
Expected: PASS (all, including the new one).

- [ ] **Step 5: Load/save costConfig in useScenario**

In `src/hooks/useScenario.ts`:
- Import `emptyCostConfig`, `HORIZON_MONTHS`, type `CostConfig`.
- Add state `const [costConfig, setCostConfig] = useState<CostConfig>(() => emptyCostConfig(HORIZON_MONTHS));`
- On load (the `maybeSingle()` select), also read a `cost_config` JSON column if present: change the select to `.select("clients, cost_config")` and, in the loaded handler, `if (data?.cost_config) setCostConfig(data.cost_config as CostConfig);` inside the try/catch.
- In the debounced autosave upsert, include `cost_config: costConfig`.
- Add a `updateCost(patch: Partial<CostConfig>)` setter: `setCostConfig((c) => ({ ...c, ...patch }))`.
- Return `costConfig` and `updateCost` alongside the existing API.
- The autosave effect dependency array must include `costConfig` so cost edits persist.

- [ ] **Step 6: Add the cost_config column (Supabase, via Management API)**

This is a DDL change to project `bmuqjchslhgnxgiugoyx` — the controller (not the subagent) runs it with the user's authorization, via the Supabase Management API query endpoint:

```sql
alter table public.partner_forecast_scenario
  add column if not exists cost_config jsonb not null default '{}'::jsonb;
```

- [ ] **Step 7: Verify + commit**

Run: `npm run build && npx vitest run`
Expected: build ok, all tests pass.

```bash
git add src/lib/forecast/mergeScenario.ts src/lib/forecast/__tests__/mergeScenario.test.ts src/hooks/useScenario.ts
git commit -m "feat: persist revenue fields + agency cost config"
```

---

## Task 6: P&L tab UI + tab toggle

**Files:** Create `src/components/partners/PnlTab.tsx`, `src/components/partners/PricingModal.tsx`; Modify `src/pages/Partners.tsx`

- [ ] **Step 1: Build the tab toggle in Partners.tsx**

In `src/pages/Partners.tsx`, wrap the existing capacity content and the new P&L content in shadcn `Tabs`:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PnlTab } from "@/components/partners/PnlTab";
// ... inside the returned JSX, replacing the flat list of capacity components:
<Tabs defaultValue="capacity" className="w-full">
  <TabsList>
    <TabsTrigger value="capacity">Capacity</TabsTrigger>
    <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
  </TabsList>
  <TabsContent value="capacity" className="space-y-8">
    {/* existing ForecastChart + HireTimeline + ScenarioBuilder block, unchanged */}
  </TabsContent>
  <TabsContent value="pnl">
    <PnlTab
      clients={clients}
      costConfig={costConfig}
      monthLabels={monthLabels}
      deliverablesByMonth={result.months.map((mm) => mm.assets)}
      onUpdate={update}
      onUpdateCost={updateCost}
    />
  </TabsContent>
</Tabs>
```

Pull `costConfig` and `updateCost` from `useScenario(...)`. `result` is the existing capacity forecast result; `result.months[i].assets` is deliverables per month. `monthLabels` already exists.

- [ ] **Step 2: Build PnlTab.tsx**

```tsx
// src/components/partners/PnlTab.tsx
import { useMemo, useState } from "react";
import { runPnL } from "@/lib/forecast/pnl";
import { computeFee } from "@/lib/forecast/fee";
import { BREAKEVEN_FLOOR, PRACTICAL_FLOOR, type CostConfig, type ScenarioClient } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  clients: ScenarioClient[];
  costConfig: CostConfig;
  monthLabels: string[];
  deliverablesByMonth: number[];
  onUpdate: (id: string, patch: Partial<ScenarioClient>) => void;
  onUpdateCost: (patch: Partial<CostConfig>) => void;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtu = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString()}`);

export function PnlTab({ clients, costConfig, monthLabels, deliverablesByMonth, onUpdate, onUpdateCost }: Props) {
  const [view, setView] = useState<"fee" | "spend" | "pct">("fee");

  const rows = useMemo(
    () => runPnL({ clients, costConfig, deliverablesByMonth, monthLabels }),
    [clients, costConfig, deliverablesByMonth, monthLabels],
  );

  // current-month (index 0) KPIs
  const cur = rows[0];

  const setCostCell = (key: keyof CostConfig, i: number, raw: string) => {
    const next = [...costConfig[key]];
    next[i] = parseFloat(raw) || 0;
    onUpdateCost({ [key]: next } as Partial<CostConfig>);
  };
  const setClientCell = (c: ScenarioClient, key: "adSpendByMonth" | "agencyPctByMonth", i: number, raw: string) => {
    const arr = [...(c[key] ?? new Array(monthLabels.length).fill(0))];
    arr[i] = parseFloat(raw) || 0;
    onUpdate(c.id, { [key]: arr } as Partial<ScenarioClient>);
  };

  return (
    <div className="space-y-6">
      {/* KPI header */}
      <div className="flex flex-wrap gap-6">
        <Kpi label="Net income (this month)" value={cur ? fmt(cur.netIncome) : "—"} good={!!cur && cur.netIncome >= 0} />
        <Kpi label="Margin" value={cur ? `${Math.round(cur.margin * 100)}%` : "—"} good={!!cur && cur.margin >= 0} />
        <Kpi label="Fee / deliverable" value={cur ? fmtu(cur.feePerDeliverable) : "—"} />
        <Kpi
          label={`Cost / deliverable (floor ${fmt(BREAKEVEN_FLOOR)})`}
          value={cur ? fmtu(cur.costPerDeliverable) : "—"}
          good={!!cur && cur.costPerDeliverable !== null && cur.feePerDeliverable !== null && cur.feePerDeliverable >= cur.costPerDeliverable}
        />
      </div>

      {/* view toggle */}
      <div className="flex gap-2">
        {(["fee", "spend", "pct"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={cn("text-xs rounded px-2 py-1", view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {v === "fee" ? "Fee" : v === "spend" ? "Ad Spend" : "Agency %"}
          </button>
        ))}
      </div>

      {/* revenue grid */}
      <div className="overflow-x-auto">
        <SectionHeader title="Revenue" />
        <table className="text-sm">
          <thead>
            <tr><th className="text-left p-1">Client</th>{monthLabels.map((l) => <th key={l} className="p-1 text-right font-mono text-xs text-muted-foreground">{l}</th>)}</tr>
          </thead>
          <tbody>
            {clients.filter((c) => c.enabled).map((c) => (
              <tr key={c.id}>
                <td className="p-1 whitespace-nowrap">{c.name}</td>
                {monthLabels.map((_, i) => {
                  const adSpend = c.adSpendByMonth?.[i] ?? 0;
                  const pct = c.agencyPctByMonth?.[i] ?? 0;
                  if (view === "fee") {
                    const fee = c.pricing ? computeFee(adSpend, pct, c.pricing) : 0;
                    return <td key={i} className="p-1 text-right font-mono">{fmt(fee)}</td>;
                  }
                  const key = view === "spend" ? "adSpendByMonth" : "agencyPctByMonth";
                  const val = view === "spend" ? adSpend : pct;
                  return <td key={i} className="p-1"><Input type="number" min="0" className="w-20 h-7 font-mono text-right" value={val} onChange={(e) => setClientCell(c, key, i, e.target.value)} /></td>;
                })}
              </tr>
            ))}
            <tr className="font-semibold border-t border-border"><td className="p-1">Revenue</td>{rows.map((r) => <td key={r.monthIndex} className="p-1 text-right font-mono">{fmt(r.revenue)}</td>)}</tr>
          </tbody>
        </table>
      </div>

      {/* cost + profit grid */}
      <div className="overflow-x-auto">
        <SectionHeader title="Costs & profit" />
        <table className="text-sm">
          <tbody>
            <CostRow label="Partner salary" k="partnerSalaryByMonth" cfg={costConfig} labels={monthLabels} onCell={setCostCell} />
            <CostRow label="Rent / lease" k="rentByMonth" cfg={costConfig} labels={monthLabels} onCell={setCostCell} />
            <CostRow label="Cost / deliverable" k="costPerDeliverableByMonth" cfg={costConfig} labels={monthLabels} onCell={setCostCell} />
            <tr><td className="p-1 text-muted-foreground">Deliverables</td>{rows.map((r) => <td key={r.monthIndex} className="p-1 text-right font-mono text-muted-foreground">{r.deliverables}</td>)}</tr>
            <tr className="border-t border-border"><td className="p-1">Total cost</td>{rows.map((r) => <td key={r.monthIndex} className="p-1 text-right font-mono">{fmt(r.totalCost)}</td>)}</tr>
            <tr className="font-semibold"><td className="p-1">Net income</td>{rows.map((r) => <td key={r.monthIndex} className={cn("p-1 text-right font-mono", r.netIncome >= 0 ? "text-emerald-500" : "text-destructive")}>{fmt(r.netIncome)}</td>)}</tr>
            <tr><td className="p-1 text-muted-foreground">Margin</td>{rows.map((r) => <td key={r.monthIndex} className={cn("p-1 text-right font-mono", r.margin >= 0 ? "text-emerald-500" : "text-destructive")}>{Math.round(r.margin * 100)}%</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-mono", good === undefined ? "" : good ? "text-emerald-500" : "text-destructive")}>{value}</div>
    </div>
  );
}

function CostRow({ label, k, cfg, labels, onCell }: { label: string; k: keyof CostConfig; cfg: CostConfig; labels: string[]; onCell: (k: keyof CostConfig, i: number, raw: string) => void }) {
  return (
    <tr>
      <td className="p-1 whitespace-nowrap">{label}</td>
      {labels.map((_, i) => (
        <td key={i} className="p-1"><Input type="number" min="0" className="w-20 h-7 font-mono text-right" value={cfg[k][i] ?? 0} onChange={(e) => onCell(k, i, e.target.value)} /></td>
      ))}
    </tr>
  );
}
```

- [ ] **Step 3: Build PricingModal.tsx**

A `Dialog` to add a client / edit pricing: fields for name, minimum fee, and a dynamic list of tiers (`upTo` + `rate`, with an add/remove tier button and a final "and above" tier with `upTo` empty → null). On submit, calls a passed `onSave(name, pricing)` that either creates a hypothetical client (via the scenario `addClient` flow then `onUpdate` with pricing) or sets pricing on an existing client. Mirror the old modal: Client Name, Minimum Fee ($), Pricing Tiers (Up to $ / Rate %), + Add Tier, Save. Wire a trigger button ("Add client / pricing") into `PnlTab`. (Implementer: follow `src/components/ui/dialog.tsx` usage already in the codebase; keep state local; validate min fee ≥ 0 and tiers sorted ascending by `upTo`.)

- [ ] **Step 4: Render test**

```tsx
// src/components/partners/__tests__/PnlTab.test.tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PnlTab } from "../PnlTab";
import { emptyCostConfig } from "@/lib/forecast/types";
import type { ScenarioClient } from "@/lib/forecast/types";

const months = ["Jun", "Jul", "Aug"];
const client: ScenarioClient = {
  id: "1", name: "Acme", videosByMonth: [], staticsByMonth: [], enabled: true, hypothetical: false,
  pricing: { minFee: 3000, tiers: [{ upTo: null, rate: 5 }] },
  adSpendByMonth: [100000, 100000, 100000], agencyPctByMonth: [40, 40, 40],
};

describe("PnlTab", () => {
  it("renders revenue, cost and profit rows without throwing", () => {
    expect(() =>
      render(
        <PnlTab
          clients={[client]}
          costConfig={emptyCostConfig(3)}
          monthLabels={months}
          deliverablesByMonth={[10, 12, 15]}
          onUpdate={() => {}}
          onUpdateCost={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 5: Verify**

Run: `npm run build && npx vitest run`
Expected: build ok; all tests pass including PnlTab render.

- [ ] **Step 6: Commit**

```bash
git add src/components/partners/PnlTab.tsx src/components/partners/PricingModal.tsx src/components/partners/__tests__/PnlTab.test.tsx src/pages/Partners.tsx
git commit -m "feat: P&L tab (revenue + cost + profit grid, unit-economics KPIs, pricing modal)"
```

---

## Task 7 (optional, non-blocking): Recover prior pricing config

**Files:** none in-repo necessarily — investigation task.

- [ ] Inspect the prior dashboard's Supabase project for a client-pricing table (min fee + tiers). If found and mappable to current client names, write a one-off seed into `partner_forecast_scenario` clients' `pricing` field (controller-run, user-authorized). Otherwise document that pricing is entered via the modal. Do NOT block the feature on this.

---

## Self-Review notes

- **Spec coverage:** fee engine w/ marginal tiers + floor (Task 2), P&L aggregation w/ net/margin + unit economics + divide-by-zero guards (Task 3), actual ad spend from client-months (Task 4), fixed (partner+rent) + variable (cost/deliverable × capacity deliverables) cost model (Task 3 + Task 6 CostRows), tabs + Fee/Ad Spend/Agency % toggle + KPIs w/ floors (Task 6), shared persistence of revenue fields + costConfig (Task 5), prospect/roster model inherited from capacity (no new work), pricing modal (Task 6 Step 3), pricing migration (Task 7, optional).
- **Deferred (not built):** QuickBooks (any), actual-cost feed, per-type video/static variable cost, historical-fee-from-actuals (history uses computed fee from actual ad spend × set %), multiple named scenarios.
- **Type consistency:** `computeFee(adSpend, agencyPct, pricing)`, `runPnL({clients, costConfig, deliverablesByMonth, monthLabels})`, `CostConfig` keys (`partnerSalaryByMonth`/`rentByMonth`/`costPerDeliverableByMonth`), `ScenarioClient` revenue fields (`pricing`/`adSpendByMonth`/`agencyPctByMonth`) — consistent across tasks. Agency % and tier rate are percents (0–100).
- **Decision baked in:** the grid renders the 12 future (`HORIZON_MONTHS`) plan months. Wiring actual ad spend into history columns uses `actualAdSpendByClientMonth` (Task 4) and is available for a follow-up that adds history columns; v1 P&L grid is the forward plan, matching the capacity grid's editable span.
