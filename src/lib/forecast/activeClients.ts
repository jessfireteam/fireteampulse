// src/lib/forecast/activeClients.ts
import type { ClientHistory } from "./types";

/** Names we never show as a client even if marked active. */
const EXCLUDED_CLIENTS = new Set(["fireteam"]);

/** Build the set of active client names (lowercased) from the clients query. */
export function activeClientNames(
  clients: { name: string | null; status: { name: string } | null }[],
): Set<string> {
  const set = new Set<string>();
  clients.forEach((c) => {
    const name = c.name?.trim().toLowerCase();
    if (!name) return;
    if (EXCLUDED_CLIENTS.has(name)) return;
    if (c.status?.name === "Active") set.add(name);
  });
  return set;
}

/** Keep only histories whose client is in the active set. */
export function filterActiveHistories(histories: ClientHistory[], active: Set<string>): ClientHistory[] {
  return histories.filter((h) => active.has(h.client.trim().toLowerCase()));
}
