# Partners Capacity Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a partner-only forecast view to Pulse that answers "if we sign these clients at these asset volumes, where does each role break and when do we hire."

**Architecture:** Demand is modeled fully top-down from partner-entered assets/month per client, converted to weekly role-tasks via a calibration ratio derived from Fibery history, then compared against the existing per-role peak capacity. All forecast logic is pure, client-side functions over data already fetched by Pulse's existing `tasks` and `projects` queries — no new edge-function query types. The view is gated to three partner emails layered on the existing Supabase/Google auth.

**Tech Stack:** React + Vite + TypeScript, shadcn/ui, recharts, @tanstack/react-query, date-fns, vitest + @testing-library/react. Source of truth is Fibery via the `fibery-proxy` Supabase edge function.

---

## Background the engineer must know

- **Capacity unit** is *role-tasks completed per week*. Each Fibery Project is one "asset"; a project is delivered when `doneDate` is set.
- **Supply (peak) per role** already exists: see `src/components/dashboard/RoleCapacitySummary.tsx`, which sums each active person's `maxWeek26` (best single week of completed primary-category tasks over 26 weeks). We reuse `processTasksForCapacity` from `src/hooks/useFiberyData.ts`.
- **Never read Fibery's forward schedule as demand.** Future-dated projects under-count because they aren't scheduled until ~a month out. Demand comes only from the partner-entered assets/month.
- **Existing data hooks** (`src/hooks/useFiberyData.ts`): `useTasksData()` returns completed+pending tasks (7 months of completed); `useProjectsData()` returns completed projects since 2025-09-01. Both are enough; do not add query types.
- **`getTaskCategory(name)`** in `useFiberyData.ts` maps a task name to a category like `Briefs Sent`, `Creative Review`, `Brief Work`, `Design`, `Video Editing`. It is currently unexported — Task 1 exports it.
- **Roles** for the forecast and their primary task category:
  | role key | display | primary category |
  |---|---|---|
  | `Account` | Account | `Briefs Sent` |
  | `Creative Review` | Creative Review | `Creative Review` |
  | `Copywriters` | Copywriting | `Brief Work` |
  | `Design` | Design | `Design` |
  | `Video` | Video Editing | `Video Editing` |

---

## File Structure

**Create:**
- `src/lib/forecast/types.ts` — shared types and the `FORECAST_ROLES` constant.
- `src/lib/forecast/calibration.ts` — `computeRolePeaks`, `computeCalibration`.
- `src/lib/forecast/baseline.ts` — `computeClientBaselines`.
- `src/lib/forecast/engine.ts` — `runForecast` (the pure forecast core).
- `src/lib/forecast/__tests__/calibration.test.ts`
- `src/lib/forecast/__tests__/baseline.test.ts`
- `src/lib/forecast/__tests__/engine.test.ts`
- `src/lib/partners.ts` — partner email allowlist + `isPartner`.
- `src/lib/__tests__/partners.test.ts`
- `src/hooks/useForecastData.ts` — composes existing hooks → `{ peaks, calibration, baselines }`.
- `src/hooks/useScenario.ts` — scenario client list state, seeded from baselines.
- `src/components/partners/PartnerGate.tsx` — auth guard.
- `src/components/partners/CalibrationTable.tsx`
- `src/components/partners/ScenarioBuilder.tsx`
- `src/components/partners/ForecastChart.tsx`
- `src/components/partners/HireTimeline.tsx`
- `src/pages/Partners.tsx` — the page.

**Modify:**
- `src/hooks/useFiberyData.ts` — export `getTaskCategory`.
- `src/App.tsx:22-31` — add `/partners` route.

---

## Task 1: Export `getTaskCategory`

**Files:**
- Modify: `src/hooks/useFiberyData.ts:144`

- [ ] **Step 1: Change the declaration to export**

In `src/hooks/useFiberyData.ts`, change line 144 from:

```typescript
function getTaskCategory(taskName: string): string {
```

to:

```typescript
export function getTaskCategory(taskName: string): string {
```

- [ ] **Step 2: Verify build still passes**

Run: `npm run lint && npm run build`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFiberyData.ts
git commit -m "refactor: export getTaskCategory for forecast reuse"
```

---

## Task 2: Forecast types and roles constant

**Files:**
- Create: `src/lib/forecast/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/forecast/types.ts

/** Internal role key matches RoleType from useFiberyData (the 5 production roles). */
export type ForecastRoleKey =
  | "Account"
  | "Creative Review"
  | "Copywriters"
  | "Design"
  | "Video";

export interface ForecastRole {
  key: ForecastRoleKey;
  display: string;
  /** getTaskCategory() output that represents this role's primary throughput. */
  category: string;
}

export const FORECAST_ROLES: ForecastRole[] = [
  { key: "Account", display: "Account", category: "Briefs Sent" },
  { key: "Creative Review", display: "Creative Review", category: "Creative Review" },
  { key: "Copywriters", display: "Copywriting", category: "Brief Work" },
  { key: "Design", display: "Design", category: "Design" },
  { key: "Video", display: "Video Editing", category: "Video Editing" },
];

/** Average weeks per calendar month, used for month<->week conversions. */
export const WEEKS_PER_MONTH = 4.345;

/** role -> peak role-tasks/week (supply ceiling). */
export type RolePeaks = Record<ForecastRoleKey, number>;

/** role -> role-tasks generated per delivered asset (calibration ratio). */
export type Calibration = Record<ForecastRoleKey, number>;

export interface ClientBaseline {
  client: string;
  /** Recent run-rate in assets/month from the last 4 completed weeks. */
  monthlyRate: number;
  /** % change of last-4-week avg vs prior-8-week avg; null if no prior history. */
  trendPct: number | null;
  /** 12 weekly completed-asset counts, oldest -> newest, excluding current partial week. */
  weeklyCounts: number[];
}

export interface ScenarioClient {
  id: string;
  name: string;
  /** 0 = current month, 1 = next month, ... */
  startMonthIndex: number;
  assetsPerMonth: number;
  enabled: boolean;
  /** true when added by a partner (not seeded from history). */
  hypothetical: boolean;
}

export type RoleStatus = "ok" | "warning" | "critical" | "over";

export interface RoleMonthCell {
  role: ForecastRoleKey;
  demandPerWeek: number;
  peak: number;
  utilization: number; // demand / peak
  status: RoleStatus;
}

export interface ForecastMonth {
  monthIndex: number;
  label: string; // e.g. "Aug 26"
  assets: number; // total assets/month across active clients
  roles: Record<ForecastRoleKey, RoleMonthCell>;
}

export interface ForecastResult {
  months: ForecastMonth[];
  /** role -> first monthIndex where demand exceeds peak, or null if never. */
  hireByRole: Record<ForecastRoleKey, number | null>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/forecast/types.ts
git commit -m "feat: forecast types and roles constant"
```

---

## Task 3: Calibration module (peaks + tasks-per-asset)

**Files:**
- Create: `src/lib/forecast/calibration.ts`
- Test: `src/lib/forecast/__tests__/calibration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/forecast/__tests__/calibration.test.ts
import { describe, it, expect } from "vitest";
import { computeRolePeaks, computeCalibration } from "../calibration";
import type { RoleGroup } from "@/hooks/useFiberyData";
import type { Task } from "@/lib/fibery";

function task(name: string, doneDate: string | null): Task {
  return {
    id: name + doneDate,
    name,
    done: !!doneDate,
    doneDate,
    dueDate: null,
    assignee: { name: "X" },
    taskTemplateRole: null,
    project: { name: "P", client: { name: "C" }, status: null },
  };
}

describe("computeRolePeaks", () => {
  it("sums each person's primary-row maxWeek26 per role, excluding departed", () => {
    const groups: RoleGroup[] = [
      {
        role: "Design",
        people: [
          {
            name: "Erik Furtado",
            role: "Design",
            primaryTaskType: "Design",
            taskTypes: [{ taskType: "Design", avg30Day: 0, weekCounts: [], maxWeek26: 5, inheritedOverdue: 0, trueOverdue: 0, due7Days: 0, due30Days: 0 }],
            subtotal: { taskType: "Subtotal", avg30Day: 0, weekCounts: [], maxWeek26: 5, inheritedOverdue: 0, trueOverdue: 0, due7Days: 0, due30Days: 0 },
          },
        ],
      },
    ];
    const peaks = computeRolePeaks(groups);
    expect(peaks.Design).toBe(5);
  });
});

describe("computeCalibration", () => {
  it("computes role-tasks per delivered asset over the window", () => {
    // 2 completed Design tasks, 1 completed asset in-window -> 2 tasks/asset
    const now = new Date("2026-06-01T00:00:00Z");
    const inWindow = "2026-05-15"; // within last 12 completed weeks, before current week
    const tasks: Task[] = [
      task("Design the static", inWindow),
      task("Design the static", inWindow),
    ];
    const projects = [{ doneDate: inWindow, client: { name: "C" } }];
    const cal = computeCalibration(tasks, projects, now, 12);
    expect(cal.Design).toBeCloseTo(2, 5);
  });

  it("returns 0 for a role with no completed assets in window", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const cal = computeCalibration([], [], now, 12);
    expect(cal.Design).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/forecast/__tests__/calibration.test.ts`
Expected: FAIL — `computeRolePeaks`/`computeCalibration` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/forecast/calibration.ts
import { startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import type { RoleGroup } from "@/hooks/useFiberyData";
import { isExcludedMember, getTaskCategory } from "@/hooks/useFiberyData";
import type { Task } from "@/lib/fibery";
import { FORECAST_ROLES, type Calibration, type RolePeaks, type ForecastRoleKey } from "./types";

const EMPTY_PEAKS = (): RolePeaks => ({
  Account: 0, "Creative Review": 0, Copywriters: 0, Design: 0, Video: 0,
});

/**
 * Per-role peak supply = sum of each active person's primary-row maxWeek26.
 * Mirrors the peak logic in RoleCapacitySummary.computeRoleBars (kept separate
 * to avoid refactoring the working dashboard component).
 */
export function computeRolePeaks(roleGroups: RoleGroup[]): RolePeaks {
  const peaks = EMPTY_PEAKS();
  roleGroups.forEach((group) => {
    const key = group.role as ForecastRoleKey;
    if (!(key in peaks)) return;
    let sum = 0;
    group.people
      .filter((p) => !isExcludedMember(p.name))
      .forEach((p) => {
        const primary =
          p.taskTypes.find((t) => t.taskType === p.primaryTaskType) ?? p.subtotal;
        sum += primary.maxWeek26;
      });
    peaks[key] = sum;
  });
  return peaks;
}

/** Completed projects we count as delivered assets carry a doneDate. */
interface MinimalProject { doneDate: string | null }

/**
 * Calibration ratio: role-tasks completed per delivered asset, over the last
 * `windowWeeks` COMPLETED weeks (excludes the current partial week so the
 * scheduling-lag dip never pollutes it).
 */
export function computeCalibration(
  tasks: Task[],
  projects: MinimalProject[],
  referenceDate: Date,
  windowWeeks: number,
): Calibration {
  const windowStart = startOfWeek(subWeeks(referenceDate, windowWeeks), { weekStartsOn: 1 });
  const windowEnd = endOfWeek(subWeeks(referenceDate, 1), { weekStartsOn: 1 });
  const inWindow = (d: string | null) =>
    !!d && isWithinInterval(new Date(d), { start: windowStart, end: windowEnd });

  const assetCount = projects.filter((p) => inWindow(p.doneDate)).length;

  const cal: Calibration = {
    Account: 0, "Creative Review": 0, Copywriters: 0, Design: 0, Video: 0,
  };
  if (assetCount === 0) return cal;

  FORECAST_ROLES.forEach((role) => {
    const taskCount = tasks.filter(
      (t) => t.done && inWindow(t.doneDate) && getTaskCategory(t.name) === role.category,
    ).length;
    cal[role.key] = taskCount / assetCount;
  });
  return cal;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/forecast/__tests__/calibration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/calibration.ts src/lib/forecast/__tests__/calibration.test.ts
git commit -m "feat: forecast calibration (peaks + tasks-per-asset)"
```

---

## Task 4: Client baseline + trend module

**Files:**
- Create: `src/lib/forecast/baseline.ts`
- Test: `src/lib/forecast/__tests__/baseline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/forecast/__tests__/baseline.test.ts
import { describe, it, expect } from "vitest";
import { computeClientBaselines } from "../baseline";

function p(client: string, doneDate: string) {
  return { doneDate, client: { name: client } };
}

describe("computeClientBaselines", () => {
  const now = new Date("2026-06-01T00:00:00Z"); // Monday-ish reference

  it("derives monthly run-rate from the last 4 completed weeks", () => {
    // 8 assets across the last 4 completed weeks for Acme
    const projects = [
      p("Acme", "2026-05-04"), p("Acme", "2026-05-05"),
      p("Acme", "2026-05-11"), p("Acme", "2026-05-12"),
      p("Acme", "2026-05-18"), p("Acme", "2026-05-19"),
      p("Acme", "2026-05-25"), p("Acme", "2026-05-26"),
    ];
    const [acme] = computeClientBaselines(projects, now, 12);
    // 8 assets / 4 weeks * 4.345 weeks/month ~= 8.69 -> rounded
    expect(acme.client).toBe("Acme");
    expect(acme.monthlyRate).toBe(9);
  });

  it("flags an upward trend when recent weeks outpace prior weeks", () => {
    // prior 8 weeks: 1 asset total; last 4 weeks: 8 assets -> strongly positive
    const projects = [
      p("Ramp", "2026-03-16"),
      p("Ramp", "2026-05-04"), p("Ramp", "2026-05-11"),
      p("Ramp", "2026-05-18"), p("Ramp", "2026-05-25"),
      p("Ramp", "2026-05-05"), p("Ramp", "2026-05-12"),
      p("Ramp", "2026-05-19"), p("Ramp", "2026-05-26"),
    ];
    const [ramp] = computeClientBaselines(projects, now, 12);
    expect(ramp.trendPct).not.toBeNull();
    expect(ramp.trendPct!).toBeGreaterThan(0);
  });

  it("excludes the current partial week from counts", () => {
    // an asset dated in the current week must not be counted
    const projects = [p("Acme", "2026-06-01")];
    const result = computeClientBaselines(projects, now, 12);
    // no completed-week activity -> client filtered out (monthlyRate 0)
    expect(result.find((r) => r.client === "Acme")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/forecast/__tests__/baseline.test.ts`
Expected: FAIL — `computeClientBaselines` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/forecast/baseline.ts
import { startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import { WEEKS_PER_MONTH, type ClientBaseline } from "./types";

interface MinimalProject {
  doneDate: string | null;
  client: { name: string } | null;
}

/**
 * Per-client baseline run-rate (assets/month) and trend, computed from
 * COMPLETED projects only, over the last `windowWeeks` completed weeks
 * (current partial week excluded). weeklyCounts is oldest -> newest.
 */
export function computeClientBaselines(
  projects: MinimalProject[],
  referenceDate: Date,
  windowWeeks: number,
): ClientBaseline[] {
  // Build week boundaries for the last `windowWeeks` completed weeks (week -1 .. -windowWeeks).
  const weeks = Array.from({ length: windowWeeks }, (_, i) => {
    const weeksAgo = windowWeeks - i; // oldest first
    const start = startOfWeek(subWeeks(referenceDate, weeksAgo), { weekStartsOn: 1 });
    const end = endOfWeek(start, { weekStartsOn: 1 });
    return { start, end };
  });

  const perClient = new Map<string, number[]>();
  projects.forEach((proj) => {
    const name = proj.client?.name;
    if (!name || !proj.doneDate) return;
    const done = new Date(proj.doneDate);
    weeks.forEach((w, idx) => {
      if (isWithinInterval(done, { start: w.start, end: w.end })) {
        if (!perClient.has(name)) perClient.set(name, new Array(windowWeeks).fill(0));
        perClient.get(name)![idx] += 1;
      }
    });
  });

  const baselines: ClientBaseline[] = [];
  perClient.forEach((weeklyCounts, client) => {
    const last4 = weeklyCounts.slice(-4).reduce((s, v) => s + v, 0);
    if (last4 === 0) return; // no recent activity -> not an active client
    const prior8 = weeklyCounts.slice(-12, -4).reduce((s, v) => s + v, 0);
    const last4Avg = last4 / 4;
    const prior8Avg = prior8 / 8;
    const trendPct = prior8Avg > 0 ? Math.round((last4Avg / prior8Avg - 1) * 100) : null;
    const monthlyRate = Math.round((last4 / 4) * WEEKS_PER_MONTH);
    baselines.push({ client, monthlyRate, trendPct, weeklyCounts });
  });

  baselines.sort((a, b) => b.monthlyRate - a.monthlyRate);
  return baselines;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/forecast/__tests__/baseline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/baseline.ts src/lib/forecast/__tests__/baseline.test.ts
git commit -m "feat: per-client baseline run-rate and trend"
```

---

## Task 5: Forecast engine

**Files:**
- Create: `src/lib/forecast/engine.ts`
- Test: `src/lib/forecast/__tests__/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/forecast/__tests__/engine.test.ts
import { describe, it, expect } from "vitest";
import { runForecast } from "../engine";
import type { ScenarioClient, Calibration, RolePeaks } from "../types";

const calibration: Calibration = {
  Account: 1, "Creative Review": 1, Copywriters: 1, Design: 0.5, Video: 1,
};
const peaks: RolePeaks = {
  Account: 100, "Creative Review": 100, Copywriters: 100, Design: 2, Video: 100,
};

function client(over: Partial<ScenarioClient>): ScenarioClient {
  return { id: "1", name: "C", startMonthIndex: 0, assetsPerMonth: 0, enabled: true, hypothetical: false, ...over };
}

describe("runForecast", () => {
  const ref = new Date("2026-06-01T00:00:00Z");

  it("produces `horizon` months with cumulative active demand", () => {
    const scenario = [client({ assetsPerMonth: 43.45 })]; // ~10 assets/week
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months).toHaveLength(6);
    // Design demand/week = 10 * 0.5 = 5, peak 2 -> utilization 2.5 -> over
    expect(result.months[0].roles.Design.status).toBe("over");
    expect(result.months[0].roles.Account.status).toBe("ok");
  });

  it("only counts a client from its start month onward", () => {
    const scenario = [client({ assetsPerMonth: 43.45, startMonthIndex: 2 })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
    expect(result.months[2].assets).toBeCloseTo(43.45, 5);
  });

  it("excludes disabled clients", () => {
    const scenario = [client({ assetsPerMonth: 43.45, enabled: false })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.months[0].assets).toBe(0);
  });

  it("reports the first month each role exceeds peak", () => {
    const scenario = [client({ assetsPerMonth: 43.45, startMonthIndex: 1 })];
    const result = runForecast(scenario, calibration, peaks, 6, ref);
    expect(result.hireByRole.Design).toBe(1); // Design breaks the month the client starts
    expect(result.hireByRole.Account).toBeNull();
  });

  it("labels months forward from the reference month", () => {
    const result = runForecast([], calibration, peaks, 3, ref);
    expect(result.months.map((m) => m.label)).toEqual(["Jun 26", "Jul 26", "Aug 26"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/forecast/__tests__/engine.test.ts`
Expected: FAIL — `runForecast` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/forecast/engine.ts
import { addMonths, format } from "date-fns";
import {
  FORECAST_ROLES,
  WEEKS_PER_MONTH,
  type Calibration,
  type ForecastMonth,
  type ForecastResult,
  type ForecastRoleKey,
  type RoleMonthCell,
  type RolePeaks,
  type RoleStatus,
  type ScenarioClient,
} from "./types";

function statusFor(utilization: number): RoleStatus {
  if (utilization > 1) return "over";
  if (utilization >= 0.85) return "critical";
  if (utilization >= 0.75) return "warning";
  return "ok";
}

const ROLE_KEYS = FORECAST_ROLES.map((r) => r.key);

export function runForecast(
  scenario: ScenarioClient[],
  calibration: Calibration,
  peaks: RolePeaks,
  horizonMonths: number,
  referenceDate: Date,
): ForecastResult {
  const months: ForecastMonth[] = [];
  const hireByRole = ROLE_KEYS.reduce((acc, k) => {
    acc[k] = null;
    return acc;
  }, {} as Record<ForecastRoleKey, number | null>);

  for (let m = 0; m < horizonMonths; m++) {
    const assets = scenario
      .filter((c) => c.enabled && c.startMonthIndex <= m)
      .reduce((sum, c) => sum + c.assetsPerMonth, 0);
    const assetsPerWeek = assets / WEEKS_PER_MONTH;

    const roles = {} as Record<ForecastRoleKey, RoleMonthCell>;
    ROLE_KEYS.forEach((key) => {
      const peak = peaks[key] ?? 0;
      const demandPerWeek = assetsPerWeek * (calibration[key] ?? 0);
      const utilization = peak > 0 ? demandPerWeek / peak : 0;
      const status = statusFor(utilization);
      roles[key] = { role: key, demandPerWeek, peak, utilization, status };
      if (status === "over" && hireByRole[key] === null) hireByRole[key] = m;
    });

    months.push({
      monthIndex: m,
      label: format(addMonths(referenceDate, m), "MMM yy"),
      assets,
      roles,
    });
  }

  return { months, hireByRole };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/forecast/__tests__/engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/engine.ts src/lib/forecast/__tests__/engine.test.ts
git commit -m "feat: forecast engine (demand vs peak, hire-month per role)"
```

---

## Task 6: Partner allowlist

**Files:**
- Create: `src/lib/partners.ts`
- Test: `src/lib/__tests__/partners.test.ts`

> **Before this task:** obtain the two non-Jess partner emails and put them in `PARTNER_EMAILS` below. Do not ship with the placeholder entries.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/partners.test.ts
import { describe, it, expect } from "vitest";
import { isPartner } from "../partners";

describe("isPartner", () => {
  it("accepts an allowlisted partner email case-insensitively", () => {
    expect(isPartner("Jess@FireTeam.is")).toBe(true);
  });
  it("rejects a non-partner fireteam email", () => {
    expect(isPartner("rachyl@fireteam.is")).toBe(false);
  });
  it("rejects null/undefined", () => {
    expect(isPartner(null)).toBe(false);
    expect(isPartner(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/partners.test.ts`
Expected: FAIL — `isPartner` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/partners.ts

/**
 * The three FireTeam partners. Forecast + financial surfaces are visible only
 * to these emails, layered on top of the existing @fireteam.is Google auth.
 */
export const PARTNER_EMAILS = new Set<string>([
  "jess@fireteam.is",
  "REPLACE_ME_PARTNER_2@fireteam.is",
  "REPLACE_ME_PARTNER_3@fireteam.is",
]);

export function isPartner(email?: string | null): boolean {
  if (!email) return false;
  return PARTNER_EMAILS.has(email.toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/partners.test.ts`
Expected: PASS (3 tests). The `rachyl@` test passes regardless of the placeholder emails.

- [ ] **Step 5: Commit**

```bash
git add src/lib/partners.ts src/lib/__tests__/partners.test.ts
git commit -m "feat: partner email allowlist"
```

---

## Task 7: `useForecastData` hook

**Files:**
- Create: `src/hooks/useForecastData.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useForecastData.ts
import { useMemo } from "react";
import { useTasksData, useProjectsData, processTasksForCapacity } from "@/hooks/useFiberyData";
import { computeRolePeaks, computeCalibration } from "@/lib/forecast/calibration";
import { computeClientBaselines } from "@/lib/forecast/baseline";
import type { Calibration, ClientBaseline, RolePeaks } from "@/lib/forecast/types";

const CALIBRATION_WINDOW_WEEKS = 12;
const BASELINE_WINDOW_WEEKS = 12;

export interface ForecastData {
  peaks: RolePeaks;
  calibration: Calibration;
  baselines: ClientBaseline[];
  isLoading: boolean;
  error: unknown;
}

export function useForecastData(): ForecastData {
  const tasksQuery = useTasksData();
  const projectsQuery = useProjectsData();

  return useMemo(() => {
    const now = new Date();
    const tasks = tasksQuery.data?.findProjectSpecificTasks ?? [];
    const projects = projectsQuery.data?.findProjects ?? [];

    const roleGroups = processTasksForCapacity(tasks, "all");
    const peaks = computeRolePeaks(roleGroups);
    const calibration = computeCalibration(tasks, projects, now, CALIBRATION_WINDOW_WEEKS);
    const baselines = computeClientBaselines(projects, now, BASELINE_WINDOW_WEEKS);

    return {
      peaks,
      calibration,
      baselines,
      isLoading: tasksQuery.isLoading || projectsQuery.isLoading,
      error: tasksQuery.error ?? projectsQuery.error,
    };
  }, [tasksQuery.data, projectsQuery.data, tasksQuery.isLoading, projectsQuery.isLoading, tasksQuery.error, projectsQuery.error]);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `useProjectsData().data?.findProjects` shape matches `ProjectsResponse`.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useForecastData.ts
git commit -m "feat: useForecastData composes peaks, calibration, baselines"
```

---

## Task 8: `useScenario` hook

**Files:**
- Create: `src/hooks/useScenario.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useScenario.ts
import { useEffect, useState } from "react";
import type { ClientBaseline, ScenarioClient } from "@/lib/forecast/types";

let idCounter = 0;
const nextId = () => `client-${++idCounter}`;

export function useScenario(baselines: ClientBaseline[]) {
  const [clients, setClients] = useState<ScenarioClient[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Seed once from baselines when they first arrive.
  useEffect(() => {
    if (seeded || baselines.length === 0) return;
    setClients(
      baselines.map((b) => ({
        id: nextId(),
        name: b.client,
        startMonthIndex: 0,
        assetsPerMonth: b.monthlyRate,
        enabled: true,
        hypothetical: false,
      })),
    );
    setSeeded(true);
  }, [baselines, seeded]);

  const update = (id: string, patch: Partial<ScenarioClient>) =>
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addClient = () =>
    setClients((cs) => [
      ...cs,
      { id: nextId(), name: "New client", startMonthIndex: 0, assetsPerMonth: 12, enabled: true, hypothetical: true },
    ]);

  const removeClient = (id: string) => setClients((cs) => cs.filter((c) => c.id !== id));

  return { clients, update, addClient, removeClient };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScenario.ts
git commit -m "feat: useScenario state seeded from baselines"
```

---

## Task 9: PartnerGate component

**Files:**
- Create: `src/components/partners/PartnerGate.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/partners/PartnerGate.tsx
import { type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isPartner } from "@/lib/partners";

/**
 * Wraps partner-only content. useAuth already enforces an authenticated
 * @fireteam.is session (and redirects to /login otherwise); this adds the
 * partner email allowlist on top.
 */
export function PartnerGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }
  if (!isPartner(user?.email)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Partners only</h1>
          <p className="text-muted-foreground">This view is restricted to FireTeam partners.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `useAuth` returns `{ user, loading }`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/partners/PartnerGate.tsx
git commit -m "feat: PartnerGate auth guard"
```

---

## Task 10: CalibrationTable component

**Files:**
- Create: `src/components/partners/CalibrationTable.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/partners/CalibrationTable.tsx
import { Input } from "@/components/ui/input";
import { FORECAST_ROLES, type Calibration } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

interface Props {
  calibration: Calibration;
  onChange: (next: Calibration) => void;
}

/** Editable tasks-per-asset overrides. Seeded from history; partner can correct. */
export function CalibrationTable({ calibration, onChange }: Props) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Calibration — role-tasks per asset" />
      <div className="space-y-2">
        {FORECAST_ROLES.map((role) => (
          <div key={role.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{role.display}</span>
            <Input
              type="number"
              step="0.1"
              min="0"
              className="w-24 font-mono text-right"
              value={Number.isFinite(calibration[role.key]) ? Math.round(calibration[role.key] * 100) / 100 : 0}
              onChange={(e) =>
                onChange({ ...calibration, [role.key]: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/partners/CalibrationTable.tsx
git commit -m "feat: editable calibration table"
```

---

## Task 11: ScenarioBuilder component

**Files:**
- Create: `src/components/partners/ScenarioBuilder.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/partners/ScenarioBuilder.tsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import type { ClientBaseline, ScenarioClient } from "@/lib/forecast/types";
import { cn } from "@/lib/utils";

interface Props {
  clients: ScenarioClient[];
  baselines: ClientBaseline[];
  horizonMonths: number;
  onUpdate: (id: string, patch: Partial<ScenarioClient>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = pct >= 0;
  return (
    <span className={cn("text-xs font-mono", up ? "text-emerald-500" : "text-destructive")}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

export function ScenarioBuilder({ clients, baselines, horizonMonths, onUpdate, onAdd, onRemove }: Props) {
  const trendFor = (name: string) => baselines.find((b) => b.client === name)?.trendPct ?? null;

  return (
    <div className="space-y-3">
      <SectionHeader title="Scenario" />
      <div className="space-y-2">
        {clients.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md border border-border/50 p-2">
            <Checkbox checked={c.enabled} onCheckedChange={(v) => onUpdate(c.id, { enabled: !!v })} />
            <Input
              className="flex-1"
              value={c.name}
              onChange={(e) => onUpdate(c.id, { name: e.target.value })}
            />
            {!c.hypothetical && <TrendBadge pct={trendFor(c.name)} />}
            <label className="text-xs text-muted-foreground">assets/mo</label>
            <Input
              type="number"
              min="0"
              className="w-20 font-mono text-right"
              value={c.assetsPerMonth}
              onChange={(e) => onUpdate(c.id, { assetsPerMonth: parseInt(e.target.value) || 0 })}
            />
            <label className="text-xs text-muted-foreground">start</label>
            <select
              className="bg-background border border-border/50 rounded px-1 py-1 text-sm"
              value={c.startMonthIndex}
              onChange={(e) => onUpdate(c.id, { startMonthIndex: parseInt(e.target.value) })}
            >
              {Array.from({ length: horizonMonths }, (_, i) => (
                <option key={i} value={i}>
                  +{i}mo
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => onRemove(c.id)}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        + Add hypothetical client
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `Checkbox` import path differs, confirm against `src/components/ui/checkbox.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/partners/ScenarioBuilder.tsx
git commit -m "feat: scenario builder with trend badges"
```

---

## Task 12: ForecastChart + HireTimeline components

**Files:**
- Create: `src/components/partners/ForecastChart.tsx`
- Create: `src/components/partners/HireTimeline.tsx`

- [ ] **Step 1: Write ForecastChart**

```tsx
// src/components/partners/ForecastChart.tsx
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { FORECAST_ROLES, type ForecastResult } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

const COLORS: Record<string, string> = {
  Account: "#60a5fa",
  "Creative Review": "#f59e0b",
  Copywriters: "#a78bfa",
  Design: "#34d399",
  Video: "#fb7185",
};

/** Plots per-role utilization (% of peak) across the forecast horizon. 100% = peak. */
export function ForecastChart({ result }: { result: ForecastResult }) {
  const data = result.months.map((m) => {
    const row: Record<string, number | string> = { label: m.label };
    FORECAST_ROLES.forEach((role) => {
      row[role.key] = Math.round(m.roles[role.key].utilization * 100);
    });
    return row;
  });

  return (
    <div className="space-y-3">
      <SectionHeader title="Projected utilization (% of peak)" />
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, "dataMax + 20"]} unit="%" />
            <Tooltip />
            <Legend />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" label="peak" />
            {FORECAST_ROLES.map((role) => (
              <Line
                key={role.key}
                type="monotone"
                dataKey={role.key}
                name={role.display}
                stroke={COLORS[role.key]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write HireTimeline**

```tsx
// src/components/partners/HireTimeline.tsx
import { FORECAST_ROLES, type ForecastResult } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

/** Shows the first month each role's projected demand crosses its peak. */
export function HireTimeline({ result }: { result: ForecastResult }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Hire signal" />
      <div className="space-y-1.5">
        {FORECAST_ROLES.map((role) => {
          const monthIdx = result.hireByRole[role.key];
          const label = monthIdx === null ? null : result.months[monthIdx]?.label;
          return (
            <div key={role.key} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{role.display}</span>
              {label ? (
                <span className="font-mono text-destructive">breaks {label}</span>
              ) : (
                <span className="font-mono text-emerald-500">clear</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/partners/ForecastChart.tsx src/components/partners/HireTimeline.tsx
git commit -m "feat: forecast chart and hire timeline"
```

---

## Task 13: Partners page + route

**Files:**
- Create: `src/pages/Partners.tsx`
- Modify: `src/App.tsx:7-13` (imports) and `src/App.tsx:29-30` (route)

- [ ] **Step 1: Write the page**

```tsx
// src/pages/Partners.tsx
import { useMemo, useState } from "react";
import { PartnerGate } from "@/components/partners/PartnerGate";
import { useForecastData } from "@/hooks/useForecastData";
import { useScenario } from "@/hooks/useScenario";
import { runForecast } from "@/lib/forecast/engine";
import type { Calibration } from "@/lib/forecast/types";
import { ScenarioBuilder } from "@/components/partners/ScenarioBuilder";
import { CalibrationTable } from "@/components/partners/CalibrationTable";
import { ForecastChart } from "@/components/partners/ForecastChart";
import { HireTimeline } from "@/components/partners/HireTimeline";
import { Skeleton } from "@/components/ui/skeleton";

const HORIZON_MONTHS = 6;

function PartnersInner() {
  const { peaks, calibration: seededCalibration, baselines, isLoading, error } = useForecastData();
  const { clients, update, addClient, removeClient } = useScenario(baselines);
  const [calibrationOverride, setCalibrationOverride] = useState<Calibration | null>(null);
  const calibration = calibrationOverride ?? seededCalibration;

  const result = useMemo(
    () => runForecast(clients, calibration, peaks, HORIZON_MONTHS, new Date()),
    [clients, calibration, peaks],
  );

  if (isLoading) return <Skeleton className="h-96 m-8" />;
  if (error) return <div className="p-8 text-destructive">Failed to load forecast data.</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Partners — Capacity Forecast</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <ScenarioBuilder
            clients={clients}
            baselines={baselines}
            horizonMonths={HORIZON_MONTHS}
            onUpdate={update}
            onAdd={addClient}
            onRemove={removeClient}
          />
          <CalibrationTable calibration={calibration} onChange={setCalibrationOverride} />
        </div>
        <div className="space-y-8">
          <ForecastChart result={result} />
          <HireTimeline result={result} />
        </div>
      </div>
    </div>
  );
}

export default function Partners() {
  return (
    <PartnerGate>
      <PartnersInner />
    </PartnerGate>
  );
}
```

- [ ] **Step 2: Add the import to App.tsx**

In `src/App.tsx`, after line 12 (`import Accounts from "./pages/Accounts";`) add:

```tsx
import Partners from "./pages/Partners";
```

- [ ] **Step 3: Add the route to App.tsx**

In `src/App.tsx`, immediately before the catch-all comment line (`{/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}`) add:

```tsx
          <Route path="/partners" element={<Partners />} />
```

- [ ] **Step 4: Verify build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Partners.tsx src/App.tsx
git commit -m "feat: partners forecast page and route"
```

---

## Task 14: Manual verification

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all forecast + partners tests PASS, no regressions.

- [ ] **Step 2: Run the app and verify as a partner**

Run: `npm run dev`, sign in with a partner email, visit `/partners`.
Verify:
- Existing clients pre-seeded with assets/month and trend badges.
- Adding a hypothetical client at +2mo shifts demand starting that month.
- Bumping a client's assets/month pushes the utilization lines up; crossing 100% flips the hire signal to "breaks <month>".
- Editing a calibration number changes the projection live.

- [ ] **Step 3: Verify the gate**

Sign in with a non-partner `@fireteam.is` email; visit `/partners`.
Expected: "Partners only" screen, no data fetched.

- [ ] **Step 4 (optional): screenshot for the design pass**

Use the verify/run skill to capture `/partners` for a visual review before opening a PR.

---

## Self-Review notes (carried into execution)

- **Spec coverage:** supply reuse (Task 3), assets→tasks calibration with editable overrides (Tasks 3, 10), top-down demand only (Task 5 — no forward-schedule reads anywhere), trend-aware seed off completed weeks excluding current partial week (Task 4), scenario model with start month + enable + hypotheticals (Tasks 8, 11), per-role hire timing over 6-month horizon (Tasks 5, 12), partner gate via email allowlist on Google auth (Tasks 6, 9). Revenue rollup stub is intentionally deferred — it is OUT of this plan per the spec's "bottom: revenue rollup stub" being a bridge only; add as a follow-up task if wanted before merge.
- **Open items:** the two non-Jess partner emails must be filled in Task 6 before shipping. Confirm `src/components/ui/checkbox.tsx` exists (it's in the dependency list) for Task 11.
- **Out of v1 (do not build here):** QuickBooks/financials, onboarding ramp curve, saving multiple named scenarios, trend auto-extrapolation toggle.
