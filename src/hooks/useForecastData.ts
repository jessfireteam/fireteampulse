// src/hooks/useForecastData.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryFibery, type ProjectCompletionsResponse } from "@/lib/fibery";
import { useTasksData, processTasksForCapacity } from "@/hooks/useFiberyData";
import { useClientsData, useClientPlansData } from "@/hooks/useClientsData";
import { activeClientNames, filterActiveHistories } from "@/lib/forecast/activeClients";
import { computeRolePeaks } from "@/lib/forecast/calibration";
import { computeClientHistory } from "@/lib/forecast/history";
import { deriveClientPlans } from "@/lib/forecast/plan";
import { HISTORY_MONTHS, type ClientHistory, type ClientPlan, type RolePeaks } from "@/lib/forecast/types";

export interface ForecastData {
  peaks: RolePeaks;
  /** Read-only trailing actuals, shown left of the editable months. */
  histories: ClientHistory[];
  /** Current per-client plan derived from Fibery; drives the editable months. */
  plans: ClientPlan[];
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
  const clientPlansQuery = useClientPlansData();

  return useMemo(() => {
    const now = new Date();
    const tasks = tasksQuery.data?.findProjectSpecificTasks ?? [];
    const projects = projectsQuery.data?.findProjects ?? [];
    const clients = clientsQuery.data?.findClients ?? [];
    const planRows = clientPlansQuery.data?.findClients ?? [];

    const roleGroups = processTasksForCapacity(tasks, "all");
    const peaks = computeRolePeaks(roleGroups);
    const rawHistories = computeClientHistory(projects, now, HISTORY_MONTHS);
    const active = activeClientNames(clients);
    const histories = filterActiveHistories(rawHistories, active);
    // Roster comes from the active client list, not from who shipped recently, so a newly
    // signed client with a Max and no completed projects yet still appears. Min/Max ride in
    // from a separate query; if it failed, every max is null and plans fall back to
    // run-rate, which is the behaviour that existed before this was wired up.
    const planByName = new Map(
      planRows.filter((r) => r.name).map((r) => [r.name!.trim().toLowerCase(), r]),
    );
    const withPlans = clients.map((c) => {
      const row = c.name ? planByName.get(c.name.trim().toLowerCase()) : undefined;
      return {
        ...c,
        maxDeliverablesPerMonth: row?.maxDeliverablesPerMonth ?? null,
        minDeliverablesPerMonth: row?.minDeliverablesPerMonth ?? null,
      };
    });
    const plans = deriveClientPlans(withPlans, histories);

    return {
      peaks,
      histories,
      plans,
      // clientPlansQuery.isLoading is included so the grid doesn't flash run-rate numbers
      // before the plan arrives. Its error deliberately is NOT — a plan-fetch failure
      // degrades to run-rate rather than failing the page.
      isLoading:
        tasksQuery.isLoading ||
        projectsQuery.isLoading ||
        clientsQuery.isLoading ||
        clientPlansQuery.isLoading,
      error: tasksQuery.error ?? projectsQuery.error ?? clientsQuery.error,
    };
  }, [tasksQuery.data, projectsQuery.data, clientsQuery.data, clientPlansQuery.data, tasksQuery.isLoading, projectsQuery.isLoading, clientsQuery.isLoading, clientPlansQuery.isLoading, tasksQuery.error, projectsQuery.error, clientsQuery.error]);
}
