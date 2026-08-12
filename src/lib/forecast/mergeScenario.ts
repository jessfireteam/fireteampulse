import type { ClientPlan, ScenarioClient } from "./types";

/**
 * Reconcile the saved scenario with the current per-client plan:
 * - every active client gets its volumes from the derived plan (Max x trailing mix)
 * - a saved entry flagged `manualVolumes` keeps its own volumes instead
 * - everything else on a saved entry (pricing, ad spend, one-offs, active window) is
 *   carried over untouched; this only ever decides the two volume arrays
 * - saved HYPOTHETICAL clients (no matching plan) are carried over as-is
 * - saved entries for clients no longer active are dropped (unless hypothetical)
 * Saved per-month arrays are only trusted if their length === horizon.
 *
 * Why volumes are derived rather than read from the saved row: the previous version seeded
 * a client from trailing history once and then let the saved row win forever, so nothing
 * ever refreshed. Deriving here (rather than in a post-load effect) matters — useScenario
 * takes the signature of this output as "already persisted", so a plan change in Fibery
 * updates the grid without triggering a write.
 */
export function mergeScenario(
  plans: ClientPlan[],
  saved: ScenarioClient[],
  horizon: number,
  makeId: () => string,
): ScenarioClient[] {
  const key = (s: string) => s.trim().toLowerCase();
  const savedByName = new Map(saved.map((c) => [key(c.name), c]));
  const goodLen = (a: unknown): a is number[] => Array.isArray(a) && a.length === horizon;
  const goodLabels = (a: unknown): a is string[] => Array.isArray(a) && a.length === horizon;

  /**
   * Migration for rows saved before `manualVolumes` existed: a derived or seeded row is flat
   * by construction, so a row whose months VARY is proof someone shaped it deliberately (a
   * ramp, a paused month). Treat that as manual rather than flattening real work. A flat
   * saved row is indistinguishable from a stale seed, so it re-derives.
   */
  const shaped = (c: ScenarioClient): boolean =>
    (goodLen(c.videosByMonth) && new Set(c.videosByMonth).size > 1) ||
    (goodLen(c.staticsByMonth) && new Set(c.staticsByMonth).size > 1);

  const seeded: ScenarioClient[] = plans.map((p) => {
    const prior = savedByName.get(key(p.client));
    const manual =
      !!prior &&
      (!!prior.manualVolumes || shaped(prior)) &&
      goodLen(prior.videosByMonth) &&
      goodLen(prior.staticsByMonth);
    return {
      id: makeId(),
      name: p.client,
      videosByMonth: manual ? prior!.videosByMonth : new Array(horizon).fill(p.videos),
      staticsByMonth: manual ? prior!.staticsByMonth : new Array(horizon).fill(p.statics),
      enabled: prior ? prior.enabled : true,
      hypothetical: false,
      // Absent rather than false when not manual, so it never reads as a diff.
      manualVolumes: manual ? true : undefined,
      newBusiness: prior?.newBusiness,
      pricing: prior?.pricing,
      adSpendByMonth: goodLen(prior?.adSpendByMonth) ? prior!.adSpendByMonth : undefined,
      agencyPctByMonth: goodLen(prior?.agencyPctByMonth) ? prior!.agencyPctByMonth : undefined,
      oneOffsByMonth: goodLen(prior?.oneOffsByMonth) ? prior!.oneOffsByMonth : undefined,
      oneOffLabelsByMonth: goodLabels(prior?.oneOffLabelsByMonth) ? prior!.oneOffLabelsByMonth : undefined,
      startMonthIndex: prior?.startMonthIndex,
      endMonthIndex: prior?.endMonthIndex,
    };
  });

  const seededNames = new Set(seeded.map((s) => key(s.name)));
  const hypotheticals = saved
    .filter((c) => c.hypothetical && !seededNames.has(key(c.name)))
    .map((c) => ({
      id: makeId(),
      name: c.name,
      videosByMonth: goodLen(c.videosByMonth) ? c.videosByMonth : new Array(horizon).fill(0),
      staticsByMonth: goodLen(c.staticsByMonth) ? c.staticsByMonth : new Array(horizon).fill(0),
      enabled: c.enabled,
      hypothetical: true,
      manualVolumes: c.manualVolumes,
      newBusiness: c.newBusiness,
      pricing: c.pricing,
      adSpendByMonth: goodLen(c.adSpendByMonth) ? c.adSpendByMonth : undefined,
      agencyPctByMonth: goodLen(c.agencyPctByMonth) ? c.agencyPctByMonth : undefined,
      oneOffsByMonth: goodLen(c.oneOffsByMonth) ? c.oneOffsByMonth : undefined,
      oneOffLabelsByMonth: goodLabels(c.oneOffLabelsByMonth) ? c.oneOffLabelsByMonth : undefined,
      startMonthIndex: c.startMonthIndex,
      endMonthIndex: c.endMonthIndex,
    }));

  return [...seeded, ...hypotheticals];
}
