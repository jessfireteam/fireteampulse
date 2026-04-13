import { useQuery } from "@tanstack/react-query";
import { queryFibery } from "@/lib/fibery";

// Types for the raw Fibery response
interface WinnersProject {
  id: string;
  name: string;
  creationDate: string | null;
  client: { id: string; name: string } | null;
  type: { name: string } | null;
  projectRolesInternal: Array<{
    assignee: { id: string; name: string } | null;
    role: { id: string; name: string; publicId: string } | null;
  }> | null;
  projectContractorsExternal: Array<{
    id: string;
    contractor: { id: string; name: string } | null;
    role: { id: string; name: string; publicId: string } | null;
  }> | null;
  internalVersions: Array<{
    id: string;
    name: string;
    tags: Array<{ id: string; name: string }> | null;
  }> | null;
}

interface WinnersResponse {
  findProjects: WinnersProject[];
}

// Processed types
export interface ClientStat {
  name: string;
  total: number;
  winners: number;
  winRate: number;
}

export interface ClientBreakdown {
  total: number;
  winners: number;
  expectedWinners: number;
  clientRate: number;
}

export interface Contributor {
  name: string;
  role: string;
  rolePublicId: string;
  type: "internal" | "external";
  totalProjects: number;
  actualWinners: number;
  expectedWinners: number;
  rawWinRate: number;
  performanceIndex: number | null;
  clientBreakdown: Record<string, ClientBreakdown>;
}

export interface WinnersData {
  clientStats: ClientStat[];
  contributors: Contributor[];
  totalWinners: number;
  totalProjects: number;
}

const TRACKED_ROLE_IDS = new Set(["1", "6", "8", "9", "11"]);

const ROLE_LABELS: Record<string, string> = {
  "1": "VE",
  "6": "GD",
  "8": "AM",
  "9": "CD",
  "11": "CW",
};

export { ROLE_LABELS };

function processWinnersData(projects: WinnersProject[], dateFilter: string): WinnersData {
  // Apply date filter
  let filtered = projects;
  if (dateFilter !== "all") {
    const now = new Date();
    let cutoff: Date;
    if (dateFilter === "30d") cutoff = new Date(now.getTime() - 30 * 86400000);
    else if (dateFilter === "90d") cutoff = new Date(now.getTime() - 90 * 86400000);
    else {
      // this-year
      cutoff = new Date(now.getFullYear(), 0, 1);
    }
    const cutoffStr = cutoff.toISOString().split("T")[0];
    filtered = projects.filter(
      (p) => p.creationDate && p.creationDate >= cutoffStr
    );
  }

  // Step 1: Identify winning projects
  const winningProjectIds = new Set<string>();
  filtered.forEach((project) => {
    const isWinner = project.internalVersions?.some((version) =>
      version.tags?.some((tag) => tag.name?.startsWith("Winner - "))
    );
    if (isWinner) winningProjectIds.add(project.id);
  });

  // Step 2: Build client stats
  const clientStatsMap: Record<string, ClientStat> = {};
  filtered.forEach((project) => {
    if (!project.client) return;
    const cid = project.client.id;
    if (!clientStatsMap[cid]) {
      clientStatsMap[cid] = { name: project.client.name, total: 0, winners: 0, winRate: 0 };
    }
    clientStatsMap[cid].total++;
    if (winningProjectIds.has(project.id)) clientStatsMap[cid].winners++;
  });
  Object.values(clientStatsMap).forEach((c) => {
    c.winRate = c.total > 0 ? c.winners / c.total : 0;
  });

  // Step 3: Build contributor stats
  const contributorsMap: Record<string, Contributor> = {};

  filtered.forEach((project) => {
    const clientId = project.client?.id;
    const clientWinRate = clientId ? (clientStatsMap[clientId]?.winRate ?? 0) : 0;
    const isWinner = winningProjectIds.has(project.id);

    // Internal roles
    project.projectRolesInternal?.forEach((pr) => {
      if (!pr.assignee || !pr.role) return;
      if (!TRACKED_ROLE_IDS.has(String(pr.role.publicId))) return;
      const key = `internal_${pr.assignee.id}_${pr.role.publicId}`;
      if (!contributorsMap[key]) {
        contributorsMap[key] = {
          name: pr.assignee.name,
          role: pr.role.name,
          rolePublicId: String(pr.role.publicId),
          type: "internal",
          totalProjects: 0,
          actualWinners: 0,
          expectedWinners: 0,
          rawWinRate: 0,
          performanceIndex: null,
          clientBreakdown: {},
        };
      }
      const c = contributorsMap[key];
      c.totalProjects++;
      if (isWinner) c.actualWinners++;
      c.expectedWinners += clientWinRate;

      const cn = project.client?.name ?? "Unknown";
      if (!c.clientBreakdown[cn]) {
        c.clientBreakdown[cn] = { total: 0, winners: 0, expectedWinners: 0, clientRate: clientWinRate };
      }
      c.clientBreakdown[cn].total++;
      if (isWinner) c.clientBreakdown[cn].winners++;
      c.clientBreakdown[cn].expectedWinners += clientWinRate;
    });

    // External contractors
    project.projectContractorsExternal?.forEach((pc) => {
      if (!pc.contractor || !pc.role) return;
      if (!TRACKED_ROLE_IDS.has(String(pc.role.publicId))) return;
      const key = `external_${pc.contractor.id}_${pc.role.publicId}`;
      if (!contributorsMap[key]) {
        contributorsMap[key] = {
          name: pc.contractor.name,
          role: pc.role.name,
          rolePublicId: String(pc.role.publicId),
          type: "external",
          totalProjects: 0,
          actualWinners: 0,
          expectedWinners: 0,
          rawWinRate: 0,
          performanceIndex: null,
          clientBreakdown: {},
        };
      }
      const c = contributorsMap[key];
      c.totalProjects++;
      if (isWinner) c.actualWinners++;
      c.expectedWinners += clientWinRate;

      const cn = project.client?.name ?? "Unknown";
      if (!c.clientBreakdown[cn]) {
        c.clientBreakdown[cn] = { total: 0, winners: 0, expectedWinners: 0, clientRate: clientWinRate };
      }
      c.clientBreakdown[cn].total++;
      if (isWinner) c.clientBreakdown[cn].winners++;
      c.clientBreakdown[cn].expectedWinners += clientWinRate;
    });
  });

  // Step 4: Calculate Performance Index
  Object.values(contributorsMap).forEach((c) => {
    c.rawWinRate = c.totalProjects > 0 ? c.actualWinners / c.totalProjects : 0;
    c.performanceIndex =
      c.expectedWinners > 0
        ? Math.round((c.actualWinners / c.expectedWinners) * 100)
        : null;
  });

  return {
    clientStats: Object.values(clientStatsMap).sort((a, b) => b.winRate - a.winRate),
    contributors: Object.values(contributorsMap),
    totalWinners: winningProjectIds.size,
    totalProjects: filtered.length,
  };
}

export function useWinnersData(dateFilter: string) {
  const query = useQuery({
    queryKey: ["fibery", "winners"],
    queryFn: () => queryFibery<WinnersResponse>("winners"),
    staleTime: 5 * 60 * 1000,
  });

  const processed = query.data
    ? processWinnersData(query.data.findProjects, dateFilter)
    : null;

  return {
    data: processed,
    isLoading: query.isLoading,
    error: query.error,
  };
}
