import { supabase } from "@/integrations/supabase/client";

// Query types that match the edge function whitelist
type QueryType = 'projects' | 'tasks' | 'pending-tasks' | 'client-months' | 'client-weeks' | 'project-completions' | 'project-upcoming' | 'project-timeline-upcoming' | 'project-pacing' | 'shipped-tasks' | 'client-expenses' | 'creator-costs' | 'leads' | 'stage-tracking' | 'clients' | 'client-plans' | 'winners' | 'revision-stats';

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
    status: { name: string } | null;
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
    type: { name: string } | null;
  }>;
}

export interface ProjectUpcomingResponse {
  findProjects: Array<{
    client: { name: string } | null;
    name: string;
    dueDate: string | null;
  }>;
}

export interface ProjectTimelineUpcomingResponse {
  findProjects: Array<{
    client: { name: string } | null;
    name: string;
    dueDate: string | null;
    type: { name: string } | null;
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

export interface CreatorCostExpense {
  name: string;
  amount: number | null;
  date: string | null;
  client: { name: string } | null;
}

export interface ClientExpensesResponse {
  findExpenses: Expense[];
}

export interface CreatorCostsResponse {
  findExpenses: CreatorCostExpense[];
}

export interface LeadContact {
  name: string | null;
  normalisedEmail: string | null;
}

export interface LeadCompany {
  name: string | null;
  email: string | null;
  website: string | null;
  stage: { name: string } | null;
  lastContacted: string | null;
  firstContact: string | null;
  daysSinceLastContact: number | null;
  creationDate: string | null;
  owner: { name: string } | null;
  contacts: LeadContact[] | null;
}

export interface LeadsResponse {
  findCompanies: LeadCompany[];
}

export interface StageTrackingEntry {
  stage: {
    name: string;
  } | null;
  duration: number | null;
  project: {
    name: string;
    type: { name: string } | null;
  } | null;
  creationDate: string | null;
}

export interface StageTrackingResponse {
  findStageTrackings: StageTrackingEntry[];
}

export interface FiberyClient {
  name: string | null;
  status: { name: string } | null;
}

/** From the separate 'client-plans' query; see the note on that query in fibery-proxy. */
export interface FiberyClientPlan {
  name: string | null;
  /** Auto-scheduling ceiling ops enforces; the current operating plan. Null when unset. */
  maxDeliverablesPerMonth: number | null;
  /** Contractual minimum. Display only. */
  minDeliverablesPerMonth: number | null;
}

export interface ClientPlansResponse {
  findClients: FiberyClientPlan[];
}

export interface ClientsResponse {
  findClients: FiberyClient[];
}