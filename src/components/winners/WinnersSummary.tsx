import { KPICard } from "@/components/dashboard/KPICard";
import { Trophy, TrendingUp, Crown, Star } from "lucide-react";
import type { WinnersData, Contributor } from "@/hooks/useWinnersData";

interface Props {
  data: WinnersData;
  contributors: Contributor[];
}

export function WinnersSummary({ data, contributors }: Props) {
  const recentRatePct = data.recentProjects > 0 ? data.recentWinRate * 100 : 0;
  const allTimeRatePct =
    data.totalProjects > 0 ? (data.totalWinners / data.totalProjects) * 100 : 0;
  const overallWinRate = data.recentProjects > 0
    ? recentRatePct.toFixed(2) + "%"
    : "0%";
  const delta = recentRatePct - allTimeRatePct;
  const arrow = delta > 0.01 ? "▲" : delta < -0.01 ? "▼" : "·";
  const winRateSubtitle =
    `${data.recentWinners} winners · last 90d ${arrow} ` +
    `all-time ${allTimeRatePct.toFixed(2)}%`;

  // Rank on the shrunk (noise-adjusted) index and require enough volume +
  // measurability, so the headline "top performer" isn't a lucky 2/3.
  const eligible = contributors.filter(
    (c) => c.totalProjects >= 10 && c.measurable && c.shrunkIndex !== null
  );
  const topPerformer = eligible.length > 0
    ? eligible.sort((a, b) => (b.shrunkIndex ?? 0) - (a.shrunkIndex ?? 0))[0]
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
        subtitle={winRateSubtitle}
        icon={TrendingUp}
      />
      <KPICard
        title="Top Performer"
        value={topPerformer ? topPerformer.name : "—"}
        subtitle={
          topPerformer
            ? `W Index ${topPerformer.performanceIndex} (adj ${topPerformer.shrunkIndex})${topPerformer.significant ? " ★" : ""}`
            : "Min 10 projects needed"
        }
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
