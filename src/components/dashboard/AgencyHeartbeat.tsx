import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PacingChart } from "./PacingChart";
import { SectionHeader } from "./SectionHeader";
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
import { useClientsData, getActiveClientNames } from "@/hooks/useClientsData";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Color palette reserved for ACTIVE clients only. Inactive/retired clients
// all render in a single muted gray (GRAY_INACTIVE) so the active roster stays
// visually distinct and the palette isn't burned on churned clients.
const COLORS = [
  "hsl(18, 100%, 60%)",   // Fire orange
  "hsl(32, 95%, 55%)",    // Amber
  "hsl(45, 93%, 50%)",    // Yellow
  "hsl(75, 65%, 50%)",    // Lime
  "hsl(160, 70%, 45%)",   // Teal
  "hsl(175, 75%, 55%)",   // Aqua
  "hsl(195, 90%, 55%)",   // Cyan
  "hsl(220, 75%, 60%)",   // Blue
  "hsl(250, 70%, 65%)",   // Indigo
  "hsl(280, 75%, 62%)",   // Purple
  "hsl(310, 70%, 60%)",   // Magenta
  "hsl(340, 82%, 60%)",   // Pink
  "hsl(0, 75%, 60%)",     // Red
  "hsl(125, 55%, 50%)",   // Green
];

// Uniform color for every inactive/retired client.
const GRAY_INACTIVE = "hsl(220, 10%, 42%)";

export function AgencyHeartbeat() {
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const { data, isLoading, error } = useProjectsData();
  const { data: clientsData } = useClientsData();

  const { chartData, clients } = useMemo(() => {
    const projects = data?.findProjects || [];
    return processProjectsForHeartbeat(projects, viewMode);
  }, [data, viewMode]);

  // Order clients so active ones come first (and get the color palette), with
  // inactive/retired clients grouped at the top of the stack in a single gray.
  // Each active client keeps a stable palette color; inactives all share gray.
  const { orderedClients, colorFor } = useMemo(() => {
    const activeSet = getActiveClientNames(clientsData);
    const active = clients.filter((c) => activeSet.has(c.trim().toLowerCase()));
    const inactive = clients.filter((c) => !activeSet.has(c.trim().toLowerCase()));
    const colors: Record<string, string> = {};
    active.forEach((c, i) => { colors[c] = COLORS[i % COLORS.length]; });
    inactive.forEach((c) => { colors[c] = GRAY_INACTIVE; });
    return { orderedClients: [...active, ...inactive], colorFor: colors };
  }, [clients, clientsData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Agency Heartbeat" />
        <Skeleton className="h-80" />
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

  return (
    <div className="space-y-6">
      <SectionHeader title="Agency Heartbeat" />

      {/* Pacing Line Chart */}
      <PacingChart />

      {/* Stacked Bar Chart */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Projects Completed by {viewMode === 'weekly' ? 'Week' : 'Month'}
            </h3>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => value && setViewMode(value as 'weekly' | 'monthly')}
              className="bg-secondary/50 rounded-md p-1"
            >
              <ToggleGroupItem
                value="weekly"
                aria-label="View by week"
                className="text-xs px-3 py-1 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                Week
              </ToggleGroupItem>
              <ToggleGroupItem
                value="monthly"
                aria-label="View by month"
                className="text-xs px-3 py-1 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                Month
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
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
                  cursor={false}
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
                {orderedClients.map((client, index) => (
                  <Bar
                    key={client}
                    dataKey={client}
                    stackId="a"
                    fill={colorFor[client]}
                    radius={index === orderedClients.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
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