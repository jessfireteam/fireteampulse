import { supabase } from "@/integrations/supabase/client";

// Query types that match the edge function whitelist
type QueryType = 'projects' | 'tasks' | 'pending-tasks' | 'client-months' | 'client-weeks' | 'project-completions' | 'project-upcoming' | 'project-pacing' | 'shipped-tasks' | 'client-expenses';

export async function queryFibery<T>(queryType: QueryType): Promise<T> {
  const { data, error } = await supabase.functions.invoke('fibery-proxy', {
    body: { queryType }
  });

  if (error) {
    throw new Error(`Failed to fetch from Fibery: ${error.message}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (data.errors && data.errors.length > 0) {
    throw new Error(data.errors[0].message);
  }

  return data.data as T;
}

// Types
export interface Project {
  id: string;
  name: string;
  doneDate: string | null;
  client: { name: string } | null;
  type: { name: string } | null;
}

export interface Task {
  id: string;
  name: string;
  done: boolean;
  doneDate: string | null;
  dueDate: string | null;
  assignee: { name: string } | null;
  taskTemplateRole: { name: string } | null;
  project: {
    name: string;
    client: { name: string } | null;
  } | null;
}

export interface PricingPlanMonth {
  revenue: number | null;
  costPerDeliverable: number | null;
  deliverablesShipped: number | null;
}

export interface ClientMonth {
  id: string;
  name: string;
  client: { name: string } | null;
  totalSpend: number | null;
  fireTeamSpend: number | null;
  pricingPlanMonths: PricingPlanMonth[] | null;
}

export interface ClientWeek {
  client: { name: string } | null;
  totalSpend: number | null;
  agencySpend: number | null;
  dateRange: { start: string; end: string } | null;
  week: { name: string; isoWeeknum: number; current: boolean } | null;
}

export interface ProjectsResponse {
  findProjects: Project[];
}

export interface TasksResponse {
  findProjectSpecificTasks: Task[];
}

export interface ClientMonthsResponse {
  findClientMonths: ClientMonth[];
}

export interface ClientWeeksResponse {
  findClientWeeks: ClientWeek[];
}

export interface ProjectCompletionsResponse {
  findProjects: Array<{
    client: { name: string } | null;
    name: string;
    doneDate: string | null;
    dueDate: string | null;
  }>;
}

export interface ProjectUpcomingResponse {
  findProjects: Array<{
    client: { name: string } | null;
    name: string;
    dueDate: string | null;
  }>;
}

export interface ProjectPacingResponse {
  findProjects: Array<{
    name: string;
    creationDate: string | null;
    shippedDay: { date: string } | null;
  }>;
}

export interface ShippedTasksResponse {
  findProjectSpecificTasks: Array<{
    name: string;
    doneDate: string | null;
    project: {
      name: string;
      client: { name: string } | null;
      creationDate: string | null;
    } | null;
  }>;
}

export interface Expense {
  name: string;
  amount: number | null;
  date: string | null;
  paid: boolean | null;
  billedToClient: boolean | null;
  client: { name: string } | null;
}

export interface ClientExpensesResponse {
  findExpenses: Expense[];
}