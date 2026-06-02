import { computeFee } from "./fee";
import type { ClientPricing, CostConfig, PnlMonth } from "./types";

interface PnlClient {
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[];
}

export function runPnL(params: {
  clients: PnlClient[];
  costConfig: CostConfig;
  deliverablesByMonth: number[];
  monthLabels: string[];
}): PnlMonth[] {
  const { clients, costConfig, deliverablesByMonth, monthLabels } = params;
  return monthLabels.map((label, m) => {
    const revenue = clients.reduce((sum, c) => {
      if (!c.pricing) return sum;
      const adSpend = c.adSpendByMonth?.[m] ?? 0;
      const pct = c.agencyPctByMonth?.[m] ?? 0;
      return sum + computeFee(adSpend, pct, c.pricing);
    }, 0);
    const deliverables = deliverablesByMonth[m] ?? 0;
    const fixedCost = (costConfig.partnerSalaryByMonth[m] ?? 0) + (costConfig.rentByMonth[m] ?? 0);
    const variableCost = (costConfig.costPerDeliverableByMonth[m] ?? 0) * deliverables;
    const totalCost = fixedCost + variableCost;
    const netIncome = revenue - totalCost;
    return {
      monthIndex: m, label, revenue, fixedCost, variableCost, totalCost, netIncome,
      margin: revenue === 0 ? 0 : netIncome / revenue,
      deliverables,
      feePerDeliverable: deliverables === 0 ? null : revenue / deliverables,
      costPerDeliverable: deliverables === 0 ? null : totalCost / deliverables,
    };
  });
}
