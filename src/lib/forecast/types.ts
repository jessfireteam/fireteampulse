// src/lib/forecast/types.ts

/** Internal role key matches RoleType from useFiberyData (the 5 production roles). */
export type ForecastRoleKey =
  | "Account"
  | "CD Review"
  | "AM Review"
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
   * deliverables — the Copywriters rate converts between them.
   */
  unit: string;
}

export const FORECAST_ROLES: ForecastRole[] = [
  { key: "Account", display: "Account", unit: "briefs sent/wk" },
  // Creative Review split in two on purpose: measured (4wks to 2026-08-13), Jess reviews 1.0x
  // of everything that ships with nobody else able to absorb it, while the AMs share 1.8x.
  // Pooling them hid that one line is a single person with no redundancy.
  { key: "CD Review", display: "CD Review", unit: "reviews/wk" },
  { key: "AM Review", display: "AM Review", unit: "reviews/wk" },
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
  "CD Review",
  "AM Review",
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

/** tasks-per-deliverable multiplier per role; reality isn't a flat 1 (video ~1.8, creative review ~2.8 combined). */
export type RoleRates = Partial<Record<ForecastRoleKey, number>>;
/**
 * These rates INCLUDE revision rounds: a "REVISION n:" re-run is counted as another task of
 * its base type. Supply is counted the same way (getTaskCategory buckets revision tasks by
 * base name), so any capacity box someone fills in (Max/wk on the roster) must also be TOTAL
 * tasks per week including revisions — a first-passes-only number there will read as a
 * shortage that isn't real.
 *
 * Measured over the 13 weeks Jun–Aug 2026: 490 deliverables (261 videos / 229 statics),
 * tasks counted by Task Template Role in Fibery, revision rounds included.
 */
export const DEFAULT_ROLE_RATES: Record<ForecastRoleKey, number> = {
  Account: 1,
  // The CD (Jess) reviews everything that ships once; his revision reviews are negligible.
  "CD Review": 1,
  // 883 AM review tasks / 490 deliverables = 1.8. CD + AM must sum to total review load per
  // deliverable (~2.8).
  "AM Review": 1.8,
  // 636 brief tasks / 490 deliverables = 1.3. The supply unit stays briefs/wk.
  Copywriters: 1.3,
  // Only creator-led videos need a cast, not every video (0.8 of videos). Casts have no
  // revision rounds. Tune on the "Tasks per deliverable" dial, not in code.
  Casting: 0.8,
  // 408 design tasks / 229 statics = 1.8, revision rounds included.
  Design: 1.8,
  // 477 video-edit tasks / 261 videos = 1.8, revision rounds included.
  Video: 1.8,
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
  /**
   * True for rows synthesized from PipelineConfig. They regenerate from the config on every
   * load, so the row's ✕ is hidden: removing one means unchecking `enabled` (which persists)
   * or changing the config. A hand-edited pipeline row is pinned exactly like a real client.
   */
  pipeline?: boolean;
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
  /**
   * This month's capacity ceiling for the role. Named `peak` for historical reasons and it is
   * NOT a peak any more: it is the sum of the maxes set per person in the capacity table, or
   * their recent actual where no max is set. Nothing here is a busiest-ever week.
   */
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

/**
 * The standing new-business assumption: leads arrive predictably, so instead of hand-adding a
 * hypothetical client when one appears, this stamps out future pipeline clients on a cadence.
 * Derived into ScenarioClient rows at load — never stored as rows — so the config is the only
 * thing persisted (inside cost_config, written only when edited).
 */
export interface PipelineConfig {
  enabled: boolean;
  /** One new client every N months. */
  everyNMonths: number;
  /** Month index (0 = this month) of the first expected signing. */
  firstMonthIndex: number;
  videosPerMonth: number;
  staticsPerMonth: number;
  /** Monthly fee each pipeline client bills (flat; editable per row afterwards). */
  minFee: number;
}

/** Converts role demand into fractional hires: what ONE new hire adds per week. */
export interface RunwayConfig {
  /** Per-role weekly output of a standard hire. Missing keys use RUNWAY_DEFAULT_HIRE_UNITS. */
  hireUnitPerWeek?: Partial<Record<ForecastRoleKey, number>>;
  /** Weeks from posting a req to a productive hire; backs the "post req by" date off the first deficit. */
  hireLeadWeeks?: number;
}

/** One standard hire's weekly output, from the caps ops actually assigns (Angelia, 2026-08-13). */
export const RUNWAY_DEFAULT_HIRE_UNITS: Record<ForecastRoleKey, number> = {
  Account: 1, // placeholder; Account is excluded from the runway until the client-count model
  "CD Review": 33,
  "AM Review": 20,
  Copywriters: 10,
  Casting: 13,
  Design: 10,
  Video: 8,
};

export const DEFAULT_HIRE_LEAD_WEEKS = 6;

/** Gap (in heads) at which "absorb it" becomes "post a req". */
export const HIRE_TRIGGER_HEADS = 0.5;

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
   * Design, reviews for Creative Review, and BRIEFS for Copywriters (brief tasks, which run
   * ~1.3 per deliverable via DEFAULT_ROLE_RATES.Copywriters — briefs written, not deliverables
   * covered). TOTAL tasks including revision rounds, because demand rates and measured actuals
   * both count revisions — a first-passes-only max here undercounts the person. Absent = fall
   * back to this person's measured recent actual.
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
  /** Standing new-business assumption; absent = no pipeline rows generated. */
  pipeline?: PipelineConfig;
  /** Hire-unit sizes and lead time for the runway table. */
  runway?: RunwayConfig;
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
