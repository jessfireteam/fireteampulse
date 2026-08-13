import { useEffect, useMemo, useRef } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { PartnerGate } from "@/components/partners/PartnerGate";
import { useForecastData } from "@/hooks/useForecastData";
import { useScenario } from "@/hooks/useScenario";
import { useAuth } from "@/hooks/useAuth";
import { runForecast } from "@/lib/forecast/engine";
import { resolveRoleSupply } from "@/lib/forecast/supply";
import { computeRunway } from "@/lib/forecast/runway";
import { HORIZON_MONTHS, HISTORY_MONTHS, FORECAST_ROLES, DEFAULT_ROLE_RATES, DEFAULT_HIRE_LEAD_WEEKS, type ClientPricing } from "@/lib/forecast/types";
import { Input } from "@/components/ui/input";
import { ScenarioBuilder } from "@/components/partners/ScenarioBuilder";
import { CapacityRoster } from "@/components/partners/CapacityRoster";
import { RunwayTable } from "@/components/partners/RunwayTable";
import { StuckWorkStrip } from "@/components/partners/StuckWorkStrip";
import { PnlTab } from "@/components/partners/PnlTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

function PartnersInner() {
  const { measuredPeople, histories, plans, stuckStages, isLoading, error } = useForecastData();
  const { user } = useAuth();
  // isLoading is passed through as the seed gate: PartnersInner's hooks run even while the page
  // renders a skeleton, so without it useScenario would seed from a half-loaded plan list.
  const { clients, update, addClient, removeClient, costConfig, updateCost, saveState } = useScenario(plans, user?.email, !isLoading);

  // Modal-driven client creation: addClient() appends a new client but doesn't
  // return its id (the id is minted inside the hook's setState). We stash the
  // name+pricing and the set of known ids, then an effect patches whichever
  // client id is new. Keeps PnlTab focused on display/edit; Partners owns creation.
  const pendingNew = useRef<{ name: string; pricing: ClientPricing; newBusiness: boolean; knownIds: Set<string> } | null>(null);
  const handleAddClientWithPricing = (name: string, pricing: ClientPricing, newBusiness = false) => {
    pendingNew.current = { name, pricing, newBusiness, knownIds: new Set(clients.map((c) => c.id)) };
    addClient();
  };
  useEffect(() => {
    const pending = pendingNew.current;
    if (!pending) return;
    const created = clients.find((c) => !pending.knownIds.has(c.id));
    if (!created) return;
    pendingNew.current = null;
    update(created.id, { name: pending.name, pricing: pending.pricing, newBusiness: pending.newBusiness });
  }, [clients, update]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthLabels = useMemo(
    () => Array.from({ length: HORIZON_MONTHS }, (_, i) => format(addMonths(new Date(), i), "MMM")),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const historyLabels = useMemo(
    () => Array.from({ length: HISTORY_MONTHS }, (_, i) => format(subMonths(new Date(), HISTORY_MONTHS - i), "MMM")),
    [],
  );

  // Supply comes from the team roster (role + max + start month), so a hire lifts the ceiling
  // from the month they begin. A role with nobody assigned falls back to the summed recent
  // actuals of whoever Fibery says does that work.
  const resolved = useMemo(
    () => resolveRoleSupply(costConfig.team ?? [], measuredPeople, HORIZON_MONTHS),
    [costConfig.team, measuredPeople],
  );

  const result = useMemo(
    () => runForecast(clients, resolved.supply, HORIZON_MONTHS, new Date(), costConfig.roleRates),
    [clients, resolved.supply, costConfig.roleRates],
  );

  // Today's ACTUAL production for the runway's Now column: newest full history month.
  const runwayRoles = useMemo(() => {
    const actualVideos = histories.reduce((s, h) => s + (h.seedVideos ?? 0), 0);
    const actualStatics = histories.reduce((s, h) => s + (h.seedStatics ?? 0), 0);
    return computeRunway({
      months: result.months,
      monthLabels,
      supply: resolved.supply,
      actualVideosPerMonth: actualVideos,
      actualStaticsPerMonth: actualStatics,
      team: costConfig.team ?? [],
      roleRates: costConfig.roleRates,
      config: costConfig.runway,
    });
  }, [histories, result.months, monthLabels, resolved.supply, costConfig.team, costConfig.roleRates, costConfig.runway]);

  if (isLoading) return <Skeleton className="h-96 m-8" />;
  if (error) return <div className="p-8 text-destructive">Failed to load forecast data.</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Partners — Capacity Forecast</h1>
        {saveState === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
        {saveState === "saved" && <span className="text-xs text-muted-foreground">Saved</span>}
        {saveState === "error" && <span className="text-xs text-destructive">Save failed</span>}
      </div>
      <Tabs defaultValue="capacity" className="w-full">
        <TabsList>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
        </TabsList>
        <TabsContent value="capacity" className="space-y-8">
          <RunwayTable
            roles={runwayRoles}
            monthLabels={monthLabels}
            roleRates={costConfig.roleRates}
            hireLeadWeeks={costConfig.runway?.hireLeadWeeks ?? DEFAULT_HIRE_LEAD_WEEKS}
            onLeadWeeksChange={(w) => updateCost({ runway: { ...(costConfig.runway ?? {}), hireLeadWeeks: w } })}
          />
          <StuckWorkStrip stages={stuckStages} />
          <CapacityRoster
            team={costConfig.team ?? []}
            resolved={resolved}
            monthLabels={monthLabels}
            onUpdatePerson={(id, patch) =>
              updateCost({
                team: (costConfig.team ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
              })
            }
            onAddPerson={(name) =>
              updateCost({
                team: [
                  ...(costConfig.team ?? []),
                  {
                    // Same id scheme as the P&L roster: stable across reloads, collision-free.
                    id:
                      typeof crypto !== "undefined" && crypto.randomUUID
                        ? `person-${crypto.randomUUID()}`
                        : `person-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
                    name,
                    side: "both",
                    monthlyCost: 0,
                    startMonthIndex: 0,
                  },
                ],
              })
            }
          />
          <ScenarioBuilder
            clients={clients}
            historyLabels={historyLabels}
            monthLabels={monthLabels}
            histories={histories}
            plans={plans}
            onUpdate={update}
            onAdd={addClient}
            onRemove={removeClient}
          />
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Tasks per deliverable (by role)</h3>
            <p className="text-xs text-muted-foreground">
              How many of each role's tasks one deliverable generates - check monthly against the Pulse Role Capacity actuals.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {FORECAST_ROLES.map((role) => (
                <label key={role.key} className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">{role.display}</span>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="h-7 font-mono text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={costConfig.roleRates?.[role.key] ?? DEFAULT_ROLE_RATES[role.key]}
                    onChange={(e) =>
                      updateCost({
                        roleRates: {
                          ...(costConfig.roleRates ?? {}),
                          [role.key]: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="pnl">
          <PnlTab
            clients={clients}
            costConfig={costConfig}
            monthLabels={monthLabels}
            onUpdate={update}
            onUpdateCost={updateCost}
            onAddClientWithPricing={handleAddClientWithPricing}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Partners() {
  return (
    <PartnerGate>
      <PartnersInner />
    </PartnerGate>
  );
}
