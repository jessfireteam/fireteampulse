// src/lib/forecast/supply.ts
import {
  FORECAST_ROLES,
  type ForecastRoleKey,
  type ProductionPerson,
  type RolePeaks,
  type RoleSupply,
} from "./types";

/** Weeks of completed work behind the "actual / wk" figure. Excludes the current partial week. */
export const ACTUAL_WINDOW_WEEKS = 4;

/**
 * One measured person and what they have actually been completing per week recently.
 *
 * Deliberately a recent average rather than a peak. A busiest-week-in-26 figure is a personal
 * record, and planning capacity at everyone's simultaneous record is how you schedule burnout.
 */
export interface MeasuredPerson {
  name: string;
  role: ForecastRoleKey;
  actualPerWeek: number;
}

/** A person's capacity row: what they actually do, versus the max we're willing to run them at. */
export interface PersonSupplyRow {
  id: string;
  name: string;
  role: ForecastRoleKey;
  startMonthIndex: number;
  /** The max we set for them. Undefined means we haven't decided and are following actuals. */
  desiredMax?: number;
  /** Recent actual per week, or null when no Fibery history matched them. */
  actualPerWeek: number | null;
  /** What counts toward the ceiling. */
  effective: number;
  /** False when no measured person matched by name — surface it, don't imply zero. */
  matched: boolean;
}

export interface ResolvedSupply {
  supply: RoleSupply;
  perPerson: PersonSupplyRow[];
  /** Roles nobody is assigned to; these fall back to the summed actuals of whoever does the work. */
  rolesUsingActuals: ForecastRoleKey[];
  /** Summed recent actual per week per role, for the actual-versus-max comparison. */
  actualsByRole: Record<ForecastRoleKey, number>;
}

const ROLE_KEYS = FORECAST_ROLES.map((r) => r.key);

const norm = (s: string) => s.trim().toLowerCase();

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A flat ceiling held constant across the horizon. Used by tests and by the role fallback. */
export function flatSupply(peaks: RolePeaks, horizon: number): RoleSupply {
  const supply = {} as RoleSupply;
  ROLE_KEYS.forEach((role) => {
    supply[role] = new Array(horizon).fill(peaks[role] ?? 0);
  });
  return supply;
}

/**
 * Match a roster name to a measured person within the same role.
 *
 * Roster names are short ("Vaiv", "Sanchit", "Erik"); Fibery reports full display names
 * ("Vaiv Singh") or sometimes an email ("khushboo@fireteam.is"). Exact, then unique prefix,
 * then unique substring. An ambiguous match returns null rather than picking one — guessing
 * here is how `Sanchit` silently matched nobody for months.
 */
export function matchMeasured(
  name: string,
  role: ForecastRoleKey,
  measured: MeasuredPerson[],
): MeasuredPerson | null {
  const n = norm(name);
  if (!n) return null;
  const inRole = measured.filter((m) => m.role === role);

  const exact = inRole.filter((m) => norm(m.name) === n);
  if (exact.length === 1) return exact[0];

  const prefix = inRole.filter((m) => norm(m.name).startsWith(n));
  if (prefix.length === 1) return prefix[0];

  const substr = inRole.filter((m) => norm(m.name).includes(n));
  if (substr.length === 1) return substr[0];

  return null;
}

/**
 * Turn the team roster into a per-month supply ceiling per role.
 *
 * Per role: if anyone is assigned to it, supply is the sum of those people's effective capacity,
 * counting only people who have started by that month. If nobody is assigned, the role falls
 * back to the summed recent actuals of whoever Fibery says does that work, which is the
 * behaviour before any of this was configured.
 */
export function resolveRoleSupply(
  team: ProductionPerson[],
  measured: MeasuredPerson[],
  horizon: number,
): ResolvedSupply {
  const actualsByRole = {} as Record<ForecastRoleKey, number>;
  ROLE_KEYS.forEach((role) => {
    actualsByRole[role] = round1(
      measured.filter((m) => m.role === role).reduce((s, m) => s + m.actualPerWeek, 0),
    );
  });

  const perPerson: PersonSupplyRow[] = team
    .filter((p): p is ProductionPerson & { role: ForecastRoleKey } => !!p.role)
    .map((p) => {
      const hit = matchMeasured(p.name, p.role, measured);
      const actualPerWeek = hit ? hit.actualPerWeek : null;
      const desiredMax = typeof p.capacityPerWeek === "number" ? p.capacityPerWeek : undefined;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        startMonthIndex: p.startMonthIndex ?? 0,
        desiredMax,
        actualPerWeek,
        effective: desiredMax ?? actualPerWeek ?? 0,
        matched: hit !== null,
      };
    });

  const rolesUsingActuals: ForecastRoleKey[] = [];
  const supply = {} as RoleSupply;

  ROLE_KEYS.forEach((role) => {
    const people = perPerson.filter((p) => p.role === role);
    if (people.length === 0) {
      rolesUsingActuals.push(role);
      supply[role] = new Array(horizon).fill(actualsByRole[role]);
      return;
    }
    supply[role] = Array.from({ length: horizon }, (_, m) =>
      round1(people.reduce((sum, p) => (p.startMonthIndex <= m ? sum + p.effective : sum), 0)),
    );
  });

  return { supply, perPerson, rolesUsingActuals, actualsByRole };
}
