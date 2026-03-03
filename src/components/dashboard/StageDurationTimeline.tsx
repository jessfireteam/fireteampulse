import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryFibery, StageTrackingResponse } from "@/lib/fibery";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
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

function classifyProjectType(typeName: string | null | undefined): ProjectTypeFilter | null {
  if (!typeName) return null;
  const t = typeName.toUpperCase();
  if (t.includes("VIDEO") || t.includes("LOFI") || t.includes("LO-FI") || t.includes("UGC") || t.includes("EDIT")) return "Video - LoFi";
  if (t.includes("STATIC") || t.includes("CAROUSEL") || t.includes("GRAPHIC") || t.includes("DESIGN")) return "Static";
  return null;
}

interface StageBar {
  stageName: string;
  avgDays: number;
  prevAvgDays: number | null;
  avg6mo: number | null;
  count: number;
}

export function StageDurationTimeline() {
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>("Static");

  const { data, isLoading, error } = useQuery({
    queryKey: ["fibery-stage-tracking"],
    queryFn: async () => {
      const result = await queryFibery<StageTrackingResponse>("stage-tracking");
      console.log("[StageDuration] Raw data count:", result?.findStageTrackings?.length);
      if (result?.findStageTrackings?.length > 0) {
        console.log("[StageDuration] Sample entries:", result.findStageTrackings.slice(0, 5));
      }
      return result;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { bars, totalCurrent, totalPrev } = useMemo(() => {
    if (!data?.findStageTrackings) return { bars: [], totalCurrent: 0, totalPrev: null };

    const now = new Date();
    const cutoff30 = subDays(now, 30);
    const cutoff60 = subDays(now, 60);
    const stages = typeFilter === "Static" ? STATIC_STAGES : VIDEO_STAGES;

    // Debug: log how many entries match the type filter
    const typeMatches = data.findStageTrackings.filter((e) => {
      const pType = classifyProjectType(e.project?.type?.name);
      return pType === typeFilter;
    });
    console.log(`[StageDuration] ${typeFilter} matches: ${typeMatches.length}, total entries: ${data.findStageTrackings.length}`);

    // Also log date range of data
    const dates = data.findStageTrackings
      .filter((e) => e.creationDate)
      .map((e) => new Date(e.creationDate!).getTime());
    if (dates.length > 0) {
      console.log(`[StageDuration] Date range: ${new Date(Math.min(...dates)).toISOString()} to ${new Date(Math.max(...dates)).toISOString()}`);
      console.log(`[StageDuration] Cutoff30: ${cutoff30.toISOString()}, Cutoff60: ${cutoff60.toISOString()}`);
    }

    // Bucket entries into current (last 30d), previous (30-60d), and 6-month window
    const cutoff6mo = subDays(now, 180);
    const currentMap: Record<string, { total: number; count: number }> = {};
    const prevMap: Record<string, { total: number; count: number }> = {};
    const sixMoMap: Record<string, { total: number; count: number }> = {};

    let currentCount = 0;
    let prevCount = 0;

    data.findStageTrackings.forEach((entry) => {
      if (!entry.project || !entry.creationDate || !entry.stage) return;
      if (entry.duration == null || entry.duration <= 0) return;
      if (EXCLUDED_STAGES.has(entry.stage.name)) return;
      if (classifyProjectType(entry.project.type?.name) !== typeFilter) return;

      const date = parseISO(entry.creationDate);
      const stageName = entry.stage.name;

      // 6-month bucket (includes everything in window)
      if (isAfter(date, cutoff6mo)) {
        if (!sixMoMap[stageName]) sixMoMap[stageName] = { total: 0, count: 0 };
        sixMoMap[stageName].total += entry.duration;
        sixMoMap[stageName].count++;
      }

      if (isAfter(date, cutoff30)) {
        if (!currentMap[stageName]) currentMap[stageName] = { total: 0, count: 0 };
        currentMap[stageName].total += entry.duration;
        currentMap[stageName].count++;
        currentCount++;
      } else if (isAfter(date, cutoff60)) {
        if (!prevMap[stageName]) prevMap[stageName] = { total: 0, count: 0 };
        prevMap[stageName].total += entry.duration;
        prevMap[stageName].count++;
        prevCount++;
      }
    });

    console.log(`[StageDuration] Current period entries: ${currentCount}, Previous period: ${prevCount}`);
    console.log(`[StageDuration] Current stages:`, Object.keys(currentMap));

    const result: StageBar[] = stages
      .filter((s) => !EXCLUDED_STAGES.has(s))
      .map((stageName) => {
        const cur = currentMap[stageName];
        const prev = prevMap[stageName];
        const sixMo = sixMoMap[stageName];
        const avgDays = cur && cur.count > 0 ? Math.round((cur.total / cur.count) * 10) / 10 : 0;
        const prevAvgDays = prev && prev.count > 0 ? Math.round((prev.total / prev.count) * 10) / 10 : null;
        const avg6mo = sixMo && sixMo.count > 0 ? Math.round((sixMo.total / sixMo.count) * 10) / 10 : null;
        return { stageName, avgDays, prevAvgDays, avg6mo, count: cur?.count ?? 0 };
      });

    const totalC = result.reduce((s, b) => s + b.avgDays, 0);
    const totalP = result.every((b) => b.prevAvgDays != null)
      ? result.reduce((s, b) => s + (b.prevAvgDays ?? 0), 0)
      : null;

    return {
      bars: result,
      totalCurrent: Math.round(totalC * 10) / 10,
      totalPrev: totalP != null ? Math.round(totalP * 10) / 10 : null,
    };
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
          <div className="text-base font-mono text-muted-foreground">
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
            <div className="space-y-1.5">
              {bars.map((bar) => {
                const widthPct = maxDays > 0 ? (bar.avgDays / maxDays) * 100 : 0;
                const delta = bar.prevAvgDays != null ? Math.round((bar.avgDays - bar.prevAvgDays) * 10) / 10 : null;

                return (
                  <HoverCard key={bar.stageName} openDelay={150} closeDelay={50}>
                    <HoverCardTrigger asChild>
                      <div className="flex items-center gap-3 cursor-default group">
                        <div className="w-44 shrink-0 text-right">
                          <span className="text-xs text-muted-foreground font-medium">{bar.stageName}</span>
                        </div>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-5 relative">
                            {bar.avgDays > 0 && (
                              <div
                                className={`h-full rounded transition-all ${
                                  delta != null && delta > 0 ? "bg-red-400/70" : "bg-primary/60"
                                } group-hover:brightness-125`}
                                style={{ width: `${Math.max(widthPct, 1)}%`, minWidth: "4px" }}
                              />
                            )}
                          </div>
                          <div className="w-20 shrink-0 flex items-center gap-1.5">
                            <span className="text-xs font-mono text-muted-foreground">
                              {bar.avgDays > 0 ? `${bar.avgDays}d` : "—"}
                            </span>
                            {delta != null && delta !== 0 && (
                              <span className={`text-[11px] font-bold ${delta < 0 ? "text-emerald-500" : "text-red-400"}`}>
                                {delta < 0 ? "↓" : "↑"}{Math.abs(delta)}d
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent side="top" align="center" sideOffset={4} className="w-auto p-3 text-xs space-y-1">
                      <p className="font-semibold">{bar.stageName}</p>
                      <p>Avg: <span className="font-mono">{bar.avgDays}</span> days (last 30d)</p>
                      {bar.prevAvgDays != null && (
                        <p>Previous 30d: <span className="font-mono">{bar.prevAvgDays}</span> days</p>
                      )}
                      {bar.avg6mo != null && (
                        <p>6-month avg: <span className="font-mono">{bar.avg6mo}</span> days</p>
                      )}
                      <p className="text-muted-foreground">{bar.count} projects</p>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
