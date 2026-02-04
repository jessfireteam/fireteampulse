import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AgencyHeartbeat } from "@/components/dashboard/AgencyHeartbeat";
import { TeamCapacity } from "@/components/dashboard/TeamCapacity";
import { ClientEconomics } from "@/components/dashboard/ClientEconomics";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Subtle background gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(18_100%_60%_/_0.05),_transparent_50%)] pointer-events-none" />
      
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader />

        <div className="space-y-12">
          {/* Agency Heartbeat Section */}
          <section>
            <AgencyHeartbeat />
          </section>

          {/* Team Capacity Section */}
          <section>
            <TeamCapacity />
          </section>

          {/* Client Economics Section */}
          <section>
            <ClientEconomics />
          </section>
        </div>
      </div>
    </div>
  );
};

export default Index;