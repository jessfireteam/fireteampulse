// src/hooks/useForecastData.ts
import { useMemo } from "react";
import { useTasksData, useProjectsData, processTasksForCapacity } from "@/hooks/useFiberyData";
import { computeRolePeaks, computeCalibration } from "@/lib/forecast/calibration";
import { computeClientBaselines } from "@/lib/forecast/baseline";
import type { Calibration, ClientBaseline, RolePeaks } from "@/lib/forecast/types";

const CALIBRATION_WINDOW_WEEKS = 12;
const BASELINE_WINDOW_WEEKS = 12;

export interface ForecastData {
  peaks: RolePeaks;
  calibration: Calibration;
  baselines: ClientBaseline[];
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
    const calibration = computeCalibration(tasks, projects, now, CALIBRATION_WINDOW_WEEKS);
    const baselines = computeClientBaselines(projects, now, BASELINE_WINDOW_WEEKS);

    return {
      peaks,
      calibration,
      baselines,
      isLoading: tasksQuery.isLoading || projectsQuery.isLoading,
      error: tasksQuery.error ?? projectsQuery.error,
    };
  }, [tasksQuery.data, projectsQuery.data, tasksQuery.isLoading, projectsQuery.isLoading, tasksQuery.error, projectsQuery.error]);
}
