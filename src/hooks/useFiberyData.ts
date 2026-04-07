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
  if (name.includes('write brief') || name.includes('write the brief') || name.includes('draft brief')) return 'Brief Work';
  if (name.includes('revision')) return 'Revisions';
  if (name.includes('review creative')) return 'Creative Review';
  if (name.includes('review')) return 'Review';
  if ((name.includes('edit video') || name.includes('video edit'))) return 'Video Editing';
  if (name.includes('design') || name.includes('static')) return 'Design';
  if (name.includes('upload')) return 'Upload';
  if (name.includes('assign editor')) return 'Assign Editor';
  if (name.includes('assign')) return 'Assignments';
  if (name.includes('cast creator')) return 'Cast Creator';
  if (name.includes('footage') || name.includes('pull')) return 'Footage/Assets';
  return 'Other';
}

export interface TaskTypeRow {
  taskType: string;
  avg30Day: number;
  weekCounts: number[]; // 8 weeks, index 0 = oldest (week -8), index 7 = most recent (week -1)
  maxWeek26: number; // highest single-week completions over last 26 weeks
  inheritedOverdue: number;
  trueOverdue: number;
  due7Days: number;
  due30Days: number;
}

export type RoleType = 'Account' | 'Creative Review' | 'Copywriters' | 'Design' | 'Video' | 'Other';

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

// Departed team members — excluded from capacity summary bars (but historical completions still count)
export const EXCLUDED_MEMBERS = new Set(['riteesh@fireteam.is']);

// Explicit role assignments with primary task types
const ROLE_ASSIGNMENTS: Record<string, { role: RoleType; primaryTaskType: string }[]> = {
  'Niki Brazier': [{ role: 'Account', primaryTaskType: 'Briefs Sent' }, { role: 'Creative Review', primaryTaskType: 'Creative Review' }],
  'Emily Peter': [{ role: 'Account', primaryTaskType: 'Briefs Sent' }, { role: 'Creative Review', primaryTaskType: 'Creative Review' }],
  'amanda@fireteam.is': [{ role: 'Account', primaryTaskType: 'Briefs Sent' }, { role: 'Creative Review', primaryTaskType: 'Creative Review' }],
  'Jess Bachman': [{ role: 'Copywriters', primaryTaskType: 'Brief Work' }, { role: 'Creative Review', primaryTaskType: 'Creative Review' }],
  'riteesh@fireteam.is': [{ role: 'Copywriters', primaryTaskType: 'Brief Work' }],
  'shreya8881@gmail.com': [{ role: 'Copywriters', primaryTaskType: 'Brief Work' }],
  'Erik Furtado': [{ role: 'Design', primaryTaskType: 'Design' }],
  'Reynelle Reid': [{ role: 'Design', primaryTaskType: 'Design' }],
  'Vaiv Singh': [{ role: 'Video', primaryTaskType: 'Video Editing' }],
  'Sanchit': [{ role: 'Video', primaryTaskType: 'Video Editing' }],
  'Ike': [{ role: 'Video', primaryTaskType: 'Video Editing' }],
  'Kenny Fisher': [{ role: 'Other', primaryTaskType: 'Assign Editor' }],
  'Nicolle Valladares': [{ role: 'Other', primaryTaskType: 'Cast Creator' }],
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

export function isExcludedMember(name: string): boolean {
  if (EXCLUDED_MEMBERS.has(name)) return true;
  for (const excluded of EXCLUDED_MEMBERS) {
    if (name.includes(excluded) || excluded.includes(name)) return true;
  }
  return false;
}

function parseTaskDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr);
}

// Process tasks data for Team Capacity with task type breakdown
export function processTasksForCapacity(tasks: Task[], roleFilter: string): RoleGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const next7Days = addDays(todayStart, 7);
  const next30Days = addDays(todayStart, 30);
  const last30Days = subDays(todayStart, 30);

  const weeks = Array.from({ length: 8 }, (_, i) => getWeekBoundaries(todayStart, i + 1));
  const weeks26 = Array.from({ length: 26 }, (_, i) => getWeekBoundaries(todayStart, i + 1));


  // Filter out tasks from cancelled projects
  let filteredTasks = tasks.filter((t) => {
    const projectStatus = t.project?.status?.name?.toLowerCase();
    return projectStatus !== 'cancelled';
  });

  if (roleFilter === "video") {
    filteredTasks = tasks.filter((t) =>
      t.taskTemplateRole?.name?.includes("Video Editor (VE)")
    );
  } else if (roleFilter === "design") {
    filteredTasks = tasks.filter((t) =>
      t.taskTemplateRole?.name?.includes("Graphic Designer (GD)")
    );
  }

  // Build project task sequences: group all tasks by project, sort by dueDate
  const projectTasks: Record<string, Task[]> = {};
  filteredTasks.forEach((task) => {
    const projectName = task.project?.name;
    if (!projectName) return;
    if (!projectTasks[projectName]) projectTasks[projectName] = [];
    projectTasks[projectName].push(task);
  });
  // Sort each project's tasks by dueDate to infer sequence
  Object.values(projectTasks).forEach((tasks) => {
    tasks.sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });
  });

  // For a given task, check if its predecessor in the project was completed before this task's dueDate
  function isInheritedOverdue(task: Task): boolean {
    const projectName = task.project?.name;
    if (!projectName || !projectTasks[projectName]) return false;
    const seq = projectTasks[projectName];
    const idx = seq.findIndex(t => t.id === task.id);
    if (idx <= 0) return false; // first task or not found — can't be inherited
    const predecessor = seq[idx - 1];
    // If predecessor isn't done yet, this task isn't actionable
    if (!predecessor.done || !predecessor.doneDate) return true;
    const predDone = new Date(predecessor.doneDate);
    const taskDue = task.dueDate ? new Date(task.dueDate) : null;
    // If predecessor was completed after this task's due date, it was inherited overdue
    if (taskDue && predDone > taskDue) return true;
    return false;
  }

  const personData: Record<string, Record<string, {
    weekCounts: number[];
    weekCounts26: number[];
    inheritedOverdue: number;
    trueOverdue: number;
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
        weekCounts: [0, 0, 0, 0, 0, 0, 0, 0],
        weekCounts26: new Array(26).fill(0),
        inheritedOverdue: 0,
        trueOverdue: 0,
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
      weeks26.forEach((week, index) => {
        if (isWithinInterval(doneDate, { start: week.start, end: week.end })) {
          data.weekCounts26[index]++;
        }
      });
    }

    if (!task.done && task.dueDate) {
      const dueDate = parseTaskDate(task.dueDate);
      if (!dueDate) return;
      
      const dueDateNormalized = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      
      if (dueDateNormalized < todayStart) {
        if (isInheritedOverdue(task)) {
          data.inheritedOverdue++;
        } else {
          data.trueOverdue++;
        }
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
        weekCounts: [...data.weekCounts].reverse(),
        maxWeek26: Math.max(...data.weekCounts26),
        inheritedOverdue: data.inheritedOverdue,
        trueOverdue: data.trueOverdue,
        due7Days: data.due7Days,
        due30Days: data.due30Days,
      }))
      .filter(row => {
        const totalWeeks = row.weekCounts.reduce((s, v) => s + v, 0);
        return totalWeeks >= 3 || row.due7Days >= 3 || row.due30Days >= 3 || (row.inheritedOverdue + row.trueOverdue) >= 1;
      })
      .sort((a, b) => b.avg30Day - a.avg30Day);

    const subtotal: TaskTypeRow = {
      taskType: 'Subtotal',
      avg30Day: Math.round(taskTypeRows.reduce((sum, r) => sum + r.avg30Day, 0) * 10) / 10,
      weekCounts: Array.from({ length: 8 }, (_, i) => taskTypeRows.reduce((sum, r) => sum + r.weekCounts[i], 0)),
      maxWeek26: Math.max(...taskTypeRows.map(r => r.maxWeek26)),
      inheritedOverdue: taskTypeRows.reduce((sum, r) => sum + r.inheritedOverdue, 0),
      trueOverdue: taskTypeRows.reduce((sum, r) => sum + r.trueOverdue, 0),
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

  // Dynamically add anyone with Brief Work completions to Copywriters
  const existingCopywriters = new Set(people.filter(p => p.role === 'Copywriters').map(p => p.name));
  Object.entries(personData).forEach(([name, taskTypes]) => {
    if (existingCopywriters.has(name) || isExcludedMember(name)) return;
    const briefWork = taskTypes['Brief Work'];
    if (briefWork && briefWork.last30DaysTotal > 0) {
      // Only show the Brief Work row for dynamic copywriters
      const briefWorkRow: TaskTypeRow = {
        taskType: 'Brief Work',
        avg30Day: briefWork.last30DaysTotal,
        weekCounts: [...briefWork.weekCounts].reverse(),
        maxWeek26: Math.max(...briefWork.weekCounts26),
        inheritedOverdue: briefWork.inheritedOverdue,
        trueOverdue: briefWork.trueOverdue,
        due7Days: briefWork.due7Days,
        due30Days: briefWork.due30Days,
      };

      people.push({
        name,
        role: 'Copywriters',
        primaryTaskType: 'Brief Work',
        taskTypes: [briefWorkRow],
        subtotal: briefWorkRow,
      });
    }
  });

  // Dynamically add anyone with Creative Review completions
  const existingCR = new Set(people.filter(p => p.role === 'Creative Review').map(p => p.name));
  Object.entries(personData).forEach(([name, taskTypes]) => {
    if (existingCR.has(name) || isExcludedMember(name)) return;
    const cr = taskTypes['Creative Review'];
    if (cr && cr.last30DaysTotal > 0) {
      const crRow: TaskTypeRow = {
        taskType: 'Creative Review',
        avg30Day: cr.last30DaysTotal,
        weekCounts: [...cr.weekCounts].reverse(),
        maxWeek26: Math.max(...cr.weekCounts26),
        inheritedOverdue: cr.inheritedOverdue,
        trueOverdue: cr.trueOverdue,
        due7Days: cr.due7Days,
        due30Days: cr.due30Days,
      };
      people.push({
        name,
        role: 'Creative Review',
        primaryTaskType: 'Creative Review',
        taskTypes: [crRow],
        subtotal: crRow,
      });
    }
  });

  // Dynamically add anyone with Design completions
  const existingDesign = new Set(people.filter(p => p.role === 'Design').map(p => p.name));
  Object.entries(personData).forEach(([name, taskTypes]) => {
    if (existingDesign.has(name) || isExcludedMember(name)) return;
    const d = taskTypes['Design'];
    if (d && d.last30DaysTotal > 0) {
      const dRow: TaskTypeRow = {
        taskType: 'Design',
        avg30Day: d.last30DaysTotal,
        weekCounts: [...d.weekCounts].reverse(),
        maxWeek26: Math.max(...d.weekCounts26),
        inheritedOverdue: d.inheritedOverdue, trueOverdue: d.trueOverdue, due7Days: d.due7Days, due30Days: d.due30Days,
      };
      people.push({ name, role: 'Design', primaryTaskType: 'Design', taskTypes: [dRow], subtotal: dRow });
    }
  });

  // Dynamically add anyone with Video Editing completions
  const existingVideo = new Set(people.filter(p => p.role === 'Video').map(p => p.name));
  Object.entries(personData).forEach(([name, taskTypes]) => {
    if (existingVideo.has(name) || isExcludedMember(name)) return;
    const v = taskTypes['Video Editing'];
    if (v && v.last30DaysTotal > 0) {
      const vRow: TaskTypeRow = {
        taskType: 'Video Editing',
        avg30Day: v.last30DaysTotal,
        weekCounts: [...v.weekCounts].reverse(),
        maxWeek26: Math.max(...v.weekCounts26),
        inheritedOverdue: v.inheritedOverdue, trueOverdue: v.trueOverdue, due7Days: v.due7Days, due30Days: v.due30Days,
      };
      people.push({ name, role: 'Video', primaryTaskType: 'Video Editing', taskTypes: [vRow], subtotal: vRow });
    }
  });

  people.sort((a, b) => b.subtotal.avg30Day - a.subtotal.avg30Day);

  const roleOrder: RoleType[] = ['Account', 'Creative Review', 'Copywriters', 'Design', 'Video', 'Other'];
  return roleOrder
    .map(role => ({
      role,
      people: people.filter(p => p.role === role),
    }))
    .filter(group => group.people.length > 0);
}