import { useQuery } from "@tanstack/react-query";
import {
  queryFibery,
  PROJECTS_QUERY,
  TASKS_QUERY,
  CLIENT_MONTHS_QUERY,
  ProjectsResponse,
  TasksResponse,
  ClientMonthsResponse,
  Project,
  Task,
  ClientMonth,
} from "@/lib/fibery";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  isWithinInterval,
  parseISO,
  format,
  addDays,
  isAfter,
  isBefore,
} from "date-fns";

// Hook for Projects data
export function useProjectsData() {
  return useQuery({
    queryKey: ["fibery-projects"],
    queryFn: () => queryFibery<ProjectsResponse>("projects", PROJECTS_QUERY),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

// Hook for Tasks data
export function useTasksData() {
  return useQuery({
    queryKey: ["fibery-tasks"],
    queryFn: () => queryFibery<TasksResponse>("projects", TASKS_QUERY),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// Hook for Client Months data
export function useClientMonthsData() {
  return useQuery({
    queryKey: ["fibery-client-months"],
    queryFn: () => queryFibery<ClientMonthsResponse>("stats", CLIENT_MONTHS_QUERY),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// Process projects data for Agency Heartbeat
export function processProjectsForHeartbeat(projects: Project[]) {
  const now = new Date();
  const sixMonthsAgo = subMonths(now, 6);

  console.log('[Heartbeat] Processing projects, total count:', projects.length);
  console.log('[Heartbeat] Current date:', now.toISOString());
  console.log('[Heartbeat] Six months ago:', sixMonthsAgo.toISOString());

  // Filter to last 6 months
  const recentProjects = projects.filter((p) => {
    if (!p.doneDate) return false;
    const date = parseISO(p.doneDate);
    const isRecent = date >= sixMonthsAgo && date <= now;
    return isRecent;
  });

  console.log('[Heartbeat] Recent projects (last 6 months):', recentProjects.length);
  if (recentProjects.length > 0) {
    console.log('[Heartbeat] Sample project doneDates:', recentProjects.slice(0, 5).map(p => p.doneDate));
  }

  // Group by week and client
  const weeklyData: Record<string, Record<string, number>> = {};
  const clients = new Set<string>();

  recentProjects.forEach((project) => {
    if (!project.doneDate) return;
    const date = parseISO(project.doneDate);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekKey = format(weekStart, "yyyy-MM-dd");
    const clientName = project.client?.name || "Unknown";

    clients.add(clientName);

    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = {};
    }
    weeklyData[weekKey][clientName] = (weeklyData[weekKey][clientName] || 0) + 1;
  });

  // Convert to chart format
  const chartData = Object.entries(weeklyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, clientCounts]) => ({
      week: format(parseISO(week), "MMM d"),
      ...clientCounts,
    }));

  // Calculate KPIs - use current month
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  console.log('[Heartbeat] This month range:', thisMonthStart.toISOString(), 'to', thisMonthEnd.toISOString());

  const projectsThisMonth = recentProjects.filter((p) => {
    if (!p.doneDate) return false;
    const date = parseISO(p.doneDate);
    const inMonth = isWithinInterval(date, { start: thisMonthStart, end: thisMonthEnd });
    return inMonth;
  });

  console.log('[Heartbeat] Projects this month:', projectsThisMonth.length);
  if (projectsThisMonth.length > 0) {
    console.log('[Heartbeat] This month project dates:', projectsThisMonth.map(p => p.doneDate));
  }

  const activeClients = new Set(
    projectsThisMonth.map((p) => p.client?.name).filter(Boolean)
  ).size;

  const weeksCount = Object.keys(weeklyData).length || 1;
  const weeklyAverage = Math.round(recentProjects.length / weeksCount);

  return {
    chartData,
    clients: Array.from(clients),
    kpis: {
      projectsThisMonth: projectsThisMonth.length,
      activeClients,
      weeklyAverage,
    },
  };
}

// Process tasks data for Team Capacity - simplified version
export function processTasksForCapacity(tasks: Task[], roleFilter: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const last7Days = subDays(today, 7);
  const last30Days = subDays(today, 30);
  const next7Days = addDays(today, 7);
  const next30Days = addDays(today, 30);

  // Debug logging
  console.log('[Capacity] Today:', now.toISOString());
  console.log('[Capacity] Date ranges:', {
    last7Days: last7Days.toISOString(),
    last30Days: last30Days.toISOString(),
    next7Days: next7Days.toISOString(),
    next30Days: next30Days.toISOString(),
  });

  // Log done tasks
  const doneTasks = tasks.filter(t => t.done && t.doneDate);
  console.log('[Capacity] Done tasks count:', doneTasks.length);
  console.log('[Capacity] Sample done task dates:', doneTasks.slice(0, 10).map(t => ({
    name: t.name,
    doneDate: t.doneDate,
    assignee: t.assignee?.name
  })));

  // Log pending tasks with due dates
  const pendingWithDue = tasks.filter(t => t.done === false && t.dueDate);
  console.log('[Capacity] Pending tasks with dueDate:', pendingWithDue.length);
  console.log('[Capacity] Sample pending task dates:', pendingWithDue.slice(0, 10).map(t => ({
    name: t.name,
    dueDate: t.dueDate,
    assignee: t.assignee?.name
  })));

  // Filter by role if specified
  let filteredTasks = tasks;
  if (roleFilter === "video") {
    filteredTasks = tasks.filter((t) =>
      t.taskTemplateRole?.name?.includes("Video Editor (VE)")
    );
  } else if (roleFilter === "design") {
    filteredTasks = tasks.filter((t) =>
      t.taskTemplateRole?.name?.includes("Graphic Designer (GD)")
    );
  }

  // Group by assignee
  const assigneeData: Record<
    string,
    {
      completedLastWeek: number;
      completedLastMonth: number;
      assignedThisWeek: number;
      assignedThisMonth: number;
    }
  > = {};

  filteredTasks.forEach((task) => {
    const assigneeName = task.assignee?.name || "Unassigned";

    if (!assigneeData[assigneeName]) {
      assigneeData[assigneeName] = {
        completedLastWeek: 0,
        completedLastMonth: 0,
        assignedThisWeek: 0,
        assignedThisMonth: 0,
      };
    }

    // Completed tasks
    if (task.done && task.doneDate) {
      const doneDate = new Date(task.doneDate);
      if (doneDate >= last7Days && doneDate <= today) {
        assigneeData[assigneeName].completedLastWeek++;
      }
      if (doneDate >= last30Days && doneDate <= today) {
        assigneeData[assigneeName].completedLastMonth++;
      }
    }

    // Assigned (not done) tasks
    if (!task.done && task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (dueDate >= todayStart && dueDate <= next7Days) {
        assigneeData[assigneeName].assignedThisWeek++;
      }
      if (dueDate >= todayStart && dueDate <= next30Days) {
        assigneeData[assigneeName].assignedThisMonth++;
      }
    }
  });

  return Object.entries(assigneeData)
    .filter(([name]) => name !== "Unassigned")
    .map(([name, data]) => ({
      name,
      ...data,
    }))
    .sort((a, b) => (b.completedLastMonth + b.assignedThisMonth) - (a.completedLastMonth + a.assignedThisMonth));
}

// Note: Client Economics processing has been moved to ClientEconomics.tsx
// to use Fibery's pre-calculated costPerDeliverable from pricingPlanMonths