# Partners Capacity Forecast — Design Spec

**Date:** 2026-06-01
**Status:** Approved for planning
**Scope:** Capacity forecast / scenario engine, partner-gated, inside the existing Pulse app.
**Out of scope (separate later spec):** QuickBooks actuals, billing reconciliation, full financial projections. A revenue rollup stub is included only as a bridge.

---

## Problem

The partners need to answer two recurring questions that the current Pulse dashboard cannot:

1. **"If we sign these clients at these volumes, where does each role break, and when?"** Pulse shows current-week capacity only. There is no forward scenario.
2. **"Are we over capacity / do we need to hire production?"** projected, not just observed.

These are partner-only decisions (hiring, taking on clients), so the surface must be gated.

### Why we can't use Fibery's forward schedule

Future-dated projects in Fibery trail off the further out you look — **not** because demand drops, but because projects often aren't scheduled until ~a month out. Pulse's existing "Next 30d" columns and faded future-timeline bars inherit this artifact and under-count. **The forecast must never read Fibery's forward schedule as demand.** Forward Fibery data is excluded from the demand math entirely.

---

## What already exists (and is reused)

Pulse computes capacity today, and it's trustworthy because it's all backward-looking:

- **Supply (peak capacity), per role** = sum of each active person's `maxWeek26` (their single best week of completed role-tasks over the trailing 26 weeks). See `src/components/dashboard/RoleCapacitySummary.tsx`.
- **Current load, per role** = sum of each person's `avg30Day ÷ 4.3` (weekly run-rate).
- **Unit** underneath everything: **role-tasks completed per week**.
- **Data path:** live from Fibery via one Supabase edge function `fibery-proxy` (whitelisted query types in `src/lib/fibery.ts`). Fibery is source of truth; no heavy Supabase data model.
- **Stack:** React + Vite + shadcn/ui + recharts + react-query, deployed on Netlify. Auth already present (`useAuth`, `Login.tsx`).

Roles in the capacity model: **Account, Creative Review, Copywriting, Design, Video Editing.**

---

## Core design

### The unit bridge: assets/month → role-tasks/week

Supply is in role-tasks/week. Demand is entered by partners in **assets/month**. One calibration converts between them:

- **Asset definition:** every Fibery **Project** is one asset; an asset is **delivered** when its Project is marked **completed** (`doneDate` set). This applies to both the calibration ratio and the trend seed.
- **Calibration ratio** = role-tasks per asset, per role, derived automatically from Fibery history (total completed role-tasks ÷ total completed Projects, over a trailing window).
- Surfaced as an **editable table** so a partner can override a number that looks wrong. This is the single calibration that makes the forecast trustworthy, so it is visible, not hidden.

### Demand is fully top-down

For **every** client (existing and hypothetical), demand = entered assets/month → converted to weekly role-tasks via the calibration ratio. Fibery history is used for only two backward-looking things: supply peaks (`maxWeek26`) and the calibration ratio. Forward Fibery data is never used.

### Trend-aware seed for existing clients

Existing clients are pre-seeded with a forward assets/month value that reflects **where the client is now**, not a flat long-run average (a flat 90-day mean would halve the forward number for a client doubling month-over-month, e.g. Rejuvia).

- **Baseline rate** = trailing **4 completed weeks** of delivered assets per client, excluding the current partial week (where scheduling lag lives), converted to monthly.
- **Trend signal** = last 4 weeks vs the prior 8 weeks, shown per client as a direction + % change, with a small weekly sparkline of completed deliveries.
- **Forward input** = partner-entered assets/month, **pre-filled** with the baseline rate, displayed beside the trend signal so the partner sets the number with trajectory in view.
- **No auto-extrapolation** of the slope into the forecast by default. Weekly delivery data is noisy and partners have better forward knowledge than a regression. (Optional "project the trend forward" toggle is a fast follow, not v1.)

### The scenario model

A scenario is a list of clients, each with:

- **name**
- **start month** (when they begin contributing demand)
- **assets/month** (forward input, pre-filled per above for existing clients; partner-estimated for hypotheticals)
- **enabled** toggle (include/exclude from the forecast)

Existing clients load in pre-seeded and editable. Partners add hypothetical clients with a name + asset estimate. v1 = **one working scenario** edited live (no saving of multiple named scenarios).

For v1, each client contributes a **flat assets/month from its start month**. The onboarding burst (≈12 assets in the first ~6 weeks, then dropping to a spend-based steady state) is real and affects near-term spikes, but is a **fast follow**, not v1.

### The math (per future month, per role)

1. Sum assets/month across all enabled clients active that month.
2. Convert to weekly role-tasks per role via the calibration ratio.
3. Compare projected demand per role against peak capacity per role (`maxWeek26` sum).
4. Output per role per month: utilization %, healthy/overload status (same bands as today), and a **hire signal** when projected demand crosses peak.

Result reads as "Design breaks in August, Video Editing in October," not just "we're over."

### Output surface

- **Left: scenario builder** — editable client list with assets/month inputs, start month, enable toggles, trend signal + sparkline per existing client, and the editable calibration table.
- **Right: forward view** — per-role capacity-vs-demand chart over the next N months with break points marked, plus a table of "when does each role need a hire."
- **Bottom: revenue rollup stub** — assets × rate, as a bridge toward the later financials spec. Not the focus.

### Access control

Partner-only, **three partners**, gated by **Google OAuth restricted to an allowlist of the three partner emails**. Anyone else (even authenticated) cannot reach the scenario/financial surfaces or their data. Partner email allowlist to be filled in during planning (Jess = jess@fireteam.is + two others).

---

## Components / units of work

1. **Calibration module** — derive role-tasks-per-asset ratio from Fibery completed history; editable overrides. New `fibery-proxy` query type(s) for completed assets + role-tasks over trailing window.
2. **Client baseline + trend module** — trailing-4-week completed-delivery run-rate per client, trend vs prior 8 weeks, weekly sparkline. New `fibery-proxy` query type for per-client weekly completed deliverables.
3. **Scenario state** — in-memory (react-query + local state) client list with start month, assets/month, enabled. v1 needs no persistence.
4. **Forecast engine** — pure function: (scenario, calibration, peaks) → per-role-per-month demand, utilization, overload, hire-month. Independently testable, no I/O.
5. **Forecast UI** — scenario builder + forward charts/table (recharts), partner-gated route.
6. **Auth gate** — partner role check on the new route.
7. **Revenue rollup stub** — assets × rate display only.

---

## Testing

- **Forecast engine** is a pure function and gets the most test coverage: known scenario + known calibration + known peaks → asserted per-role utilization and hire-month. Edge cases: client starting mid-window, zero-asset client, demand exactly at peak, multiple roles breaking in different months.
- **Calibration + baseline modules**: assert correct trailing-window math and current-partial-week exclusion against fixture Fibery data.
- **Auth gate**: non-partner cannot reach the route or its data.

---

## Resolved decisions

- **Partner access:** Google OAuth restricted to an allowlist of the 3 partner emails. (Fill in the two non-Jess emails during planning.)
- **Asset:** every Fibery Project; delivered when marked completed (`doneDate` set). No type filtering.
- **Forecast horizon:** 6 months.
