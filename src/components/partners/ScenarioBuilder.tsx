// src/components/partners/ScenarioBuilder.tsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import type { ClientBaseline, ScenarioClient } from "@/lib/forecast/types";
import { cn } from "@/lib/utils";

interface Props {
  clients: ScenarioClient[];
  baselines: ClientBaseline[];
  horizonMonths: number;
  onUpdate: (id: string, patch: Partial<ScenarioClient>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = pct >= 0;
  return (
    <span className={cn("text-xs font-mono", up ? "text-emerald-500" : "text-destructive")}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

export function ScenarioBuilder({ clients, baselines, horizonMonths, onUpdate, onAdd, onRemove }: Props) {
  const trendFor = (name: string) => baselines.find((b) => b.client === name)?.trendPct ?? null;

  return (
    <div className="space-y-3">
      <SectionHeader title="Scenario" />
      <div className="space-y-2">
        {clients.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md border border-border/50 p-2">
            <Checkbox checked={c.enabled} onCheckedChange={(v) => onUpdate(c.id, { enabled: !!v })} />
            <Input
              className="flex-1"
              value={c.name}
              onChange={(e) => onUpdate(c.id, { name: e.target.value })}
            />
            {!c.hypothetical && <TrendBadge pct={trendFor(c.name)} />}
            <label className="text-xs text-muted-foreground">assets/mo</label>
            <Input
              type="number"
              min="0"
              className="w-20 font-mono text-right"
              value={c.assetsPerMonth}
              onChange={(e) => onUpdate(c.id, { assetsPerMonth: parseInt(e.target.value) || 0 })}
            />
            <label className="text-xs text-muted-foreground">start</label>
            <select
              className="bg-background border border-border/50 rounded px-1 py-1 text-sm"
              value={c.startMonthIndex}
              onChange={(e) => onUpdate(c.id, { startMonthIndex: parseInt(e.target.value) })}
            >
              {Array.from({ length: horizonMonths }, (_, i) => (
                <option key={i} value={i}>
                  +{i}mo
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => onRemove(c.id)}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        + Add hypothetical client
      </Button>
    </div>
  );
}
