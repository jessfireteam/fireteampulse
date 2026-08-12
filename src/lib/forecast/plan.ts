// src/lib/forecast/plan.ts
import type { ClientHistory, ClientPlan } from "./types";
import { activeClientNames } from "./activeClients";

export interface PlanClientInput {
  name: string | null;
  status: { name: string } | null;
  maxDeliverablesPerMonth?: number | null;
  minDeliverablesPerMonth?: number | null;
}

const key = (s: string) => s.trim().toLowerCase();

/**
 * Completed projects a client needs in the history window before we trust its OWN
 * video/static ratio. Below this, one project swings the split wildly — Spacelift shipped a
 * single static in the last three months, which would read as "0% video" and turn a Max of
 * 16 into 16 statics and no videos. Thin samples fall back to the agency-wide mix.
 */
export const MIN_MIX_SAMPLE = 6;

/** Video share across every client we have history for; the fallback for a client with none. */
function agencyVideoShare(histories: ClientHistory[]): number {
  let videos = 0;
  let total = 0;
  histories.forEach((h) => {
    const v = h.videosByMonth.reduce((s, n) => s + n, 0);
    const s = h.staticsByMonth.reduce((sum, n) => sum + n, 0);
    videos += v;
    total += v + s;
  });
  return total > 0 ? videos / total : 0.5;
}

/** This client's own trailing video share, or null when its sample is too thin to trust. */
function clientVideoShare(h: ClientHistory | undefined): number | null {
  if (!h) return null;
  const videos = h.videosByMonth.reduce((s, n) => s + n, 0);
  const statics = h.staticsByMonth.reduce((s, n) => s + n, 0);
  const total = videos + statics;
  return total >= MIN_MIX_SAMPLE ? videos / total : null;
}

/**
 * Build the current plan for every active client.
 *
 * The roster is the active client list from Fibery, NOT the set of clients with recent
 * output. A client that signed last week has a Max and no completed projects yet, and it
 * still belongs in a capacity forecast.
 *
 * Volumes come from `Max × that client's trailing video/static mix`. The mix is per client
 * on purpose: agency-wide would be wrong for most of them (Flewd and FabFitFun skew static,
 * Ground News and Mighty Munch skew video).
 */
export function deriveClientPlans(
  clients: PlanClientInput[],
  histories: ClientHistory[],
): ClientPlan[] {
  const active = activeClientNames(clients);
  const historyByName = new Map(histories.map((h) => [key(h.client), h]));
  const fallbackShare = agencyVideoShare(histories);

  const plans: ClientPlan[] = [];
  clients.forEach((c) => {
    const name = c.name?.trim();
    if (!name || !active.has(key(name))) return;

    const hist = historyByName.get(key(name));
    const ownShare = clientVideoShare(hist);
    const share = ownShare ?? fallbackShare;
    const mixSource: "client" | "agency" = ownShare === null ? "agency" : "client";
    const max = c.maxDeliverablesPerMonth ?? null;
    const min = c.minDeliverablesPerMonth ?? null;

    if (max === null) {
      // No plan set in Fibery. Fall back to what they actually shipped so the row isn't
      // silently zeroed, and flag it so the missing field is visible rather than implied.
      plans.push({
        client: name,
        max: null,
        min,
        videoShare: share,
        mixSource,
        videos: hist?.seedVideos ?? 0,
        statics: hist?.seedStatics ?? 0,
        source: "runrate",
      });
      return;
    }

    // Round videos and take statics as the remainder so the two always sum to Max exactly.
    const videos = Math.round(max * share);
    plans.push({
      client: name,
      max,
      min,
      videoShare: share,
      mixSource,
      videos,
      statics: max - videos,
      source: "max",
    });
  });

  plans.sort((a, b) => (b.max ?? b.videos + b.statics) - (a.max ?? a.videos + a.statics));
  return plans;
}
