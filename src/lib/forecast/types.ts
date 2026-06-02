// src/lib/forecast/types.ts

/** Internal role key matches RoleType from useFiberyData (the 5 production roles). */
export type ForecastRoleKey =
  | "Account"
  | "Creative Review"
  | "Copywriters"
  | "Design"
  | "Video";

export interface ForecastRole {
  key: ForecastRoleKey;
  display: string;
}

export const FORECAST_ROLES: ForecastRole[] = [
  { key: "Account", display: "Account" },
  { key: "Creative Review", display: "Creative Review" },
  { key: "Copywriters", display: "Copywriting" },
  { key: "Design", display: "Design" },
  { key: "Video", display: "Video Editing" },
];

/** Average weeks per calendar month, used for month<->week conversions. */
export const WEEKS_PER_MONTH = 4.345;

/** Forecast horizon in months (grid column count). */
export const HORIZON_MONTHS = 12;

/** role -> peak role-tasks/week (supply ceiling). */
export type RolePeaks = Record<ForecastRoleKey, number>;

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
  pricing?: ClientPricing;
  adSpendByMonth?: number[];
  agencyPctByMonth?: number[]; // percent 0-100
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
  side: "video" | "static";
  monthlyCost: number;
  startMonthIndex: number; // 0 = active now; >0 = a hire beginning that month
}

/** Agency-level cost config; arrays length HORIZON_MONTHS (future months). */
export interface CostConfig {
  partnerSalaryByMonth: number[];
  rentByMonth: number[];
  overheadByMonth: number[];
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
    overheadByMonth: new Array(horizon).fill(0),
    costPerDeliverableByMonth: new Array(horizon).fill(0),
    team: [],
  };
}
