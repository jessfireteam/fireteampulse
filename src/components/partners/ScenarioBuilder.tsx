// src/components/partners/ScenarioBuilder.tsx
import { Fragment } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import type { ScenarioClient, ClientHistory } from "@/lib/forecast/types";
import { isClientActive } from "@/lib/forecast/active";
import { cn } from "@/lib/utils";

interface Props {
  clients: ScenarioClient[];
  historyLabels: string[]; // 3 past month labels, oldest->newest, e.g. ["Mar","Apr","May"]
  monthLabels: string[]; // 12 future labels, e.g. ["Jun","Jul",...]
  histories: ClientHistory[]; // for the read-only past cells, matched by client name
  onUpdate: (id: string, patch: Partial<ScenarioClient>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

const checkboxClass =
  "data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white";

export function ScenarioBuilder({
  clients,
  historyLabels,
  monthLabels,
  histories,
  onUpdate,
  onAdd,
  onRemove,
}: Props) {
  const onCell = (
    c: ScenarioClient,
    kind: "videosByMonth" | "staticsByMonth",
    i: number,
    raw: string,
  ) => {
    const next = [...c[kind]];
    next[i] = parseInt(raw) || 0;
    onUpdate(c.id, { [kind]: next });
  };

  return (
    <div className="space-y-3">
      <SectionHeader title="Scenario — videos & statics per month" />
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs text-muted-foreground font-medium px-2 py-1 whitespace-nowrap">
                Client
              </th>
              <th className="text-xs text-muted-foreground font-medium px-2 py-1 whitespace-nowrap" aria-hidden />
              {historyLabels.map((label, i) => (
                <th
                  key={`h-${i}`}
                  className="text-xs italic text-muted-foreground font-normal px-1 py-1 text-center whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
              {monthLabels.map((label, i) => (
                <th
                  key={`f-${i}`}
                  className={cn(
                    "text-xs text-muted-foreground font-mono font-normal px-1 py-1 text-center whitespace-nowrap",
                    i === 0 && "border-l border-border",
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const hist = histories.find((h) => h.client === c.name);
              return (
                <Fragment key={c.id}>
                  <tr className={cn("border-t border-border/50", !c.enabled && "opacity-50")}>
                    <td rowSpan={2} className="px-2 py-1 align-top whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          className={checkboxClass}
                          checked={c.enabled}
                          onCheckedChange={(v) => onUpdate(c.id, { enabled: !!v })}
                        />
                        <Input
                          className="w-40 flex-1"
                          value={c.name}
                          onChange={(e) => onUpdate(c.id, { name: e.target.value })}
                        />
                        <Button
                          aria-label="Remove client"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(c.id)}
                        >
                          ✕
                        </Button>
                      </div>
                    </td>
                    <td className="px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">Videos</td>
                    {historyLabels.map((_, i) => (
                      <td key={`hv-${i}`} className="text-center text-xs text-muted-foreground">
                        {hist?.videosByMonth[i] ?? 0}
                      </td>
                    ))}
                    {monthLabels.map((_, i) => (
                      <td key={`fv-${i}`} className={cn("px-0.5 py-1", i === 0 && "border-l border-border")}>
                        <Input
                          type="number"
                          min="0"
                          className={cn("w-14 font-mono text-right", !isClientActive(c, i) && "opacity-40")}
                          value={c.videosByMonth[i]}
                          onChange={(e) => onCell(c, "videosByMonth", i, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className={cn(!c.enabled && "opacity-50")}>
                    <td className="px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">Statics</td>
                    {historyLabels.map((_, i) => (
                      <td key={`hs-${i}`} className="text-center text-xs text-muted-foreground">
                        {hist?.staticsByMonth[i] ?? 0}
                      </td>
                    ))}
                    {monthLabels.map((_, i) => (
                      <td key={`fs-${i}`} className={cn("px-0.5 py-1", i === 0 && "border-l border-border")}>
                        <Input
                          type="number"
                          min="0"
                          className={cn("w-14 font-mono text-right", !isClientActive(c, i) && "opacity-40")}
                          value={c.staticsByMonth[i]}
                          onChange={(e) => onCell(c, "staticsByMonth", i, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        + Add hypothetical client
      </Button>
    </div>
  );
}
