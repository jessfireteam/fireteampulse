import { useQuery } from "@tanstack/react-query";
import {
  queryFibery,
  ProjectsResponse,
  TasksResponse,
  ClientMonthsResponse,
  Project,
  Task,
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
} from "date-fns";

// Hook for Projects data
export function useProjectsData() {
  return useQuery({
    queryKey: ["fibery-projects"],
    queryFn: () => queryFibery<ProjectsResponse>("projects"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// Hook for Tasks data - combines completed and pending tasks
export function useTasksData() {
  return useQuery({
    queryKey: ["fibery-tasks"],
    queryFn: async () => {
      const [completedRes, pendingRes] = await Promise.all([
        queryFibery<TasksResponse>("tasks"),
        queryFibery<TasksResponse>("pending-tasks"),
      ]);

      const tasksMap = new Map<string, Task>();
      completedRes.findProjectSpecificTasks.forEach(t => tasksMap.set(t.id, t));
      pendingRes.findProjectSpecificTasks.forEach(t => tasksMap.set(t.id, t));

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
    queryFn: () => queryFibery<ClientMonthsResponse>("client-months"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// Process projects data for Agency Heartbeat
export function processProjectsForHeartbeat(projects: Project[], viewMode: 'weekly' | 'monthly' = 'weekly') {
  const now = new Date();
  const sixMonthsAgo = subMonths(now, 6);

  const recentProjects = projects.filter((p) => {
    if (!p.doneDate) return false;
    const date = parseISO(p.doneDate);
    return date >= sixMonthsAgo && date <= now;
  });

  const periodData: Record<string, Record<string, number>> = {};
  const clients = new Set<string>();

  recentProjects.forEach((project) => {
    if (!project.doneDate) return;
    const date = parseISO(project.doneDate);
    const clientName = project.client?.name || "Unknown";
    clients.add(clientName);

    let periodKey: string;
    if (viewMode === 'monthly') {
      periodKey = format(startOfMonth(date), "yyyy-MM-dd");
    } else {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      periodKey = format(weekStart, "yyyy-MM-dd");
    }

    if (!periodData[periodKey]) {
      periodData[periodKey] = {};
    }
    periodData[periodKey][clientName] = (periodData[periodKey][clientName] || 0) + 1;
  });

  const chartData = Object.entries(periodData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, clientCounts]) => ({
      week: viewMode === 'monthly' 
        ? format(parseISO(period), "MMM yyyy")
        : format(parseISO(period), "MMM d"),
      ...clientCounts,
    }));

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  const projectsThisMonth = recentProjects.filter((p) => {
    if (!p.doneDate) return false;
    const date = parseISO(p.doneDate);
    return isWithinInterval(date, { start: thisMonthStart, end: thisMonthEnd });
  });

  const activeClients = new Set(
    projectsThisMonth.map((p) => p.client?.name).filter(Boolean)
  ).size;

  const weeksCount = Object.keys(periodData).length || 1;
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
  if (name.includes('approve and send brief')) return 'Briefs Sent';
  if (name.includes('brief')) return 'Brief Work';
  if (name.includes('review')) return 'Review';
  if (name.includes('edit video') || name.includes('video edit')) return 'Video Editing';
  if (name.includes('design') || name.includes('static')) return 'Design';
  if (name.includes('upload')) return 'Upload';
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
  overdue: number;
  due7Days: number;
  due30Days: number;
}

export type RoleType = 'Account' | 'Copywriters' | 'Design' | 'Video' | 'Other';

export interface PersonCapacity {
  name: string;
  role: RoleType;
  primaryTaskType: string;
  taskTypes: TaskTypeRow[];
  subtotal: TaskTypeRow;
}

export interface RoleGroup {
  role: RoleType;
  people: PersonCapacity[];
}

// Explicit role assignments with primary task types
const ROLE_ASSIGNMENTS: Record<string, { role: RoleType; primaryTaskType: string }[]> = {
  'Niki Brazier': [{ role: 'Account', primaryTaskType: 'Briefs Sent' }],
  'Emily Peter': [{ role: 'Account', primaryTaskType: 'Briefs Sent' }],
  'amanda@fireteam.is': [{ role: 'Account', primaryTaskType: 'Briefs Sent' }],
  'Jess Bachman': [{ role: 'Copywriters', primaryTaskType: 'Brief Work' }],
  'riteesh@fireteam.is': [{ role: 'Copywriters', primaryTaskType: 'Brief Work' }],
  'shreya8881@gmail.com': [{ role: 'Copywriters', primaryTaskType: 'Brief Work' }],
  'Erik Furtado': [{ role: 'Design', primaryTaskType: 'Design' }],
  'Reynelle Reid': [{ role: 'Design', primaryTaskType: 'Design' }],
  'Vaiv Singh': [{ role: 'Video', primaryTaskType: 'Video Editing' }],
  'Sanchit': [{ role: 'Video', primaryTaskType: 'Video Editing' }],
  'Ike': [{ role: 'Video', primaryTaskType: 'Video Editing' }],
  'Kenny Fisher': [
    { role: 'Video', primaryTaskType: 'Video Editing' },
    { role: 'Other', primaryTaskType: 'Assignments' },
  ],
  'Nicolle Valladares': [{ role: 'Other', primaryTaskType: 'Other' }],
  'Jada Hall': [{ role: 'Other', primaryTaskType: 'Upload' }],
};

function getAssigneeRoles(assigneeName: string): { role: RoleType; primaryTaskType: string }[] | null {
  if (ROLE_ASSIGNMENTS[assigneeName]) {
    return ROLE_ASSIGNMENTS[assigneeName];
  }
  for (const [key, value] of Object.entries(ROLE_ASSIGNMENTS)) {
    if (assigneeName.includes(key) || key.includes(assigneeName)) {
      return value;
    }
  }
  return null;
}

function parseTaskDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr);
}

// Process tasks data for Team Capacity with task type breakdown
export function processTasksForCapacity(tasks: Task[], roleFilter: string): RoleGroup[] {
  const todayStart = new Date(2026, 1, 4, 0, 0, 0);
  const today = new Date(2026, 1, 4, 23, 59, 59);
  const next7Days = addDays(todayStart, 7);
  const next30Days = addDays(todayStart, 30);
  const last30Days = subDays(todayStart, 30);

  const weeks = [
    getWeekBoundaries(todayStart, 1),
    getWeekBoundaries(todayStart, 2),
    getWeekBoundaries(todayStart, 3),
    getWeekBoundaries(todayStart, 4),
    getWeekBoundaries(todayStart, 5),
  ];

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

  const personData: Record<string, Record<string, {
    weekCounts: number[];
    overdue: number;
    due7Days: number;
    due30Days: number;
    last30DaysTotal: number;
  }>> = {};

  filteredTasks.forEach((task) => {
    const assigneeName = task.assignee?.name;
    if (!assigneeName) return;

    const taskType = getTaskCategory(task.name);

    if (!personData[assigneeName]) {
      personData[assigneeName] = {};
    }
    if (!personData[assigneeName][taskType]) {
      personData[assigneeName][taskType] = {
        weekCounts: [0, 0, 0, 0, 0],
        overdue: 0,
        due7Days: 0,
        due30Days: 0,
        last30DaysTotal: 0,
      };
    }

    const data = personData[assigneeName][taskType];

    if (task.done && task.doneDate) {
      const doneDate = parseTaskDate(task.doneDate);
      if (!doneDate) return;
      
      if (doneDate >= last30Days && doneDate <= today) {
        data.last30DaysTotal++;
      }
      
      weeks.forEach((week, index) => {
        if (isWithinInterval(doneDate, { start: week.start, end: week.end })) {
          data.weekCounts[index]++;
        }
      });
    }

    if (!task.done && task.dueDate) {
      const dueDate = parseTaskDate(task.dueDate);
      if (!dueDate) return;
      
      const dueDateNormalized = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      
      if (dueDateNormalized < todayStart) {
        data.overdue++;
      }
      
      if (dueDateNormalized >= todayStart && dueDateNormalized <= next7Days) {
        data.due7Days++;
      }
      if (dueDateNormalized >= todayStart && dueDateNormalized <= next30Days) {
        data.due30Days++;
      }
    }
  });

  const people: PersonCapacity[] = [];
  
  Object.entries(personData).forEach(([name, taskTypes]) => {
    const roles = getAssigneeRoles(name);
    if (!roles) return;
    
    const taskTypeRows: TaskTypeRow[] = Object.entries(taskTypes)
      .map(([taskType, data]) => ({
        taskType,
        avg30Day: data.last30DaysTotal,
        weekMinus5: data.weekCounts[4],
        weekMinus4: data.weekCounts[3],
        weekMinus3: data.weekCounts[2],
        weekMinus2: data.weekCounts[1],
        weekMinus1: data.weekCounts[0],
        overdue: data.overdue,
        due7Days: data.due7Days,
        due30Days: data.due30Days,
      }))
      .filter(row => {
        const totalWeeks = row.weekMinus1 + row.weekMinus2 + row.weekMinus3 + 
                          row.weekMinus4 + row.weekMinus5;
        return totalWeeks >= 3 || row.due7Days >= 3 || row.due30Days >= 3 || row.overdue >= 1;
      })
      .sort((a, b) => b.avg30Day - a.avg30Day);

    const subtotal: TaskTypeRow = {
      taskType: 'Subtotal',
      avg30Day: Math.round(taskTypeRows.reduce((sum, r) => sum + r.avg30Day, 0) * 10) / 10,
      weekMinus5: taskTypeRows.reduce((sum, r) => sum + r.weekMinus5, 0),
      weekMinus4: taskTypeRows.reduce((sum, r) => sum + r.weekMinus4, 0),
      weekMinus3: taskTypeRows.reduce((sum, r) => sum + r.weekMinus3, 0),
      weekMinus2: taskTypeRows.reduce((sum, r) => sum + r.weekMinus2, 0),
      weekMinus1: taskTypeRows.reduce((sum, r) => sum + r.weekMinus1, 0),
      overdue: taskTypeRows.reduce((sum, r) => sum + r.overdue, 0),
      due7Days: taskTypeRows.reduce((sum, r) => sum + r.due7Days, 0),
      due30Days: taskTypeRows.reduce((sum, r) => sum + r.due30Days, 0),
    };

    roles.forEach(({ role, primaryTaskType }) => {
      people.push({
        name,
        role,
        primaryTaskType,
        taskTypes: taskTypeRows,
        subtotal,
      });
    });
  });

  people.sort((a, b) => b.subtotal.avg30Day - a.subtotal.avg30Day);

  const roleOrder: RoleType[] = ['Account', 'Copywriters', 'Design', 'Video', 'Other'];
  return roleOrder
    .map(role => ({
      role,
      people: people.filter(p => p.role === role),
    }))
    .filter(group => group.people.length > 0);
}