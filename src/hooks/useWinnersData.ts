import { useQuery } from "@tanstack/react-query";
import { queryFibery } from "@/lib/fibery";

// Types for the raw Fibery response
interface WinnersProject {
  id: string;
  name: string;
  creationDate: string | null;
  doneDate: string | null;
  status: { name: string } | null;
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
    winnerDate: string | null;
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

export interface MonthlyWinners {
  month: string; // "Sep '25"
  winners: number;
  total: number;
  winRate: number;
}

export interface WinnersData {
  clientStats: ClientStat[];
  contributors: Contributor[];
  totalWinners: number;
  totalProjects: number;
  monthlyWinners: MonthlyWinners[];
}

const TRACKED_ROLE_IDS = new Set(["1", "6", "8", "9", "11"]);

const ROLE_LABELS: Record<string, string> = {
  "1": "VE",
  "6": "GD",
  "8": "AM",
  "9": "CD",
  "11": "CW",
};

// Roles that should use type-specific baselines
const VIDEO_ROLE_IDS = new Set(["1"]); // VE
const STATIC_ROLE_IDS = new Set(["6"]); // GD

export { ROLE_LABELS };

// Classify project type as video or static
function classifyAdType(project: WinnersProject): "video" | "static" {
  const t = project.type?.name?.toLowerCase() ?? "";
  if (t.includes("video") || t.includes("ugc") || t.includes("lofi") || t.includes("lo-fi") || t.includes("edit")) return "video";
  return "static";
}

// Winners tracking started September 2025 — exclude all projects before this
const WINNERS_TRACKING_START = "2025-09-01";

function getWinnerDate(project: WinnersProject): string | null {
  for (const version of project.internalVersions ?? []) {
    const isWinner = version.tags?.some((t) => t.name?.startsWith("Winner - "));
    if (isWinner) {
      return version.winnerDate ?? project.creationDate;
    }
  }
  return null;
}

function processWinnersData(projects: WinnersProject[], dateFilter: string): WinnersData {
  // Always exclude projects before winner tracking began
  let filtered = projects.filter(
    (p) => p.creationDate && p.creationDate >= WINNERS_TRACKING_START
  );

  // Apply additional date filter
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
    filtered = filtered.filter((p) => {
      const winDate = getWinnerDate(p);
      // Non-winners: use creationDate; Winners: use winnerDate (with fallback)
      const dateToCheck = winDate ?? p.creationDate;
      return dateToCheck && dateToCheck >= cutoffStr;
    });
  }

  // Step 1: Identify winning projects and their winner dates
  const winningProjectIds = new Set<string>();
  const winnerDateMap = new Map<string, string>();
  filtered.forEach((project) => {
    const winDate = getWinnerDate(project);
    if (winDate) {
      winningProjectIds.add(project.id);
      winnerDateMap.set(project.id, winDate);
    }
  });

  // Step 2: Build client stats (overall + by ad type)
  const clientStatsMap: Record<string, ClientStat> = {};
  // client_id -> ad_type -> { total, winners }
  const clientTypeStatsMap: Record<string, Record<string, { total: number; winners: number }>> = {};

  filtered.forEach((project) => {
    if (!project.client) return;
    const cid = project.client.id;
    const adType = classifyAdType(project);

    if (!clientStatsMap[cid]) {
      clientStatsMap[cid] = { name: project.client.name, total: 0, winners: 0, winRate: 0 };
    }
    clientStatsMap[cid].total++;
    if (winningProjectIds.has(project.id)) clientStatsMap[cid].winners++;

    if (!clientTypeStatsMap[cid]) clientTypeStatsMap[cid] = {};
    if (!clientTypeStatsMap[cid][adType]) clientTypeStatsMap[cid][adType] = { total: 0, winners: 0 };
    clientTypeStatsMap[cid][adType].total++;
    if (winningProjectIds.has(project.id)) clientTypeStatsMap[cid][adType].winners++;
  });
  Object.values(clientStatsMap).forEach((c) => {
    c.winRate = c.total > 0 ? c.winners / c.total : 0;
  });

  // Helper: get the appropriate win rate for a role on a client
  function getBaselineRate(clientId: string, rolePublicId: string, adType: "video" | "static"): number {
    // VE → video baseline, GD → static baseline, others → overall client baseline
    if (VIDEO_ROLE_IDS.has(rolePublicId) || STATIC_ROLE_IDS.has(rolePublicId)) {
      const typeKey = VIDEO_ROLE_IDS.has(rolePublicId) ? "video" : "static";
      const typeStats = clientTypeStatsMap[clientId]?.[typeKey];
      if (typeStats && typeStats.total > 0) return typeStats.winners / typeStats.total;
      // Fall back to overall if no projects of that type
      return clientStatsMap[clientId]?.winRate ?? 0;
    }
    return clientStatsMap[clientId]?.winRate ?? 0;
  }

  // Step 3: Build contributor stats
  const contributorsMap: Record<string, Contributor> = {};

  filtered.forEach((project) => {
    const clientId = project.client?.id;
    const adType = classifyAdType(project);
    const isWinner = winningProjectIds.has(project.id);

    // Internal roles
    project.projectRolesInternal?.forEach((pr) => {
      if (!pr.assignee || !pr.role) return;
      if (!TRACKED_ROLE_IDS.has(String(pr.role.publicId))) return;
      const roleId = String(pr.role.publicId);
      const baseline = clientId ? getBaselineRate(clientId, roleId, adType) : 0;
      const key = `internal_${pr.assignee.id}_${roleId}`;
      if (!contributorsMap[key]) {
        contributorsMap[key] = {
          name: pr.assignee.name,
          role: pr.role.name,
          rolePublicId: roleId,
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
      c.expectedWinners += baseline;

      const cn = project.client?.name ?? "Unknown";
      if (!c.clientBreakdown[cn]) {
        c.clientBreakdown[cn] = { total: 0, winners: 0, expectedWinners: 0, clientRate: baseline };
      }
      c.clientBreakdown[cn].total++;
      if (isWinner) c.clientBreakdown[cn].winners++;
      c.clientBreakdown[cn].expectedWinners += baseline;
    });

    // External contractors
    project.projectContractorsExternal?.forEach((pc) => {
      if (!pc.contractor || !pc.role) return;
      if (!TRACKED_ROLE_IDS.has(String(pc.role.publicId))) return;
      const roleId = String(pc.role.publicId);
      const baseline = clientId ? getBaselineRate(clientId, roleId, adType) : 0;
      const key = `external_${pc.contractor.id}_${roleId}`;
      if (!contributorsMap[key]) {
        contributorsMap[key] = {
          name: pc.contractor.name,
          role: pc.role.name,
          rolePublicId: roleId,
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
      c.expectedWinners += baseline;

      const cn = project.client?.name ?? "Unknown";
      if (!c.clientBreakdown[cn]) {
        c.clientBreakdown[cn] = { total: 0, winners: 0, expectedWinners: 0, clientRate: baseline };
      }
      c.clientBreakdown[cn].total++;
      if (isWinner) c.clientBreakdown[cn].winners++;
      c.clientBreakdown[cn].expectedWinners += baseline;
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

  // Step 5: Build monthly winners (always from Sep '25, ignoring dateFilter)
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthMap: Record<string, { winners: number; total: number }> = {};

  // Use all post-tracking projects (not filtered by dateFilter)
  const allPostTracking = projects.filter(
    (p) => p.creationDate && p.creationDate >= WINNERS_TRACKING_START
  );
  allPostTracking.forEach((p) => {
    if (!p.creationDate) return;
    const winDate = getWinnerDate(p);
    // For total count, bucket by creationDate
    const d = new Date(p.creationDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { winners: 0, total: 0 };
    monthMap[key].total++;
    // For winners, bucket by winnerDate (falls back to creationDate)
    if (winDate) {
      const wd = new Date(winDate);
      const wKey = `${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[wKey]) monthMap[wKey] = { winners: 0, total: 0 };
      monthMap[wKey].winners++;
    }
  });

  const monthlyWinners: MonthlyWinners[] = Object.keys(monthMap)
    .sort()
    .map((key) => {
      const [y, m] = key.split("-");
      const label = `${MONTH_NAMES[parseInt(m, 10) - 1]} '${y.slice(2)}`;
      const d = monthMap[key];
      return { month: label, winners: d.winners, total: d.total, winRate: d.total > 0 ? d.winners / d.total : 0 };
    });

  return {
    clientStats: Object.values(clientStatsMap).sort((a, b) => b.winRate - a.winRate),
    contributors: Object.values(contributorsMap),
    totalWinners: winningProjectIds.size,
    totalProjects: filtered.length,
    monthlyWinners,
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
