import { useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { PartnerGate } from "@/components/partners/PartnerGate";
import { useForecastData } from "@/hooks/useForecastData";
import { useScenario } from "@/hooks/useScenario";
import { runForecast } from "@/lib/forecast/engine";
import { HORIZON_MONTHS, HISTORY_MONTHS, type TypedCalibration } from "@/lib/forecast/types";
import { ScenarioBuilder } from "@/components/partners/ScenarioBuilder";
import { CalibrationTable } from "@/components/partners/CalibrationTable";
import { ForecastChart } from "@/components/partners/ForecastChart";
import { HireTimeline } from "@/components/partners/HireTimeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function PartnersInner() {
  const { peaks, typedCalibration, histories, isLoading, error } = useForecastData();
  const { clients, update, addClient, removeClient } = useScenario(histories);
  const [override, setOverride] = useState<TypedCalibration | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const calibration = override ?? typedCalibration;

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
    () => runForecast(clients, calibration, peaks, HORIZON_MONTHS, new Date()),
    [clients, calibration, peaks],
  );

  if (isLoading) return <Skeleton className="h-96 m-8" />;
  if (error) return <div className="p-8 text-destructive">Failed to load forecast data.</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Partners — Capacity Forecast</h1>
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
      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((s) => !s)}>
          {showAdvanced ? "Hide advanced" : "Advanced: calibration"}
        </Button>
        {showAdvanced && (
          <div className="mt-3 max-w-md">
            <CalibrationTable calibration={calibration} onChange={setOverride} />
          </div>
        )}
      </div>
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
