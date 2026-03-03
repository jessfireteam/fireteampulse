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

// Stage orders per project type (position = display order left-to-right)
const STATIC_STAGE_ORDER: Record<string, number> = {
  "Needs Concept": 1,
  "Concept Pending Approval": 2,
  "Needs Brief Written": 3,
  "Need to send brief to client": 4,
  "Brief Pending Client Approval": 5,
  "Ad Needs Naming": 6,
  "Assign Designer": 7,
  "With Designer": 8,
  "Creative Review": 9,
  "Approved Internally": 10,
  "Ready For Upload": 11,
  "Need to send ad to client": 12,
  "Ad Pending Client Approval": 13,
  "Needs To Go To Market": 14,
  "Final Deliverables": 15,
};

const VIDEO_STAGE_ORDER: Record<string, number> = {
  "Needs Concept": 1,
  "Concept Pending Approval": 2,
  "Needs Brief Written": 3,
  "Need to send to client": 4,
  "Brief Pending Client Approval": 5,
  "Ad Needs Naming": 6,
  "Cast Creator": 7,
  "Awaiting deliverables": 8,
  "Assign Editor": 9,
  "With Editor": 10,
  "Creative Review": 11,
  "Approved Internally": 12,
  "Ready For Upload": 13,
  "Send ad to client for review": 14,
  "Ad Pending Client Approval": 15,
  "Needs To Go To Market": 16,
  "Final Deliverables": 17,
};

const EXCLUDED_STAGES = new Set(["Approved"]);

function getStagePosition(stageName: string, typeFilter: ProjectTypeFilter): number {
  const order = typeFilter === "Static" ? STATIC_STAGE_ORDER : VIDEO_STAGE_ORDER;
  return order[stageName] ?? 99;
}

function classifyProjectType(typeName: string | null | undefined): ProjectTypeFilter | null {
  if (!typeName) return null;
  const t = typeName.toUpperCase();
  if (t.includes("VIDEO") || t.includes("LOFI") || t.includes("LO-FI") || t.includes("UGC") || t.includes("EDIT")) return "Video - LoFi";
  if (t.includes("STATIC") || t.includes("CAROUSEL") || t.includes("GRAPHIC") || t.includes("DESIGN")) return "Static";
  return null;
}

interface StageSegment {
  stageName: string;
  avgDuration: number;
  position: number;
  count: number;
}

interface MonthRow {
  monthLabel: string;
  monthKey: string;
  segments: StageSegment[];
  totalDays: number;
}

// Stage color palette
const STAGE_COLORS: Record<string, string> = {
  "Needs Concept": "bg-slate-500/70",
  "Concept Pending Approval": "bg-slate-400/70",
  "Needs Brief Written": "bg-sky-700/70",
  "Need to send brief to client": "bg-sky-600/70",
  "Need to send to client": "bg-sky-600/70",
  "Brief Pending Client Approval": "bg-sky-500/70",
  "Ad Needs Naming": "bg-cyan-500/70",
  "Assign Designer": "bg-violet-500/70",
  "Assign Editor": "bg-violet-500/70",
  "Cast Creator": "bg-purple-500/70",
  "Awaiting deliverables": "bg-purple-400/70",
  "With Designer": "bg-indigo-500/70",
  "With Editor": "bg-indigo-500/70",
  "Creative Review": "bg-amber-500/70",
  "Approved Internally": "bg-yellow-500/70",
  "Ready For Upload": "bg-emerald-500/70",
  "Need to send ad to client": "bg-orange-500/70",
  "Send ad to client for review": "bg-orange-500/70",
  "Ad Pending Client Approval": "bg-orange-400/70",
  "Needs To Go To Market": "bg-teal-500/70",
  "Final Deliverables": "bg-green-500/70",
};

function getStageColor(stageName: string): string {
  return STAGE_COLORS[stageName] ?? "bg-muted-foreground/30";
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

    const filtered = data.findStageTrackings.filter((entry) => {
      if (!entry.project || !entry.creationDate || !entry.stage) return false;
      if (entry.duration == null || entry.duration <= 0) return false;
      if (EXCLUDED_STAGES.has(entry.stage.name)) return false;
      const pType = classifyProjectType(entry.project.type?.name);
      return pType === typeFilter;
    });

    // Group by month → stage
    const monthStageMap: Record<string, Record<string, { totalDuration: number; count: number }>> = {};

    filtered.forEach((entry) => {
      if (!entry.creationDate || !entry.stage) return;
      const date = parseISO(entry.creationDate);
      const monthKey = format(startOfMonth(date), "yyyy-MM");
      const stageName = entry.stage.name;
      const duration = entry.duration ?? 0;

      if (!monthStageMap[monthKey]) monthStageMap[monthKey] = {};
      if (!monthStageMap[monthKey][stageName]) {
        monthStageMap[monthKey][stageName] = { totalDuration: 0, count: 0 };
      }
      monthStageMap[monthKey][stageName].totalDuration += duration;
      monthStageMap[monthKey][stageName].count++;
    });

    const rows: MonthRow[] = Object.entries(monthStageMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, stages]) => {
        const segments: StageSegment[] = Object.entries(stages)
          .map(([stageName, data]) => {
            const avg = data.count > 0 ? data.totalDuration / data.count : 0;
            return {
              stageName,
              avgDuration: Math.round(avg * 10) / 10,
              position: getStagePosition(stageName, typeFilter),
              count: data.count,
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

  // Collect all unique stages for the legend
  const allStages = new Map<string, number>();
  monthRows.forEach((row) =>
    row.segments.forEach((seg) => {
      if (!allStages.has(seg.stageName)) allStages.set(seg.stageName, seg.position);
    })
  );
  const legendStages = [...allStages.entries()].sort((a, b) => a[1] - b[1]);

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
              <div className="space-y-1.5">
                <div className="flex items-center pl-16 mb-1">
                  <span className="text-[10px] text-muted-foreground">Days →</span>
                </div>

                {monthRows.map((row) => (
                  <div key={row.monthKey} className="flex items-center gap-2">
                    <div className="w-14 shrink-0 text-right">
                      <span className="text-[11px] text-muted-foreground font-medium">{row.monthLabel}</span>
                    </div>

                    <div className="flex-1 flex items-center gap-0 h-6 relative">
                      {row.segments.map((seg, i) => {
                        const widthPct = (seg.avgDuration / maxDays) * 100;
                        if (widthPct < 0.3) return null;
                        const showLabel = widthPct > 8;

                        return (
                          <Tooltip key={`${row.monthKey}-${seg.stageName}-${i}`}>
                            <TooltipTrigger asChild>
                              <div
                                className={`h-full flex items-center justify-center cursor-default transition-colors ${getStageColor(seg.stageName)} hover:brightness-125 ${
                                  i === 0 ? "rounded-l-md" : ""
                                } ${i === row.segments.length - 1 ? "rounded-r-md" : ""} border-r border-background/40`}
                                style={{ width: `${widthPct}%`, minWidth: "2px" }}
                              >
                                {showLabel && (
                                  <span className="text-[8px] font-medium truncate px-0.5 text-white/90">
                                    {seg.stageName}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs space-y-1 max-w-xs">
                              <p className="font-semibold">{seg.stageName}</p>
                              <p>Avg: <span className="font-mono">{seg.avgDuration}</span> days</p>
                              <p className="text-muted-foreground">{seg.count} projects</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}

                      <span className="ml-2 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                        {row.totalDays}d
                      </span>
                    </div>
                  </div>
                ))}

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-3 pt-3 pl-16">
                  {legendStages.map(([name]) => (
                    <div key={name} className="flex items-center gap-1">
                      <div className={`w-2.5 h-2.5 rounded-sm ${getStageColor(name)}`} />
                      <span className="text-[9px] text-muted-foreground">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
