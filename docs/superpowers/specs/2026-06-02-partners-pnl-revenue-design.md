# Partners P&L (Revenue + Profit) — Design Spec

**Date:** 2026-06-02
**Status:** Approved for planning
**Scope:** A P&L view integrated into the existing `/partners` surface — per-client revenue (fee) projection plus a simplified cost model, yielding monthly net income, margin, and per-deliverable unit economics.
**Builds on:** the Partners Capacity Forecast (`2026-06-01-partners-capacity-forecast-design.md`). Shares the client roster, month grid, and Supabase persistence.
**Out of scope (deferred):** QuickBooks integration of any kind, granular expense-category pull, actual-cost validation, per-type (video vs static) variable cost, multiple named scenarios.

---

## Problem

The partners need monthly **profit** and **margin**, plus per-deliverable unit economics, to decide pricing and whether a client/scenario is worth it. The prior Lovable dashboard's revenue engine worked but its QuickBooks expense pull was overdone, granular in ways nobody reviewed, and required manual partner-salary entry. What matters is a trustworthy bottom line and honest unit economics, projected forward as clients are added.

---

## Surface

`/partners` gets a **Capacity | P&L** tab toggle. The P&L tab is a spreadsheet-style timeline: clients/line-items as rows, months as columns, actuals on the left, editable plan on the right — mirroring the capacity grid's feel and reusing its month-label and history/future-divider conventions.

Sub-toggle on the revenue section (as in the old tool): **Fee / Ad Spend / Agency %**.

---

## Revenue engine (per client, per month)

Inputs:
- **Ad spend** — actual for past months (pulled from the FB Ads Supabase via the existing `get_monthly_spend_by_client` path used by the `client-months` query; **no QuickBooks**); editable plan for future months.
- **Agency %** — editable per cell (lets a mid-stream step-down be recorded). The share of the client's ad spend the agency manages.

Derived:
- **Managed spend** = ad spend × agency %.
- **Fee** = marginal tiered rate applied to managed spend, floored at the client's minimum fee. Marginal = bracket-by-bracket (first slice up to tier-1 ceiling at tier-1 rate, next slice at tier-2 rate, remainder at the top rate), like tax brackets. Fee is **not** directly editable.

**Revenue (month)** = sum of all client fees that month.

### Per-client pricing config
Each client carries: **minimum fee** + ordered **tiers** `[{ upTo: number|null, rate: % }]` (last tier `upTo: null` = "and above"). Edited via an "Add client / Edit pricing" modal (name, min fee, tiers), matching the old flow. New clients added here are **Prospects** until they appear Active in Fibery (see roster model).

---

## Cost model

Only **two fixed lines**; everything else is variable with deliverable volume.

- **Fixed (flat, editable per month):**
  - Partner salary
  - Rent / lease
- **Variable (editable):** a single blended **cost-per-deliverable rate** (encompasses all production labor, contractors, software, and remaining overhead — i.e. "all non-fixed expenses ÷ deliverables") × **total deliverables that month** (videos + statics from the Capacity tab — actual for past months, planned for future).

**Total cost (month)** = partner salary + rent + (cost-per-deliverable rate × deliverables).
**Net income (month)** = revenue − total cost.
**Margin %** = net income ÷ revenue.

The cost-per-deliverable rate and the two fixed lines are **agency-level config** (not per client). For v1 they are set and monitored by partners; there is no actual-cost feed (that's the deferred QuickBooks job).

---

## Unit-economics KPIs (headline)

Displayed prominently on the P&L tab, per month (and/or for the selected/current month):

- **Fee per deliverable** = total fees ÷ deliverables.
- **All-in cost per deliverable** = total cost ÷ deliverables. Because partner salary + rent are fixed, this figure **falls as volume rises** (operating leverage) and rises at thin volume — surfacing the break-even reality directly.
- **Per-deliverable margin** = fee/deliverable − cost/deliverable.
- Reference floors: **break-even ~$700**, **practical ~$1000** (configurable constants) shown against cost-per-deliverable so sub-floor situations are visible.

---

## Shared client + roster model

Reuses the capacity tab's model exactly:
- The Fibery roster is the source of truth: **Active** = real client; a partner-added client not yet Active in Fibery = **Prospect**; gone-from-active = **Churned**.
- A prospect flips to real when ops marks it Active in Fibery (reconciled by name) — explicit, no QuickBooks trigger. This replaces the old opaque prospect→client transition.
- Adding a client once makes it available in both tabs.

---

## Persistence

Extends the shared `partner_forecast_scenario` Supabase row (single 'default' row, partner-email RLS):
- Each scenario **client** object gains revenue fields: `pricing { minFee, tiers[] }`, `adSpendByMonth[]` (plan), `agencyPctByMonth[]`.
- A new agency-level `costConfig` block on the row: `partnerSalaryByMonth[]`, `rentByMonth[]`, `costPerDeliverableByMonth[]` (or standing values with per-month overrides).
- One debounced autosave, same `mergeScenario` roster reconciliation as capacity (revenue fields preserved by client name; cost config is roster-independent).

---

## Components / units of work

1. **Fee engine** (pure): `(adSpend, agencyPct, pricing) → fee` with marginal tiers + min floor. Independently testable.
2. **P&L aggregation** (pure): `(clients, costConfig, deliverablesByMonth) → { revenue, totalCost, netIncome, margin, feePerDeliv, costPerDeliv }[]` per month.
3. **Actual ad-spend source**: reuse the FB Ads monthly-spend path (already wired in `fibery-proxy` `client-months` / `get_monthly_spend_by_client`); map to per-client per-month actual ad spend.
4. **Deliverables bridge**: total videos+statics per month from the capacity scenario (actual history + planned), consumed by the cost model and KPIs.
5. **Persistence extension**: revenue fields on clients + `costConfig`; merge/seed/autosave.
6. **UI**: P&L tab (tab toggle, revenue grid with Fee/Ad Spend/Agency % sub-toggle, cost lines, net income + margin rows, unit-economics KPI header), Add/Edit-pricing modal. Mirror the capacity grid scaffolding; render test required (recharts/grid mount).
7. **Pricing migration (best-effort)**: attempt to recover the prior dashboard's per-client pricing (min fee + tiers) from the old Supabase project; fall back to manual entry via the modal.

---

## Testing

- **Fee engine**: marginal-tier math (single tier, multi-tier spanning brackets, exactly-on-boundary, below-minimum-fee floor, zero spend, 0%/100% agency).
- **P&L aggregation**: revenue/cost/net/margin for a known scenario; cost-per-deliverable falls as deliverables rise with fixed costs held; divide-by-zero guards when deliverables = 0 (KPIs show "—", not NaN/Infinity).
- **Roster/merge**: revenue fields preserved by name across reconciliation; cost config survives independent of roster.
- **Grid render test**: P&L tab mounts without throwing (mock ResponsiveContainer to a fixed size), per the chart-render-test rule.

---

## Resolved decisions

- Cost model = fixed (partner salary + rent) + blended cost-per-deliverable × capacity deliverables. No QuickBooks in v1.
- Fee = marginal tiers on (ad spend × agency %), min-fee floor.
- Actual ad spend from FB Ads Supabase (existing path); actual cost not fed in v1.
- Two headline unit metrics: fee/deliverable and all-in cost/deliverable, with ~$700 / ~$1000 reference floors.
- Integrated into `/partners` as a P&L tab sharing roster + persistence.

## Open items for planning

- Exact storage shape for `costConfig` (standing values + per-month overrides vs full per-month arrays).
- Whether the per-client revenue grid and the cost/profit block render as one continuous P&L table or stacked sections.
- Recoverability of prior pricing config from the old Supabase project (investigate at build time).
