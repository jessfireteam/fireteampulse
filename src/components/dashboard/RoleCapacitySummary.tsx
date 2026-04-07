import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import { useTasksData, processTasksForCapacity, isExcludedMember } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface RoleBar {
  role: string;
  current: number;
  peak: number;
}

function computeRoleBars(tasks: any[]): RoleBar[] {
  const roleGroups = processTasksForCapacity(tasks, "all");

  const ROLE_MAP: Record<string, string> = {
    Account: "Account",
    "Creative Review": "Creative Review",
    Copywriters: "Copywriting",
    Design: "Design",
    Video: "Video Editing",
  };

  return roleGroups
    .filter((g) => ROLE_MAP[g.role])
    .map((g) => {
      let peakSum = 0;
      let currentSum = 0;

      // Current includes ALL people (including departed — their completions still count)
      g.people.forEach((person) => {
        const primaryRow =
          person.taskTypes.find((t) => t.taskType === person.primaryTaskType) ||
          person.subtotal;
        currentSum += primaryRow.avg30Day / 4.3;
      });

      // Peak excludes departed members (they can't produce anymore)
      g.people
        .filter((person) => !isExcludedMember(person.name))
        .forEach((person) => {
          const primaryRow =
            person.taskTypes.find((t) => t.taskType === person.primaryTaskType) ||
            person.subtotal;
          peakSum += primaryRow.maxWeek26;
        });

      return {
        role: ROLE_MAP[g.role]!,
        current: Math.round(currentSum * 10) / 10,
        peak: peakSum,
      };
    })
    .filter((r) => r.peak > 0);
}

function UtilizationBar({ role, current, peak }: RoleBar) {
  const pct = peak > 0 ? (current / peak) * 100 : 0;
  const clampedPct = Math.min(pct, 100);
  const overflow = pct > 100;

  // Zone boundaries as percentages of peak
  const greenStart = 50;
  const greenEnd = 75;
  const redStart = 75;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{role}</span>
        <span className="font-mono text-muted-foreground text-xs">
          {current.toFixed(1)} / {peak}{" "}
          <span className="text-muted-foreground/60">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="relative h-6 rounded-md bg-muted/40 overflow-hidden">
        {/* Green zone band (50-75%) */}
        <div
          className="absolute inset-y-0 bg-emerald-500/15 border-l border-r border-emerald-500/30"
          style={{ left: `${greenStart}%`, width: `${greenEnd - greenStart}%` }}
        />
        {/* Amber transition zone (75-85%) */}
        <div
          className="absolute inset-y-0 bg-amber-500/10 border-l border-amber-500/20"
          style={{ left: `${redStart}%`, width: `10%` }}
        />
        {/* Red zone band (85-100%) */}
        <div
          className="absolute inset-y-0 bg-destructive/10 border-r border-destructive/30"
          style={{ left: `85%`, width: `15%` }}
        />

        {/* Filled bar */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-md transition-all duration-500",
            overflow
              ? "bg-destructive"
              : pct >= 85
                ? "bg-destructive/80"
                : pct >= 75
                  ? "bg-amber-500"
                  : pct >= 50
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/30"
          )}
          style={{ width: `${clampedPct}%` }}
        />

        {/* Overflow indicator */}
        {overflow && (
          <div className="absolute inset-0 flex items-center justify-end pr-2">
            <span className="text-[10px] font-bold text-destructive-foreground">
              ⚠ {Math.round(pct)}%
            </span>
          </div>
        )}

        {/* Zone labels */}
        <div className="absolute inset-y-0 flex items-center pointer-events-none" style={{ left: `${(greenStart + greenEnd) / 2}%`, transform: "translateX(-50%)" }}>
          <span className="text-[9px] text-emerald-600/60 font-medium">healthy</span>
        </div>
        <div className="absolute inset-y-0 flex items-center pointer-events-none" style={{ left: `${(redStart + 100) / 2}%`, transform: "translateX(-50%)" }}>
          <span className="text-[9px] text-destructive/50 font-medium">overload</span>
        </div>
      </div>
    </div>
  );
}

export function RoleCapacitySummary() {
  const { data, isLoading, error } = useTasksData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Role Capacity" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Role Capacity" />
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load capacity data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tasks = data?.findProjectSpecificTasks || [];
  const bars = computeRoleBars(tasks);

  return (
    <div className="space-y-6">
      <SectionHeader title="Role Capacity" />
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6 space-y-5">
          {bars.length === 0 ? (
            <p className="text-center text-muted-foreground">No capacity data</p>
          ) : (
            bars.map((bar) => <UtilizationBar key={bar.role} {...bar} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
