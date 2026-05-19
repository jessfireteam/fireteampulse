import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subMonths } from "date-fns";
import { queryFibery } from "@/lib/fibery";
import { useClientMonthsData } from "@/hooks/useFiberyData";
import { useProcessedClientWeeks } from "@/hooks/useClientWeeksData";
import { useClientsData } from "@/hooks/useClientsData";

// ─── Monthly spend + fee per deliverable ─────────────────────────────────────

export interface ClientMonthlySpendEntry {
  month: string;          // YYYY-MM
  monthLabel: string;     // "Apr '26"
  totalSpend: number;
  ftSpend: number;
  ftPct: number;          // 0–100
  costPerDeliverable: number;
  deliverables: number;
}

function processMonthlySpend(
  findClientMonths: Array<{
    name: string;
    client: { name: string } | null;
    totalSpend: number | null;
    fireTeamSpend: number | null;
    pricingPlanMonths: Array<{
      costPerDeliverable: number | null;
      deliverablesShipped: number | null;
      revenue: number | null;
    }> | null;
  }>
): Record<string, ClientMonthlySpendEntry[]> {
  const now = new Date();
  const currentMonthStr = format(now, "yyyy-MM");

  const grouped: Record<string, ClientMonthlySpendEntry[]> = {};

  findClientMonths.forEach((cm) => {
    const monthMatch = cm.name?.match(/^(\d{4}-\d{2})/);
    const monthStr = monthMatch ? monthMatch[1] : "";
    const clientName = cm.client?.name?.trim();
    if (!monthStr || !clientName) return;
    // Exclude future months
    if (monthStr > currentMonthStr) return;

    const totalSpend = Number(cm.totalSpend) || 0;
    const ftSpend = Number(cm.fireTeamSpend) || 0;
    const ftPct = totalSpend > 0 ? (ftSpend / totalSpend) * 100 : 0;

    const ppm = cm.pricingPlanMonths?.[0];
    const rawCpd = ppm?.costPerDeliverable ?? 0;
    const deliverables = ppm?.deliverablesShipped ?? 0;
    const revenue = ppm?.revenue ?? 0;
    const costPerDeliverable = rawCpd > 0
      ? rawCpd
      : (deliverables > 0 && revenue > 0 ? revenue / deliverables : 0);

    let monthLabel = monthStr;
    try {
      monthLabel = format(parseISO(`${monthStr}-01`), "MMM ''yy");
    } catch { /* keep raw */ }

    if (!grouped[clientName]) grouped[clientName] = [];

    grouped[clientName].push({
      month: monthStr,
      monthLabel,
      totalSpend,
      ftSpend,
      ftPct: Math.round(ftPct * 10) / 10,
      costPerDeliverable: Math.round(costPerDeliverable),
      deliverables,
    });
  });

  // Sort chronologically, keep last 6 months
  Object.keys(grouped).forEach((client) => {
    grouped[client].sort((a, b) => a.month.localeCompare(b.month));
    if (grouped[client].length > 6) {
      grouped[client] = grouped[client].slice(-6);
    }
  });

  return grouped;
}

// ─── Per-client monthly win rates (MoM change) ───────────────────────────────

export interface ClientWinRate {
  current: number | null;    // this month, 0–100
  previous: number | null;   // last month, 0–100
  change: number | null;     // percentage-point change
  allTime: number | null;    // all-time win rate, 0–100
}

interface RawWinnersProject {
  client: { name: string } | null;
  doneDate: string | null;
  status: { name: string } | null;
  internalVersions: Array<{
    winnerDate: string | null;
    tags: Array<{ name: string }> | null;
  }> | null;
}

function computeMonthlyWinRates(
  projects: RawWinnersProject[]
): Record<string, ClientWinRate> {
  const now = new Date();
  const thisMonth = format(now, "yyyy-MM");
  const lastMonth = format(subMonths(now, 1), "yyyy-MM");

  // bucket by client → month → { total, winners }
  const stats: Record<string, Record<string, { total: number; winners: number }>> = {};
  const allTime: Record<string, { total: number; winners: number }> = {};

  const TRACKING_START = "2025-09-01";

  projects.forEach((p) => {
    if (!p.client?.name) return;
    const isComplete = !!p.doneDate || p.status?.name === "Completed";
    if (!isComplete) return;
    if (!p.doneDate || p.doneDate < TRACKING_START) return;

    const clientName = p.client.name;
    const month = p.doneDate.substring(0, 7);
    const isWinner = p.internalVersions?.some(
      (v) => v.tags?.some((t) => t.name?.startsWith("Winner - "))
    ) ?? false;

    // All-time
    if (!allTime[clientName]) allTime[clientName] = { total: 0, winners: 0 };
    allTime[clientName].total++;
    if (isWinner) allTime[clientName].winners++;

    // Monthly
    if (!stats[clientName]) stats[clientName] = {};
    if (!stats[clientName][month]) stats[clientName][month] = { total: 0, winners: 0 };
    stats[clientName][month].total++;
    if (isWinner) stats[clientName][month].winners++;
  });

  const result: Record<string, ClientWinRate> = {};

  const allClients = new Set([...Object.keys(stats), ...Object.keys(allTime)]);

  allClients.forEach((client) => {
    const cur = stats[client]?.[thisMonth];
    const prev = stats[client]?.[lastMonth];
    const at = allTime[client];

    const current = cur && cur.total > 0 ? Math.round((cur.winners / cur.total) * 100) : null;
    const previous = prev && prev.total > 0 ? Math.round((prev.winners / prev.total) * 100) : null;
    const change = current !== null && previous !== null ? current - previous : null;
    const allTimeRate = at && at.total > 0 ? Math.round((at.winners / at.total) * 100) : null;

    result[client] = { current, previous, change, allTime: allTimeRate };
  });

  return result;
}

// ─── Main hook ───────────────────────────────────────────────────────────────

export function useAccountsData() {
  const { data: clientMonthsData, isLoading: monthsLoading, error: monthsError } = useClientMonthsData();
  const { data: clientWeeksData, isLoading: weeksLoading } = useProcessedClientWeeks();
  const { data: clientsData, isLoading: clientsLoading } = useClientsData();

  const winnersQuery = useQuery({
    queryKey: ["fibery", "winners"],
    // Reuses cached data from the Winners page if already loaded
    queryFn: () => queryFibery<{ findProjects: RawWinnersProject[] }>("winners"),
    staleTime: 5 * 60 * 1000,
  });

  const monthlySpend = useMemo(() => {
    if (!clientMonthsData?.findClientMonths) return {};
    return processMonthlySpend(clientMonthsData.findClientMonths);
  }, [clientMonthsData]);

  const winRates = useMemo(() => {
    if (!winnersQuery.data?.findProjects) return {};
    return computeMonthlyWinRates(winnersQuery.data.findProjects);
  }, [winnersQuery.data]);

  // Client lists: active first, then inactive
  const { activeClients, inactiveClients } = useMemo(() => {
    const activeSet = new Set<string>();
    const inactiveSet = new Set<string>();

    if (clientsData?.findClients) {
      clientsData.findClients.forEach((c) => {
        const name = c.name?.trim();
        if (!name) return;
        if (c.status?.name?.toLowerCase() === "active") {
          activeSet.add(name);
        } else if (c.status?.name?.toLowerCase() !== "retired") {
          inactiveSet.add(name);
        }
      });
    }

    // Internal accounts that should never appear as clients
    const EXCLUDED = new Set(["Fireteam", "FireTeam", "Fire Team"]);

    // Only include clients that have any data
    const hasData = (name: string) =>
      !!monthlySpend[name] ||
      !!clientWeeksData[name] ||
      !!winRates[name];

    const active = Array.from(activeSet)
      .filter((name) => !EXCLUDED.has(name) && hasData(name))
      .sort((a, b) => a.localeCompare(b));

    const inactive = Array.from(inactiveSet)
      .filter((name) => !EXCLUDED.has(name) && hasData(name))
      .sort((a, b) => a.localeCompare(b));

    return { activeClients: active, inactiveClients: inactive };
  }, [clientsData, monthlySpend, clientWeeksData, winRates]);

  return {
    monthlySpend,
    weeklyFT: clientWeeksData,
    winRates,
    activeClients,
    inactiveClients,
    isLoading: monthsLoading || weeksLoading || clientsLoading || winnersQuery.isLoading,
    error: monthsError ?? winnersQuery.error,
  };
}
