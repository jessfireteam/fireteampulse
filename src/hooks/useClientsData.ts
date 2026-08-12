import { useQuery } from "@tanstack/react-query";
import { queryFibery } from "@/lib/fibery";
import type { ClientPlansResponse, ClientsResponse } from "@/lib/fibery";

export function useClientsData() {
  return useQuery({
    queryKey: ["fibery-clients"],
    queryFn: () => queryFibery<ClientsResponse>("clients"),
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Min/Max Deliverables Per Month, fetched separately from the client roster on purpose.
 * Callers must treat a failure here as "no plan known" and degrade to trailing run-rate,
 * never as a page error — the roster query is the one the dashboard can't live without.
 */
export function useClientPlansData() {
  return useQuery({
    queryKey: ["fibery-client-plans"],
    queryFn: () => queryFibery<ClientPlansResponse>("client-plans"),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function getActiveClientNames(data: ClientsResponse | undefined): Set<string> {
  const active = new Set<string>();
  if (data?.findClients) {
    data.findClients.forEach((c) => {
      const name = c.name?.trim();
      if (!name) return;
      if (c.status?.name?.toLowerCase() === "active") {
        active.add(name.toLowerCase());
      }
    });
  }
  return active;
}
