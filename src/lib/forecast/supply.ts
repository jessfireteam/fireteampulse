// src/lib/forecast/supply.ts
import {
  FORECAST_ROLES,
  type ForecastRoleKey,
  type ProductionPerson,
  type RolePeaks,
  type RoleSupply,
} from "./types";

/** One measured person: their name as Fibery reports it, and their busiest week out of 26. */
export interface MeasuredPerson {
  name: string;
  role: ForecastRoleKey;
  maxWeek26: number;
}

/** What a roster person contributes, and where the number came from. */
export interface PersonSupplyRow {
  id: string;
  name: string;
  role: ForecastRoleKey;
  startMonthIndex: number;
  /** Typed on the roster; undefined when following the measured figure. */
  declared?: number;
  /** This person's measured busiest week, or null when we couldn't match them. */
  measured: number | null;
  /** What actually counts toward supply. */
  effective: number;
  /** False when no measured person could be matched by name — surface it, don't imply zero. */
  matched: boolean;
}

export interface ResolvedSupply {
  supply: RoleSupply;
  perPerson: PersonSupplyRow[];
  /** Roles nobody on the roster is assigned to; these still read the flat measured peak. */
  rolesUsingMeasured: ForecastRoleKey[];
}

const ROLE_KEYS = FORECAST_ROLES.map((r) => r.key);

const norm = (s: string) => s.trim().toLowerCase();

/** A flat ceiling held constant across the horizon: one measured peak per role, every month. */
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
 * Turn the P&L roster into a per-month supply ceiling per role.
 *
 * Per role: if anyone on the roster is assigned to it, supply is the sum of those people's
 * effective capacity, counting only people who have started by that month. If nobody is
 * assigned to it, the role keeps reading the flat measured peak — which is exactly today's
 * behaviour, and is what keeps Account working until it gets its own client-based model.
 */
export function resolveRoleSupply(
  team: ProductionPerson[],
  measuredPeaks: RolePeaks,
  measured: MeasuredPerson[],
  horizon: number,
): ResolvedSupply {
  const perPerson: PersonSupplyRow[] = team
    .filter((p): p is ProductionPerson & { role: ForecastRoleKey } => !!p.role)
    .map((p) => {
      const hit = matchMeasured(p.name, p.role, measured);
      const measuredValue = hit ? hit.maxWeek26 : null;
      const declared = typeof p.capacityPerWeek === "number" ? p.capacityPerWeek : undefined;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        startMonthIndex: p.startMonthIndex ?? 0,
        declared,
        measured: measuredValue,
        effective: declared ?? measuredValue ?? 0,
        matched: hit !== null,
      };
    });

  const rolesUsingMeasured: ForecastRoleKey[] = [];
  const supply = {} as RoleSupply;

  ROLE_KEYS.forEach((role) => {
    const people = perPerson.filter((p) => p.role === role);
    if (people.length === 0) {
      rolesUsingMeasured.push(role);
      supply[role] = new Array(horizon).fill(measuredPeaks[role] ?? 0);
      return;
    }
    supply[role] = Array.from({ length: horizon }, (_, m) =>
      people.reduce((sum, p) => (p.startMonthIndex <= m ? sum + p.effective : sum), 0),
    );
  });

  return { supply, perPerson, rolesUsingMeasured };
}
