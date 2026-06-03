import { computeFee } from "./fee";
import { isClientActive } from "./active";
import type { ClientPricing, CostConfig, PnlMonth } from "./types";

interface PnlClient {
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[];
  oneOffsByMonth?: number[];
  videosByMonth?: number[];
  staticsByMonth?: number[];
  enabled?: boolean;
  startMonthIndex?: number;
  endMonthIndex?: number | null;
}

export function runPnL(params: {
  clients: PnlClient[];
  costConfig: CostConfig;
  monthLabels: string[];
}): PnlMonth[] {
  const { clients, costConfig, monthLabels } = params;
  const team = costConfig.team ?? [];

  return monthLabels.map((label, m) => {
    const revenue = clients.reduce((sum, c) => {
      let r = 0;
      // Recurring fee (minimum + tiered) only bills inside the active window.
      if (isClientActive(c, m) && c.pricing) {
        r += computeFee(c.adSpendByMonth?.[m] ?? 0, c.agencyPctByMonth?.[m] ?? 0, c.pricing);
      }
      // One-off fees bill in whatever month they're entered, including months
      // before the active start (e.g. a strategy fee the month before billing).
      r += c.oneOffsByMonth?.[m] ?? 0;
      return sum + r;
    }, 0);

    const videos = clients.reduce((s, c) => s + (isClientActive(c, m) ? (c.videosByMonth?.[m] ?? 0) : 0), 0);
    const statics = clients.reduce((s, c) => s + (isClientActive(c, m) ? (c.staticsByMonth?.[m] ?? 0) : 0), 0);
    const deliverables = videos + statics;

    const activeTeam = team.filter((p) => p.startMonthIndex <= m);
    const sideSum = (side: "video" | "static" | "both") =>
      activeTeam.filter((p) => p.side === side).reduce((s, p) => s + p.monthlyCost, 0);
    // per-type cost uses ALL active producers so cost/video & cost/static stay accurate
    const videoSideCost = sideSum("video");
    const staticSideCost = sideSum("static");
    const bothCost = sideSum("both");
    // production-cost LINE = ALL producers, regardless of employment classification
    const productionCost = activeTeam.reduce((s, p) => s + p.monthlyCost, 0);
    // salaried producers are already in production cost; subtract them from the entered full payroll so each is counted once
    const salariedProducerCost = activeTeam
      .filter((p) => p.employment === "salary")
      .reduce((s, p) => s + p.monthlyCost, 0);
    const nonProdSalaryNet = Math.max(0, (costConfig.nonProdSalaryByMonth?.[m] ?? 0) - salariedProducerCost);
    // allocate "both" cost across types by this month's output mix
    const videoShare = deliverables === 0 ? 0 : videos / deliverables;
    const videoAlloc = bothCost * videoShare;
    const staticAlloc = bothCost - videoAlloc;

    const overheadTotal = (costConfig.overheadLines && costConfig.overheadLines.length > 0)
      ? costConfig.overheadLines.reduce((s, line) => s + (line.byMonth?.[m] ?? 0), 0)
      : (costConfig.overheadByMonth?.[m] ?? 0);
    const fixedCost = (costConfig.partnerSalaryByMonth[m] ?? 0) + (costConfig.rentByMonth[m] ?? 0) + nonProdSalaryNet + overheadTotal;
    const totalCost = fixedCost + productionCost;
    const netIncome = revenue - totalCost;

    return {
      monthIndex: m, label, revenue, fixedCost, productionCost, nonProdSalaryNet, totalCost, netIncome,
      margin: revenue === 0 ? 0 : netIncome / revenue,
      deliverables, videos, statics,
      feePerDeliverable: deliverables === 0 ? null : revenue / deliverables,
      costPerDeliverable: deliverables === 0 ? null : totalCost / deliverables,
      costPerVideo: videos === 0 ? null : (videoSideCost + videoAlloc) / videos,
      costPerStatic: statics === 0 ? null : (staticSideCost + staticAlloc) / statics,
    };
  });
}
