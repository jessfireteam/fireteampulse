// src/hooks/useForecastData.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryFibery, type ProjectCompletionsResponse } from "@/lib/fibery";
import { useTasksData, processTasksForCapacity } from "@/hooks/useFiberyData";
import { useClientsData } from "@/hooks/useClientsData";
import { activeClientNames, filterActiveHistories } from "@/lib/forecast/activeClients";
import { computeRolePeaks } from "@/lib/forecast/calibration";
import { computeClientHistory } from "@/lib/forecast/history";
import { HISTORY_MONTHS, type ClientHistory, type RolePeaks } from "@/lib/forecast/types";

export interface ForecastData {
  peaks: RolePeaks;
  histories: ClientHistory[];
  isLoading: boolean;
  error: unknown;
}

export function useForecastData(): ForecastData {
  const tasksQuery = useTasksData();
  const projectsQuery = useQuery({
    queryKey: ["fibery-project-completions"],
    queryFn: () => queryFibery<ProjectCompletionsResponse>("project-completions"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
  const clientsQuery = useClientsData();

  return useMemo(() => {
    const now = new Date();
    const tasks = tasksQuery.data?.findProjectSpecificTasks ?? [];
    const projects = projectsQuery.data?.findProjects ?? [];
    const clients = clientsQuery.data?.findClients ?? [];

    const roleGroups = processTasksForCapacity(tasks, "all");
    const peaks = computeRolePeaks(roleGroups);
    const rawHistories = computeClientHistory(projects, now, HISTORY_MONTHS);
    const active = activeClientNames(clients);
    const histories = filterActiveHistories(rawHistories, active);

    return {
      peaks,
      histories,
      isLoading: tasksQuery.isLoading || projectsQuery.isLoading || clientsQuery.isLoading,
      error: tasksQuery.error ?? projectsQuery.error ?? clientsQuery.error,
    };
  }, [tasksQuery.data, projectsQuery.data, clientsQuery.data, tasksQuery.isLoading, projectsQuery.isLoading, clientsQuery.isLoading, tasksQuery.error, projectsQuery.error, clientsQuery.error]);
}
