import { supabase } from "@/integrations/supabase/client";

export async function queryFibery<T>(
  endpoint: 'projects' | 'stats',
  query: string
): Promise<T> {
  console.log(`[Fibery] Calling endpoint: ${endpoint}`);
  console.log(`[Fibery] Query:`, query);

  const { data, error } = await supabase.functions.invoke('fibery-proxy', {
    body: { endpoint, query }
  });

  console.log(`[Fibery] Raw response:`, data);

  if (error) {
    console.error('[Fibery] Proxy error:', error);
    throw new Error(`Failed to fetch from Fibery: ${error.message}`);
  }

  if (data.error) {
    console.error('[Fibery] API error:', data.error);
    throw new Error(data.error);
  }

  if (data.errors && data.errors.length > 0) {
    console.error('[Fibery] GraphQL errors:', data.errors);
    throw new Error(data.errors[0].message);
  }

  console.log(`[Fibery] Parsed data:`, data.data);
  return data.data as T;
}

// GraphQL Queries
export const PROJECTS_QUERY = `{
  findProjects(
    limit: 1000
    status: { name: { is: "Completed" } }
  ) {
    id
    name
    doneDate
    client { name }
    type { name }
  }
}`;

// Query for recently completed tasks - filter to last 45 days to avoid hitting 2000 limit
// CRITICAL: Filter by done: true AND doneDate to ensure we count actual completions
// Date is dynamic based on reference date (Feb 4, 2026) - going back ~45 days to Jan 1
export const COMPLETED_TASKS_QUERY = `{
  findProjectSpecificTasks(
    limit: 2000
    done: { is: true }
    doneDate: { greater: "2026-01-01" }
  ) {
    id
    name
    done
    doneDate
    dueDate
    assignee { name }
    taskTemplateRole { name }
    project { 
      name 
      client { name }
    }
  }
}`;

// Query for pending tasks with upcoming due dates
export const PENDING_TASKS_QUERY = `{
  findProjectSpecificTasks(
    limit: 1000
    done: { is: false }
    dueDate: { greater: "2026-01-01" }
  ) {
    id
    name
    done
    doneDate
    dueDate
    assignee { name }
    taskTemplateRole { name }
    project { 
      name 
      client { name }
    }
  }
}`;

export const CLIENT_MONTHS_QUERY = `{
  findClientMonths(limit: 200) {
    id
    name
    client { name }
    totalSpend
    fireTeamSpend
    pricingPlanMonths {
      revenue
      costPerDeliverable
      deliverablesShipped
    }
  }
}`;

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

export interface ProjectsResponse {
  findProjects: Project[];
}

export interface TasksResponse {
  findProjectSpecificTasks: Task[];
}

export interface ClientMonthsResponse {
  findClientMonths: ClientMonth[];
}