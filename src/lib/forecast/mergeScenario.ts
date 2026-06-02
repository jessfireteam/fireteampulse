import type { ClientHistory, ScenarioClient } from "./types";

/**
 * Reconcile the saved scenario with the current active-client roster:
 * - active clients (from histories) are seeded flat from their run-rate
 * - a saved entry matching an active client by name overrides its videos/statics/enabled
 * - saved HYPOTHETICAL clients (no matching active client) are carried over
 * - saved entries for clients no longer active are dropped (unless hypothetical)
 * Saved per-month arrays are only trusted if their length === horizon.
 */
export function mergeScenario(
  histories: ClientHistory[],
  saved: ScenarioClient[],
  horizon: number,
  makeId: () => string,
): ScenarioClient[] {
  const key = (s: string) => s.trim().toLowerCase();
  const savedByName = new Map(saved.map((c) => [key(c.name), c]));
  const goodLen = (a: unknown): a is number[] => Array.isArray(a) && a.length === horizon;

  const seeded: ScenarioClient[] = histories.map((h) => {
    const prior = savedByName.get(key(h.client));
    return {
      id: makeId(),
      name: h.client,
      videosByMonth: prior && goodLen(prior.videosByMonth) ? prior.videosByMonth : new Array(horizon).fill(h.seedVideos),
      staticsByMonth: prior && goodLen(prior.staticsByMonth) ? prior.staticsByMonth : new Array(horizon).fill(h.seedStatics),
      enabled: prior ? prior.enabled : true,
      hypothetical: false,
      pricing: prior?.pricing,
      adSpendByMonth: goodLen(prior?.adSpendByMonth) ? prior!.adSpendByMonth : undefined,
      agencyPctByMonth: goodLen(prior?.agencyPctByMonth) ? prior!.agencyPctByMonth : undefined,
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
      pricing: c.pricing,
      adSpendByMonth: goodLen(c.adSpendByMonth) ? c.adSpendByMonth : undefined,
      agencyPctByMonth: goodLen(c.agencyPctByMonth) ? c.agencyPctByMonth : undefined,
    }));

  return [...seeded, ...hypotheticals];
}
