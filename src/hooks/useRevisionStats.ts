import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryFibery } from "@/lib/fibery";

interface RawRevisionProject {
  name: string;
  doneDate: string | null;
  client: { name: string } | null;
  type: { name: string } | null;
  internalVersions: Array<{ sendToClient: boolean }> | null;
}

export interface FlaggedProject {
  name: string;
  doneDate: string;
  type: string;
  rounds: number;
}

export interface ClientRevisionStats {
  avgRounds: number;
  highRevisionRate: number; // % of projects with 3+ rounds
  flaggedProjects: FlaggedProject[];
  totalProjects: number;
}

export function useRevisionStats(clientName: string) {
  const query = useQuery({
    queryKey: ["fibery", "revision-stats"],
    queryFn: () =>
      queryFibery<{ findProjects: RawRevisionProject[] }>("revision-stats"),
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo((): ClientRevisionStats | null => {
    if (!query.data?.findProjects || !clientName) return null;

    const clientLower = clientName.trim().toLowerCase();
    const clientProjects = query.data.findProjects.filter(
      (p) =>
        p.client?.name?.trim().toLowerCase() === clientLower && !!p.doneDate
    );

    if (clientProjects.length === 0) return null;

    // Count versions where sendToClient = true
    const projectsWithRounds = clientProjects
      .map((p) => ({
        name: p.name,
        doneDate: p.doneDate!,
        type: p.type?.name ?? "Unknown",
        rounds: p.internalVersions?.filter((v) => v.sendToClient).length ?? 0,
      }))
      .filter((p) => p.rounds > 0);

    if (projectsWithRounds.length === 0) return null;

    const avgRounds =
      projectsWithRounds.reduce((sum, p) => sum + p.rounds, 0) /
      projectsWithRounds.length;

    const flagged = projectsWithRounds
      .filter((p) => p.rounds >= 3)
      .sort((a, b) => b.doneDate.localeCompare(a.doneDate));

    const highRevisionRate = Math.round(
      (flagged.length / projectsWithRounds.length) * 100
    );

    return {
      avgRounds: Math.round(avgRounds * 10) / 10,
      highRevisionRate,
      flaggedProjects: flagged.slice(0, 20),
      totalProjects: projectsWithRounds.length,
    };
  }, [query.data, clientName]);

  return { stats, isLoading: query.isLoading, error: query.error };
}
