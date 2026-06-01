// src/hooks/useForecastData.ts
import { useMemo } from "react";
import { useTasksData, useProjectsData, processTasksForCapacity } from "@/hooks/useFiberyData";
import { computeRolePeaks, computeTypedCalibration } from "@/lib/forecast/calibration";
import { computeClientHistory } from "@/lib/forecast/history";
import { HISTORY_MONTHS, type ClientHistory, type RolePeaks, type TypedCalibration } from "@/lib/forecast/types";

const CALIBRATION_WINDOW_WEEKS = 12;

export interface ForecastData {
  peaks: RolePeaks;
  typedCalibration: TypedCalibration;
  histories: ClientHistory[];
  isLoading: boolean;
  error: unknown;
}

export function useForecastData(): ForecastData {
  const tasksQuery = useTasksData();
  const projectsQuery = useProjectsData();

  return useMemo(() => {
    const now = new Date();
    const tasks = tasksQuery.data?.findProjectSpecificTasks ?? [];
    const projects = projectsQuery.data?.findProjects ?? [];

    const roleGroups = processTasksForCapacity(tasks, "all");
    const peaks = computeRolePeaks(roleGroups);
    const typedCalibration = computeTypedCalibration(tasks, projects, now, CALIBRATION_WINDOW_WEEKS);
    const histories = computeClientHistory(projects, now, HISTORY_MONTHS);

    return {
      peaks,
      typedCalibration,
      histories,
      isLoading: tasksQuery.isLoading || projectsQuery.isLoading,
      error: tasksQuery.error ?? projectsQuery.error,
    };
  }, [tasksQuery.data, projectsQuery.data, tasksQuery.isLoading, projectsQuery.isLoading, tasksQuery.error, projectsQuery.error]);
}
