import { useQuery } from "@tanstack/react-query";
import { queryFibery, ProjectCompletionsResponse, ProjectUpcomingResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { format, parseISO, subMonths } from "date-fns";

export interface MonthDeliverables {
  monthKey: string; // "2026-01"
  monthLabel: string; // "Jan '26"
  count: number; // completed projects
  scheduledCount: number; // due but not yet done (current month only)
}

export interface ClientDeliverables {
  clientName: string;
  months: MonthDeliverables[];
}

function useProjectCompletions() {
  return useQuery({
    queryKey: ["fibery-project-completions"],
    queryFn: () => queryFibery<ProjectCompletionsResponse>("project-completions"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

function useProjectUpcoming() {
  return useQuery({
    queryKey: ["fibery-project-upcoming"],
    queryFn: () => queryFibery<ProjectUpcomingResponse>("project-upcoming"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function useDeliverablesData(): {
  data: Record<string, ClientDeliverables>;
  isLoading: boolean;
  error: Error | null;
} {
  const { data: completionsData, isLoading: compLoading, error: compError } = useProjectCompletions();
  const { data: upcomingData, isLoading: upLoading, error: upError } = useProjectUpcoming();

  const isLoading = compLoading || upLoading;
  const error = compError || upError;

  const processed = useMemo(() => {
    const result: Record<string, ClientDeliverables> = {};

    // Build the last 5 months including current month
    const now = new Date();
    const currentMonthKey = format(now, "yyyy-MM");
    const months: { key: string; label: string }[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = subMonths(now, i);
      months.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM ''yy"),
      });
    }

    const ensureClient = (clientName: string) => {
      if (!result[clientName]) {
        result[clientName] = {
          clientName,
          months: months.map((m) => ({
            monthKey: m.key,
            monthLabel: m.label,
            count: 0,
            scheduledCount: 0,
          })),
        };
      }
    };

    // Process completed projects
    if (completionsData?.findProjects) {
      completionsData.findProjects.forEach((p) => {
        const clientName = p.client?.name?.trim();
        if (!clientName || !p.doneDate) return;

        const monthKey = format(parseISO(p.doneDate), "yyyy-MM");

        // Only include if within last 5 months
        if (!months.some((m) => m.key === monthKey)) return;

        ensureClient(clientName);

        const monthEntry = result[clientName].months.find((m) => m.monthKey === monthKey);
        if (monthEntry) {
          monthEntry.count++;
        }
      });
    }

    // Process upcoming/scheduled projects → add to current month's scheduledCount
    if (upcomingData?.findProjects) {
      upcomingData.findProjects.forEach((p) => {
        const clientName = p.client?.name?.trim();
        if (!clientName) return;

        ensureClient(clientName);

        const currentMonthEntry = result[clientName].months.find(
          (m) => m.monthKey === currentMonthKey
        );
        if (currentMonthEntry) {
          currentMonthEntry.scheduledCount++;
        }
      });
    }

    return result;
  }, [completionsData, upcomingData]);

  return { data: processed, isLoading, error: error as Error | null };
}
