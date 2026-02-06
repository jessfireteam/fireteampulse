import { useQuery } from "@tanstack/react-query";
import { queryFibery, ClientWeeksResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";

export interface ProcessedClientWeek {
  weekLabel: string;
  agencyPercent: number;
  agencySpend: number;
  totalSpend: number;
  isoWeeknum: number;
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

    const grouped: Record<string, ProcessedClientWeek[]> = {};

    rawData.findClientWeeks.forEach((cw) => {
      const clientName = cw.client?.name?.trim();
      if (!clientName) return;

      const totalSpend = cw.totalSpend ?? 0;
      const agencySpend = cw.agencySpend ?? 0;
      const agencyPercent = totalSpend > 0 ? (agencySpend / totalSpend) * 100 : 0;

      let weekLabel = "Unknown";
      if (cw.dateRange?.start) {
        try {
          weekLabel = format(parseISO(cw.dateRange.start), "MMM d");
        } catch {
          weekLabel = cw.dateRange.start;
        }
      }

      if (!grouped[clientName]) {
        grouped[clientName] = [];
      }

      grouped[clientName].push({
        weekLabel,
        agencyPercent: Math.round(agencyPercent * 10) / 10,
        agencySpend,
        totalSpend,
        isoWeeknum: cw.week?.isoWeeknum ?? 0,
      });
    });

    // Sort each client's weeks chronologically and take last 5
    Object.keys(grouped).forEach((client) => {
      grouped[client].sort((a, b) => a.isoWeeknum - b.isoWeeknum);
      if (grouped[client].length > 5) {
        grouped[client] = grouped[client].slice(-5);
      }
    });

    return grouped;
  }, [rawData]);

  return { data: processed, isLoading, error: error as Error | null };
}
