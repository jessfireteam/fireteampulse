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

export const TASKS_QUERY = `{
  findProjectSpecificTasks(limit: 5000) {
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
    month { name }
    totalSpend
    fireTeamSpend
    actualDeliverables
    scopedDeliverables
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

export interface ClientMonth {
  id: string;
  name: string;
  client: { name: string } | null;
  month: { name: string } | null;
  totalSpend: number | null;
  fireTeamSpend: number | null;
  actualDeliverables: number | null;
  scopedDeliverables: number | null;
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