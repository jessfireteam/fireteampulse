import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PacingCard } from "./PacingCard";
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
import { usePacingData } from "@/hooks/usePacingData";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const { data, isLoading, error } = useProjectsData();
  const pacing = usePacingData();

  const { chartData, clients } = useMemo(() => {
    const projects = data?.findProjects || [];
    return processProjectsForHeartbeat(projects, viewMode);
  }, [data, viewMode]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Agency Heartbeat" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
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

  return (
    <div className="space-y-6">
      <SectionHeader title="Agency Heartbeat" />

      {/* Pacing Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {pacing.isLoading ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </>
        ) : (
          <>
            <PacingCard title="Projects Created" metric={pacing.created} />
            <PacingCard title="Projects Shipped" metric={pacing.shipped} />
          </>
        )}
      </div>

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