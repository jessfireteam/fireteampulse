import { Card, CardContent } from "@/components/ui/card";
import { KPICard } from "./KPICard";
import { SectionHeader } from "./SectionHeader";
import { FolderCheck, Users, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useProjectsData, processProjectsForHeartbeat } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";

// Color palette for clients
const COLORS = [
  "hsl(18, 100%, 60%)",   // Fire orange
  "hsl(32, 95%, 55%)",    // Amber
  "hsl(45, 93%, 47%)",    // Yellow
  "hsl(195, 90%, 55%)",   // Cyan
  "hsl(280, 80%, 60%)",   // Purple
  "hsl(340, 82%, 60%)",   // Pink
  "hsl(160, 70%, 50%)",   // Teal
  "hsl(220, 70%, 60%)",   // Blue
];

export function AgencyHeartbeat() {
  const { data, isLoading, error } = useProjectsData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Agency Heartbeat" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Agency Heartbeat" />
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load projects data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const projects = data?.findProjects || [];
  const { chartData, clients, kpis } = processProjectsForHeartbeat(projects);

  return (
    <div className="space-y-6">
      <SectionHeader title="Agency Heartbeat" />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard
          title="Projects This Month"
          value={kpis.projectsThisMonth}
          icon={FolderCheck}
        />
        <KPICard
          title="Active Clients"
          value={kpis.activeClients}
          icon={Users}
        />
        <KPICard
          title="Weekly Average"
          value={kpis.weeklyAverage}
          subtitle="projects per week"
          icon={TrendingUp}
        />
      </div>

      {/* Stacked Bar Chart */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">
            Projects Completed by Week
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(217, 33%, 18%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="week"
                  tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(217, 33%, 18%)" }}
                />
                <YAxis
                  tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 47%, 10%)",
                    border: "1px solid hsl(217, 33%, 18%)",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                  labelStyle={{ color: "hsl(210, 40%, 96%)", fontWeight: 600 }}
                  itemStyle={{ color: "hsl(210, 40%, 96%)" }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: "20px" }}
                  iconType="circle"
                />
                {clients.map((client, index) => (
                  <Bar
                    key={client}
                    dataKey={client}
                    stackId="a"
                    fill={COLORS[index % COLORS.length]}
                    radius={index === clients.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}