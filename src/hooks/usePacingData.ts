import { useQuery } from "@tanstack/react-query";
import { queryFibery, ProjectPacingResponse, ShippedTasksResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { parseISO, startOfMonth, endOfMonth, getDaysInMonth, getDate, format, subMonths } from "date-fns";

export interface PacingDayPoint {
  day: number;
  createdCurrent: number | null;
  createdPrevious: number | null;
  shippedCurrent: number | null;
  shippedPrevious: number | null;
}

export interface PacingChartData {
  points: PacingDayPoint[];
  currentMonthLabel: string;
  previousMonthLabel: string;
  totalDaysCurrentMonth: number;
  totalDaysPreviousMonth: number;
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

function useShippedTasks() {
  return useQuery({
    queryKey: ["fibery-shipped-tasks"],
    queryFn: () => queryFibery<ShippedTasksResponse>("shipped-tasks"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function usePacingData(): PacingChartData {
  const { data: pacingData, isLoading: pacingLoading, error: pacingError } = useProjectPacing();
  const { data: shippedData, isLoading: shippedLoading, error: shippedError } = useShippedTasks();

  const isLoading = pacingLoading || shippedLoading;
  const error = pacingError || shippedError;

  const result = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));

    const totalDaysCurrentMonth = getDaysInMonth(now);
    const totalDaysPreviousMonth = getDaysInMonth(subMonths(now, 1));
    const maxDays = Math.max(totalDaysCurrentMonth, totalDaysPreviousMonth);

    const currentMonthLabel = format(now, "MMM");
    const previousMonthLabel = format(subMonths(now, 1), "MMM");

    // Daily buckets for created projects
    const createdCurrentDaily: number[] = new Array(maxDays).fill(0);
    const createdPreviousDaily: number[] = new Array(maxDays).fill(0);

    const projects = pacingData?.findProjects || [];
    projects.forEach((p) => {
      if (!p.creationDate) return;
      const created = parseISO(p.creationDate);
      if (created >= currentMonthStart && created <= currentMonthEnd) {
        const day = getDate(created) - 1;
        if (day < maxDays) createdCurrentDaily[day]++;
      } else if (created >= prevMonthStart && created <= prevMonthEnd) {
        const day = getDate(created) - 1;
        if (day < maxDays) createdPreviousDaily[day]++;
      }
    });

    // Daily buckets for shipped (task-based)
    const shippedCurrentDaily: number[] = new Array(maxDays).fill(0);
    const shippedPreviousDaily: number[] = new Array(maxDays).fill(0);

    // The proxy already filters by task name on Fibery's side; this second pass
    // is a cheap guard so a change there can't silently start counting every
    // done task as a shipped ad.
    const tasks = shippedData?.findProjectSpecificTasks || [];
    const sendAdTasks = tasks.filter((t) =>
      t.name?.toLowerCase().includes("send ad to client")
    );

    sendAdTasks.forEach((t) => {
      if (!t.doneDate) return;
      const done = parseISO(t.doneDate);
      if (done >= currentMonthStart && done <= currentMonthEnd) {
        const day = getDate(done) - 1;
        if (day < maxDays) shippedCurrentDaily[day]++;
      } else if (done >= prevMonthStart && done <= prevMonthEnd) {
        const day = getDate(done) - 1;
        if (day < maxDays) shippedPreviousDaily[day]++;
      }
    });

    // Build cumulative points
    const points: PacingDayPoint[] = [];
    let cumCreatedCurrent = 0;
    let cumCreatedPrevious = 0;
    let cumShippedCurrent = 0;
    let cumShippedPrevious = 0;

    const todayDay = getDate(now); // e.g. 19 for Feb 19

    for (let i = 0; i < maxDays; i++) {
      cumCreatedCurrent += createdCurrentDaily[i];
      cumCreatedPrevious += createdPreviousDaily[i];
      cumShippedCurrent += shippedCurrentDaily[i];
      cumShippedPrevious += shippedPreviousDaily[i];

      const dayNum = i + 1;
      const isFutureCurrentMonth = dayNum > todayDay;

      points.push({
        day: dayNum,
        createdCurrent: isFutureCurrentMonth ? null : cumCreatedCurrent,
        createdPrevious: dayNum > totalDaysPreviousMonth ? null : cumCreatedPrevious,
        shippedCurrent: isFutureCurrentMonth ? null : cumShippedCurrent,
        shippedPrevious: dayNum > totalDaysPreviousMonth ? null : cumShippedPrevious,
      });
    }

    return {
      points,
      currentMonthLabel,
      previousMonthLabel,
      totalDaysCurrentMonth,
      totalDaysPreviousMonth,
    };
  }, [pacingData, shippedData]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
  };
}
