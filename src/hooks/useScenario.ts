// src/hooks/useScenario.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HORIZON_MONTHS, emptyCostConfig, type ClientPlan, type ScenarioClient, type CostConfig } from "@/lib/forecast/types";
import { mergeScenario } from "@/lib/forecast/mergeScenario";
import { reconcileScenario, reconcileCost, scenarioSignature } from "@/lib/forecast/reconcileScenario";

let idCounter = 0;
const nextId = () => `client-${++idCounter}`;

const TABLE = "partner_forecast_scenario";
const ROW_ID = "default";
const AUTOSAVE_MS = 800;

// The generated Supabase Database type does not (yet) include
// partner_forecast_scenario, so cast to a loosely-typed client. The table is
// being created out-of-band; all calls below are wrapped so a missing
// table/row or any failure never crashes the page.
const db = supabase as unknown as {
  from: (table: string) => any;
};

const sameToken = (a?: string | null, b?: string | null) =>
  !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * @param plansReady false while any query feeding `plans` is still in flight. The seed MUST wait
 * for it. `plans.length > 0` is not a sufficient gate: the client roster query resolves before
 * the Max query and the project-history query, so for a moment `plans` holds every client at
 * 0 videos / 0 statics. Seeding then locks those zeros in via seededRef, and the next edit
 * persists them — which is exactly what happened on 2026-08-13, flattening the whole forecast to
 * ~0% utilization and writing zeros for all 16 clients to the shared row.
 */
export function useScenario(
  plans: ClientPlan[],
  userEmail?: string | null,
  plansReady = true,
) {
  const [clients, setClients] = useState<ScenarioClient[]>([]);
  const [costConfig, setCostConfig] = useState<CostConfig>(() => emptyCostConfig(HORIZON_MONTHS));
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Saved row loaded from Supabase (or [] on error/missing).
  const [savedClients, setSavedClients] = useState<ScenarioClient[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  const seededRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * True once a human has actually changed something in this tab. Until then the hook must
   * never write, no matter how far local state has drifted from the stored row — and it does
   * drift, because volumes are derived from Fibery on every load.
   *
   * The signature check below is not sufficient on its own: the seed captures its
   * "already persisted" signature before the loaded cost_config has landed in state, so with a
   * populated cost_config the first render pair looked like an edit and fired a save. That was
   * live (production's row has a cost_config) and only invisible in tests because a null
   * cost_config never triggers the second state update. This flag is the invariant stated
   * outright: opening the page writes nothing.
   */
  const dirtyRef = useRef(false);

  // Optimistic-concurrency + merge state:
  //  - token: the row's updated_at our local state is branched from
  //  - baseline*: the remote scenario our unsaved edits diverge from (3-way merge base)
  //  - lastSavedSig: signature of what is currently persisted remotely, so we
  //    never fire a no-op save that would clobber a newer write with stale data
  const tokenRef = useRef<string | null>(null);
  const baselineClientsRef = useRef<ScenarioClient[]>([]);
  const baselineCostRef = useRef<CostConfig>(emptyCostConfig(HORIZON_MONTHS));
  const lastSavedSigRef = useRef<string | null>(null);

  // 1) Load the saved row once, gracefully.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await db
          .from(TABLE)
          .select("clients, cost_config, updated_at")
          .eq("id", ROW_ID)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setSavedClients([]);
        } else {
          tokenRef.current = data?.updated_at ?? null;
          const raw = data?.clients;
          setSavedClients(Array.isArray(raw) ? (raw as ScenarioClient[]) : []);
          const cc = data?.cost_config;
          if (cc && Array.isArray(cc.partnerSalaryByMonth)) {
            const cfg = { ...emptyCostConfig(HORIZON_MONTHS), ...(cc as Partial<CostConfig>) };
            // Auto-migrate a legacy single overhead row into one editable named line (no data loss, no guessing).
            if ((!cfg.overheadLines || cfg.overheadLines.length === 0) && (cfg.overheadByMonth ?? []).some((v) => v > 0)) {
              cfg.overheadLines = [{ id: "overhead-legacy", label: "Operating overhead", byMonth: [...cfg.overheadByMonth!] }];
            }
            // Migrate a user's existing "Salary"-labeled overhead line into the dedicated non-prod salary field (don't keep both).
            if ((!cfg.nonProdSalaryByMonth || cfg.nonProdSalaryByMonth.every((v) => !v)) && Array.isArray(cfg.overheadLines)) {
              const salaryLine = cfg.overheadLines.find((l) => /salary/i.test(l.label));
              if (salaryLine) {
                cfg.nonProdSalaryByMonth = [...salaryLine.byMonth];
                cfg.overheadLines = cfg.overheadLines.filter((l) => l !== salaryLine);
              }
            }
            setCostConfig(cfg);
          }
        }
      } catch {
        if (!cancelled) setSavedClients([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Seed once, after both the saved row and the derived plans are available.
  useEffect(() => {
    if (seededRef.current) return;
    if (!loaded || !plansReady || plans.length === 0) return;
    const seeded = mergeScenario(plans, savedClients ?? [], HORIZON_MONTHS, nextId);
    setClients(seeded);
    // Baseline for the 3-way merge is the raw remote row (what edits diverge from).
    baselineClientsRef.current = savedClients ?? [];
    baselineCostRef.current = costConfig;
    // Treat the seed as already-persisted so merely loading the page never
    // triggers an autosave (the load-time clobber vector). Real user edits
    // change the signature and do save.
    lastSavedSigRef.current = scenarioSignature(seeded, costConfig);
    seededRef.current = true;
  }, [loaded, plansReady, plans, savedClients, costConfig]);

  // 3) Debounced, concurrency-guarded autosave. Only writes when local state
  //    actually diverges from what is persisted, and never blindly overwrites
  //    a newer remote write.
  useEffect(() => {
    if (!seededRef.current) return;

    const sig = scenarioSignature(clients, costConfig);
    if (!dirtyRef.current) {
      // Nothing a person did. Adopt the signature so the first real edit is measured against
      // what's on screen, and write nothing.
      lastSavedSigRef.current = sig;
      return;
    }
    if (sig === lastSavedSigRef.current) {
      setSaveState((s) => (s === "saving" ? "saved" : s));
      return;
    }
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);

    const persist = async () => {
      const payload = {
        clients,
        cost_config: costConfig,
        updated_at: new Date().toISOString(),
        updated_by: userEmail ?? null,
      };
      try {
        const token = tokenRef.current;
        // Guarded update: only succeeds if the row is still at our token.
        if (token != null) {
          const { data, error } = await db
            .from(TABLE)
            .update(payload)
            .eq("id", ROW_ID)
            .eq("updated_at", token)
            .select("updated_at")
            .maybeSingle();
          if (error) throw error;
          if (data) {
            tokenRef.current = data.updated_at;
            baselineClientsRef.current = clients;
            baselineCostRef.current = costConfig;
            lastSavedSigRef.current = sig;
            setSaveState("saved");
            return;
          }
          // data == null -> someone else wrote since our token; fall through to reconcile.
        }

        // Token unknown or stale: refetch the current row and reconcile.
        const { data: fresh, error: fErr } = await db
          .from(TABLE)
          .select("clients, cost_config, updated_at")
          .eq("id", ROW_ID)
          .maybeSingle();
        if (fErr) throw fErr;

        if (!fresh) {
          // Row doesn't exist yet -> create it.
          const { data: ins, error: iErr } = await db
            .from(TABLE)
            .insert({ id: ROW_ID, ...payload })
            .select("updated_at")
            .maybeSingle();
          if (iErr) throw iErr;
          tokenRef.current = ins?.updated_at ?? null;
          baselineClientsRef.current = clients;
          baselineCostRef.current = costConfig;
          lastSavedSigRef.current = sig;
          setSaveState("saved");
          return;
        }

        // Conflict: 3-way merge local edits onto the fresh remote, adopt the
        // remote token, and let the effect re-run to persist the merged result
        // (which now matches the adopted token).
        const theirClients: ScenarioClient[] = Array.isArray(fresh.clients) ? fresh.clients : [];
        const theirCost: CostConfig = fresh.cost_config ?? emptyCostConfig(HORIZON_MONTHS);
        const mergedClients = reconcileScenario(baselineClientsRef.current, clients, theirClients);
        const mergedCost = reconcileCost(baselineCostRef.current, costConfig, theirCost);

        tokenRef.current = fresh.updated_at;
        baselineClientsRef.current = theirClients;
        baselineCostRef.current = theirCost;
        lastSavedSigRef.current = scenarioSignature(theirClients, theirCost);
        setClients(mergedClients);
        setCostConfig(mergedCost);
      } catch {
        setSaveState("error");
      }
    };

    timerRef.current = setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, costConfig, userEmail]);

  // 4) Realtime: when another tab/partner writes the row, merge it into local
  //    state (local edits preserved) so an open tab never shows or saves stale data.
  useEffect(() => {
    const channel = supabase
      .channel(`pfs-${ROW_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `id=eq.${ROW_ID}` },
        (payload: any) => {
          const row = payload?.new;
          if (!row || !seededRef.current) return;
          if (sameToken(row.updated_at, tokenRef.current)) return; // our own write echoing back

          const theirClients: ScenarioClient[] = Array.isArray(row.clients) ? row.clients : [];
          const theirCost: CostConfig = row.cost_config ?? emptyCostConfig(HORIZON_MONTHS);
          const baseClients = baselineClientsRef.current;
          const baseCost = baselineCostRef.current;

          // Adopt remote as the new baseline / token / persisted signature.
          tokenRef.current = row.updated_at;
          baselineClientsRef.current = theirClients;
          baselineCostRef.current = theirCost;
          lastSavedSigRef.current = scenarioSignature(theirClients, theirCost);

          setClients((cur) => {
            const merged = reconcileScenario(baseClients, cur, theirClients);
            // Avoid a needless re-render (and save) when nothing changed for us.
            return scenarioSignature(merged, baseCost) === scenarioSignature(cur, baseCost) ? cur : merged;
          });
          setCostConfig((cur) => reconcileCost(baseCost, cur, theirCost));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Clear pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const update = (id: string, patch: Partial<ScenarioClient>) => {
    dirtyRef.current = true;
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addClient = () => {
    dirtyRef.current = true;
    setClients((cs) => [
      ...cs,
      {
        id: nextId(),
        name: "New client",
        videosByMonth: new Array(HORIZON_MONTHS).fill(0),
        staticsByMonth: new Array(HORIZON_MONTHS).fill(0),
        enabled: true,
        hypothetical: true,
      },
    ]);
  };

  const removeClient = (id: string) => {
    dirtyRef.current = true;
    setClients((cs) => cs.filter((c) => c.id !== id));
  };

  const updateCost = (patch: Partial<CostConfig>) => {
    dirtyRef.current = true;
    setCostConfig((c) => ({ ...c, ...patch }));
  };

  return { clients, update, addClient, removeClient, costConfig, updateCost, saveState };
}
