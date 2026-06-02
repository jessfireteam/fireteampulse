# Production Cost Roster — Design Spec

**Date:** 2026-06-02
**Status:** Approved for planning
**Scope:** Replace the P&L's single "Variable cost / deliverable" input with a production-team roster (people with monthly costs, split video/static), deriving per-video and per-static cost and supporting hire modeling.
**Builds on:** Partners P&L (`2026-06-02-partners-pnl-revenue-design.md`) + the operating-overhead reframe. Lives in the same `/partners` P&L tab.

---

## Problem

The single blended "Variable cost / deliverable" rate ($620, then ~$145) was both confusing and inaccurate — it treated all-in or marginal cost as if it scaled per deliverable, when in reality production cost is **monthly salaries/retainers that are fixed month to month**. The partners want to (a) enter the real monthly cost of their production people, (b) see cost-per-video and cost-per-static separately, and (c) model the profit impact of a hire.

Key fact from the partners: **no one works on both types.** The team splits cleanly into a video side and a static side, so each person belongs to exactly one side — no cost allocation needed.

---

## Model

### Production team roster (new)
A list of production people, each:
- `name`
- `side`: `"video"` | `"static"`
- `monthlyCost`: their fixed monthly salary/retainer (number)
- `startMonthIndex`: 0 = active now (existing staff); >0 = a hypothetical **hire** that begins that month

Stored agency-level in the scenario's `cost_config` as `team: ProductionPerson[]`.

### Derived figures (per month `m`)
- **Production cost(m)** = sum of `monthlyCost` for people with `startMonthIndex <= m`. This is a (mostly fixed) cost line that **steps up when a hire's start month hits**. It does NOT scale with deliverable count.
- **cost / video(m)** = (sum of video-side monthly cost active at `m`) ÷ videos produced that month (from the capacity tab), or null if 0 videos.
- **cost / static(m)** = (sum of static-side monthly cost active at `m`) ÷ statics that month, or null if 0 statics.

These per-type figures are **efficiency outputs**, not cost drivers: the same team spread over more output lowers per-unit cost (operating leverage) until capacity is hit and a hire is needed — which ties to the capacity tab's hire signal.

### P&L integration
- The single "Variable cost / deliverable" row is **removed**.
- **Total cost(m)** = partner salary + rent + operating overhead + **production cost(m)**. (All fixed-ish; production steps with hires.)
- Net income and margin unchanged in formula.
- KPI header shows **cost / video** and **cost / static** (replacing the single all-in cost/deliverable; keep an all-in = total cost ÷ deliverables as a third KPI for the break-even view).

### Hire modeling
Add a person on a side with a monthly cost and a start month (e.g. video side, $8k/mo, starting September). Production cost steps up from September, cost/video jumps, and net income/margin show the hit — paired with the capacity tab telling you *when* that side breaks.

---

## Components / units of work

1. **types** (`src/lib/forecast/types.ts`): `ProductionPerson { id, name, side: "video"|"static", monthlyCost, startMonthIndex }`. Add `team: ProductionPerson[]` to `CostConfig`. The existing `costPerDeliverableByMonth` becomes unused (keep optional for back-compat; ignored by the engine).
2. **P&L aggregation** (`src/lib/forecast/pnl.ts`): compute `productionCost(m)` from the team (active by start month); `costPerVideo(m)`/`costPerStatic(m)` using per-month videos/statics; fold `productionCost` into `totalCost`; add `productionCost`, `costPerVideo`, `costPerStatic` to `PnlMonth`. Needs per-month `videos` and `statics` arrays (not just total deliverables) passed in — extend the `runPnL` input.
3. **Deliverables-by-type bridge**: the P&L tab must pass per-month `videosByMonth` and `staticsByMonth` (summed across enabled clients from the capacity scenario), not just the combined `assets`. (Capacity scenario already holds these per client.)
4. **Persistence** (`src/hooks/useScenario.ts`): load/save `team` within `cost_config`; default to `[]` when missing (back-compat).
5. **UI** (`src/components/partners/PnlTab.tsx` + a roster editor): a "Production team" section/modal — rows of {name, side dropdown, monthly cost (MoneyInput), start month, remove} + "Add person/hire". Remove the Variable cost/deliverable row. KPI header shows cost/video + cost/static (+ all-in). Render test mounts it.

---

## Testing

- **Production cost**: sums active people; a person with `startMonthIndex = 3` is excluded months 0–2, included from 3 on.
- **Per-type cost**: video-side total ÷ videos; static-side ÷ statics; null when that type's count is 0 (no NaN/Infinity).
- **Total/net/margin**: total cost includes production cost; net = revenue − total; margin guard at revenue 0.
- **Hire step**: adding a video-side person raises production cost and cost/video from the start month onward only.
- **Render test**: P&L tab with a roster mounts without throwing.

---

## Resolved decisions

- People belong to exactly one side (video or static); no shared-cost allocation.
- Production cost is fixed monthly (roster sum), steps with hire start months; per-video/per-static are derived efficiency KPIs, not cost multipliers.
- Replaces the single "Variable cost / deliverable" input entirely.
- Stored in `cost_config.team`; back-compat default `[]`.

## Open items for planning

- Seeding the initial roster: partners enter real people + monthly costs (no historical source to auto-derive). Start empty; they populate.
- Whether the roster lives inline in the cost section or behind a modal (lean inline/expandable for at-a-glance, matching the rest of the grid).
- Keep the all-in cost/deliverable KPI alongside the two per-type KPIs (yes) for the break-even floor reference.
