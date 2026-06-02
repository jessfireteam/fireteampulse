// src/hooks/useScenario.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HORIZON_MONTHS, emptyCostConfig, type ClientHistory, type ScenarioClient, type CostConfig } from "@/lib/forecast/types";
import { mergeScenario } from "@/lib/forecast/mergeScenario";

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

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useScenario(histories: ClientHistory[], userEmail?: string | null) {
  const [clients, setClients] = useState<ScenarioClient[]>([]);
  const [costConfig, setCostConfig] = useState<CostConfig>(() => emptyCostConfig(HORIZON_MONTHS));
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Saved row loaded from Supabase (or [] on error/missing).
  const [savedClients, setSavedClients] = useState<ScenarioClient[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  const seededRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1) Load the saved row once, gracefully.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await db
          .from(TABLE)
          .select("clients, cost_config")
          .eq("id", ROW_ID)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setSavedClients([]);
        } else {
          const raw = data?.clients;
          setSavedClients(Array.isArray(raw) ? (raw as ScenarioClient[]) : []);
          const cc = data?.cost_config;
          if (cc && Array.isArray(cc.partnerSalaryByMonth)) setCostConfig({ ...emptyCostConfig(HORIZON_MONTHS), ...(cc as Partial<CostConfig>) });
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

  // 2) Seed once, after both the saved row and histories are available.
  useEffect(() => {
    if (seededRef.current) return;
    if (!loaded || histories.length === 0) return;
    setClients(mergeScenario(histories, savedClients ?? [], HORIZON_MONTHS, nextId));
    seededRef.current = true;
  }, [loaded, histories, savedClients]);

  // 3) Debounced autosave, only after seeding completes.
  useEffect(() => {
    if (!seededRef.current) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      (async () => {
        try {
          const { error } = await db.from(TABLE).upsert({
            id: ROW_ID,
            clients,
            cost_config: costConfig,
            updated_at: new Date().toISOString(),
            updated_by: userEmail ?? null,
          });
          setSaveState(error ? "error" : "saved");
        } catch {
          setSaveState("error");
        }
      })();
    }, AUTOSAVE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, costConfig, userEmail]);

  // Clear pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const update = (id: string, patch: Partial<ScenarioClient>) =>
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addClient = () =>
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

  const removeClient = (id: string) => setClients((cs) => cs.filter((c) => c.id !== id));

  const updateCost = (patch: Partial<CostConfig>) => setCostConfig((c) => ({ ...c, ...patch }));

  return { clients, update, addClient, removeClient, costConfig, updateCost, saveState };
}
