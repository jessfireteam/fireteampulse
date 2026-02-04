import { useQuery } from "@tanstack/react-query";
import {
  queryFibery,
  PROJECTS_QUERY,
  COMPLETED_TASKS_QUERY,
  PENDING_TASKS_QUERY,
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

// Hook for Tasks data - combines completed and pending tasks
export function useTasksData() {
  return useQuery({
    queryKey: ["fibery-tasks"],
    queryFn: async () => {
      // Fetch both queries in parallel
      const [completedRes, pendingRes] = await Promise.all([
        queryFibery<TasksResponse>("projects", COMPLETED_TASKS_QUERY),
        queryFibery<TasksResponse>("projects", PENDING_TASKS_QUERY),
      ]);

      // Combine and deduplicate by task ID
      const tasksMap = new Map<string, Task>();
      completedRes.findProjectSpecificTasks.forEach(t => tasksMap.set(t.id, t));
      pendingRes.findProjectSpecificTasks.forEach(t => tasksMap.set(t.id, t));

      console.log('[Tasks] Completed tasks fetched:', completedRes.findProjectSpecificTasks.length);
      console.log('[Tasks] Pending tasks fetched:', pendingRes.findProjectSpecificTasks.length);
      console.log('[Tasks] Combined unique tasks:', tasksMap.size);

      return {
        findProjectSpecificTasks: Array.from(tasksMap.values()),
      };
    },
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

// Week boundaries helper
function getWeekBoundaries(referenceDate: Date, weeksAgo: number) {
  const weekStart = startOfWeek(subDays(referenceDate, weeksAgo * 7), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  return { start: weekStart, end: weekEnd };
}

// Extract task type from task name (first part before any specific details)
function extractTaskType(taskName: string): string {
  // Common patterns: "Write Brief - Project Name" or "Review Creative for Client"
  // Take the first meaningful chunk
  const cleanName = taskName.trim();
  
  // Try splitting by common separators
  const separators = [' - ', ' – ', ' for ', ' | ', ':'];
  for (const sep of separators) {
    if (cleanName.includes(sep)) {
      return cleanName.split(sep)[0].trim();
    }
  }
  
  // If no separator, return the full name (but limit length)
  return cleanName.length > 30 ? cleanName.substring(0, 30) + '...' : cleanName;
}

export interface TaskTypeRow {
  taskType: string;
  avg30Day: number;
  weekMinus5: number;
  weekMinus4: number;
  weekMinus3: number;
  weekMinus2: number;
  weekMinus1: number;
  due7Days: number;
  due30Days: number;
}

export interface PersonCapacity {
  name: string;
  taskTypes: TaskTypeRow[];
  subtotal: TaskTypeRow;
}

// Process tasks data for Team Capacity with task type breakdown
export function processTasksForCapacity(tasks: Task[], roleFilter: string): PersonCapacity[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next7Days = addDays(today, 7);
  const next30Days = addDays(today, 30);
  const last30Days = subDays(today, 30);

  // Get week boundaries for last 5 weeks
  const weeks = [
    getWeekBoundaries(today, 1), // Week -1 (last week)
    getWeekBoundaries(today, 2), // Week -2
    getWeekBoundaries(today, 3), // Week -3
    getWeekBoundaries(today, 4), // Week -4
    getWeekBoundaries(today, 5), // Week -5
  ];

  console.log('[Capacity] Today:', now.toISOString());
  console.log('[Capacity] Week boundaries:', weeks.map((w, i) => ({
    week: `W-${i + 1}`,
    start: format(w.start, 'MMM d'),
    end: format(w.end, 'MMM d'),
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

  // Group by assignee and task type
  const personData: Record<string, Record<string, {
    weekCounts: number[];
    due7Days: number;
    due30Days: number;
    last30DaysTotal: number;
  }>> = {};

  filteredTasks.forEach((task) => {
    const assigneeName = task.assignee?.name;
    if (!assigneeName) return;

    const taskType = extractTaskType(task.name);

    if (!personData[assigneeName]) {
      personData[assigneeName] = {};
    }
    if (!personData[assigneeName][taskType]) {
      personData[assigneeName][taskType] = {
        weekCounts: [0, 0, 0, 0, 0], // W-1 to W-5
        due7Days: 0,
        due30Days: 0,
        last30DaysTotal: 0,
      };
    }

    const data = personData[assigneeName][taskType];

    // Completed tasks - check which week they were done in
    if (task.done && task.doneDate) {
      const doneDate = new Date(task.doneDate);
      
      // Check last 30 days for average
      if (doneDate >= last30Days && doneDate <= today) {
        data.last30DaysTotal++;
      }
      
      // Check each week
      weeks.forEach((week, index) => {
        if (isWithinInterval(doneDate, { start: week.start, end: week.end })) {
          data.weekCounts[index]++;
        }
      });
    }

    // Pending tasks with due dates
    if (!task.done && task.dueDate) {
      const dueDate = new Date(task.dueDate);
      
      if (dueDate >= todayStart && dueDate <= next7Days) {
        data.due7Days++;
      }
      if (dueDate >= todayStart && dueDate <= next30Days) {
        data.due30Days++;
      }
    }
  });

  // Convert to structured output
  const result: PersonCapacity[] = Object.entries(personData)
    .map(([name, taskTypes]) => {
      const taskTypeRows: TaskTypeRow[] = Object.entries(taskTypes)
        .map(([taskType, data]) => ({
          taskType,
          avg30Day: Math.round((data.last30DaysTotal / 4) * 10) / 10, // 30 days ≈ 4 weeks
          weekMinus5: data.weekCounts[4],
          weekMinus4: data.weekCounts[3],
          weekMinus3: data.weekCounts[2],
          weekMinus2: data.weekCounts[1],
          weekMinus1: data.weekCounts[0],
          due7Days: data.due7Days,
          due30Days: data.due30Days,
        }))
        .filter(row => 
          // Only include task types with some activity
          row.avg30Day > 0 || row.due7Days > 0 || row.due30Days > 0 ||
          row.weekMinus1 > 0 || row.weekMinus2 > 0 || row.weekMinus3 > 0 ||
          row.weekMinus4 > 0 || row.weekMinus5 > 0
        )
        .sort((a, b) => b.avg30Day - a.avg30Day);

      // Calculate subtotal
      const subtotal: TaskTypeRow = {
        taskType: 'Subtotal',
        avg30Day: Math.round(taskTypeRows.reduce((sum, r) => sum + r.avg30Day, 0) * 10) / 10,
        weekMinus5: taskTypeRows.reduce((sum, r) => sum + r.weekMinus5, 0),
        weekMinus4: taskTypeRows.reduce((sum, r) => sum + r.weekMinus4, 0),
        weekMinus3: taskTypeRows.reduce((sum, r) => sum + r.weekMinus3, 0),
        weekMinus2: taskTypeRows.reduce((sum, r) => sum + r.weekMinus2, 0),
        weekMinus1: taskTypeRows.reduce((sum, r) => sum + r.weekMinus1, 0),
        due7Days: taskTypeRows.reduce((sum, r) => sum + r.due7Days, 0),
        due30Days: taskTypeRows.reduce((sum, r) => sum + r.due30Days, 0),
      };

      return {
        name,
        taskTypes: taskTypeRows,
        subtotal,
      };
    })
    .filter(person => person.taskTypes.length > 0)
    .sort((a, b) => b.subtotal.avg30Day - a.subtotal.avg30Day);

  console.log('[Capacity] Processed persons:', result.length);
  console.log('[Capacity] Sample person data:', result[0]);

  return result;
}

// Note: Client Economics processing has been moved to ClientEconomics.tsx
// to use Fibery's pre-calculated costPerDeliverable from pricingPlanMonths