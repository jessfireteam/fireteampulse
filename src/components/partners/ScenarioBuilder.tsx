// src/components/partners/ScenarioBuilder.tsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import type { ScenarioClient } from "@/lib/forecast/types";
import { cn } from "@/lib/utils";

interface Props {
  clients: ScenarioClient[];
  monthLabels: string[]; // 12 short labels, e.g. ["Jun","Jul",...]
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

export function ScenarioBuilder({ clients, monthLabels, onUpdate, onAdd, onRemove }: Props) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Scenario" />
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs text-muted-foreground font-medium px-2 py-1 whitespace-nowrap">
                Client
              </th>
              {monthLabels.map((label, i) => (
                <th
                  key={i}
                  className="text-xs text-muted-foreground font-mono font-normal px-1 py-1 text-center whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
              <th className="px-1 py-1" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-border/50">
                <td className="px-2 py-1 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={c.enabled}
                      onCheckedChange={(v) => onUpdate(c.id, { enabled: !!v })}
                    />
                    <Input
                      className="w-40"
                      value={c.name}
                      onChange={(e) => onUpdate(c.id, { name: e.target.value })}
                    />
                    {!c.hypothetical && <TrendBadge pct={c.trendPct ?? null} />}
                  </div>
                </td>
                {c.assetsByMonth.map((value, i) => (
                  <td key={i} className="px-0.5 py-1">
                    <Input
                      type="number"
                      min="0"
                      className="w-14 font-mono text-right"
                      value={value}
                      onChange={(e) => {
                        const next = [...c.assetsByMonth];
                        next[i] = parseInt(e.target.value) || 0;
                        onUpdate(c.id, { assetsByMonth: next });
                      }}
                    />
                  </td>
                ))}
                <td className="px-1 py-1">
                  <Button
                    aria-label="Remove client"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(c.id)}
                  >
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        + Add hypothetical client
      </Button>
    </div>
  );
}
