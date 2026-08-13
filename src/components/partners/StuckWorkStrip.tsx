// src/components/partners/StuckWorkStrip.tsx
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import type { StuckStage } from "@/lib/forecast/stuck";
import { cn } from "@/lib/utils";

interface Props {
  stages: StuckStage[];
}

/**
 * Where the work is stuck: overdue open tasks bucketed by pipeline stage, in walking order.
 * This is the panel that answers "why are the designers at half capacity" at a glance — if
 * Produce is quiet while Assign and Brief QC are jammed, the throttle is upstream of the
 * producers, and idle producers plus a screaming runway are the same fact.
 */
export function StuckWorkStrip({ stages }: Props) {
  const worst = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-3">
      <SectionHeader title="Where the work is stuck" />
      <p className="text-xs text-muted-foreground max-w-3xl">
        Open tasks past their due date, by pipeline stage, left to right in the order work
        flows. Unassigned means the task is late and nobody owns it yet. Median days late
        separates fresh slippage from long-dead chains that need cancelling. Looks back 3
        months, so anything older than that has fallen off this view entirely.
      </p>
      <div className="grid gap-2 w-full" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => (
          <div
            key={s.key}
            className={cn(
              "rounded-lg border p-2 min-w-0",
              s.count === worst && s.count > 0 && "border-red-500/50 bg-red-500/5",
            )}
          >
            <div className="text-[10px] text-muted-foreground truncate" title={s.label}>
              {i + 1}. {s.label}
            </div>
            {s.note && <div className="text-[9px] text-muted-foreground/60">{s.note}</div>}
            <div className={cn("text-xl font-mono", s.count === 0 ? "text-muted-foreground/40" : s.count === worst ? "text-red-500" : "text-foreground")}>
              {s.count}
            </div>
            <div className="text-[10px] leading-4 min-h-8">
              {s.unassigned > 0 && (
                <div className="text-red-500">{s.unassigned} unassigned</div>
              )}
              {s.count > 0 && (
                <div className="text-muted-foreground/60">~{s.medianDaysLate}d late</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
