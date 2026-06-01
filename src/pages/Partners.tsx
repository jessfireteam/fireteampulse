import { useMemo } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { PartnerGate } from "@/components/partners/PartnerGate";
import { useForecastData } from "@/hooks/useForecastData";
import { useScenario } from "@/hooks/useScenario";
import { useAuth } from "@/hooks/useAuth";
import { runForecast } from "@/lib/forecast/engine";
import { HORIZON_MONTHS, HISTORY_MONTHS } from "@/lib/forecast/types";
import { ScenarioBuilder } from "@/components/partners/ScenarioBuilder";
import { ForecastChart } from "@/components/partners/ForecastChart";
import { HireTimeline } from "@/components/partners/HireTimeline";
import { Skeleton } from "@/components/ui/skeleton";

function PartnersInner() {
  const { peaks, histories, isLoading, error } = useForecastData();
  const { user } = useAuth();
  const { clients, update, addClient, removeClient, saveState } = useScenario(histories, user?.email);

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

  const result = useMemo(
    () => runForecast(clients, peaks, HORIZON_MONTHS, new Date()),
    [clients, peaks],
  );

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
      <ForecastChart result={result} />
      <HireTimeline result={result} />
      <ScenarioBuilder
        clients={clients}
        historyLabels={historyLabels}
        monthLabels={monthLabels}
        histories={histories}
        onUpdate={update}
        onAdd={addClient}
        onRemove={removeClient}
      />
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
