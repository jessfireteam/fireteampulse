import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProcessedClientWeek } from "@/hooks/useClientWeeksData";
import { ClientDeliverables } from "@/hooks/useDeliverablesData";
import { CostPerDeliverableChart, MonthlyData } from "./CostPerDeliverableChart";
import { AdSpendChart } from "./AdSpendChart";
import { DeliverablesChart } from "./DeliverablesChart";

interface ClientMonthlyChartProps {
  clientName: string;
  data: MonthlyData[];
  adSpendData?: ProcessedClientWeek[];
  deliverablesData?: ClientDeliverables;
}

export type { MonthlyData };

export function ClientMonthlyChart({
  clientName,
  data,
  adSpendData,
  deliverablesData,
}: ClientMonthlyChartProps) {
  const [viewMode, setViewMode] = useState<string>("cost");

  const hasAnyData =
    data.length > 0 ||
    (adSpendData && adSpendData.length > 0) ||
    (deliverablesData &&
      deliverablesData.months.some((m) => m.count > 0 || m.scheduledCount > 0));

  if (!hasAnyData) {
    return null;
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{clientName}</h3>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(val) => {
              if (val) setViewMode(val);
            }}
            size="sm"
            className="bg-secondary/30 rounded-md p-0.5"
          >
            <ToggleGroupItem
              value="cost"
              className="text-[11px] px-2.5 py-1 h-7 data-[state=on]:bg-secondary data-[state=on]:text-foreground rounded-sm"
            >
              $/Deliverable
            </ToggleGroupItem>
            <ToggleGroupItem
              value="adspend"
              className="text-[11px] px-2.5 py-1 h-7 data-[state=on]:bg-secondary data-[state=on]:text-foreground rounded-sm"
            >
              % Ad Spend
            </ToggleGroupItem>
            <ToggleGroupItem
              value="deliverables"
              className="text-[11px] px-2.5 py-1 h-7 data-[state=on]:bg-secondary data-[state=on]:text-foreground rounded-sm"
            >
              Deliverables
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {viewMode === "cost" ? (
          <CostPerDeliverableChart data={data} />
        ) : viewMode === "adspend" ? (
          adSpendData && adSpendData.length > 0 ? (
            <AdSpendChart data={adSpendData} />
          ) : (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-muted-foreground text-sm">
                No ad spend data available
              </p>
            </div>
          )
        ) : deliverablesData &&
          deliverablesData.months.some((m) => m.count > 0 || m.scheduledCount > 0) ? (
          <DeliverablesChart data={deliverablesData} />
        ) : (
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">
              No deliverables data available
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
