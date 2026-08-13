// src/lib/forecast/types.ts

/** Internal role key matches RoleType from useFiberyData (the 5 production roles). */
export type ForecastRoleKey =
  | "Account"
  | "Creative Review"
  | "Copywriters"
  | "Casting"
  | "Design"
  | "Video";

export interface ForecastRole {
  key: ForecastRoleKey;
  display: string;
  /**
   * The unit one person's weekly capacity is counted in for this role. Shown next to the
   * roster input because entering the wrong unit fails silently. Copywriting is briefs, NOT
   * deliverables: DEFAULT_ROLE_RATES.Copywriters is 0.5, so demand already assumes one brief
   * covers two deliverables.
   */
  unit: string;
}

export const FORECAST_ROLES: ForecastRole[] = [
  { key: "Account", display: "Account", unit: "briefs sent/wk" },
  { key: "Creative Review", display: "Creative Review", unit: "reviews/wk" },
  { key: "Copywriters", display: "Copywriting", unit: "briefs/wk" },
  { key: "Casting", display: "Casting", unit: "casts/wk" },
  { key: "Design", display: "Design", unit: "statics/wk" },
  { key: "Video", display: "Video Editing", unit: "videos/wk" },
];

/**
 * Roles a roster person can be assigned to. Account is deliberately absent: its demand is
 * modelled per deliverable, but an account manager's real ceiling is how many client
 * relationships they hold, so a per-week number would be a confident wrong answer. Account
 * keeps reading measured actuals until it gets a client-based model. Put an AM on the roster
 * with no role — they'll carry cost and no capacity.
 */
export const ROSTER_ROLE_KEYS: ForecastRoleKey[] = [
  "Creative Review",
  "Copywriters",
  "Casting",
  "Design",
  "Video",
];

/** Average weeks per calendar month, used for month<->week conversions. */
export const WEEKS_PER_MONTH = 4.345;

/** Forecast horizon in months (grid column count). */
export const HORIZON_MONTHS = 12;

/**
 * role -> peak role-tasks/week MEASURED from Fibery task history (each assigned person's
 * busiest week out of the last 26, summed). Kept as the reference figure that declared
 * roster capacity is checked against, and still the supply source for any role nobody on
 * the roster is assigned to.
 */
export type RolePeaks = Record<ForecastRoleKey, number>;

/**
 * role -> supply ceiling per month, length HORIZON_MONTHS. Per month rather than flat
 * because roster people carry a start month: a hire lifts the ceiling from the month they
 * begin instead of retroactively across the whole horizon.
 */
export type RoleSupply = Record<ForecastRoleKey, number[]>;

/** tasks-per-deliverable multiplier per role; reality isn't a flat 1 (copy ~0.5, creative review ~2). */
export type RoleRates = Partial<Record<ForecastRoleKey, number>>;
export const DEFAULT_ROLE_RATES: Record<ForecastRoleKey, number> = {
  Account: 1,
  "Creative Review": 2,
  Copywriters: 0.5,
  // Only creator-led videos need a cast, not every video. 51 casting tasks were completed in
  // the 4 weeks to 2026-08-13 against roughly twice that many videos, so half is the starting
  // point — tune it on the "Tasks per deliverable" dial rather than in code.
  Casting: 0.5,
  Design: 1,
  Video: 1,
};

/** Months of read-only historical actuals shown left of the editable future. */
export const HISTORY_MONTHS = 3;

export interface ClientHistory {
  client: string;
  /** length HISTORY_MONTHS, oldest -> newest. */
  videosByMonth: number[];
  staticsByMonth: number[];
  /** suggested flat seed for the future grid (recent monthly run-rate, per type). */
  seedVideos: number;
  seedStatics: number;
}

/**
 * The current operating plan for one client, derived on every load — never stored.
 *
 * `Clients/Max Deliverables Per Month` in Fibery is the auto-scheduling ceiling that
 * Morning Production Ops enforces, so it IS the plan and it moves whenever the plan
 * moves. `Min` is the contractual minimum and is display-only here.
 */
export interface ClientPlan {
  client: string;
  /** Fibery Max; null when unset. 0 is a real plan of zero, not "unset". */
  max: number | null;
  /** Fibery Min (contractual minimum); display only, never drives volumes. */
  min: number | null;
  /** Share of trailing output that was video, 0..1. */
  videoShare: number;
  /** Whether videoShare is this client's own mix or the agency-wide fallback (thin sample). */
  mixSource: "client" | "agency";
  /** Derived monthly volumes. When source is "max", videos + statics === max exactly. */
  videos: number;
  statics: number;
  /** "max" = split from the Fibery plan; "runrate" = no Max set, trailing actuals instead. */
  source: "max" | "runrate";
}

export interface ClientBaseline {
  client: string;
  /** Recent run-rate in assets/month from the last 4 completed weeks. */
  monthlyRate: number;
  /** % change of last-4-week avg vs prior-8-week avg; null if no prior history. */
  trendPct: number | null;
  /** 12 weekly completed-asset counts, oldest -> newest, excluding current partial week. */
  weeklyCounts: number[];
}

export interface ScenarioClient {
  id: string;
  name: string;
  /** per-month video counts; length === HORIZON_MONTHS. */
  videosByMonth: number[];
  /** per-month static counts; length === HORIZON_MONTHS. */
  staticsByMonth: number[];
  enabled: boolean;
  hypothetical: boolean;
  /**
   * Set only when someone deliberately typed a volume for this client. Signed clients
   * without it re-derive from the Fibery plan on every load, which is what keeps the
   * grid current. Absent (not false) when unset, so it never shows up as a diff in
   * scenarioSignature().
   */
  manualVolumes?: boolean;
  /** Pipeline status: true = prospective new business, false/undefined = signed client. Display/sort only; does not affect math. */
  newBusiness?: boolean;
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[]; // percent 0-100
  oneOffsByMonth?: number[];      // one-off fee amount per month (0 where none)
  oneOffLabelsByMonth?: string[]; // optional label per month, parallel to oneOffsByMonth
  /** First active month index (default 0 = active now / from the start of the horizon). */
  startMonthIndex?: number;
  /** Last active month index inclusive; null/undefined = ongoing (no end). */
  endMonthIndex?: number | null;
}

export type RoleStatus = "ok" | "warning" | "critical" | "over";

export interface RoleMonthCell {
  role: ForecastRoleKey;
  demandPerWeek: number;
  peak: number;
  utilization: number; // demand / peak
  status: RoleStatus;
}

export interface ForecastMonth {
  monthIndex: number;
  label: string; // e.g. "Aug 26"
  assets: number; // total assets/month across active clients
  roles: Record<ForecastRoleKey, RoleMonthCell>;
}

export interface ForecastResult {
  months: ForecastMonth[];
  /** role -> first monthIndex where demand exceeds peak, or null if never. */
  hireByRole: Record<ForecastRoleKey, number | null>;
}

/** A pricing tier; upTo is the upper bound of MANAGED spend for this bracket (null = "and above"). rate is a percent. */
export interface PricingTier {
  upTo: number | null;
  rate: number;
}

export interface ClientPricing {
  baseFee?: number; // additive base, added to tiered amount before the minFee floor; defaults to 0
  minFee: number;
  tiers: PricingTier[];
}

export interface ProductionPerson {
  id: string;
  name: string;
  side: "video" | "static" | "both";
  monthlyCost: number;
  startMonthIndex: number; // 0 = active now; >0 = a hire beginning that month
  /**
   * Which role's supply this person contributes to. `side` can't answer this — it's a cost
   * allocation dimension (Nicolle is "video" but casts creators, copywriters are "both"), not
   * a job. Absent = cost only, contributing no capacity, which is every pre-existing row.
   */
  role?: ForecastRoleKey;
  /**
   * Declared throughput in this role's own task unit per week: videos for Video, statics for
   * Design, reviews for Creative Review, and BRIEFS for Copywriters (one brief already covers
   * ~2 deliverables via DEFAULT_ROLE_RATES.Copywriters = 0.5, so this is briefs written, not
   * deliverables covered). Absent = fall back to this person's measured busiest week.
   */
  capacityPerWeek?: number;
  /** Classification only. Production cost counts ALL producers regardless; "salary" producers are subtracted from the dedicated Non-production salary line so each person is counted once. */
  employment?: "contractor" | "salary";
}

/** A named operating-overhead line; byMonth length HORIZON_MONTHS (future months). */
export interface OverheadLine {
  id: string;
  label: string;
  byMonth: number[];
}

/** Agency-level cost config; arrays length HORIZON_MONTHS (future months). */
export interface CostConfig {
  partnerSalaryByMonth: number[];
  rentByMonth: number[];
  /** Full P&L payroll entered by the user. Salaried producers are subtracted from this (floored at 0) so each person is counted once; the NET feeds total cost. */
  nonProdSalaryByMonth?: number[];
  /** Named overhead lines (Software, Other, ...); summed into fixed cost. */
  overheadLines?: OverheadLine[];
  /** Per-role tasks-per-deliverable multipliers; falls back to DEFAULT_ROLE_RATES when unset. */
  roleRates?: RoleRates;
  /** @deprecated legacy single overhead row; used only when overheadLines is absent/empty. */
  overheadByMonth?: number[];
  costPerDeliverableByMonth?: number[]; // legacy, unused
  team: ProductionPerson[];
}

/** Break-even / practical cost-per-deliverable reference floors (USD). */
export const BREAKEVEN_FLOOR = 700;
export const PRACTICAL_FLOOR = 1000;

export interface PnlMonth {
  monthIndex: number;
  label: string;
  revenue: number;
  fixedCost: number;
  productionCost: number;
  nonProdSalaryNet: number;
  totalCost: number;
  netIncome: number;
  margin: number; // netIncome / revenue, 0 when revenue is 0
  deliverables: number;
  videos: number;
  statics: number;
  feePerDeliverable: number | null; // null when deliverables === 0
  costPerDeliverable: number | null;
  costPerVideo: number | null;
  costPerStatic: number | null;
}

export function emptyCostConfig(horizon: number): CostConfig {
  return {
    partnerSalaryByMonth: new Array(horizon).fill(0),
    rentByMonth: new Array(horizon).fill(0),
    nonProdSalaryByMonth: new Array(horizon).fill(0),
    overheadLines: [],
    overheadByMonth: new Array(horizon).fill(0),
    costPerDeliverableByMonth: new Array(horizon).fill(0),
    team: [],
  };
}
