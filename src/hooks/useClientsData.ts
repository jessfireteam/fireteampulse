import { useQuery } from "@tanstack/react-query";
import { queryFibery } from "@/lib/fibery";
import type { ClientsResponse } from "@/lib/fibery";

export function useClientsData() {
  return useQuery({
    queryKey: ["fibery-clients"],
    queryFn: () => queryFibery<ClientsResponse>("clients"),
    staleTime: 10 * 60 * 1000,
    retry: 2,
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
