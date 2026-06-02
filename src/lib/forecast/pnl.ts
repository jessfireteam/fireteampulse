import { computeFee } from "./fee";
import type { ClientPricing, CostConfig, PnlMonth } from "./types";

interface PnlClient {
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[];
  videosByMonth?: number[];
  staticsByMonth?: number[];
  enabled?: boolean;
}

export function runPnL(params: {
  clients: PnlClient[];
  costConfig: CostConfig;
  monthLabels: string[];
}): PnlMonth[] {
  const { clients, costConfig, monthLabels } = params;
  const active = clients.filter((c) => c.enabled !== false);
  const team = costConfig.team ?? [];

  return monthLabels.map((label, m) => {
    const revenue = active.reduce((sum, c) => {
      if (!c.pricing) return sum;
      return sum + computeFee(c.adSpendByMonth?.[m] ?? 0, c.agencyPctByMonth?.[m] ?? 0, c.pricing);
    }, 0);

    const videos = active.reduce((s, c) => s + (c.videosByMonth?.[m] ?? 0), 0);
    const statics = active.reduce((s, c) => s + (c.staticsByMonth?.[m] ?? 0), 0);
    const deliverables = videos + statics;

    const activeTeam = team.filter((p) => p.startMonthIndex <= m);
    const videoSideCost = activeTeam.filter((p) => p.side === "video").reduce((s, p) => s + p.monthlyCost, 0);
    const staticSideCost = activeTeam.filter((p) => p.side === "static").reduce((s, p) => s + p.monthlyCost, 0);
    const productionCost = videoSideCost + staticSideCost;

    const fixedCost = (costConfig.partnerSalaryByMonth[m] ?? 0) + (costConfig.rentByMonth[m] ?? 0) + (costConfig.overheadByMonth?.[m] ?? 0);
    const totalCost = fixedCost + productionCost;
    const netIncome = revenue - totalCost;

    return {
      monthIndex: m, label, revenue, fixedCost, productionCost, totalCost, netIncome,
      margin: revenue === 0 ? 0 : netIncome / revenue,
      deliverables, videos, statics,
      feePerDeliverable: deliverables === 0 ? null : revenue / deliverables,
      costPerDeliverable: deliverables === 0 ? null : totalCost / deliverables,
      costPerVideo: videos === 0 ? null : videoSideCost / videos,
      costPerStatic: statics === 0 ? null : staticSideCost / statics,
    };
  });
}
