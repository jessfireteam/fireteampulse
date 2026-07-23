import type { ScenarioClient, CostConfig } from "./types";

/** Clients are matched across tabs/writes by name (ids are regenerated per load). */
const nameKey = (s: string) => s.trim().toLowerCase();

/**
 * Deterministic JSON: object keys sorted and `undefined` dropped, so field
 * ordering or an absent-vs-undefined difference never reads as a real change.
 */
export function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          if (obj[k] !== undefined) acc[k] = obj[k];
          return acc;
        }, {});
    }
    return v;
  });
}

/** Compare two clients ignoring the ephemeral, per-session `id`. */
function sameClient(a: ScenarioClient, b: ScenarioClient): boolean {
  const strip = ({ id: _id, ...rest }: ScenarioClient) => rest;
  return stable(strip(a)) === stable(strip(b));
}

/**
 * A stable signature of the whole scenario (clients + cost config), ignoring
 * client ids. Used to tell whether local state actually diverges from what is
 * already persisted, so we never fire a no-op / clobbering save.
 */
export function scenarioSignature(clients: ScenarioClient[], cost: CostConfig): string {
  return stable({ clients: clients.map(({ id: _id, ...rest }) => rest), cost });
}

/**
 * Three-way merge of the scenario client list, keyed by client name.
 *
 * - `baseline` = the remote state our local edits were branched from
 * - `mine`     = current local state (may contain unsaved edits)
 * - `theirs`   = the newer remote state we just observed
 *
 * Rules (local-edit-wins, never-lose-data):
 * - A client I edited or added stays, even if the other side deleted it.
 * - A client the other side edited/added that I didn't touch is absorbed.
 * - A client deleted remotely is dropped only if I never touched it locally.
 * - On a true same-client conflict, my version wins (documented tie-break).
 *
 * Local ordering is preserved; remote-only clients are appended.
 */
export function reconcileScenario(
  baseline: ScenarioClient[],
  mine: ScenarioClient[],
  theirs: ScenarioClient[],
): ScenarioClient[] {
  const baseMap = new Map(baseline.map((c) => [nameKey(c.name), c]));
  const mineMap = new Map(mine.map((c) => [nameKey(c.name), c]));
  const theirsMap = new Map(theirs.map((c) => [nameKey(c.name), c]));

  const result: ScenarioClient[] = [];
  const seen = new Set<string>();

  const take = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    const b = baseMap.get(k);
    const m = mineMap.get(k);
    const t = theirsMap.get(k);
    const myChanged = !!m && (!b || !sameClient(m, b));
    const theirChanged = !!t && (!b || !sameClient(t, b));

    if (m && myChanged) result.push(m); // I edited/added it -> keep mine
    else if (t && theirChanged) result.push(t); // they edited/added it -> take theirs
    else if (t) result.push(t); // unchanged both sides, present remotely -> keep
    else if (m && !b) result.push(m); // I added it (not in baseline, not remote) -> keep
    // else: existed only in baseline (remote deleted, I didn't touch) -> drop
  };

  for (const c of mine) take(nameKey(c.name));
  for (const c of theirs) take(nameKey(c.name));
  return result;
}

/**
 * Cost config is a single object; reconcile at object granularity with the
 * same local-wins rule: if I changed it since baseline, keep mine; otherwise
 * adopt the remote version.
 */
export function reconcileCost(baseline: CostConfig, mine: CostConfig, theirs: CostConfig): CostConfig {
  return stable(mine) !== stable(baseline) ? mine : theirs;
}
