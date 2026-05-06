import { useAuth } from "@/hooks/useAuth";
import { useCreatorCostsData } from "@/hooks/useCreatorCostsData";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { AgencyTrendsChart } from "@/components/creator-costs/AgencyTrendsChart";
import { CreatorTable } from "@/components/creator-costs/CreatorTable";
import { ClientSpendChart } from "@/components/creator-costs/ClientSpendChart";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

const CreatorCosts = () => {
  const { loading: authLoading } = useAuth();
  const { creators, monthlyTrends, clientSpend, winnerMatchStats, isLoading, error } = useCreatorCostsData();

  if (authLoading) {
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

        <div className="mb-2">
          <h2 className="text-xl font-semibold text-foreground">Creator Costs</h2>
          <p className="text-sm text-muted-foreground">Creator payment trends — last 12 months</p>
        </div>

        {isLoading ? (
          <div className="space-y-6 mt-8">
            <Skeleton className="h-[350px]" />
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[300px]" />
          </div>
        ) : error ? (
          <Card className="border-destructive/50 bg-destructive/10 mt-8">
            <CardContent className="p-6">
              <p className="text-destructive">Failed to load creator costs data</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-12 mt-8">
            {/* Agency-Wide Trends */}
            <section>
              <SectionHeader title="Agency-Wide Trends" />
              <Card className="border-border/50 bg-card/50 mt-4">
                <CardContent className="p-6">
                  <AgencyTrendsChart data={monthlyTrends} />
                </CardContent>
              </Card>
            </section>

            {/* Creator Table */}
            <section>
              <SectionHeader title={`Creators (${creators.length})`} />
              {winnerMatchStats.totalCreators > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Windex matched {winnerMatchStats.matchedCreators}/{winnerMatchStats.totalCreators} creators
                  ({Math.round(winnerMatchStats.matchRate * 100)}%) to Fibery contractor records.
                  Unmatched names show "—" — check for naming inconsistencies between expense records and Fibery contractor entities.
                </p>
              )}
              <div className="mt-4">
                <CreatorTable creators={creators} />
              </div>
            </section>

            {/* Spend by Client */}
            <section>
              <SectionHeader title="Spend by Client" />
              <Card className="border-border/50 bg-card/50 mt-4">
                <CardContent className="p-6">
                  {clientSpend.length > 0 ? (
                    <ClientSpendChart data={clientSpend} />
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No client spend data available</p>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorCosts;
