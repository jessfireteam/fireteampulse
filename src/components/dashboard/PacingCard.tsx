import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { PacingMetric } from "@/hooks/usePacingData";

interface PacingCardProps {
  title: string;
  metric: PacingMetric;
}

export function PacingCard({ title, metric }: PacingCardProps) {
  const isAhead = metric.pacingDiff >= 0;
  const progressValue = Math.min(metric.percentOfPrevious, 100);

  return (
    <Card className="card-glow overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground mb-3">{title}</p>

        {/* Large current count */}
        <p className="stat-value mb-1">{metric.currentCount}</p>
        <p className="text-sm text-muted-foreground mb-4">
          vs {metric.previousCount} in {metric.previousMonthLabel}
        </p>

        {/* Progress bar */}
        <div className="relative mb-4">
          <Progress
            value={progressValue}
            className="h-2 bg-muted"
          />
          {/* Previous month marker line */}
          <div
            className="absolute top-0 h-2 w-0.5 bg-foreground/40 rounded-full"
            style={{ left: `${Math.min(100, (metric.previousCount / Math.max(metric.projectedTotal, metric.previousCount, 1)) * 100)}%` }}
          />
        </div>

        {/* Pacing indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isAhead ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
            <span className={`text-sm font-medium ${isAhead ? "text-success" : "text-destructive"}`}>
              Pacing {isAhead ? "ahead" : "behind"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            On pace for ~{metric.projectedTotal}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
