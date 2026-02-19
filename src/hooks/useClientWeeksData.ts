import { useQuery } from "@tanstack/react-query";
import { queryFibery, ClientWeeksResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { format, parseISO, addDays } from "date-fns";

export interface ProcessedClientWeek {
  weekLabel: string;
  agencyPercent: number;
  agencySpend: number;
  totalSpend: number;
  weekStart: string; // ISO date string for sorting
}

export interface ClientWeekGroup {
  clientName: string;
  weeks: ProcessedClientWeek[];
}

// Hook for raw Client Weeks data
export function useClientWeeksData() {
  return useQuery({
    queryKey: ["fibery-client-weeks"],
    queryFn: () => queryFibery<ClientWeeksResponse>("client-weeks"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// Process and group client weeks by client, last 5 weeks per client
export function useProcessedClientWeeks(): {
  data: Record<string, ProcessedClientWeek[]>;
  isLoading: boolean;
  error: Error | null;
} {
  const { data: rawData, isLoading, error } = useClientWeeksData();

  const processed = useMemo(() => {
    if (!rawData?.findClientWeeks) return {};

    // Debug: log raw dateRange and week info before any processing
    console.log("[ClientWeeks] Raw response count:", rawData.findClientWeeks.length);
    rawData.findClientWeeks.forEach((cw) => {
      console.log("[ClientWeeks RAW]", {
        client: cw.client?.name,
        "dateRange.start": cw.dateRange?.start,
        "dateRange.end": cw.dateRange?.end,
        "week.name": cw.week?.name,
        "week.isoWeeknum": cw.week?.isoWeeknum,
        "week.current": cw.week?.current,
        totalSpend: cw.totalSpend,
        agencySpend: cw.agencySpend,
      });
    });

    // Deduplicate: keep only one record per client per isoWeeknum
    // Use a Map keyed by "clientName|isoWeeknum" to detect duplicates
    const deduped = new Map<string, typeof rawData.findClientWeeks[number]>();
    rawData.findClientWeeks.forEach((cw) => {
      const clientName = cw.client?.name?.trim();
      if (!clientName) return;
      const weekNum = cw.week?.isoWeeknum;
      const key = `${clientName}|${weekNum ?? cw.dateRange?.start ?? "unknown"}`;
      // Keep the first occurrence (ordered by ASC from API)
      if (!deduped.has(key)) {
        deduped.set(key, cw);
      }
    });

    console.log("[ClientWeeks] After dedup:", deduped.size, "records (from", rawData.findClientWeeks.length, "raw)");

    const grouped: Record<string, ProcessedClientWeek[]> = {};

    deduped.forEach((cw) => {
      const clientName = cw.client?.name?.trim();
      if (!clientName) return;

      const totalSpend = cw.totalSpend ?? 0;
      const agencySpendRaw = cw.agencySpend ?? 0;
      const agencyPercent = agencySpendRaw * 100;
      const agencyDollars = totalSpend > 0 ? agencySpendRaw * totalSpend : 0;

      const weekStart = cw.dateRange?.start ?? "";
      let weekLabel = "Unknown";
      if (weekStart) {
        try {
          const start = parseISO(weekStart);
          const end = addDays(start, 6);
          weekLabel = `${format(start, "MMM d")}–${format(end, "d")}`;
        } catch {
          weekLabel = weekStart;
        }
      }

      if (!grouped[clientName]) {
        grouped[clientName] = [];
      }

      grouped[clientName].push({
        weekLabel,
        agencyPercent: Math.round(agencyPercent * 100) / 100,
        agencySpend: Math.round(agencyDollars),
        totalSpend: Math.round(totalSpend),
        weekStart,
      });
    });

    // Sort each client's weeks by dateRange.start (chronological) and take last 5
    Object.keys(grouped).forEach((client) => {
      grouped[client].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      if (grouped[client].length > 5) {
        grouped[client] = grouped[client].slice(-5);
      }
    });

    // Debug: log processed data for active clients
    const activeClients = ["Rejuvia", "FabFitFun", "Bambu Earth", "Adapt Naturals"];
    activeClients.forEach(name => {
      if (grouped[name]) {
        console.log(`[ClientWeeks] ${name}:`, grouped[name]);
      }
    });

    return grouped;
  }, [rawData]);

  return { data: processed, isLoading, error: error as Error | null };
}
