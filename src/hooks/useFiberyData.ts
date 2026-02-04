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

// Process tasks data for Team Capacity
export function processTasksForCapacity(tasks: Task[], roleFilter: string) {
  const now = new Date();
  const lastWeekStart = subDays(now, 7);
  const lastMonthStart = subDays(now, 30);
  const nextWeekEnd = addDays(now, 7);
  const nextMonthEnd = addDays(now, 30);

  console.log('[Capacity] Processing tasks, total count:', tasks.length);
  console.log('[Capacity] Current date:', now.toISOString());
  console.log('[Capacity] Last week start:', lastWeekStart.toISOString());
  console.log('[Capacity] Last month start:', lastMonthStart.toISOString());

  // Log sample task dates
  const completedTasks = tasks.filter(t => t.done && t.doneDate);
  console.log('[Capacity] Total completed tasks with doneDate:', completedTasks.length);
  if (completedTasks.length > 0) {
    console.log('[Capacity] Sample completed task doneDates:', completedTasks.slice(0, 10).map(t => ({ 
      name: t.name, 
      doneDate: t.doneDate,
      assignee: t.assignee?.name 
    })));
  }

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

  console.log('[Capacity] Filtered tasks count:', filteredTasks.length);

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

    // Completed tasks - check if doneDate is within the range
    if (task.done && task.doneDate) {
      try {
        const doneDate = parseISO(task.doneDate);
        
        // Check if completed in last 7 days
        if (isAfter(doneDate, lastWeekStart) && isBefore(doneDate, now)) {
          assigneeData[assigneeName].completedLastWeek++;
        }
        
        // Check if completed in last 30 days
        if (isAfter(doneDate, lastMonthStart) && isBefore(doneDate, now)) {
          assigneeData[assigneeName].completedLastMonth++;
        }
      } catch (e) {
        console.error('[Capacity] Error parsing doneDate:', task.doneDate, e);
      }
    }

    // Assigned (not done) tasks - check dueDate
    if (!task.done && task.dueDate) {
      try {
        const dueDate = parseISO(task.dueDate);
        
        // Check if due in next 7 days
        if (isAfter(dueDate, now) && isBefore(dueDate, nextWeekEnd)) {
          assigneeData[assigneeName].assignedThisWeek++;
        }
        
        // Check if due in next 30 days
        if (isAfter(dueDate, now) && isBefore(dueDate, nextMonthEnd)) {
          assigneeData[assigneeName].assignedThisMonth++;
        }
      } catch (e) {
        console.error('[Capacity] Error parsing dueDate:', task.dueDate, e);
      }
    }
  });

  console.log('[Capacity] Assignee data:', assigneeData);

  // Convert to array and sort
  return Object.entries(assigneeData)
    .filter(([name]) => name !== "Unassigned")
    .map(([name, data]) => ({
      name,
      ...data,
    }))
    .sort((a, b) => b.assignedThisWeek - a.assignedThisWeek);
}

// Process client months for Client Economics
export function processClientMonths(clientMonths: ClientMonth[]) {
  console.log('[Economics] Processing client months, total count:', clientMonths.length);
  if (clientMonths.length > 0) {
    console.log('[Economics] Sample client month data:', clientMonths.slice(0, 3));
  }

  const processed = clientMonths
    .map((cm) => {
      const costPerDeliverable =
        cm.actualDeliverables && cm.actualDeliverables > 0
          ? (cm.fireTeamSpend || 0) / cm.actualDeliverables
          : null;

      let flag: "over" | "normal" | "under" | null = null;
      if (costPerDeliverable !== null) {
        if (costPerDeliverable < 1000) flag = "over";
        else if (costPerDeliverable > 2000) flag = "under";
        else flag = "normal";
      }

      // Extract month from name (format: "2025-01 - ClientName") or use month.name
      const monthMatch = cm.name?.match(/^(\d{4}-\d{2})/);
      const monthStr = monthMatch ? monthMatch[1] : cm.month?.name || "";

      return {
        id: cm.id,
        client: cm.client?.name || "Unknown",
        month: monthStr,
        totalSpend: cm.totalSpend || 0,
        fireTeamSpend: cm.fireTeamSpend || 0,
        actualDeliverables: cm.actualDeliverables || 0,
        scopedDeliverables: cm.scopedDeliverables || 0,
        costPerDeliverable,
        flag,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));

  console.log('[Economics] Processed data:', processed.slice(0, 5));

  // Get unique clients for filter
  const clients = Array.from(new Set(processed.map((p) => p.client))).sort();

  // Prepare line chart data
  const chartDataMap: Record<string, Record<string, number>> = {};
  processed.forEach((item) => {
    if (!item.month || item.costPerDeliverable === null) return;
    if (!chartDataMap[item.month]) {
      chartDataMap[item.month] = {};
    }
    chartDataMap[item.month][item.client] = item.costPerDeliverable;
  });

  const chartData = Object.entries(chartDataMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, clientData]) => {
      try {
        return {
          month: format(parseISO(`${month}-01`), "MMM yyyy"),
          ...clientData,
        };
      } catch (e) {
        console.error('[Economics] Error parsing month:', month, e);
        return { month, ...clientData };
      }
    });

  console.log('[Economics] Chart data:', chartData);

  return {
    tableData: processed,
    chartData,
    clients,
  };
}