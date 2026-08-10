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
  measurable: boolean;
}

// Account-Manager "Book Trend" index. AMs are ~1-per-client, so a
// client-normalized Windex cancels them out (they define their own baseline)
// and a raw book index just measures who was handed the easy clients. The
// trend index sidesteps both: it freezes each client's baseline from a prior
// window and scores the AM's recent book against it (so client difficulty
// cancels — Rejuvia is compared to Rejuvia's own past), while the AM's recent
// performance is NOT in the baseline (so it doesn't self-cancel). It measures
// whether the book got better/worse than it was, adjusted for agency-wide
// drift. Single-quarter values are noisy — that's what `series` is for.
export interface AmTrend {
  index: number | null;
  actual: number; // winners in the score window
  projects: number; // projects in the score window
  expected: number;
  significant: boolean;
  scoreLabel: string; // e.g. "Apr '26–Jun '26"
  baselineLabel: string; // e.g. "Dec '25–Mar '26"
  // The same index computed over consecutive rolling windows, oldest first,
  // ending at the primary window above. One quarter of AM output is 5-15
  // winners, so a single value swings ±50 on Poisson noise alone — the series
  // is the only honest read. Rendered as a sparkline next to the index.
  series: Array<{ label: string; index: number | null; significant: boolean }>;
  // Per-client detail for the score window, so the expanded row reconciles with
  // the index above it. The craft Windex's leave-one-out breakdown is useless
  // for an AM: they're the only AM on nearly every account, so removing them
  // removes the whole baseline and every real client reads "n/a" while a
  // 1-project sliver on someone else's account reads as measurable. Here the
  // baseline is the client's own prior window instead, which every client has
  // (or falls back to the agency rate).
  clients: AmTrendClient[];
}

export interface AmTrendClient {
  name: string;
  projects: number; // projects completed in the score window
  winners: number;
  expected: number;
  // The client's own prior-window record, [maturedProjects, winners]. Zero
  // projects means no history in the baseline window, so `expected` came off
  // the agency rate rather than this client's own past.
  baselineProjects: number;
  baselineWinners: number;
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
  // Empirical-Bayes shrunk index — pulls small samples toward 100 so a
  // lucky 2/3 doesn't outrank a proven 20/160. This is the number to trust.
  shrunkIndex: number | null;
  // True when the raw index's ~90% confidence interval excludes 100 (i.e.
  // the over/under-performance is unlikely to be noise).
  significant: boolean;
  // False when the person covers ~all of their clients' projects, so there's
  // no independent baseline to measure them against (CDs, most AMs).
  measurable: boolean;
  // Last-90-day rolling figures (based on project doneDate)
  recentProjects: number;
  recentActualWinners: number;
  recentExpectedWinners: number;
  recentPerformanceIndex: number | null;
  clientBreakdown: Record<string, ClientBreakdown>;
  // Populated only for Account Managers (rolePublicId "8"); see AmTrend.
  amTrend?: AmTrend;
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

// Contributors excluded from all winner/Windex math. Kenny Fisher was a
// production lead who added himself as an external contractor on top of the
// editors/designers who actually did the work (55+ duplicate-role rows), so
// his "performance" is a phantom that both double-counts projects and drags
// down whoever he was layered onto. He has left the org. Matched on
// normalized full name (see normalizeCreatorName).
const EXCLUDED_CONTRIBUTORS = new Set<string>(["kenny fisher"]);

function isExcluded(name: string): boolean {
  return EXCLUDED_CONTRIBUTORS.has(name.toLowerCase().trim().replace(/\s+/g, " "));
}

// ---------------------------------------------------------------------------
// Winner-tag maturity curve
// ---------------------------------------------------------------------------
// Winners are tagged well after a project is marked Done — empirically a median
// of ~2-3 weeks, but only ~56% are tagged by day 22 and it takes ~85 days to
// see ~all of them (winner tagging happens in a monthly batch, so the tail is
// long). A project done yesterday is not a "loser" — it just hasn't had its
// chance yet. So instead of a hard cutoff, every completed project contributes
// to expected-winners in proportion to how many of its eventual winners we'd
// expect to have SEEN by now. maturityWeight(daysSinceDone) returns that
// fraction. Recompute the breakpoints quarterly from the done->winnerDate lag
// distribution (see winners-windex-review in the fireteam repo).
const MATURITY_CURVE: Array<[number, number]> = [
  [0, 0.0],
  [14, 0.25],
  [22, 0.56],
  [52, 0.8],
  [67, 0.9],
  [85, 1.0],
];
// Floor so a project that wins within days of completion doesn't divide by ~0.
const MATURITY_FLOOR = 0.05;

function maturityWeight(daysSinceDone: number): number {
  if (daysSinceDone >= 85) return 1.0;
  if (daysSinceDone <= 0) return MATURITY_FLOOR;
  for (let i = 1; i < MATURITY_CURVE.length; i++) {
    const [x1, y1] = MATURITY_CURVE[i];
    if (daysSinceDone <= x1) {
      const [x0, y0] = MATURITY_CURVE[i - 1];
      const t = (daysSinceDone - x0) / (x1 - x0);
      return Math.max(MATURITY_FLOOR, y0 + t * (y1 - y0));
    }
  }
  return 1.0;
}

// Winners tracking started September 2025 — exclude all projects before this
const WINNERS_TRACKING_START = "2025-09-01";

// EB shrinkage strength: number of baseline-projects' worth of prior pull
// toward index 100. Higher = more conservative on small samples.
const SHRINK_STRENGTH = 20;
// z for a ~90% two-sided confidence interval.
const SIGNIFICANCE_Z = 1.64;
// Minimum fraction of a person's projects that must be independently
// baseline-able (leave-one-out) for their index to be shown. Production /
// creative roles (VE, GD, CW) almost always share a client with a peer, so
// ~all their work is measurable. Account Managers and the Creative Director
// are ~1-per-client, so LOO can only cover the rare shared-client sliver —
// an index built on 1-28% of someone's book is misleading, so we show n/a
// instead. (AM influence belongs in an origination-attribution metric, not
// here — see the winners-windex review.)
const MEASURABLE_COVERAGE_MIN = 0.8;

// AM Book-Trend windows (in calendar months, relative to now). Projects are
// bucketed by DONE date, not creation date: projects are created in bulk at
// brainstorms and then sit a median of 48 days (p90 106d) before production,
// so creation-date buckets are only ~40-50% settled and keep back-filling for
// months — which compares a fast-turnaround slice of the recent window against
// a far more complete baseline window. Done-date buckets close for good once
// the month ends. (Verified 2026-08-10: 0 of 1031 completed projects lack a
// doneDate, so there is nothing to fall back for.)
//
// The score window still ends LAG months before now so winners in it have had
// time to be tagged, but because expectations are now maturity-weighted (see
// maturityWeight) the lag no longer has to cover the whole tagging tail on its
// own — 2 months instead of 4 puts two extra quarters on the dashboard.
const AM_TREND_LAG_MONTHS = 2;
const AM_TREND_SCORE_MONTHS = 3;
const AM_TREND_BASELINE_MONTHS = 4;
// How many consecutive rolling windows to report as the sparkline series.
const AM_TREND_SERIES_WINDOWS = 5;
// Pseudo-projects of pull toward the agency base rate when a client's trailing
// baseline is thin (or missing — new clients fall back to the agency rate).
const AM_TREND_SHRINK = 15;
const AM_ROLE_ID = "8";

function getWinnerDate(project: WinnersProject): string | null {
  for (const version of project.internalVersions ?? []) {
    const isWinner = version.tags?.some((t) => t.name?.startsWith("Winner - "));
    if (isWinner) {
      return version.winnerDate ?? project.creationDate;
    }
  }
  return null;
}

// Classify project type as video or static
function classifyAdType(project: WinnersProject): "video" | "static" {
  const t = project.type?.name?.toLowerCase() ?? "";
  if (t.includes("video") || t.includes("ugc") || t.includes("lofi") || t.includes("lo-fi") || t.includes("edit")) return "video";
  return "static";
}

const isProjectComplete = (p: WinnersProject) =>
  !!p.doneDate || p.status?.name === "Completed";

// Days since a project was completed (falls back to creation date when a
// project is marked Completed but has no doneDate).
function daysSinceDone(p: WinnersProject, nowMs: number): number {
  const ref = p.doneDate ?? p.creationDate;
  if (!ref) return 85; // treat unknown as fully mature
  const ms = nowMs - new Date(ref.slice(0, 10) + "T00:00:00Z").getTime();
  return ms / 86400000;
}

// A running (winner, maturity-weight) accumulator for one client bucket.
interface WeightedAgg {
  weightSum: number; // Σ maturityWeight — the "matured project count"
  winners: number; // winners tagged so far
}
function newAgg(): WeightedAgg {
  return { weightSum: 0, winners: 0 };
}

// Calendar-month index (year*12 + monthIndex0) from an ISO date, and back to a
// "Mon 'YY" label. Used for the AM trailing-window trend.
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthIndexOfISO(iso: string): number {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
function monthIndexNow(nowMs: number): number {
  const d = new Date(nowMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
function labelForMonthIndex(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = idx % 12;
  return `${MONTH_ABBR[m]} '${String(y).slice(2)}`;
}

const amOf = (p: WinnersProject): { id: string; name: string } | null => {
  for (const pr of p.projectRolesInternal ?? []) {
    if (pr.assignee && pr.role && String(pr.role.publicId) === AM_ROLE_ID) return pr.assignee;
  }
  for (const pc of p.projectContractorsExternal ?? []) {
    if (pc.contractor && pc.role && String(pc.role.publicId) === AM_ROLE_ID) return pc.contractor;
  }
  return null;
};

// The month a project lands in for trend purposes. Done date, since that's
// when the work actually shipped and when its tagging clock starts; creation
// date only as a defensive fallback for a Completed row with no doneDate.
const trendMonthIndex = (p: WinnersProject): number | null => {
  const ref = p.doneDate ?? p.creationDate;
  return ref ? monthIndexOfISO(ref) : null;
};

interface AmWindow {
  index: number | null;
  actual: number;
  projects: number;
  expected: number;
  significant: boolean;
  scoreLabel: string;
  baselineLabel: string;
  clients: AmTrendClient[];
}

// One rolling window of the AM Book Trend. `lagMonths` is how far back the
// score window ends; everything else is derived from it.
function computeAmWindow(
  completed: WinnersProject[],
  nowMs: number,
  lagMonths: number
): Map<string, AmWindow> {
  const trackingStartIdx = monthIndexOfISO(WINNERS_TRACKING_START);
  const scoreEnd = monthIndexNow(nowMs) - lagMonths;
  const scoreStart = scoreEnd - (AM_TREND_SCORE_MONTHS - 1);
  const baseEnd = scoreStart - 1;
  const baseStart = Math.max(trackingStartIdx, baseEnd - (AM_TREND_BASELINE_MONTHS - 1));
  const scoreLabel = `${labelForMonthIndex(scoreStart)}–${labelForMonthIndex(scoreEnd)}`;
  const baselineLabel = `${labelForMonthIndex(baseStart)}–${labelForMonthIndex(baseEnd)}`;

  // Client trailing baselines and the per-AM score window. Counts are
  // maturity-weighted (Σ maturityWeight, i.e. "matured project count") so a
  // project that finished three weeks ago contributes ~a quarter of a project's
  // worth of expectation rather than counting as a full loss.
  const clientBase: Record<string, [number, number]> = {}; // [maturedN, winners]
  const clientNames: Record<string, string> = {};
  let agBaseN = 0, agBaseW = 0, agScoreN = 0, agScoreW = 0;
  // perClient: [rawProjects, winners, maturedN]
  const amScore: Record<string, { name: string; perClient: Record<string, [number, number, number]> }> = {};

  completed.forEach((p) => {
    const idx = trendMonthIndex(p);
    if (idx === null) return;
    const cid = p.client?.id;
    if (cid && p.client?.name) clientNames[cid] = p.client.name;
    const win = getWinnerDate(p) ? 1 : 0;
    const mw = maturityWeight(daysSinceDone(p, nowMs));
    if (idx >= baseStart && idx <= baseEnd) {
      agBaseN += mw; agBaseW += win;
      if (cid) {
        if (!clientBase[cid]) clientBase[cid] = [0, 0];
        clientBase[cid][0] += mw; clientBase[cid][1] += win;
      }
    } else if (idx >= scoreStart && idx <= scoreEnd) {
      agScoreN += mw; agScoreW += win;
      const am = amOf(p);
      if (am && cid) {
        if (!amScore[am.id]) amScore[am.id] = { name: normalizeName(am.name), perClient: {} };
        const pc = amScore[am.id].perClient;
        if (!pc[cid]) pc[cid] = [0, 0, 0];
        pc[cid][0] += 1; pc[cid][1] += win; pc[cid][2] += mw;
      }
    }
  });

  const agRate = agBaseN > 1e-6 ? agBaseW / agBaseN : 0;
  // Agency-wide drift base->score, so an AM isn't penalized for a shop-wide dip.
  const drift =
    agBaseN > 1e-6 && agScoreN > 1e-6 && agBaseW > 0
      ? (agScoreW / agScoreN) / (agBaseW / agBaseN)
      : 1;

  const out = new Map<string, AmWindow>();
  Object.entries(amScore).forEach(([amId, data]) => {
    let expected = 0, actual = 0, projectsN = 0;
    const clients: AmTrendClient[] = [];
    Object.entries(data.perClient).forEach(([cid, [cn, cw, cmw]]) => {
      const [bn, bw] = clientBase[cid] ?? [0, 0];
      // Trailing client baseline, shrunk toward the agency rate for stability.
      // A client with no baseline-window history falls back to the agency rate;
      // measured 2026-08-10, genuinely-new clients win at 9.9% vs 9.5% for
      // established ones, so that fallback is not a meaningful bias.
      const shrunkBase = (bw + AM_TREND_SHRINK * agRate) / (bn + AM_TREND_SHRINK);
      const expectedC = cmw * shrunkBase * drift;
      expected += expectedC;
      actual += cw;
      projectsN += cn;
      clients.push({
        name: clientNames[cid] ?? cid,
        projects: cn,
        winners: cw,
        expected: expectedC,
        baselineProjects: bn,
        baselineWinners: bw,
      });
    });
    clients.sort((a, b) => b.projects - a.projects);
    const index = expected > 1e-6 ? Math.round((actual / expected) * 100) : null;
    const significant = expected > 1e-6 && Math.abs((actual - expected) / Math.sqrt(expected)) >= SIGNIFICANCE_Z;
    out.set(amId, { index, actual, projects: projectsN, expected, significant, scoreLabel, baselineLabel, clients });
  });
  return out;
}

// AM Book-Trend index — see AmTrend. Computed over fixed rolling windows,
// independent of the dashboard's date filter. Keyed by AM person id.
export function computeAmTrend(
  projects: WinnersProject[],
  retiredClients: Set<string>,
  nowMs: number
): Map<string, AmTrend> {
  const completed = projects.filter(
    (p) =>
      p.creationDate &&
      p.creationDate >= WINNERS_TRACKING_START &&
      !(p.client?.name && retiredClients.has(p.client.name)) &&
      isProjectComplete(p)
  );

  // Oldest window first, primary (freshest) window last.
  const lags: number[] = [];
  for (let i = AM_TREND_SERIES_WINDOWS - 1; i >= 0; i--) {
    lags.push(AM_TREND_LAG_MONTHS + i);
  }
  const windows = lags.map((lag) => computeAmWindow(completed, nowMs, lag));
  const primary = windows[windows.length - 1];

  const out = new Map<string, AmTrend>();
  primary.forEach((w, amId) => {
    out.set(amId, {
      ...w,
      series: windows.map((win) => {
        const v = win.get(amId);
        return {
          label: v?.scoreLabel ?? "",
          index: v?.index ?? null,
          significant: v?.significant ?? false,
        };
      }),
    });
  });
  return out;
}

export function processWinnersData(
  projects: WinnersProject[],
  dateFilter: string,
  retiredClients: Set<string>
): WinnersData {
  const nowMs = Date.now();

  // Always exclude projects before winner tracking began. Also exclude any
  // project whose client is in Retired status — the dashboard only shows
  // active clients, so the rates and contributor stats should match.
  let filtered = projects.filter(
    (p) =>
      p.creationDate &&
      p.creationDate >= WINNERS_TRACKING_START &&
      !(p.client?.name && retiredClients.has(p.client.name))
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

  // Step 2: Build client stats (overall + by ad type), maturity-weighted.
  // Displayed client win rate stays the simple winners/total (what people
  // expect to see), but the *baselines* used for Windex are maturity-weighted
  // so recent, not-yet-tagged projects don't deflate the expected rate.
  const clientStatsMap: Record<string, ClientStat> = {};
  // client_id -> { overall, video, static } weighted aggregates
  const clientAgg: Record<string, { overall: WeightedAgg; video: WeightedAgg; static: WeightedAgg }> = {};

  const ninetyDaysAgoStr = new Date(nowMs - 90 * 86400000)
    .toISOString()
    .split("T")[0];

  filtered.forEach((project) => {
    if (!project.client) return;
    // Only completed projects contribute to client baselines. Otherwise
    // "Concept" / brief / abandoned projects pad the denominator with zero
    // winners and pull every Windex above 100.
    if (!isProjectComplete(project)) return;
    const cid = project.client.id;
    const adType = classifyAdType(project);
    const isWin = winningProjectIds.has(project.id);
    const weight = maturityWeight(daysSinceDone(project, nowMs));
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
      clientAgg[cid] = { overall: newAgg(), video: newAgg(), static: newAgg() };
    }
    clientStatsMap[cid].total++;
    if (isWin) clientStatsMap[cid].winners++;
    if (isRecentClient) {
      clientStatsMap[cid].recentTotal++;
      if (isWin) clientStatsMap[cid].recentWinners++;
    }

    const agg = clientAgg[cid];
    agg.overall.weightSum += weight;
    agg[adType].weightSum += weight;
    if (isWin) {
      agg.overall.winners += 1;
      agg[adType].winners += 1;
    }
  });
  Object.values(clientStatsMap).forEach((c) => {
    c.winRate = c.total > 0 ? c.winners / c.total : 0;
    c.recentWinRate = c.recentTotal > 0 ? c.recentWinners / c.recentTotal : null;
  });

  // Pick the bucket a role is baselined against: VE -> video, GD -> static,
  // everyone else -> the client overall.
  function bucketForRole(rolePublicId: string): "overall" | "video" | "static" {
    if (VIDEO_ROLE_IDS.has(rolePublicId)) return "video";
    if (STATIC_ROLE_IDS.has(rolePublicId)) return "static";
    return "overall";
  }

  // Step 3: Per-contributor own aggregates, per client, in their bucket.
  // We need the person's OWN weighted winners/weight per client so we can
  // subtract them from the client baseline (leave-one-out): a person can't be
  // measured against a baseline they themselves define.
  interface ContribAccum {
    name: string;
    personId: string;
    role: string;
    rolePublicId: string;
    type: "internal" | "external";
    bucket: "overall" | "video" | "static";
    // client_id -> own weighted agg + client name + all-project counts
    perClient: Record<string, { clientName: string; own: WeightedAgg; total: number; winners: number }>;
    // recent (last-90d by doneDate) descriptive counts
    recentProjects: number;
    recentWinners: number;
    recentWeight: number;
  }
  const contributorsMap: Record<string, ContribAccum> = {};

  const makeAccum = (
    name: string,
    personId: string,
    role: string,
    roleId: string,
    type: "internal" | "external",
  ): ContribAccum => ({
    name,
    personId,
    role,
    rolePublicId: roleId,
    type,
    bucket: bucketForRole(roleId),
    perClient: {},
    recentProjects: 0,
    recentWinners: 0,
    recentWeight: 0,
  });

  const accumulate = (
    c: ContribAccum,
    project: WinnersProject,
    weight: number,
    isWin: boolean,
    isRecent: boolean,
  ) => {
    const cid = project.client?.id ?? "unknown";
    const cn = project.client?.name ?? "Unknown";
    if (!c.perClient[cid]) c.perClient[cid] = { clientName: cn, own: newAgg(), total: 0, winners: 0 };
    const pc = c.perClient[cid];
    pc.own.weightSum += weight;
    pc.total += 1;
    if (isWin) {
      pc.own.winners += 1;
      pc.winners += 1;
    }
    if (isRecent) {
      c.recentProjects += 1;
      c.recentWeight += weight;
      if (isWin) c.recentWinners += 1;
    }
  };

  filtered.forEach((project) => {
    if (!isProjectComplete(project)) return;
    const adType = classifyAdType(project);
    const isWinner = winningProjectIds.has(project.id);
    const isRecent = !!project.doneDate && project.doneDate >= ninetyDaysAgoStr;
    const weight = maturityWeight(daysSinceDone(project, nowMs));

    const handle = (
      person: { id: string; name: string },
      role: { publicId: string; name: string },
      type: "internal" | "external",
    ) => {
      const roleId = String(role.publicId);
      if (!TRACKED_ROLE_IDS.has(roleId)) return;
      const name = normalizeName(person.name);
      if (isExcluded(name)) return; // phantom contributor (Kenny)
      // Role vs project-type coherence: a Video Editor credited on a static,
      // or a Graphic Designer on a video, is almost always a bad template /
      // mis-assignment. Since VE is baselined on video and GD on static,
      // counting these would score them against the wrong baseline. Drop them.
      if (VIDEO_ROLE_IDS.has(roleId) && adType === "static") return;
      if (STATIC_ROLE_IDS.has(roleId) && adType === "video") return;

      const key = `${type}_${person.id}_${roleId}`;
      if (!contributorsMap[key]) {
        contributorsMap[key] = makeAccum(name, person.id, role.name, roleId, type);
      }
      accumulate(contributorsMap[key], project, weight, isWinner, isRecent);
    };

    project.projectRolesInternal?.forEach((pr) => {
      if (pr.assignee && pr.role) handle(pr.assignee, pr.role, "internal");
    });
    project.projectContractorsExternal?.forEach((pc) => {
      if (pc.contractor && pc.role) handle(pc.contractor, pc.role, "external");
    });
  });

  // AM Book-Trend index (fixed rolling windows, independent of dateFilter).
  const amTrendMap = computeAmTrend(projects, retiredClients, nowMs);

  // Step 4: Finalize each contributor with leave-one-out baselines, EB
  // shrinkage, and a significance flag.
  const contributors: Contributor[] = Object.values(contributorsMap).map((c) => {
    let expected = 0; // Σ looBaseline × maturity-weight (measurable clients)
    let measurableActual = 0; // winners on measurable clients (matches index)
    let varSum = 0; // Σ b(1-b)·weight — variance of expected under H0
    let measurableWeight = 0; // Σ weight on measurable clients
    let measurableProjects = 0; // project count on measurable clients
    let totalProjects = 0;
    let totalWinners = 0;

    const clientBreakdown: Record<string, ClientBreakdown> = {};

    Object.entries(c.perClient).forEach(([cid, pc]) => {
      totalProjects += pc.total;
      totalWinners += pc.winners;

      const agg = clientAgg[cid];
      // Choose the bucket; fall back to overall if the type bucket is empty.
      let bucketAgg = agg ? agg[c.bucket] : undefined;
      if (!bucketAgg || bucketAgg.weightSum <= pc.own.weightSum) {
        bucketAgg = agg?.overall;
      }

      let expectedC = 0;
      let measurable = false;
      let baseline = 0;
      if (bucketAgg) {
        // Leave-one-out: remove this person's own contribution from the
        // client baseline before scoring them against it.
        const looWeight = bucketAgg.weightSum - pc.own.weightSum;
        const looWinners = bucketAgg.winners - pc.own.winners;
        if (looWeight > 0.5) {
          baseline = Math.max(0, looWinners / looWeight);
          expectedC = baseline * pc.own.weightSum;
          measurable = true;
          expected += expectedC;
          measurableActual += pc.winners;
          measurableWeight += pc.own.weightSum;
          measurableProjects += pc.total;
          varSum += baseline * (1 - baseline) * pc.own.weightSum;
        }
      }

      clientBreakdown[pc.clientName] = {
        total: pc.total,
        winners: pc.winners,
        expectedWinners: expectedC,
        clientRate: baseline,
        measurable,
      };
    });

    // Too little of this person's book is independently baseline-able (they
    // define most of their own baseline) — don't publish a misleading index.
    const coverage = totalProjects > 0 ? measurableProjects / totalProjects : 0;
    const hasCoverage = expected > 1e-6 && coverage >= MEASURABLE_COVERAGE_MIN;

    const performanceIndex = hasCoverage
      ? Math.round((measurableActual / expected) * 100)
      : null;

    // EB shrinkage toward index 100 with SHRINK_STRENGTH baseline-projects.
    let shrunkIndex: number | null = null;
    if (hasCoverage && measurableWeight > 1e-6) {
      const avgBaseline = expected / measurableWeight;
      const priorExp = SHRINK_STRENGTH * avgBaseline;
      shrunkIndex = Math.round(
        ((measurableActual + priorExp) / (expected + priorExp)) * 100
      );
    }

    // Significance: does the ~90% CI on the raw index exclude 100?
    let significant = false;
    if (hasCoverage && varSum > 0) {
      const z = (measurableActual - expected) / Math.sqrt(varSum);
      significant = Math.abs(z) >= SIGNIFICANCE_Z;
    }

    // Recent (90d) index — kept for continuity; baselined the same way but at
    // the portfolio-average rate (recent samples are too thin per client for
    // per-client LOO). Deprecated in the UI in favor of the shrunk index.
    const avgBaselineAll = measurableWeight > 1e-6 ? expected / measurableWeight : 0;
    const recentExpected = c.recentWeight * avgBaselineAll;
    const recentPerformanceIndex =
      recentExpected > 1e-6 ? Math.round((c.recentWinners / recentExpected) * 100) : null;

    return {
      name: c.name,
      role: c.role,
      rolePublicId: c.rolePublicId,
      type: c.type,
      totalProjects,
      actualWinners: totalWinners,
      expectedWinners: expected,
      rawWinRate: totalProjects > 0 ? totalWinners / totalProjects : 0,
      performanceIndex,
      shrunkIndex,
      significant,
      measurable: performanceIndex !== null,
      recentProjects: c.recentProjects,
      recentActualWinners: c.recentWinners,
      recentExpectedWinners: recentExpected,
      recentPerformanceIndex,
      clientBreakdown,
      amTrend: c.rolePublicId === AM_ROLE_ID ? amTrendMap.get(c.personId) : undefined,
    };
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
  const ninetyDaysAgo = new Date(nowMs - 90 * 86400000).toISOString().split("T")[0];
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
    contributors,
    totalWinners: winningProjectIds.size,
    totalProjects: filtered.length,
    monthlyWinners,
    recentWinners,
    recentProjects,
    recentWinRate: recentProjects > 0 ? recentWinners / recentProjects : 0,
  };
}

interface ClientsResponse {
  findClients: Array<{ name: string; status: { name: string } | null }>;
}

export function useWinnersData(dateFilter: string) {
  const winnersQuery = useQuery({
    queryKey: ["fibery", "winners"],
    queryFn: () => queryFibery<WinnersResponse>("winners"),
    staleTime: 5 * 60 * 1000,
  });

  // Pull client list separately so we can identify retired clients without
  // changing the winners GraphQL query (which would require an Edge Function
  // redeploy). Joined client-side by name.
  const clientsQuery = useQuery({
    queryKey: ["fibery", "clients"],
    queryFn: () => queryFibery<ClientsResponse>("clients"),
    staleTime: 30 * 60 * 1000,
  });

  const retiredClients = new Set<string>(
    (clientsQuery.data?.findClients ?? [])
      .filter((c) => c.status?.name === "Retired")
      .map((c) => c.name)
  );

  const processed = winnersQuery.data
    ? processWinnersData(winnersQuery.data.findProjects, dateFilter, retiredClients)
    : null;

  return {
    data: processed,
    isLoading: winnersQuery.isLoading || clientsQuery.isLoading,
    error: winnersQuery.error ?? clientsQuery.error,
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
  shrunkWindex: number | null;
  significant: boolean;
  recentTotalProjects: number;
  recentWinningProjects: number;
  recentExpectedWinners: number;
  recentWindex: number | null;
  winnerProjectNames: Array<{ name: string; client: string; winnerDate: string | null }>;
}

export function normalizeCreatorName(name: string): string {
  return normalizeName(name).toLowerCase().trim().replace(/\s+/g, " ");
}

// Which contractor roles count toward creator stats. "content-creators"
// restricts to the Content Creator (CC) role — production roles like Video
// Editor (Alex) and Graphic Designer (Prince) have their own contributor
// views, and their per-project Windex measures something different (win rate
// of projects they edited/designed, not on-camera contribution).
export type CreatorRoleFilter = "all" | "content-creators";

export function processCreatorWinnerStats(
  projects: WinnersProject[],
  retiredClients: Set<string>,
  roleFilter: CreatorRoleFilter
): Map<string, CreatorWinnerStats> {
  const nowMs = Date.now();

  // Only projects since winner tracking began, and skip retired clients so
  // creator stats line up with the active-only contributor view.
  const filtered = projects.filter(
    (p) =>
      p.creationDate &&
      p.creationDate >= WINNERS_TRACKING_START &&
      !(p.client?.name && retiredClients.has(p.client.name))
  );

  // Build maturity-weighted client baselines (overall + by type), completed
  // projects only — same construction as the contributor path.
  const clientAgg: Record<string, { overall: WeightedAgg; video: WeightedAgg; static: WeightedAgg }> = {};
  const winningProjectIds = new Set<string>();
  const winnerDateMap = new Map<string, string>();

  filtered.forEach((p) => {
    const winDate = getWinnerDate(p);
    if (winDate) {
      winningProjectIds.add(p.id);
      winnerDateMap.set(p.id, winDate);
    }
    if (!p.client) return;
    if (!isProjectComplete(p)) return;
    const cid = p.client.id;
    const adType = classifyAdType(p);
    const weight = maturityWeight(daysSinceDone(p, nowMs));
    if (!clientAgg[cid]) clientAgg[cid] = { overall: newAgg(), video: newAgg(), static: newAgg() };
    const agg = clientAgg[cid];
    agg.overall.weightSum += weight;
    agg[adType].weightSum += weight;
    if (winDate) {
      agg.overall.winners += 1;
      agg[adType].winners += 1;
    }
  });

  // Per-creator own aggregates, per client + bucket, for leave-one-out.
  interface CreatorAccum {
    displayName: string;
    // cid -> { adType-aware own aggregates }
    perClient: Record<string, {
      overall: WeightedAgg; video: WeightedAgg; static: WeightedAgg;
      total: number; winners: number;
      // remember which bucket to use per project count (video if that type
      // bucket has >=5 client projects, else overall) — decided at read time
    }>;
    recentWeight: number;
    recentProjects: number;
    recentWinners: number;
    winnerProjectNames: Array<{ name: string; client: string; winnerDate: string | null }>;
  }
  const ninetyDaysAgoStr = new Date(nowMs - 90 * 86400000).toISOString().split("T")[0];
  const creatorMap = new Map<string, CreatorAccum>();

  filtered.forEach((project) => {
    if (!isProjectComplete(project)) return;
    const clientId = project.client?.id;
    if (!clientId) return;
    const adType = classifyAdType(project);
    const weight = maturityWeight(daysSinceDone(project, nowMs));
    const isWinner = winningProjectIds.has(project.id);
    const isRecent = !!project.doneDate && project.doneDate >= ninetyDaysAgoStr;
    const winDate = winnerDateMap.get(project.id) ?? null;

    const seenOnProject = new Set<string>();
    project.projectContractorsExternal?.forEach((pc) => {
      if (!pc.contractor?.name) return;
      if (
        roleFilter === "content-creators" &&
        !pc.role?.name?.toLowerCase().includes("content creator")
      ) return;
      const rawName = pc.contractor.name;
      const key = normalizeCreatorName(rawName);
      if (isExcluded(rawName)) return;
      if (seenOnProject.has(key)) return;
      seenOnProject.add(key);

      if (!creatorMap.has(key)) {
        creatorMap.set(key, {
          displayName: normalizeName(rawName),
          perClient: {},
          recentWeight: 0,
          recentProjects: 0,
          recentWinners: 0,
          winnerProjectNames: [],
        });
      }
      const c = creatorMap.get(key)!;
      if (!c.perClient[clientId]) {
        c.perClient[clientId] = { overall: newAgg(), video: newAgg(), static: newAgg(), total: 0, winners: 0 };
      }
      const pc2 = c.perClient[clientId];
      pc2.overall.weightSum += weight;
      pc2[adType].weightSum += weight;
      pc2.total += 1;
      if (isWinner) {
        pc2.overall.winners += 1;
        pc2[adType].winners += 1;
        pc2.winners += 1;
        c.winnerProjectNames.push({
          name: project.name,
          client: project.client?.name ?? "Unknown",
          winnerDate: winDate,
        });
      }
      if (isRecent) {
        c.recentProjects += 1;
        c.recentWeight += weight;
        if (isWinner) c.recentWinners += 1;
      }
    });
  });

  // Finalize
  const out = new Map<string, CreatorWinnerStats>();
  creatorMap.forEach((c, key) => {
    let expected = 0;
    let measurableActual = 0;
    let measurableWeight = 0;
    let varSum = 0;
    let totalProjects = 0;
    let totalWinners = 0;

    Object.entries(c.perClient).forEach(([cid, pc]) => {
      totalProjects += pc.total;
      totalWinners += pc.winners;
      const agg = clientAgg[cid];
      if (!agg) return;
      // Use the type bucket if the client has >=5 (weighted) projects of it,
      // else overall — mirrors the previous getBaseline behavior.
      const useVideo = agg.video.weightSum >= 5 && pc.video.weightSum > 0;
      const useStatic = agg.static.weightSum >= 5 && pc.static.weightSum > 0;
      // A creator can span types; account per bucket separately.
      const buckets: Array<["overall" | "video" | "static", WeightedAgg]> = [];
      if (useVideo) buckets.push(["video", pc.video]);
      if (useStatic) buckets.push(["static", pc.static]);
      // Remaining projects not covered by a used type bucket -> overall
      const coveredWeight = (useVideo ? pc.video.weightSum : 0) + (useStatic ? pc.static.weightSum : 0);
      const coveredWinners = (useVideo ? pc.video.winners : 0) + (useStatic ? pc.static.winners : 0);
      const overallOwn: WeightedAgg = {
        weightSum: pc.overall.weightSum - coveredWeight,
        winners: pc.overall.winners - coveredWinners,
      };
      if (overallOwn.weightSum > 1e-6) buckets.push(["overall", overallOwn]);

      buckets.forEach(([bucketName, own]) => {
        const bAgg = agg[bucketName];
        const looWeight = bAgg.weightSum - own.weightSum;
        const looWinners = bAgg.winners - own.winners;
        if (looWeight > 0.5) {
          const baseline = Math.max(0, looWinners / looWeight);
          expected += baseline * own.weightSum;
          measurableActual += own.winners;
          measurableWeight += own.weightSum;
          varSum += baseline * (1 - baseline) * own.weightSum;
        }
      });
    });

    const windex = expected > 1e-6 ? Math.round((measurableActual / expected) * 100) : null;
    let shrunkWindex: number | null = null;
    if (measurableWeight > 1e-6 && expected > 1e-6) {
      const avgBaseline = expected / measurableWeight;
      const priorExp = SHRINK_STRENGTH * avgBaseline;
      shrunkWindex = Math.round(((measurableActual + priorExp) / (expected + priorExp)) * 100);
    }
    let significant = false;
    if (varSum > 0 && expected > 1e-6) {
      const z = (measurableActual - expected) / Math.sqrt(varSum);
      significant = Math.abs(z) >= SIGNIFICANCE_Z;
    }
    const avgBaselineAll = measurableWeight > 1e-6 ? expected / measurableWeight : 0;
    const recentExpected = c.recentWeight * avgBaselineAll;
    const recentWindex = recentExpected > 1e-6 ? Math.round((c.recentWinners / recentExpected) * 100) : null;

    c.winnerProjectNames.sort((a, b) => (b.winnerDate ?? "").localeCompare(a.winnerDate ?? ""));

    out.set(key, {
      displayName: c.displayName,
      totalProjects,
      winningProjects: totalWinners,
      expectedWinners: expected,
      rawWinRate: totalProjects > 0 ? totalWinners / totalProjects : 0,
      windex,
      shrunkWindex,
      significant,
      recentTotalProjects: c.recentProjects,
      recentWinningProjects: c.recentWinners,
      recentExpectedWinners: recentExpected,
      recentWindex,
      winnerProjectNames: c.winnerProjectNames,
    });
  });

  return out;
}

export function useCreatorWinnerStats(roleFilter: CreatorRoleFilter = "all") {
  const winnersQuery = useQuery({
    queryKey: ["fibery", "winners"],
    queryFn: () => queryFibery<WinnersResponse>("winners"),
    staleTime: 5 * 60 * 1000,
  });

  const clientsQuery = useQuery({
    queryKey: ["fibery", "clients"],
    queryFn: () => queryFibery<ClientsResponse>("clients"),
    staleTime: 30 * 60 * 1000,
  });

  const retiredClients = new Set<string>(
    (clientsQuery.data?.findClients ?? [])
      .filter((c) => c.status?.name === "Retired")
      .map((c) => c.name)
  );

  const stats = winnersQuery.data
    ? processCreatorWinnerStats(winnersQuery.data.findProjects, retiredClients, roleFilter)
    : null;

  return {
    stats,
    isLoading: winnersQuery.isLoading || clientsQuery.isLoading,
    error: winnersQuery.error ?? clientsQuery.error,
  };
}
