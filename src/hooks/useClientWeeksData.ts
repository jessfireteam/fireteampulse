import { useQuery } from "@tanstack/react-query";
import { queryFibery, ClientWeeksResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";

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

    // Debug: log raw response
    console.log("[ClientWeeks] Raw response count:", rawData.findClientWeeks.length);
    console.log("[ClientWeeks] Sample records:", rawData.findClientWeeks.slice(0, 5));
    console.log("[ClientWeeks] Client names:", [...new Set(rawData.findClientWeeks.map(cw => cw.client?.name))]);

    const grouped: Record<string, ProcessedClientWeek[]> = {};

    rawData.findClientWeeks.forEach((cw) => {
      const clientName = cw.client?.name?.trim();
      if (!clientName) return;

      const totalSpend = cw.totalSpend ?? 0;
      // agencySpend from Fibery is already a percentage as a decimal (e.g., 0.554 = 0.554%)
      const agencySpendRaw = cw.agencySpend ?? 0;
      // Convert to display percentage
      const agencyPercent = agencySpendRaw * 100;
      // Calculate the actual dollar amount of agency spend
      const agencyDollars = totalSpend > 0 ? (agencySpendRaw / 100) * totalSpend : 0;

      const weekStart = cw.dateRange?.start ?? "";
      let weekLabel = "Unknown";
      if (weekStart) {
        try {
          weekLabel = format(parseISO(weekStart), "MMM d");
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
