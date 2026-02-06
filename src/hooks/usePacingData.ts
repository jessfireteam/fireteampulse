import { useQuery } from "@tanstack/react-query";
import { queryFibery, ProjectPacingResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { parseISO, startOfMonth, endOfMonth, getDaysInMonth, getDate, format, subMonths } from "date-fns";

export interface PacingMetric {
  currentCount: number;
  previousCount: number;
  projectedTotal: number;
  pacingDiff: number; // positive = ahead, negative = behind
  percentOfPrevious: number;
  previousMonthLabel: string;
}

export interface PacingData {
  created: PacingMetric;
  shipped: PacingMetric;
  isLoading: boolean;
  error: Error | null;
}

function useProjectPacing() {
  return useQuery({
    queryKey: ["fibery-project-pacing"],
    queryFn: () => queryFibery<ProjectPacingResponse>("project-pacing"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function usePacingData(): PacingData {
  const { data, isLoading, error } = useProjectPacing();

  const result = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));

    const dayOfMonth = getDate(now);
    const totalDaysInMonth = getDaysInMonth(now);
    const percentThroughMonth = dayOfMonth / totalDaysInMonth;

    const previousMonthLabel = format(prevMonthStart, "MMMM");

    const projects = data?.findProjects || [];

    // Count created
    let createdCurrent = 0;
    let createdPrevious = 0;
    let shippedCurrent = 0;
    let shippedPrevious = 0;

    projects.forEach((p) => {
      // Creation date counting
      if (p.creationDate) {
        const created = parseISO(p.creationDate);
        if (created >= currentMonthStart && created <= currentMonthEnd) {
          createdCurrent++;
        } else if (created >= prevMonthStart && created <= prevMonthEnd) {
          createdPrevious++;
        }
      }

      // Shipped date counting
      if (p.shippedDay?.date) {
        const shipped = parseISO(p.shippedDay.date);
        if (shipped >= currentMonthStart && shipped <= currentMonthEnd) {
          shippedCurrent++;
        } else if (shipped >= prevMonthStart && shipped <= prevMonthEnd) {
          shippedPrevious++;
        }
      }
    });

    const buildMetric = (current: number, previous: number): PacingMetric => {
      const projectedTotal = percentThroughMonth > 0
        ? Math.round(current / percentThroughMonth)
        : 0;
      const pacingDiff = projectedTotal - previous;
      const percentOfPrevious = previous > 0
        ? Math.round((current / previous) * 100)
        : current > 0 ? 100 : 0;

      return {
        currentCount: current,
        previousCount: previous,
        projectedTotal,
        pacingDiff,
        percentOfPrevious,
        previousMonthLabel,
      };
    };

    return {
      created: buildMetric(createdCurrent, createdPrevious),
      shipped: buildMetric(shippedCurrent, shippedPrevious),
    };
  }, [data]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
  };
}
