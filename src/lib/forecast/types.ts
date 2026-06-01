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
  /** getTaskCategory() output that represents this role's primary throughput. */
  category: string;
}

export const FORECAST_ROLES: ForecastRole[] = [
  { key: "Account", display: "Account", category: "Briefs Sent" },
  { key: "Creative Review", display: "Creative Review", category: "Creative Review" },
  { key: "Copywriters", display: "Copywriting", category: "Brief Work" },
  { key: "Design", display: "Design", category: "Design" },
  { key: "Video", display: "Video Editing", category: "Video Editing" },
];

/** Average weeks per calendar month, used for month<->week conversions. */
export const WEEKS_PER_MONTH = 4.345;

/** Forecast horizon in months (grid column count). */
export const HORIZON_MONTHS = 12;

/** role -> peak role-tasks/week (supply ceiling). */
export type RolePeaks = Record<ForecastRoleKey, number>;

/** role -> role-tasks generated per delivered asset (calibration ratio). */
export type Calibration = Record<ForecastRoleKey, number>;

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
  /** One asset count per forecast month; length === horizon (12). */
  assetsByMonth: number[];
  enabled: boolean;
  /** true when added by a partner (not seeded from history). */
  hypothetical: boolean;
  /** Carried from the seeding baseline so the trend survives a name edit; undefined for hypotheticals. */
  trendPct?: number | null;
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
