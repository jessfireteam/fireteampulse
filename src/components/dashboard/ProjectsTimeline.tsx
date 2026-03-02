import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryFibery, ProjectCompletionsResponse, ProjectTimelineUpcomingResponse } from "@/lib/fibery";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { startOfWeek, endOfWeek, format, parseISO, subWeeks, addWeeks } from "date-fns";

function classifyType(name: string, typeName: string | null | undefined): "Static" | "Video" {
  if (typeName) {
    const t = typeName.toLowerCase();
    if (t.includes("video") || t.includes("ugc")) return "Video";
    if (t.includes("static") || t.includes("graphic") || t.includes("design")) return "Static";
  }
  // Fallback: infer from project name
  const n = name.toLowerCase();
  if (n.includes("video") || n.includes("ugc") || n.includes("reel") || n.includes("tiktok")) return "Video";
  return "Static";
}

interface WeekData {
  weekLabel: string;
  weekStart: Date;
  static: number;
  video: number;
  isFuture: boolean;
}

export function ProjectsTimeline() {
  const { data: completionsData, isLoading: compLoading, error: compError } = useQuery({
    queryKey: ["fibery-project-completions"],
    queryFn: () => queryFibery<ProjectCompletionsResponse>("project-completions"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { data: upcomingData, isLoading: upLoading, error: upError } = useQuery({
    queryKey: ["fibery-project-timeline-upcoming"],
    queryFn: () => queryFibery<ProjectTimelineUpcomingResponse>("project-timeline-upcoming"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const isLoading = compLoading || upLoading;
  const error = compError || upError;

  const chartData = useMemo(() => {
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });

    // Determine how many future weeks we need based on upcoming data
    let maxFutureWeeks = 5;
    if (upcomingData?.findProjects) {
      upcomingData.findProjects.forEach((p) => {
        if (!p.dueDate) return;
        const dueDate = parseISO(p.dueDate);
        const ws = startOfWeek(dueDate, { weekStartsOn: 1 });
        const weeksOut = Math.ceil((ws.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weeksOut > maxFutureWeeks) maxFutureWeeks = weeksOut;
      });
    }

    // Build week buckets: 12 past weeks + current week + dynamic future weeks
    const weeks: WeekData[] = [];

    for (let i = 12; i >= 1; i--) {
      const ws = subWeeks(currentWeekStart, i);
      weeks.push({
        weekLabel: format(ws, "MMM d"),
        weekStart: ws,
        static: 0,
        video: 0,
        isFuture: false,
      });
    }

    // Current week
    weeks.push({
      weekLabel: format(currentWeekStart, "MMM d") + " ★",
      weekStart: currentWeekStart,
      static: 0,
      video: 0,
      isFuture: false,
    });

    for (let i = 1; i <= maxFutureWeeks; i++) {
      const ws = addWeeks(currentWeekStart, i);
      weeks.push({
        weekLabel: format(ws, "MMM d"),
        weekStart: ws,
        static: 0,
        video: 0,
        isFuture: true,
      });
    }

    // Fill historical from completions
    if (completionsData?.findProjects) {
      completionsData.findProjects.forEach((p) => {
        if (!p.doneDate) return;
        const doneDate = parseISO(p.doneDate);
        const ws = startOfWeek(doneDate, { weekStartsOn: 1 });
        const bucket = weeks.find((w) => w.weekStart.getTime() === ws.getTime() && !w.isFuture);
        if (!bucket) return;
        const type = classifyType(p.name, p.type?.name);
        if (type === "Video") bucket.video++;
        else bucket.static++;
      });
    }

    // Fill future from upcoming
    if (upcomingData?.findProjects) {
      upcomingData.findProjects.forEach((p) => {
        if (!p.dueDate) return;
        const dueDate = parseISO(p.dueDate);
        const ws = startOfWeek(dueDate, { weekStartsOn: 1 });
        const bucket = weeks.find((w) => w.weekStart.getTime() === ws.getTime());
        if (!bucket) return;
        const type = classifyType(p.name, p.type?.name);
        if (type === "Video") bucket.video++;
        else bucket.static++;
      });
    }

    return weeks;
  }, [completionsData, upcomingData]);

  // Find the index of the "today" divider (current week)
  const todayIndex = chartData.findIndex((w) => w.weekLabel.includes("★"));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Projects Timeline" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Projects Timeline" />
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load timeline data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Projects Timeline" />
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                <XAxis
                  dataKey="weekLabel"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    name === "static" ? "Static" : "Video",
                  ]}
                />
                <Legend
                  formatter={(value) => (value === "static" ? "Static" : "Video")}
                />
                {todayIndex >= 0 && (
                  <ReferenceLine
                    x={chartData[todayIndex]?.weekLabel}
                    stroke="hsl(var(--foreground))"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    label={{
                      value: "Today",
                      position: "top",
                      fill: "hsl(var(--foreground))",
                      fontSize: 11,
                    }}
                  />
                )}
                <Bar dataKey="static" stackId="a" radius={[0, 0, 0, 0]} fill="#EAB308">
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`static-${index}`}
                      fillOpacity={entry.isFuture ? 0.5 : 1}
                    />
                  ))}
                </Bar>
                <Bar dataKey="video" stackId="a" radius={[4, 4, 0, 0]} fill="#F97316">
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`video-${index}`}
                      fillOpacity={entry.isFuture ? 0.5 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Past weeks show completed projects • Future weeks show scheduled projects (faded)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
