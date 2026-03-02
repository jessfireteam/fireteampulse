import { useAuth } from "@/hooks/useAuth";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { TeamCapacity as TeamCapacitySection } from "@/components/dashboard/TeamCapacity";
import { ProjectsTimeline } from "@/components/dashboard/ProjectsTimeline";
import { Loader2 } from "lucide-react";

const OpsPage = () => {
  const { loading: authLoading } = useAuth();

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
        <div className="space-y-12">
          <section>
            <ProjectsTimeline />
          </section>
          <section>
            <TeamCapacitySection />
          </section>
        </div>
      </div>
    </div>
  );
};

export default OpsPage;
