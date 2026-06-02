import type { ClientPricing } from "./types";

/**
 * Fee = marginal tiered rate on managed spend (adSpend * agencyPct%),
 * floored at the client's minimum fee. Each tier.upTo is the upper bound of
 * MANAGED spend for that bracket.
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
