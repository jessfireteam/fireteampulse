import { useQuery } from "@tanstack/react-query";
import { queryFibery, CreatorCostsResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { format, parseISO, subMonths, differenceInDays } from "date-fns";
import { useCreatorWinnerStats, normalizeCreatorName } from "@/hooks/useWinnersData";

export interface CreatorPayment {
  date: string;
  amount: number;
  client: string;
}

export interface CreatorSummary {
  creatorName: string;
  totalPaid: number;
  projectCount: number;
  averagePerProject: number;
  clients: string[];
  lastPaymentDate: string;
  firstPaymentDate: string;
  payments: CreatorPayment[];
  // Winner stats (joined from Fibery contractor records). Null when no match found.
  windex: number | null;
  winningProjects: number;
  totalContributionProjects: number; // projects counted for Windex (may differ from payment count)
  winnerProjectNames: Array<{ name: string; client: string; winnerDate: string | null }>;
  winnerMatched: boolean; // true if name matched a Fibery contractor with ≥1 completed project
}

export interface MonthlyAgencyData {
  monthKey: string;
  monthLabel: string;
  avgPerPayment: number;
  avgPerCreator: number;
  totalSpend: number;
  paymentCount: number;
  uniqueCreators: number;
}

export interface ClientSpendSummary {
  clientName: string;
  totalSpend: number;
}

function useCreatorCostsQuery() {
  return useQuery({
    queryKey: ["fibery-creator-costs"],
    queryFn: () => queryFibery<CreatorCostsResponse>("creator-costs"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export interface CreatorCostsResult {
  creators: CreatorSummary[];
  monthlyTrends: MonthlyAgencyData[];
  clientSpend: ClientSpendSummary[];
  winnerMatchStats: {
    totalCreators: number;
    matchedCreators: number;
    matchRate: number; // 0..1
  };
}

export function useCreatorCostsData() {
  const { data: rawData, isLoading, error } = useCreatorCostsQuery();
  const { stats: winnerStats, isLoading: winnersLoading } = useCreatorWinnerStats();

  const processed = useMemo<CreatorCostsResult>(() => {
    if (!rawData?.findExpenses) {
      return {
        creators: [],
        monthlyTrends: [],
        clientSpend: [],
        winnerMatchStats: { totalCreators: 0, matchedCreators: 0, matchRate: 0 },
      };
    }

    // Filter out props
    const expenses = rawData.findExpenses.filter(
      (e) => e.name && !e.name.toLowerCase().startsWith("props")
    );

    // Build 12-month range
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 12; i >= 0; i--) {
      const d = subMonths(now, i);
      months.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM ''yy"),
      });
    }

    // Creator aggregation
    const creatorMap = new Map<string, {
      totalPaid: number;
      payments: CreatorPayment[];
      clients: Set<string>;
    }>();

    // Monthly aggregation
    const monthMap = new Map<string, { total: number; count: number; creators: Set<string> }>();
    months.forEach((m) => monthMap.set(m.key, { total: 0, count: 0, creators: new Set() }));

    // Client aggregation
    const clientMap = new Map<string, number>();

    expenses.forEach((exp) => {
      const creatorName = exp.name?.trim();
      if (!creatorName || !exp.date) return;
      const amount = exp.amount ?? 0;
      const clientName = exp.client?.name?.trim() || "Unknown";
      const monthKey = format(parseISO(exp.date), "yyyy-MM");

      // Creator
      if (!creatorMap.has(creatorName)) {
        creatorMap.set(creatorName, { totalPaid: 0, payments: [], clients: new Set() });
      }
      const c = creatorMap.get(creatorName)!;
      c.totalPaid += amount;
      c.payments.push({ date: exp.date, amount, client: clientName });
      c.clients.add(clientName);

      // Monthly
      const monthEntry = monthMap.get(monthKey);
      if (monthEntry) {
        monthEntry.total += amount;
        monthEntry.count++;
        monthEntry.creators.add(creatorName);
      }

      // Client
      clientMap.set(clientName, (clientMap.get(clientName) || 0) + amount);
    });

    // Build creator summaries (joined with winner stats by normalized name)
    let matchedCreators = 0;
    const creators: CreatorSummary[] = Array.from(creatorMap.entries())
      .map(([name, data]) => {
        const sortedPayments = data.payments.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const normalized = normalizeCreatorName(name);
        const ws = winnerStats?.get(normalized);
        const matched = !!ws && ws.totalProjects > 0;
        if (matched) matchedCreators++;
        return {
          creatorName: name,
          totalPaid: data.totalPaid,
          projectCount: data.payments.length,
          averagePerProject: data.payments.length > 0 ? data.totalPaid / data.payments.length : 0,
          clients: Array.from(data.clients),
          lastPaymentDate: sortedPayments[sortedPayments.length - 1]?.date || "",
          firstPaymentDate: sortedPayments[0]?.date || "",
          payments: sortedPayments,
          windex: ws?.windex ?? null,
          winningProjects: ws?.winningProjects ?? 0,
          totalContributionProjects: ws?.totalProjects ?? 0,
          winnerProjectNames: ws?.winnerProjectNames ?? [],
          winnerMatched: matched,
        };
      })
      .sort((a, b) => b.totalPaid - a.totalPaid);

    // Build monthly trends
    const monthlyTrends: MonthlyAgencyData[] = months.map((m) => {
      const entry = monthMap.get(m.key)!;
      return {
        monthKey: m.key,
        monthLabel: m.label,
        avgPerPayment: entry.count > 0 ? entry.total / entry.count : 0,
        avgPerCreator: entry.creators.size > 0 ? entry.total / entry.creators.size : 0,
        totalSpend: entry.total,
        paymentCount: entry.count,
        uniqueCreators: entry.creators.size,
      };
    });

    // Build client spend
    const clientSpend: ClientSpendSummary[] = Array.from(clientMap.entries())
      .map(([clientName, totalSpend]) => ({ clientName, totalSpend }))
      .sort((a, b) => b.totalSpend - a.totalSpend);

    return {
      creators,
      monthlyTrends,
      clientSpend,
      winnerMatchStats: {
        totalCreators: creators.length,
        matchedCreators,
        matchRate: creators.length > 0 ? matchedCreators / creators.length : 0,
      },
    };
  }, [rawData, winnerStats]);

  return {
    ...processed,
    isLoading: isLoading || winnersLoading,
    error: error as Error | null,
  };
}

export function formatRelativeDate(dateStr: string): string {
  const days = differenceInDays(new Date(), parseISO(dateStr));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
