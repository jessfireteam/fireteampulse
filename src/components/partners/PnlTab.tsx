import { useMemo, useState } from "react";
import { runPnL } from "@/lib/forecast/pnl";
import { computeFee } from "@/lib/forecast/fee";
import { BREAKEVEN_FLOOR, type ClientPricing, type CostConfig, type ProductionPerson, type ScenarioClient } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { PricingModal } from "@/components/partners/PricingModal";
import { cn } from "@/lib/utils";

// Stable, collision-free across reloads (roster ids persist in the DB; a reset
// counter could regenerate an id that collides with a saved person's).
const nextPid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? `person-${crypto.randomUUID()}`
    : `person-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

interface Props {
  clients: ScenarioClient[];
  costConfig: CostConfig;
  monthLabels: string[];
  onUpdate: (id: string, patch: Partial<ScenarioClient>) => void;
  onUpdateCost: (patch: Partial<CostConfig>) => void;
  onAddClientWithPricing?: (name: string, pricing: ClientPricing) => void;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtu = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString()}`);

export function PnlTab({ clients, costConfig, monthLabels, onUpdate, onUpdateCost, onAddClientWithPricing }: Props) {
  const [view, setView] = useState<"fee" | "spend" | "pct">("fee");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioClient | null>(null);
  const rows = useMemo(
    () => runPnL({ clients, costConfig, monthLabels }),
    [clients, costConfig, monthLabels],
  );
  const cur = rows[0];

  const setCostCell = (key: keyof CostConfig, i: number, val: number) => {
    const next = [...(costConfig[key] as number[])];
    next[i] = Number.isFinite(val) ? val : 0;
    onUpdateCost({ [key]: next } as Partial<CostConfig>);
  };

  const updatePerson = (id: string, patch: Partial<ProductionPerson>) =>
    onUpdateCost({ team: (costConfig.team ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const addPerson = () =>
    onUpdateCost({ team: [...(costConfig.team ?? []), { id: nextPid(), name: "New hire", side: "video", monthlyCost: 0, startMonthIndex: 0 }] });
  const removePerson = (id: string) =>
    onUpdateCost({ team: (costConfig.team ?? []).filter((p) => p.id !== id) });
  const setClientCell = (c: ScenarioClient, key: "adSpendByMonth" | "agencyPctByMonth", i: number, val: number) => {
    const arr = [...(c[key] ?? new Array(monthLabels.length).fill(0))];
    arr[i] = Number.isFinite(val) ? val : 0;
    onUpdate(c.id, { [key]: arr } as Partial<ScenarioClient>);
  };
  const setOneOff = (c: ScenarioClient, i: number, amount: number, label: string) => {
    const amts = [...(c.oneOffsByMonth ?? new Array(monthLabels.length).fill(0))];
    const labs = [...(c.oneOffLabelsByMonth ?? new Array(monthLabels.length).fill(""))];
    amts[i] = amount; labs[i] = label;
    onUpdate(c.id, { oneOffsByMonth: amts, oneOffLabelsByMonth: labs });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6">
        <Kpi label="Net income (this month)" value={cur ? fmt(cur.netIncome) : "—"} good={!!cur && cur.netIncome >= 0} />
        <Kpi label="Margin" value={cur ? `${Math.round(cur.margin * 100)}%` : "—"} good={!!cur && cur.margin >= 0} />
        <Kpi label="Fee / deliverable" value={cur ? fmtu(cur.feePerDeliverable) : "—"} />
        <Kpi label="Cost / video" value={cur ? fmtu(cur.costPerVideo) : "—"} />
        <Kpi label="Cost / static" value={cur ? fmtu(cur.costPerStatic) : "—"} />
        <Kpi
          label={`All-in cost / deliverable (floor ${fmt(BREAKEVEN_FLOOR)})`}
          value={cur ? fmtu(cur.costPerDeliverable) : "—"}
        />
      </div>

      <div className="flex gap-2">
        {(["fee", "spend", "pct"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={cn("text-xs rounded px-2 py-1", view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {v === "fee" ? "Fee" : v === "spend" ? "Ad Spend" : "Agency %"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <SectionHeader title="Revenue" />
        {onAddClientWithPricing && (
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>+ Add client / pricing</Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: 220 }} />
            {monthLabels.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            <tr><th className="text-left p-1">Client</th>{monthLabels.map((l) => <th key={l} className="p-1 text-right font-mono text-xs text-muted-foreground">{l}</th>)}</tr>
          </thead>
          <tbody>
            {clients.filter((c) => c.enabled).map((c) => (
              <tr key={c.id}>
                <td className="p-1 whitespace-nowrap">
                  <button className="text-left hover:underline" onClick={() => setEditing(c)}>{c.name}</button>
                  <PricingSummary pricing={c.pricing} />
                </td>
                {monthLabels.map((_, i) => {
                  const adSpend = c.adSpendByMonth?.[i] ?? 0;
                  const pct = c.agencyPctByMonth?.[i] ?? 0;
                  if (view === "fee") {
                    return (
                      <td key={i} className="p-1 align-top">
                        <div className="flex flex-col items-end leading-tight gap-0.5">
                          <span className="font-mono">{fmt(c.pricing ? computeFee(c.adSpendByMonth?.[i] ?? 0, c.agencyPctByMonth?.[i] ?? 0, c.pricing) : 0)}</span>
                          <Popover>
                            <PopoverTrigger asChild>
                              {(c.oneOffsByMonth?.[i] ?? 0) > 0
                                ? <button className="text-emerald-500 font-mono text-[11px]" title={c.oneOffLabelsByMonth?.[i] || "One-off fee"}>+{fmt(c.oneOffsByMonth![i])}</button>
                                : <button className="text-muted-foreground/40 hover:text-muted-foreground text-[11px] leading-none" aria-label="Add one-off fee">+ fee</button>}
                            </PopoverTrigger>
                            <PopoverContent className="w-56 space-y-2">
                              <div className="text-xs text-muted-foreground">{c.name} · {monthLabels[i]}</div>
                              <MoneyInput value={c.oneOffsByMonth?.[i] ?? 0} onChange={(n) => setOneOff(c, i, n, c.oneOffLabelsByMonth?.[i] ?? "")} className="w-full" />
                              <Input placeholder="Label (e.g. Onboarding strategy)" value={c.oneOffLabelsByMonth?.[i] ?? ""} onChange={(e) => setOneOff(c, i, c.oneOffsByMonth?.[i] ?? 0, e.target.value)} className="h-7 text-xs" />
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOneOff(c, i, 0, "")}>Remove</Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                    );
                  }
                  if (view === "spend") {
                    return <td key={i} className="p-1"><MoneyInput value={adSpend} onChange={(n) => setClientCell(c, "adSpendByMonth", i, n)} className="w-full" /></td>;
                  }
                  return <td key={i} className="p-1"><Input type="number" min="0" max="100" className="w-full h-7 font-mono text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={pct} onChange={(e) => setClientCell(c, "agencyPctByMonth", i, parseFloat(e.target.value) || 0)} /></td>;
                })}
              </tr>
            ))}
            <tr className="font-semibold border-t border-border"><td className="p-1">Revenue</td>{rows.map((r) => <td key={r.monthIndex} className="p-1 text-right font-mono">{fmt(r.revenue)}</td>)}</tr>

            <tr><td colSpan={monthLabels.length + 1} className="pt-4 pb-1 text-xs uppercase tracking-wide text-muted-foreground">Costs &amp; profit</td></tr>

            <CostRow label="Partner salary" k="partnerSalaryByMonth" cfg={costConfig} labels={monthLabels} onCell={setCostCell} />
            <CostRow label="Rent / lease" k="rentByMonth" cfg={costConfig} labels={monthLabels} onCell={setCostCell} />
            <CostRow label="Operating overhead" k="overheadByMonth" cfg={costConfig} labels={monthLabels} onCell={setCostCell} />
            <tr><td className="p-1 whitespace-nowrap text-muted-foreground">Production team</td>{rows.map((r) => <td key={r.monthIndex} className="p-1 text-right font-mono text-muted-foreground">{fmt(r.productionCost)}</td>)}</tr>
            <tr><td className="p-1 text-muted-foreground">Deliverables</td>{rows.map((r) => <td key={r.monthIndex} className="p-1 text-right font-mono text-muted-foreground">{r.deliverables}</td>)}</tr>
            <tr className="border-t border-border"><td className="p-1">Total cost</td>{rows.map((r) => <td key={r.monthIndex} className="p-1 text-right font-mono">{fmt(r.totalCost)}</td>)}</tr>
            <tr className="font-semibold"><td className="p-1">Net income</td>{rows.map((r) => <td key={r.monthIndex} className={cn("p-1 text-right font-mono", r.netIncome >= 0 ? "text-emerald-500" : "text-destructive")}>{fmt(r.netIncome)}</td>)}</tr>
            <tr><td className="p-1 text-muted-foreground">Margin</td>{rows.map((r) => <td key={r.monthIndex} className={cn("p-1 text-right font-mono", r.margin >= 0 ? "text-emerald-500" : "text-destructive")}>{Math.round(r.margin * 100)}%</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        <SectionHeader title="Production team" />
        {(costConfig.team ?? []).map((p) => (
          <div key={p.id} className="flex gap-2 items-center">
            <Input className="flex-1" value={p.name} onChange={(e) => updatePerson(p.id, { name: e.target.value })} />
            <select
              aria-label="Side"
              className="bg-background border border-input rounded px-2 h-7 text-sm"
              value={p.side}
              onChange={(e) => updatePerson(p.id, { side: e.target.value as "video" | "static" | "both" })}
            >
              <option value="video">Video</option>
              <option value="static">Static</option>
              <option value="both">Both</option>
            </select>
            <MoneyInput value={p.monthlyCost} onChange={(n) => updatePerson(p.id, { monthlyCost: n })} className="w-28" />
            <select
              aria-label="Start month"
              className="bg-background border border-input rounded px-2 h-7 text-sm"
              value={p.startMonthIndex}
              onChange={(e) => updatePerson(p.id, { startMonthIndex: parseInt(e.target.value) })}
            >
              <option value={0}>Now</option>
              {monthLabels.slice(1).map((l, idx) => (
                <option key={idx + 1} value={idx + 1}>{l}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" aria-label="Remove person" onClick={() => removePerson(p.id)}>✕</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addPerson}>+ Add person / hire</Button>
      </div>

      {onAddClientWithPricing && (
        <PricingModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          onSave={(name, pricing) => {
            onAddClientWithPricing(name, pricing);
            setModalOpen(false);
          }}
        />
      )}

      {editing && (
        <PricingModal
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          initial={{ name: editing.name, pricing: editing.pricing }}
          onSave={(name, pricing) => { onUpdate(editing.id, { name, pricing }); setEditing(null); }}
        />
      )}
    </div>
  );
}

function PricingSummary({ pricing }: { pricing?: ClientPricing }) {
  if (!pricing) return <div className="text-[10px] text-amber-500">no pricing — click to set</div>;
  const base = pricing.baseFee ? `$${(pricing.baseFee / 1000)}k base · ` : "";
  const min = `$${(pricing.minFee / 1000)}k min`;
  const rates = pricing.tiers.map((t) => `${t.rate}%`).join("/");
  return <div className="text-[10px] text-muted-foreground font-mono">{base}{min} · {rates}</div>;
}

function Kpi({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-mono", good === undefined ? "" : good ? "text-emerald-500" : "text-destructive")}>{value}</div>
    </div>
  );
}

function CostRow({ label, k, cfg, labels, onCell }: { label: string; k: keyof CostConfig; cfg: CostConfig; labels: string[]; onCell: (k: keyof CostConfig, i: number, val: number) => void }) {
  return (
    <tr>
      <td className="p-1 whitespace-nowrap">{label}</td>
      {labels.map((_, i) => (
        <td key={i} className="p-1"><MoneyInput value={(cfg[k] as number[])?.[i] ?? 0} onChange={(n) => onCell(k, i, n)} className="w-full" /></td>
      ))}
    </tr>
  );
}

function MoneyInput({ value, onChange, className }: { value: number; onChange: (n: number) => void; className?: string }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={cn("h-7 rounded-md border border-input bg-background px-2 font-mono text-right text-sm", className)}
      value={value === 0 ? "" : value.toLocaleString("en-US")}
      placeholder="0"
      onChange={(e) => {
        const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}
