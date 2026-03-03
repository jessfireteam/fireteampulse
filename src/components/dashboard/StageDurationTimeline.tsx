import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryFibery, StageTrackingResponse } from "@/lib/fibery";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { parseISO, format, startOfMonth } from "date-fns";

type ProjectTypeFilter = "Static" | "Video - LoFi";

function classifyProjectType(typeName: string | null | undefined, projectName: string): ProjectTypeFilter | null {
  if (typeName) {
    const t = typeName.toLowerCase();
    if (t.includes("video") || t.includes("ugc") || t.includes("lofi") || t.includes("lo-fi")) return "Video - LoFi";
    if (t.includes("static") || t.includes("graphic") || t.includes("design")) return "Static";
  }
  const n = projectName.toLowerCase();
  if (n.includes("video") || n.includes("ugc") || n.includes("reel") || n.includes("tiktok")) return "Video - LoFi";
  if (n.includes("static") || n.includes("design") || n.includes("graphic")) return "Static";
  return null;
}

interface StageSegment {
  stageName: string;
  avgDuration: number;
  targetDays: number | null;
  position: number;
  count: number;
  exceeds: boolean;
}

interface MonthRow {
  monthLabel: string;
  monthKey: string;
  segments: StageSegment[];
  totalDays: number;
}

export function StageDurationTimeline() {
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>("Static");

  const { data, isLoading, error } = useQuery({
    queryKey: ["fibery-stage-tracking"],
    queryFn: () => queryFibery<StageTrackingResponse>("stage-tracking"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const monthRows = useMemo(() => {
    if (!data?.findStageTrackings) return [];

    // Filter by project type
    const filtered = data.findStageTrackings.filter((entry) => {
      if (!entry.project || !entry.creationDate || !entry.stage) return false;
      const pType = classifyProjectType(entry.project.type?.name, entry.project.name);
      return pType === typeFilter;
    });

    // Group by month → stage
    const monthStageMap: Record<string, Record<string, { totalDuration: number; count: number; target: number | null; position: number }>> = {};

    filtered.forEach((entry) => {
      if (!entry.creationDate || !entry.stage) return;
      const date = parseISO(entry.creationDate);
      const monthKey = format(startOfMonth(date), "yyyy-MM");
      const stageName = entry.stage.name;
      const position = entry.stage.positionInType ?? 999;
      const target = entry.stage.daysItShouldTake ?? null;
      const duration = entry.duration ?? 0;

      if (!monthStageMap[monthKey]) monthStageMap[monthKey] = {};
      if (!monthStageMap[monthKey][stageName]) {
        monthStageMap[monthKey][stageName] = { totalDuration: 0, count: 0, target, position };
      }
      monthStageMap[monthKey][stageName].totalDuration += duration;
      monthStageMap[monthKey][stageName].count++;
      // Keep the lowest position (most authoritative)
      if (position < monthStageMap[monthKey][stageName].position) {
        monthStageMap[monthKey][stageName].position = position;
      }
    });

    // Build rows sorted oldest → newest (top to bottom)
    const rows: MonthRow[] = Object.entries(monthStageMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, stages]) => {
        const segments: StageSegment[] = Object.entries(stages)
          .map(([stageName, data]) => {
            const avg = data.count > 0 ? data.totalDuration / data.count : 0;
            return {
              stageName,
              avgDuration: Math.round(avg * 10) / 10,
              targetDays: data.target,
              position: data.position,
              count: data.count,
              exceeds: data.target != null && avg > data.target,
            };
          })
          .sort((a, b) => a.position - b.position);

        const totalDays = segments.reduce((sum, s) => sum + s.avgDuration, 0);
        const date = parseISO(monthKey + "-01");
        return {
          monthLabel: format(date, "MMM ''yy"),
          monthKey,
          segments,
          totalDays: Math.round(totalDays * 10) / 10,
        };
      });

    return rows;
  }, [data, typeFilter]);

  // Find max total for scaling
  const maxDays = useMemo(() => {
    if (monthRows.length === 0) return 30;
    return Math.max(...monthRows.map((r) => r.totalDays), 30);
  }, [monthRows]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Stage Duration Timeline" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Stage Duration Timeline" />
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load stage tracking data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Stage Duration Timeline" />
        <ToggleGroup
          type="single"
          value={typeFilter}
          onValueChange={(val) => {
            if (val) setTypeFilter(val as ProjectTypeFilter);
          }}
          className="bg-muted/50 rounded-lg p-1"
        >
          <ToggleGroupItem value="Static" className="text-xs px-3 py-1 rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm">
            Static
          </ToggleGroupItem>
          <ToggleGroupItem value="Video - LoFi" className="text-xs px-3 py-1 rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm">
            Video - LoFi
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          {monthRows.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No stage tracking data found for {typeFilter} projects
            </p>
          ) : (
            <TooltipProvider delayDuration={100}>
              <div className="space-y-2">
                {/* X-axis label */}
                <div className="flex items-center pl-20 mb-1">
                  <span className="text-[10px] text-muted-foreground">Days →</span>
                </div>

                {monthRows.map((row) => (
                  <div key={row.monthKey} className="flex items-center gap-2">
                    {/* Month label */}
                    <div className="w-16 shrink-0 text-right">
                      <span className="text-xs text-muted-foreground font-medium">{row.monthLabel}</span>
                    </div>

                    {/* Stacked bar */}
                    <div className="flex-1 flex items-center gap-0 h-7 relative">
                      {row.segments.map((seg, i) => {
                        const widthPct = (seg.avgDuration / maxDays) * 100;
                        if (widthPct < 0.5) return null;
                        const showLabel = widthPct > 8;

                        return (
                          <Tooltip key={`${row.monthKey}-${seg.stageName}-${i}`}>
                            <TooltipTrigger asChild>
                              <div
                                className={`h-full flex items-center justify-center cursor-default transition-colors ${
                                  seg.exceeds
                                    ? "bg-destructive/80 hover:bg-destructive"
                                    : "bg-muted-foreground/25 hover:bg-muted-foreground/35"
                                } ${i === 0 ? "rounded-l-md" : ""} ${
                                  i === row.segments.length - 1 ? "rounded-r-md" : ""
                                } border-r border-background/50`}
                                style={{ width: `${widthPct}%`, minWidth: "2px" }}
                              >
                                {showLabel && (
                                  <span className={`text-[9px] font-medium truncate px-1 ${
                                    seg.exceeds ? "text-destructive-foreground" : "text-foreground/70"
                                  }`}>
                                    {seg.stageName}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs space-y-1 max-w-xs">
                              <p className="font-semibold">{seg.stageName}</p>
                              <p>Avg: <span className="font-mono">{seg.avgDuration}</span> days</p>
                              {seg.targetDays != null && (
                                <p>
                                  Target: <span className="font-mono">{seg.targetDays}</span> days
                                  {seg.exceeds && <span className="text-destructive ml-1">(exceeded)</span>}
                                </p>
                              )}
                              <p className="text-muted-foreground">{seg.count} projects</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}

                      {/* Total at end */}
                      <span className="ml-2 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                        {row.totalDays}d
                      </span>
                    </div>
                  </div>
                ))}

                {/* Legend */}
                <div className="flex items-center gap-4 pt-3 pl-20">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-muted-foreground/25" />
                    <span className="text-[10px] text-muted-foreground">Within target</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-destructive/80" />
                    <span className="text-[10px] text-muted-foreground">Exceeds target</span>
                  </div>
                </div>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
