// src/pages/Partners.tsx
import { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { PartnerGate } from "@/components/partners/PartnerGate";
import { useForecastData } from "@/hooks/useForecastData";
import { useScenario } from "@/hooks/useScenario";
import { runForecast } from "@/lib/forecast/engine";
import { HORIZON_MONTHS, type Calibration } from "@/lib/forecast/types";
import { ScenarioBuilder } from "@/components/partners/ScenarioBuilder";
import { CalibrationTable } from "@/components/partners/CalibrationTable";
import { ForecastChart } from "@/components/partners/ForecastChart";
import { HireTimeline } from "@/components/partners/HireTimeline";
import { Skeleton } from "@/components/ui/skeleton";

function PartnersInner() {
  const { peaks, calibration: seededCalibration, baselines, isLoading, error } = useForecastData();
  const { clients, update, addClient, removeClient } = useScenario(baselines);
  const [calibrationOverride, setCalibrationOverride] = useState<Calibration | null>(null);
  const calibration = calibrationOverride ?? seededCalibration;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthLabels = useMemo(() => Array.from({ length: HORIZON_MONTHS }, (_, i) => format(addMonths(new Date(), i), "MMM")), []);

  const result = useMemo(
    () => runForecast(clients, calibration, peaks, HORIZON_MONTHS, new Date()),
    [clients, calibration, peaks],
  );

  if (isLoading) return <Skeleton className="h-96 m-8" />;
  if (error) return <div className="p-8 text-destructive">Failed to load forecast data.</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Partners — Capacity Forecast</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <ScenarioBuilder
            clients={clients}
            monthLabels={monthLabels}
            onUpdate={update}
            onAdd={addClient}
            onRemove={removeClient}
          />
          <CalibrationTable calibration={calibration} onChange={setCalibrationOverride} />
        </div>
        <div className="space-y-8">
          <ForecastChart result={result} />
          <HireTimeline result={result} />
        </div>
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
