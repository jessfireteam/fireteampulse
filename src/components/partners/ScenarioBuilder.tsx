// src/components/partners/ScenarioBuilder.tsx
import { Fragment } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import type { ScenarioClient, ClientHistory, ClientPlan } from "@/lib/forecast/types";
import { isClientActive } from "@/lib/forecast/active";
import { momColor } from "@/components/partners/momColor";
import { cn } from "@/lib/utils";

interface Props {
  clients: ScenarioClient[];
  historyLabels: string[]; // 3 past month labels, oldest->newest, e.g. ["Mar","Apr","May"]
  monthLabels: string[]; // 12 future labels, e.g. ["Jun","Jul",...]
  histories: ClientHistory[]; // for the read-only past cells, matched by client name
  plans: ClientPlan[]; // current Fibery plan per client, matched by name
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
  plans,
  onUpdate,
  onAdd,
  onRemove,
}: Props) {
  const planFor = (name: string) =>
    plans.find((p) => p.client.trim().toLowerCase() === name.trim().toLowerCase());

  // Any hand-typed volume marks the client manual, which is what stops the next load from
  // re-deriving it from Fibery. Without this flag the edit would silently disappear.
  const onCell = (
    c: ScenarioClient,
    kind: "videosByMonth" | "staticsByMonth",
    i: number,
    raw: string,
  ) => {
    const next = [...c[kind]];
    next[i] = parseInt(raw) || 0;
    onUpdate(c.id, { [kind]: next, manualVolumes: true });
  };

  // Copy the first month's value across all months. Explicit (button-only) so
  // editing the first cell later never re-propagates.
  const fillAcross = (c: ScenarioClient, kind: "videosByMonth" | "staticsByMonth") => {
    const v = c[kind][0] ?? 0;
    onUpdate(c.id, { [kind]: c[kind].map(() => v), manualVolumes: true });
  };

  // Drop the override and snap back to the Fibery plan.
  const revertToPlan = (c: ScenarioClient, plan: ClientPlan) => {
    const n = monthLabels.length;
    onUpdate(c.id, {
      manualVolumes: undefined,
      videosByMonth: new Array(n).fill(plan.videos),
      staticsByMonth: new Array(n).fill(plan.statics),
    });
  };

  // Display order only: signed clients first, prospective new business below.
  // Stable sort preserves original order within each group; math is unaffected.
  const ordered = [...clients].sort((a, b) => Number(!!a.newBusiness) - Number(!!b.newBusiness));

  return (
    <div className="space-y-3">
      <SectionHeader title="Scenario — videos & statics per month" />
      <p className="text-xs text-muted-foreground">
        Volumes follow each client's Max Deliverables Per Month in Fibery (the ceiling ops
        schedules against), split by that client's recent video/static mix. Change the plan in
        Fibery and this follows. Type in a cell to override a client, and it stays overridden
        until you hit revert.
      </p>
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
            {ordered.map((c, ci) => {
              const hist = histories.find((h) => h.client === c.name);
              const plan = planFor(c.name);
              const band = ci % 2 === 1 ? "bg-muted/40" : undefined;
              return (
                <Fragment key={c.id}>
                  <tr className={cn("border-t-2 border-border", band, !c.enabled && "opacity-50")}>
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
                        {c.newBusiness && (
                          <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 whitespace-nowrap">new biz</span>
                        )}
                        <Button
                          aria-label="Remove client"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(c.id)}
                        >
                          ✕
                        </Button>
                      </div>
                      {plan && (
                        <div className="mt-1 flex items-center gap-1.5 pl-6 text-[10px] whitespace-nowrap">
                          {plan.source === "max" ? (
                            <span className="text-muted-foreground">
                              plan {plan.max}/mo
                              <span
                                className="text-muted-foreground/60"
                                title={
                                  plan.mixSource === "agency"
                                    ? "Too few recent projects to read this client's own mix, so the agency-wide video/static split is used"
                                    : `Split by this client's recent mix (${Math.round(plan.videoShare * 100)}% video)`
                                }
                              >
                                {" "}
                                ({plan.videos}v / {plan.statics}s
                                {plan.mixSource === "agency" ? ", agency mix" : ""})
                              </span>
                            </span>
                          ) : (
                            <span
                              className="uppercase tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-500"
                              title="No Max Deliverables Per Month set in Fibery — falling back to trailing run-rate"
                            >
                              no max set
                            </span>
                          )}
                          {c.manualVolumes && (
                            <>
                              <span
                                className="uppercase tracking-wide px-1 py-0.5 rounded bg-sky-500/15 text-sky-500"
                                title="Hand-edited, so it no longer follows the Fibery plan"
                              >
                                edited
                              </span>
                              <button
                                type="button"
                                onClick={() => revertToPlan(c, plan)}
                                className="text-muted-foreground/60 underline hover:text-foreground"
                              >
                                revert
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">
                      Videos
                      <button
                        type="button"
                        onClick={() => fillAcross(c, "videosByMonth")}
                        title={`Fill every month with ${monthLabels[0]}'s value`}
                        className="ml-1.5 text-muted-foreground/50 hover:text-foreground"
                      >
                        fill →
                      </button>
                    </td>
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
                          className={cn("w-16 font-mono text-right", momColor(c.videosByMonth, i), !isClientActive(c, i) && "opacity-40")}
                          value={c.videosByMonth[i]}
                          onChange={(e) => onCell(c, "videosByMonth", i, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className={cn(band, !c.enabled && "opacity-50")}>
                    <td className="px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">
                      Statics
                      <button
                        type="button"
                        onClick={() => fillAcross(c, "staticsByMonth")}
                        title={`Fill every month with ${monthLabels[0]}'s value`}
                        className="ml-1.5 text-muted-foreground/50 hover:text-foreground"
                      >
                        fill →
                      </button>
                    </td>
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
                          className={cn("w-16 font-mono text-right", momColor(c.staticsByMonth, i), !isClientActive(c, i) && "opacity-40")}
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
