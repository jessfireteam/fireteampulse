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
  recentTotal: number;
  recentWinners: number;
  recentWinRate: number | null;
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
  // Last-90-day rolling figures (based on project doneDate)
  recentProjects: number;
  recentActualWinners: number;
  recentExpectedWinners: number;
  recentPerformanceIndex: number | null;
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
  // Last-90-day rolling stats — used for the Overall Win Rate KPI so that
  // early months (where winners get tagged late) don't drag the rate down.
  recentWinners: number;
  recentProjects: number;
  recentWinRate: number;
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

// Normalize names that come through as raw emails from Fibery
const NAME_OVERRIDES: Record<string, string> = {
  "riteesh@fireteam.is": "Riteesh",
  "shreya8881@gmail.com": "Shreya",
  "amanda@fireteam.is": "Amanda",
};

function normalizeName(name: string): string {
  return NAME_OVERRIDES[name.toLowerCase()] ?? name;
}

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

  // Cutoff for "last 90 days" — used for both contributors and clients.
  // Clients use winnerDate (or creationDate fallback) for recency.
  const ninetyDaysAgoStr = new Date(Date.now() - 90 * 86400000)
    .toISOString()
    .split("T")[0];

  filtered.forEach((project) => {
    if (!project.client) return;
    // Only completed projects contribute to client baselines. Otherwise
    // "Concept" / brief / abandoned projects pad the denominator with zero
    // winners and pull every Windex above 100. Same filter applied to the
    // contributor tally below for consistency.
    if (!project.doneDate && project.status?.name !== "Completed") return;
    const cid = project.client.id;
    const adType = classifyAdType(project);
    const isWin = winningProjectIds.has(project.id);
    const winDate = winnerDateMap.get(project.id) ?? project.creationDate;
    const isRecentClient = !!winDate && winDate >= ninetyDaysAgoStr;

    if (!clientStatsMap[cid]) {
      clientStatsMap[cid] = {
        name: project.client.name,
        total: 0,
        winners: 0,
        winRate: 0,
        recentTotal: 0,
        recentWinners: 0,
        recentWinRate: null,
      };
    }
    clientStatsMap[cid].total++;
    if (isWin) clientStatsMap[cid].winners++;
    if (isRecentClient) {
      clientStatsMap[cid].recentTotal++;
      if (isWin) clientStatsMap[cid].recentWinners++;
    }

    if (!clientTypeStatsMap[cid]) clientTypeStatsMap[cid] = {};
    if (!clientTypeStatsMap[cid][adType]) clientTypeStatsMap[cid][adType] = { total: 0, winners: 0 };
    clientTypeStatsMap[cid][adType].total++;
    if (isWin) clientTypeStatsMap[cid][adType].winners++;
  });
  Object.values(clientStatsMap).forEach((c) => {
    c.winRate = c.total > 0 ? c.winners / c.total : 0;
    c.recentWinRate = c.recentTotal > 0 ? c.recentWinners / c.recentTotal : null;
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
  // Only include projects that are completed (have doneDate or status "Completed")
  // so that briefs/in-flight work don't drag down PI before they've had a chance to win.
  const isProjectComplete = (p: WinnersProject) =>
    !!p.doneDate || p.status?.name === "Completed";

  const contributorsMap: Record<string, Contributor> = {};

  // Reuse ninetyDaysAgoStr from above for contributor recency

  filtered.forEach((project) => {
    if (!isProjectComplete(project)) return;
    const clientId = project.client?.id;
    const adType = classifyAdType(project);
    const isWinner = winningProjectIds.has(project.id);
    const isRecent = !!project.doneDate && project.doneDate >= ninetyDaysAgoStr;

    const accumulate = (c: Contributor, baseline: number) => {
      c.totalProjects++;
      if (isWinner) c.actualWinners++;
      c.expectedWinners += baseline;
      if (isRecent) {
        c.recentProjects++;
        if (isWinner) c.recentActualWinners++;
        c.recentExpectedWinners += baseline;
      }
      const cn = project.client?.name ?? "Unknown";
      if (!c.clientBreakdown[cn]) {
        c.clientBreakdown[cn] = { total: 0, winners: 0, expectedWinners: 0, clientRate: baseline };
      }
      c.clientBreakdown[cn].total++;
      if (isWinner) c.clientBreakdown[cn].winners++;
      c.clientBreakdown[cn].expectedWinners += baseline;
    };

    const makeContributor = (
      name: string,
      role: string,
      roleId: string,
      type: "internal" | "external",
    ): Contributor => ({
      name,
      role,
      rolePublicId: roleId,
      type,
      totalProjects: 0,
      actualWinners: 0,
      expectedWinners: 0,
      rawWinRate: 0,
      performanceIndex: null,
      recentProjects: 0,
      recentActualWinners: 0,
      recentExpectedWinners: 0,
      recentPerformanceIndex: null,
      clientBreakdown: {},
    });

    // Internal roles
    project.projectRolesInternal?.forEach((pr) => {
      if (!pr.assignee || !pr.role) return;
      if (!TRACKED_ROLE_IDS.has(String(pr.role.publicId))) return;
      const roleId = String(pr.role.publicId);
      const baseline = clientId ? getBaselineRate(clientId, roleId, adType) : 0;
      const key = `internal_${pr.assignee.id}_${roleId}`;
      if (!contributorsMap[key]) {
        contributorsMap[key] = makeContributor(
          normalizeName(pr.assignee.name),
          pr.role.name,
          roleId,
          "internal",
        );
      }
      accumulate(contributorsMap[key], baseline);
    });

    // External contractors
    project.projectContractorsExternal?.forEach((pc) => {
      if (!pc.contractor || !pc.role) return;
      if (!TRACKED_ROLE_IDS.has(String(pc.role.publicId))) return;
      const roleId = String(pc.role.publicId);
      const baseline = clientId ? getBaselineRate(clientId, roleId, adType) : 0;
      const key = `external_${pc.contractor.id}_${roleId}`;
      if (!contributorsMap[key]) {
        contributorsMap[key] = makeContributor(
          normalizeName(pc.contractor.name),
          pc.role.name,
          roleId,
          "external",
        );
      }
      accumulate(contributorsMap[key], baseline);
    });
  });

  // Step 4: Calculate Performance Index (all-time + last 90 days)
  Object.values(contributorsMap).forEach((c) => {
    c.rawWinRate = c.totalProjects > 0 ? c.actualWinners / c.totalProjects : 0;
    c.performanceIndex =
      c.expectedWinners > 0
        ? Math.round((c.actualWinners / c.expectedWinners) * 100)
        : null;
    c.recentPerformanceIndex =
      c.recentExpectedWinners > 0
        ? Math.round((c.recentActualWinners / c.recentExpectedWinners) * 100)
        : null;
  });

  // Step 5: Build monthly winners
  // Skip Sep '25 and Oct '25 — winners are typically tagged 2-3 months after
  // creation, so those early months have artificially low winner counts.
  const MONTHLY_CHART_START = "2025-11-01";
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthMap: Record<string, { winners: number; total: number }> = {};

  const allPostTracking = projects.filter(
    (p) => p.creationDate && p.creationDate >= MONTHLY_CHART_START
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
      if (wKey >= "2025-11") {
        if (!monthMap[wKey]) monthMap[wKey] = { winners: 0, total: 0 };
        monthMap[wKey].winners++;
      }
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

  // Step 6: Last-90-day rolling overall win rate (bucketed by winnerDate / creationDate)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  let recentWinners = 0;
  let recentProjects = 0;
  projects.forEach((p) => {
    if (!p.creationDate) return;
    const winDate = getWinnerDate(p);
    const dateToCheck = winDate ?? p.creationDate;
    if (dateToCheck < ninetyDaysAgo) return;
    recentProjects++;
    if (winDate) recentWinners++;
  });

  return {
    clientStats: Object.values(clientStatsMap).sort((a, b) => b.winRate - a.winRate),
    contributors: Object.values(contributorsMap),
    totalWinners: winningProjectIds.size,
    totalProjects: filtered.length,
    monthlyWinners,
    recentWinners,
    recentProjects,
    recentWinRate: recentProjects > 0 ? recentWinners / recentProjects : 0,
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

// ============================================================================
// Creator-level winner stats (for Creator Costs dashboard)
// ============================================================================

export interface CreatorWinnerStats {
  // Canonical display name (first one we saw for this normalized key)
  displayName: string;
  totalProjects: number;
  winningProjects: number;
  expectedWinners: number;
  rawWinRate: number;
  windex: number | null; // Performance index: (actualWinners / expectedWinners) * 100
  recentTotalProjects: number;
  recentWinningProjects: number;
  recentExpectedWinners: number;
  recentWindex: number | null;
  winnerProjectNames: Array<{ name: string; client: string; winnerDate: string | null }>;
}

export function normalizeCreatorName(name: string): string {
  return normalizeName(name).toLowerCase().trim().replace(/\s+/g, " ");
}

function processCreatorWinnerStats(
  projects: WinnersProject[]
): Map<string, CreatorWinnerStats> {
  // Only projects since winner tracking began
  const filtered = projects.filter(
    (p) => p.creationDate && p.creationDate >= WINNERS_TRACKING_START
  );

  // Build client baselines — same logic as processWinnersData, minus date filter
  const clientStatsMap: Record<string, { total: number; winners: number; byType: Record<string, { total: number; winners: number }> }> = {};
  const winningProjectIds = new Set<string>();
  const winnerDateMap = new Map<string, string>();

  filtered.forEach((p) => {
    const winDate = getWinnerDate(p);
    if (winDate) {
      winningProjectIds.add(p.id);
      winnerDateMap.set(p.id, winDate);
    }
    if (!p.client) return;
    // Baselines only include completed projects so non-shipped briefs don't
    // dilute the rate (matches the contributor-tally filter below).
    if (!p.doneDate && p.status?.name !== "Completed") return;
    const cid = p.client.id;
    const adType = classifyAdType(p);
    if (!clientStatsMap[cid]) clientStatsMap[cid] = { total: 0, winners: 0, byType: {} };
    if (!clientStatsMap[cid].byType[adType]) clientStatsMap[cid].byType[adType] = { total: 0, winners: 0 };
    clientStatsMap[cid].total++;
    clientStatsMap[cid].byType[adType].total++;
    if (winDate) {
      clientStatsMap[cid].winners++;
      clientStatsMap[cid].byType[adType].winners++;
    }
  });

  const getBaseline = (clientId: string, adType: "video" | "static"): number => {
    const c = clientStatsMap[clientId];
    if (!c) return 0;
    const typeStats = c.byType[adType];
    if (typeStats && typeStats.total >= 5) return typeStats.winners / typeStats.total;
    return c.total > 0 ? c.winners / c.total : 0;
  };

  // Aggregate per creator (external contractors only, all roles)
  const ninetyDaysAgoStr = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const creatorMap = new Map<string, CreatorWinnerStats>();

  filtered.forEach((project) => {
    // Only count completed projects — briefs/in-flight shouldn't penalize Windex
    const isComplete = !!project.doneDate || project.status?.name === "Completed";
    if (!isComplete) return;

    const clientId = project.client?.id;
    if (!clientId) return;
    const adType = classifyAdType(project);
    const baseline = getBaseline(clientId, adType);
    const isWinner = winningProjectIds.has(project.id);
    const isRecent = !!project.doneDate && project.doneDate >= ninetyDaysAgoStr;
    const winDate = winnerDateMap.get(project.id) ?? null;

    // Dedupe contractors within a single project (same person in multiple roles)
    const seenOnProject = new Set<string>();
    project.projectContractorsExternal?.forEach((pc) => {
      if (!pc.contractor?.name) return;
      const rawName = pc.contractor.name;
      const key = normalizeCreatorName(rawName);
      if (seenOnProject.has(key)) return;
      seenOnProject.add(key);

      if (!creatorMap.has(key)) {
        creatorMap.set(key, {
          displayName: normalizeName(rawName),
          totalProjects: 0,
          winningProjects: 0,
          expectedWinners: 0,
          rawWinRate: 0,
          windex: null,
          recentTotalProjects: 0,
          recentWinningProjects: 0,
          recentExpectedWinners: 0,
          recentWindex: null,
          winnerProjectNames: [],
        });
      }
      const c = creatorMap.get(key)!;
      c.totalProjects++;
      c.expectedWinners += baseline;
      if (isWinner) {
        c.winningProjects++;
        c.winnerProjectNames.push({
          name: project.name,
          client: project.client?.name ?? "Unknown",
          winnerDate: winDate,
        });
      }
      if (isRecent) {
        c.recentTotalProjects++;
        c.recentExpectedWinners += baseline;
        if (isWinner) c.recentWinningProjects++;
      }
    });
  });

  // Finalize
  creatorMap.forEach((c) => {
    c.rawWinRate = c.totalProjects > 0 ? c.winningProjects / c.totalProjects : 0;
    c.windex = c.expectedWinners > 0 ? Math.round((c.winningProjects / c.expectedWinners) * 100) : null;
    c.recentWindex = c.recentExpectedWinners > 0
      ? Math.round((c.recentWinningProjects / c.recentExpectedWinners) * 100)
      : null;
    c.winnerProjectNames.sort((a, b) => (b.winnerDate ?? "").localeCompare(a.winnerDate ?? ""));
  });

  return creatorMap;
}

export function useCreatorWinnerStats() {
  const query = useQuery({
    queryKey: ["fibery", "winners"],
    queryFn: () => queryFibery<WinnersResponse>("winners"),
    staleTime: 5 * 60 * 1000,
  });

  const stats = query.data ? processCreatorWinnerStats(query.data.findProjects) : null;

  return { stats, isLoading: query.isLoading, error: query.error };
}
