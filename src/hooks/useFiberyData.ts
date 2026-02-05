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

// Categorize task by name keywords
function getTaskCategory(taskName: string): string {
  const name = taskName?.toLowerCase() || '';
  if (name.includes('brief')) return 'Brief Work';
  if (name.includes('review')) return 'Review';
  if (name.includes('edit video') || name.includes('video edit')) return 'Video Editing';
  if (name.includes('design') || name.includes('static')) return 'Design';
  if (name.includes('upload')) return 'Upload';
  if (name.includes('approval') || name.includes('approve')) return 'Approvals';
  if (name.includes('assign')) return 'Assignments';
  if (name.includes('footage') || name.includes('pull')) return 'Footage/Assets';
  if (name.includes('revision')) return 'Revisions';
  return 'Other';
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

// Helper to parse date strings (handles both '2026-02-11' and '2026-02-11T00:00:00Z' formats)
function parseTaskDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr);
}

// Process tasks data for Team Capacity with task type breakdown
export function processTasksForCapacity(tasks: Task[], roleFilter: string): PersonCapacity[] {
  // Reference date: Feb 4, 2026 (matches the data's time context)
  const now = new Date('2026-02-04T12:00:00Z');
  const today = new Date(2026, 1, 4, 23, 59, 59); // Feb 4, 2026 end of day
  const todayStart = new Date(2026, 1, 4, 0, 0, 0); // Feb 4, 2026 start of day
  const next7Days = addDays(todayStart, 7);
  const next30Days = addDays(todayStart, 30);
  const last30Days = subDays(todayStart, 30);

  // DEBUG: Detailed analysis for Jess Bachman
  const jessAllTasks = tasks.filter(t => t.assignee?.name?.includes('Jess'));
  const jessCompletedTasks = jessAllTasks.filter(t => t.done && t.doneDate);
  const jessReviewTasks = jessCompletedTasks.filter(t => getTaskCategory(t.name) === 'Review');
  const jessReviewIn30Days = jessReviewTasks.filter(t => {
    const doneDate = parseTaskDate(t.doneDate);
    return doneDate && doneDate >= last30Days && doneDate <= today;
  });

  console.log('[DEBUG Jess] Total tasks with assignee containing "Jess":', jessAllTasks.length);
  console.log('[DEBUG Jess] Completed tasks (done=true, has doneDate):', jessCompletedTasks.length);
  console.log('[DEBUG Jess] Tasks categorized as "Review":', jessReviewTasks.length);
  console.log('[DEBUG Jess] Review tasks in last 30 days:', jessReviewIn30Days.length);
  console.log('[DEBUG Jess] Task categorization uses: task.name field with keyword matching');
  console.log('[DEBUG Jess] 5 sample tasks COUNTED as Jess + Review in 30d:', jessReviewIn30Days.slice(0, 5).map(t => ({
    name: t.name,
    assignee: t.assignee?.name,
    doneDate: t.doneDate,
    category: getTaskCategory(t.name),
  })));
  
  // Find tasks that are NOT being counted - either wrong category or outside date range
  const jessNotCountedReview = jessCompletedTasks.filter(t => {
    const doneDate = parseTaskDate(t.doneDate);
    const inDateRange = doneDate && doneDate >= last30Days && doneDate <= today;
    const isReview = getTaskCategory(t.name) === 'Review';
    // Either: in date range but not categorized as Review, OR is Review but not in date range
    return (inDateRange && !isReview) || (isReview && !inDateRange);
  });
  console.log('[DEBUG Jess] 5 sample tasks NOT counted (wrong category or date):', jessNotCountedReview.slice(0, 5).map(t => ({
    name: t.name,
    assignee: t.assignee?.name,
    doneDate: t.doneDate,
    category: getTaskCategory(t.name),
    inDateRange: (() => {
      const d = parseTaskDate(t.doneDate);
      return d && d >= last30Days && d <= today;
    })(),
  })));

  // Get week boundaries for last 5 weeks
  const weeks = [
    getWeekBoundaries(todayStart, 1), // Week -1 (last week)
    getWeekBoundaries(todayStart, 2), // Week -2
    getWeekBoundaries(todayStart, 3), // Week -3
    getWeekBoundaries(todayStart, 4), // Week -4
    getWeekBoundaries(todayStart, 5), // Week -5
  ];

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

  // Debug counter for 30-day completed tasks
  let debugLast30DaysCount = 0;
  const debugSample30Day: Array<{ name: string; assignee: string; doneDate: string }> = [];
  
  filteredTasks.forEach((task) => {
    const assigneeName = task.assignee?.name;
    if (!assigneeName) return;

    const taskType = getTaskCategory(task.name);

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
      const doneDate = parseTaskDate(task.doneDate);
      if (!doneDate) return;
      
      // Check last 30 days for average
      if (doneDate >= last30Days && doneDate <= today) {
        data.last30DaysTotal++;
        debugLast30DaysCount++;
        if (debugSample30Day.length < 20) {
          debugSample30Day.push({
            name: task.name,
            assignee: assigneeName,
            doneDate: task.doneDate,
          });
        }
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
      const dueDate = parseTaskDate(task.dueDate);
      if (!dueDate) return;
      
      // Normalize dueDate to start of day for comparison
      const dueDateNormalized = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      
      if (dueDateNormalized >= todayStart && dueDateNormalized <= next7Days) {
        data.due7Days++;
      }
      if (dueDateNormalized >= todayStart && dueDateNormalized <= next30Days) {
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
        .filter(row => {
          // Calculate total across all weeks
          const totalWeeks = row.weekMinus1 + row.weekMinus2 + row.weekMinus3 + 
                            row.weekMinus4 + row.weekMinus5;
          // Filter out low-volume task types (less than 3 total across all weeks)
          return totalWeeks >= 3 || row.due7Days >= 3 || row.due30Days >= 3;
        })
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

  console.log('[Capacity] Total completed tasks in last 30 days:', debugLast30DaysCount);
  console.log('[Capacity] 30-day range:', format(last30Days, 'MMM d'), 'to', format(today, 'MMM d'));
  console.log('[Capacity] Sample 30-day completed tasks:', debugSample30Day);
  console.log('[Capacity] Completed tasks (done=true) in input:', filteredTasks.filter(t => t.done).length);
  console.log('[Capacity] Processed persons:', result.length);
  console.log('[Capacity] Sample person data:', result[0]);

  return result;
}

// Note: Client Economics processing has been moved to ClientEconomics.tsx
// to use Fibery's pre-calculated costPerDeliverable from pricingPlanMonths