// src/hooks/useScenario.ts
import { useEffect, useState } from "react";
import type { ClientBaseline, ScenarioClient } from "@/lib/forecast/types";

let idCounter = 0;
const nextId = () => `client-${++idCounter}`;

export function useScenario(baselines: ClientBaseline[]) {
  const [clients, setClients] = useState<ScenarioClient[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || baselines.length === 0) return;
    setClients(
      baselines.map((b) => ({
        id: nextId(),
        name: b.client,
        startMonthIndex: 0,
        assetsPerMonth: b.monthlyRate,
        enabled: true,
        hypothetical: false,
        trendPct: b.trendPct,
      })),
    );
    setSeeded(true);
  }, [baselines, seeded]);

  const update = (id: string, patch: Partial<ScenarioClient>) =>
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addClient = () =>
    setClients((cs) => [
      ...cs,
      { id: nextId(), name: "New client", startMonthIndex: 0, assetsPerMonth: 12, enabled: true, hypothetical: true },
    ]);

  const removeClient = (id: string) => setClients((cs) => cs.filter((c) => c.id !== id));

  return { clients, update, addClient, removeClient };
}
