// Canonical AM Book-Trend math. SINGLE SOURCE OF TRUTH.
//
// This file is imported by BOTH:
//   - the Pulse frontend (src/hooks/useWinnersData.ts), and
//   - the `am-windex` branch of the fibery-proxy edge function, which Friday
//     Flashback's All-Star board calls so it displays the same number as Pulse.
//
// It was extracted here because the math had already been copied into Friday
// Flashback once and drifted twice (lag 4->2 months, creation-date -> done-date
// bucketing, maturity weighting, rolling series). Keep it dependency-free —
// plain TS, no imports — so Vite and Deno can both consume it. Import it
// WITHOUT an extension from the frontend and WITH `.ts` from Deno.

export interface WinnersProject {
  id: string;
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
    contractor: { id: string; name: string } | null;
    role: { id: string; name: string; publicId: string } | null;
  }> | null;
  internalVersions: Array<{
    winnerDate: string | null;
    tags: Array<{ id: string; name: string }> | null;
  }> | null;
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

export interface AmTrend {
  index: number | null;
  actual: number; // winners in the score window
  projects: number; // projects in the score window
  expected: number;
  significant: boolean;
  scoreLabel: string; // e.g. "Apr '26–Jun '26"
  baselineLabel: string; // e.g. "Dec '25–Mar '26"
  // The same index over consecutive rolling windows, oldest first, ending at
  // the primary window above. One quarter of AM output is 5-15 winners, so a
  // single value swings ±50 on Poisson noise alone — the series is the only
  // honest read. Rendered as a sparkline next to the index.
  series: Array<{ label: string; index: number | null; significant: boolean }>;
  clients: AmTrendClient[];
}

// Winners tracking started September 2025 — exclude everything before it.
export const WINNERS_TRACKING_START = "2025-09-01";
// z for a ~90% two-sided confidence interval.
export const SIGNIFICANCE_Z = 1.64;

// ---------------------------------------------------------------------------
// Winner-tag maturity curve
// ---------------------------------------------------------------------------
// Winners are tagged well after a project is marked Done — median ~2-3 weeks,
// but only ~56% are tagged by day 22 and it takes ~85 days to see ~all of them
// (tagging happens in a monthly batch, so the tail is long). A project done
// yesterday is not a "loser", it just hasn't had its chance. Every completed
// project therefore contributes to expected-winners in proportion to how many
// of its eventual winners we'd expect to have SEEN by now. Recompute the
// breakpoints quarterly from the done->winnerDate lag distribution.
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

export function maturityWeight(daysSinceDone: number): number {
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

// Normalize names that come through as raw emails from Fibery.
const NAME_OVERRIDES: Record<string, string> = {
  "riteesh@fireteam.is": "Riteesh",
  "shreya8881@gmail.com": "Shreya",
  "amanda@fireteam.is": "Amanda",
};
export function normalizeName(name: string): string {
  return NAME_OVERRIDES[name.toLowerCase()] ?? name;
}

export function getWinnerDate(project: WinnersProject): string | null {
  for (const version of project.internalVersions ?? []) {
    const isWinner = version.tags?.some((t) => t.name?.startsWith("Winner - "));
    if (isWinner) {
      return version.winnerDate ?? project.creationDate;
    }
  }
  return null;
}

export const isProjectComplete = (p: WinnersProject) =>
  !!p.doneDate || p.status?.name === "Completed";

// Days since a project was completed (falls back to creation date when a
// project is marked Completed but has no doneDate).
export function daysSinceDone(p: WinnersProject, nowMs: number): number {
  const ref = p.doneDate ?? p.creationDate;
  if (!ref) return 85; // treat unknown as fully mature
  const ms = nowMs - new Date(ref.slice(0, 10) + "T00:00:00Z").getTime();
  return ms / 86400000;
}

// Calendar-month index (year*12 + monthIndex0) from an ISO date, and back to a
// "Mon 'YY" label.
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function monthIndexOfISO(iso: string): number {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
export function monthIndexNow(nowMs: number): number {
  const d = new Date(nowMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
export function labelForMonthIndex(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = idx % 12;
  return `${MONTH_ABBR[m]} '${String(y).slice(2)}`;
}

// AM Book-Trend windows (in calendar months, relative to now). Projects are
// bucketed by DONE date, not creation date: projects are created in bulk at
// brainstorms and then sit a median of 48 days (p90 106d) before production, so
// creation-date buckets are only ~40-50% settled and keep back-filling for
// months — which compares a fast-turnaround slice of the recent window against
// a far more complete baseline window. Done-date buckets close for good once
// the month ends. (Verified 2026-08-10: 0 of 1031 completed projects lack a
// doneDate, so there is nothing to fall back for.)
//
// The score window still ends LAG months before now so winners in it have had
// time to be tagged, but because expectations are maturity-weighted the lag no
// longer has to cover the whole tagging tail on its own — 2 months instead of 4
// puts two extra quarters on the dashboard.
const AM_TREND_LAG_MONTHS = 2;
const AM_TREND_SCORE_MONTHS = 3;
const AM_TREND_BASELINE_MONTHS = 4;
// How many consecutive rolling windows to report as the sparkline series.
const AM_TREND_SERIES_WINDOWS = 5;
// Pseudo-projects of pull toward the agency base rate when a client's trailing
// baseline is thin (or missing — new clients fall back to the agency rate).
const AM_TREND_SHRINK = 15;
const AM_ROLE_ID = "8";

const amOf = (p: WinnersProject): { id: string; name: string } | null => {
  for (const pr of p.projectRolesInternal ?? []) {
    if (pr.assignee && pr.role && String(pr.role.publicId) === AM_ROLE_ID) return pr.assignee;
  }
  for (const pc of p.projectContractorsExternal ?? []) {
    if (pc.contractor && pc.role && String(pc.role.publicId) === AM_ROLE_ID) return pc.contractor;
  }
  return null;
};

// The month a project lands in for trend purposes. Done date, since that's when
// the work actually shipped and when its tagging clock starts; creation date
// only as a defensive fallback for a Completed row with no doneDate.
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

// AM Book-Trend index — computed over fixed rolling windows, independent of the
// dashboard's date filter. Keyed by AM person id.
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
