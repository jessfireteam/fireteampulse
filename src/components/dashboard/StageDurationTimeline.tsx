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
import { subDays, parseISO, isAfter } from "date-fns";

type ProjectTypeFilter = "Static" | "Video - LoFi";

const STATIC_STAGES = [
  "Needs Concept",
  "Concept Pending Approval",
  "Needs Brief Written",
  "Need to send brief to client",
  "Brief Pending Client Approval",
  "Ad Needs Naming",
  "Assign Designer",
  "With Designer",
  "Creative Review",
  "Approved Internally",
  "Ready For Upload",
  "Need to send ad to client",
  "Ad Pending Client Approval",
  "Needs To Go To Market",
  "Final Deliverables",
];

const VIDEO_STAGES = [
  "Needs Concept",
  "Concept Pending Approval",
  "Needs Brief Written",
  "Need to send to client",
  "Brief Pending Client Approval",
  "Ad Needs Naming",
  "Cast Creator",
  "Awaiting deliverables",
  "Assign Editor",
  "With Editor",
  "Creative Review",
  "Approved Internally",
  "Ready For Upload",
  "Send ad to client for review",
  "Ad Pending Client Approval",
  "Needs To Go To Market",
  "Final Deliverables",
];

const EXCLUDED_STAGES = new Set(["Approved"]);

// Abbreviate long stage names for x-axis
const STAGE_ABBREV: Record<string, string> = {
  "Concept Pending Approval": "Concept Approval",
  "Needs Brief Written": "Write Brief",
  "Need to send brief to client": "Send Brief",
  "Need to send to client": "Send to Client",
  "Brief Pending Client Approval": "Brief Approval",
  "Ad Needs Naming": "Naming",
  "Assign Designer": "Assign Designer",
  "Assign Editor": "Assign Editor",
  "Awaiting deliverables": "Await Deliverables",
  "Cast Creator": "Cast Creator",
  "With Designer": "With Designer",
  "With Editor": "With Editor",
  "Creative Review": "Creative Review",
  "Approved Internally": "Internal Approval",
  "Ready For Upload": "Ready Upload",
  "Need to send ad to client": "Send Ad",
  "Send ad to client for review": "Send Ad",
  "Ad Pending Client Approval": "Ad Approval",
  "Needs To Go To Market": "Go To Market",
  "Final Deliverables": "Final",
  "Needs Concept": "Concept",
};

function classifyProjectType(typeName: string | null | undefined): ProjectTypeFilter | null {
  if (!typeName) return null;
  const t = typeName.toUpperCase();
  if (t.includes("VIDEO") || t.includes("LOFI") || t.includes("LO-FI") || t.includes("UGC") || t.includes("EDIT")) return "Video - LoFi";
  if (t.includes("STATIC") || t.includes("CAROUSEL") || t.includes("GRAPHIC") || t.includes("DESIGN")) return "Static";
  return null;
}

interface StageBar {
  stageName: string;
  abbrev: string;
  avgDays: number;
  prevAvgDays: number | null;
  count: number;
}

export function StageDurationTimeline() {
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>("Static");

  const { data, isLoading, error } = useQuery({
    queryKey: ["fibery-stage-tracking"],
    queryFn: () => queryFibery<StageTrackingResponse>("stage-tracking"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { bars, totalCurrent, totalPrev } = useMemo(() => {
    if (!data?.findStageTrackings) return { bars: [], totalCurrent: 0, totalPrev: null };

    const now = new Date();
    const cutoff30 = subDays(now, 30);
    const cutoff60 = subDays(now, 60);
    const stages = typeFilter === "Static" ? STATIC_STAGES : VIDEO_STAGES;

    // Bucket entries into current (last 30d) and previous (30-60d)
    const currentMap: Record<string, { total: number; count: number }> = {};
    const prevMap: Record<string, { total: number; count: number }> = {};

    data.findStageTrackings.forEach((entry) => {
      if (!entry.project || !entry.creationDate || !entry.stage) return;
      if (entry.duration == null || entry.duration <= 0) return;
      if (EXCLUDED_STAGES.has(entry.stage.name)) return;
      if (classifyProjectType(entry.project.type?.name) !== typeFilter) return;

      const date = parseISO(entry.creationDate);
      const stageName = entry.stage.name;

      if (isAfter(date, cutoff30)) {
        if (!currentMap[stageName]) currentMap[stageName] = { total: 0, count: 0 };
        currentMap[stageName].total += entry.duration;
        currentMap[stageName].count++;
      } else if (isAfter(date, cutoff60)) {
        if (!prevMap[stageName]) prevMap[stageName] = { total: 0, count: 0 };
        prevMap[stageName].total += entry.duration;
        prevMap[stageName].count++;
      }
    });

    const result: StageBar[] = stages
      .filter((s) => !EXCLUDED_STAGES.has(s))
      .map((stageName) => {
        const cur = currentMap[stageName];
        const prev = prevMap[stageName];
        const avgDays = cur && cur.count > 0 ? Math.round((cur.total / cur.count) * 10) / 10 : 0;
        const prevAvgDays = prev && prev.count > 0 ? Math.round((prev.total / prev.count) * 10) / 10 : null;
        return {
          stageName,
          abbrev: STAGE_ABBREV[stageName] ?? stageName,
          avgDays,
          prevAvgDays,
          count: cur?.count ?? 0,
        };
      });

    const totalC = result.reduce((s, b) => s + b.avgDays, 0);
    const totalP = result.every((b) => b.prevAvgDays != null)
      ? result.reduce((s, b) => s + (b.prevAvgDays ?? 0), 0)
      : null;

    return { bars: result, totalCurrent: Math.round(totalC * 10) / 10, totalPrev: totalP != null ? Math.round(totalP * 10) / 10 : null };
  }, [data, typeFilter]);

  const maxDays = useMemo(() => {
    if (bars.length === 0) return 10;
    return Math.max(...bars.map((b) => b.avgDays), 1);
  }, [bars]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Stage Duration" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Stage Duration" />
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load stage tracking data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalDelta = totalPrev != null ? Math.round((totalCurrent - totalPrev) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Stage Duration" />
        <div className="flex items-center gap-4">
          {/* Total cycle time */}
          <div className="text-sm font-mono text-muted-foreground">
            Total: <span className="text-foreground font-semibold">{Math.round(totalCurrent)}d</span>
            {totalDelta != null && totalDelta !== 0 && (
              <span className={`ml-1.5 text-xs font-semibold ${totalDelta < 0 ? "text-emerald-500" : "text-red-400"}`}>
                {totalDelta < 0 ? "↓" : "↑"}{Math.abs(totalDelta)}d
              </span>
            )}
          </div>
          <ToggleGroup
            type="single"
            value={typeFilter}
            onValueChange={(val) => { if (val) setTypeFilter(val as ProjectTypeFilter); }}
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
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          {bars.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No stage tracking data found for {typeFilter} projects
            </p>
          ) : (
            <TooltipProvider delayDuration={100}>
              <div className="flex items-end gap-1 h-64" style={{ minWidth: bars.length * 48 }}>
                {bars.map((bar) => {
                  const heightPct = maxDays > 0 ? (bar.avgDays / maxDays) * 100 : 0;
                  const delta = bar.prevAvgDays != null ? Math.round((bar.avgDays - bar.prevAvgDays) * 10) / 10 : null;

                  return (
                    <Tooltip key={bar.stageName}>
                      <TooltipTrigger asChild>
                        <div className="flex-1 flex flex-col items-center gap-1 min-w-0 cursor-default">
                          {/* Change indicator */}
                          <div className="h-5 flex items-center justify-center">
                            {delta != null && delta !== 0 && (
                              <span className={`text-[9px] font-bold whitespace-nowrap ${delta < 0 ? "text-emerald-500" : "text-red-400"}`}>
                                {delta < 0 ? "↓" : "↑"}{Math.abs(delta)}d
                              </span>
                            )}
                          </div>
                          {/* Value label */}
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {bar.avgDays > 0 ? bar.avgDays : ""}
                          </span>
                          {/* Bar */}
                          <div
                            className={`w-full rounded-t transition-all ${
                              delta != null && delta > 0 ? "bg-red-400/70" : "bg-primary/60"
                            }`}
                            style={{ height: `${Math.max(heightPct, 1)}%`, minHeight: bar.avgDays > 0 ? "4px" : "0px" }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs space-y-1 max-w-xs">
                        <p className="font-semibold">{bar.stageName}</p>
                        <p>Avg: <span className="font-mono">{bar.avgDays}</span> days (last 30d)</p>
                        {bar.prevAvgDays != null && (
                          <p>Previous: <span className="font-mono">{bar.prevAvgDays}</span> days</p>
                        )}
                        <p className="text-muted-foreground">{bar.count} projects</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              {/* X-axis labels */}
              <div className="flex gap-1 mt-2" style={{ minWidth: bars.length * 48 }}>
                {bars.map((bar) => (
                  <div key={bar.stageName} className="flex-1 min-w-0">
                    <p className="text-[8px] text-muted-foreground text-center leading-tight truncate -rotate-45 origin-top-left translate-x-3 w-16">
                      {bar.abbrev}
                    </p>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
