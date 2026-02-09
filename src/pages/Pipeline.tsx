import { useAuth } from "@/hooks/useAuth";
import { usePipelineData } from "@/hooks/usePipelineData";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ActivePipeline } from "@/components/pipeline/ActivePipeline";
import { LeadVolumeCharts } from "@/components/pipeline/LeadVolumeCharts";
import { GhostedLeads } from "@/components/pipeline/GhostedLeads";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

const Pipeline = () => {
  const { loading: authLoading } = useAuth();
  const { activeLeads, needAttentionCount, monthlyVolume, weeklyVolume, avgPerMonth, avgPerWeek, ghostedLeads, isLoading, error } = usePipelineData();

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
          <h2 className="text-xl font-semibold text-foreground">Pipeline</h2>
          <p className="text-sm text-muted-foreground">Lead tracking and follow-up</p>
        </div>

        {isLoading ? (
          <div className="space-y-6 mt-8">
            <Skeleton className="h-[300px]" />
            <Skeleton className="h-[300px]" />
            <Skeleton className="h-[300px]" />
          </div>
        ) : error ? (
          <Card className="border-destructive/50 bg-destructive/10 mt-8">
            <CardContent className="p-6">
              <p className="text-destructive">Failed to load pipeline data</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-12 mt-8">
            {/* Active Pipeline */}
            <section>
              <SectionHeader title="Active Pipeline" />
              <div className="mt-4">
                <ActivePipeline leads={activeLeads} needAttentionCount={needAttentionCount} />
              </div>
            </section>

            {/* Lead Volume */}
            <section>
              <SectionHeader title="Lead Volume" />
              <Card className="border-border/50 bg-card/50 mt-4">
                <CardContent className="p-6">
                  <LeadVolumeCharts
                    monthlyVolume={monthlyVolume}
                    weeklyVolume={weeklyVolume}
                    avgPerMonth={avgPerMonth}
                    avgPerWeek={avgPerWeek}
                  />
                </CardContent>
              </Card>
            </section>

            {/* Ghosted Leads */}
            <section>
              <SectionHeader title="Recently Ghosted — Worth Following Up?" />
              <Card className="border-border/50 bg-card/50 mt-4">
                <CardContent className="p-6">
                  <GhostedLeads leads={ghostedLeads} />
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pipeline;
