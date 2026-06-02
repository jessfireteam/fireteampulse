import type { ClientPricing } from "./types";

/**
 * Fee = baseFee + marginal tiered rate on managed spend (adSpend * agencyPct%),
 * floored at the client's minimum fee. The base fee is ADDED to the tiered
 * amount; the minimum fee is a floor on the total. Each tier.upTo is the upper
 * bound of MANAGED spend for that bracket. baseFee defaults to 0 when absent.
 */
export function computeFee(adSpend: number, agencyPct: number, pricing: ClientPricing): number {
  const managed = adSpend * (agencyPct / 100);
  let tiered = 0;
  let lower = 0;
  for (const tier of pricing.tiers) {
    if (managed <= lower) break;
    const ceil = tier.upTo ?? Infinity;
    const slice = Math.min(managed, ceil) - lower;
    if (slice > 0) tiered += slice * (tier.rate / 100);
    lower = ceil;
  }
  return Math.max((pricing.baseFee ?? 0) + tiered, pricing.minFee);
}
