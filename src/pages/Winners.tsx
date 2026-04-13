import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { useWinnersData, ROLE_LABELS } from "@/hooks/useWinnersData";
import { WinnersSummary } from "@/components/winners/WinnersSummary";
import { ClientBaseline } from "@/components/winners/ClientBaseline";
import { ContributorTable } from "@/components/winners/ContributorTable";
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredContributors = data
    ? roleFilter === "all"
      ? data.contributors
      : data.contributors.filter((c) => c.rolePublicId === roleFilter)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(18_100%_60%_/_0.05),_transparent_50%)] pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader />

        {/* Filters */}
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
          <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-1">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRoleFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  roleFilter === opt.value
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
            <WinnersSummary data={data} contributors={filteredContributors} />
            <ClientBaseline clients={data.clientStats} />
            <ContributorTable
              contributors={filteredContributors}
              clientStats={data.clientStats}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Winners;
