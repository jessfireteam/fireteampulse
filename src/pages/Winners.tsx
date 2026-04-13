import { useState, useMemo } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { useWinnersData } from "@/hooks/useWinnersData";
import { useClientsData, getActiveClientNames } from "@/hooks/useClientsData";
import { WinnersSummary } from "@/components/winners/WinnersSummary";
import { ClientBaseline } from "@/components/winners/ClientBaseline";
import { ContributorTable } from "@/components/winners/ContributorTable";
import { WinnersMonthlyChart } from "@/components/winners/WinnersMonthlyChart";
import { Loader2 } from "lucide-react";

const DATE_OPTIONS = [
  { value: "30d", label: "Last 30d" },
  { value: "90d", label: "Last 90d" },
  { value: "this-year", label: "This Year" },
  { value: "all", label: "All Time" },
];

const Winners = () => {
  const { loading } = useAuth();
  const [dateFilter, setDateFilter] = useState("all");
  const { data, isLoading, error } = useWinnersData(dateFilter);
  const { data: clientsData } = useClientsData();

  const activeClientStats = useMemo(() => {
    if (!data?.clientStats) return [];
    const activeNames = getActiveClientNames(clientsData);
    if (activeNames.size === 0) return data.clientStats; // fallback if no client data
    return data.clientStats.filter((c) => activeNames.has(c.name.toLowerCase()));
  }, [data?.clientStats, clientsData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(18_100%_60%_/_0.05),_transparent_50%)] pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader />

        {/* Date Filter */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-1">
            {DATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  dateFilter === opt.value
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load winners data. Please try again.
          </div>
        )}

        {data && (
          <div className="space-y-8">
            <WinnersMonthlyChart data={data.monthlyWinners} />
            <WinnersSummary data={data} contributors={data.contributors} />
            <ClientBaseline clients={activeClientStats} />
            <ContributorTable
              contributors={data.contributors}
              clientStats={data.clientStats}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Winners;
