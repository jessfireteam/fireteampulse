// src/hooks/useScenario.ts
import { useEffect, useState } from "react";
import { HORIZON_MONTHS, type ClientHistory, type ScenarioClient } from "@/lib/forecast/types";

let idCounter = 0;
const nextId = () => `client-${++idCounter}`;

export function useScenario(histories: ClientHistory[]) {
  const [clients, setClients] = useState<ScenarioClient[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || histories.length === 0) return;
    setClients(
      histories.map((h) => ({
        id: nextId(),
        name: h.client,
        videosByMonth: new Array(HORIZON_MONTHS).fill(h.seedVideos),
        staticsByMonth: new Array(HORIZON_MONTHS).fill(h.seedStatics),
        enabled: true,
        hypothetical: false,
      })),
    );
    setSeeded(true);
  }, [histories, seeded]);

  const update = (id: string, patch: Partial<ScenarioClient>) =>
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addClient = () =>
    setClients((cs) => [
      ...cs,
      { id: nextId(), name: "New client", videosByMonth: new Array(HORIZON_MONTHS).fill(0), staticsByMonth: new Array(HORIZON_MONTHS).fill(0), enabled: true, hypothetical: true },
    ]);

  const removeClient = (id: string) => setClients((cs) => cs.filter((c) => c.id !== id));

  return { clients, update, addClient, removeClient };
}
