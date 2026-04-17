import { KPICard } from "@/components/dashboard/KPICard";
import { Trophy, TrendingUp, Crown, Star } from "lucide-react";
import type { WinnersData, Contributor } from "@/hooks/useWinnersData";

interface Props {
  data: WinnersData;
  contributors: Contributor[];
}

export function WinnersSummary({ data, contributors }: Props) {
  const overallWinRate = data.totalProjects > 0
    ? ((data.totalWinners / data.totalProjects) * 100).toFixed(1) + "%"
    : "0%";

  const eligible = contributors.filter((c) => c.totalProjects >= 5 && c.performanceIndex !== null);
  const topPerformer = eligible.length > 0
    ? eligible.sort((a, b) => (b.performanceIndex ?? 0) - (a.performanceIndex ?? 0))[0]
    : null;

  const topClient = data.clientStats.length > 0 ? data.clientStats[0] : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        title="Total Winners"
        value={data.totalWinners}
        subtitle={`of ${data.totalProjects} projects`}
        icon={Trophy}
      />
      <KPICard
        title="Overall Win Rate"
        value={overallWinRate}
        subtitle={`${data.totalWinners} winners`}
        icon={TrendingUp}
      />
      <KPICard
        title="Top Performer"
        value={topPerformer ? topPerformer.name : "—"}
        subtitle={topPerformer ? `W Index: ${topPerformer.performanceIndex}` : "Min 5 projects needed"}
        icon={Crown}
      />
      <KPICard
        title="Most Winner-Prone Client"
        value={topClient ? topClient.name : "—"}
        subtitle={topClient ? `${(topClient.winRate * 100).toFixed(0)}% win rate` : "No data"}
        icon={Star}
      />
    </div>
  );
}
