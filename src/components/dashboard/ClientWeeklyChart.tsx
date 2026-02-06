import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { ProcessedClientWeek } from "@/hooks/useClientWeeksData";

interface MonthlyData {
  month: string;
  monthLabel: string;
  costPerDeliverable: number;
  deliverables: number;
  fireTeamSpend: number;
}

interface ClientMonthlyChartProps {
  clientName: string;
  data: MonthlyData[];
  adSpendData?: ProcessedClientWeek[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function CostPerDeliverableChart({ data }: { data: MonthlyData[] }) {
  const Y_AXIS_CAP = 4000;
  const actualMax = Math.max(...data.map((d) => d.costPerDeliverable));
  const hasClippedValues = actualMax > Y_AXIS_CAP;

  return (
    <>
      {hasClippedValues && (
        <div className="flex justify-end mb-2">
          <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            * Values above $4k are clipped
          </span>
        </div>
      )}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 60, bottom: 40 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(0, 0%, 22%)"
              vertical={false}
            />
            <ReferenceArea
              y1={1000}
              y2={2000}
              fill="hsl(148, 58%, 72%)"
              fillOpacity={0.2}
              stroke="hsl(148, 58%, 72%)"
              strokeOpacity={0.5}
              strokeDasharray="4 2"
            />
            <XAxis
              dataKey="monthLabel"
              tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "hsl(0, 0%, 22%)" }}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              domain={[0, Y_AXIS_CAP]}
              ticks={[0, 1000, 2000, 3000, 4000]}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(0, 0%, 16%)",
                border: "1px solid hsl(0, 0%, 22%)",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "13px",
              }}
              labelStyle={{ color: "hsl(0, 0%, 89%)", fontWeight: 600, marginBottom: 4 }}
              formatter={(value: number) => [formatCurrency(value), "$/Deliverable"]}
              labelFormatter={(label) => label}
            />
            <Bar
              dataKey="costPerDeliverable"
              fill="hsl(22, 77%, 70%)"
              radius={[4, 4, 0, 0]}
              maxBarSize={50}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-4 w-8 rounded-sm bg-success/20 border border-success/50 border-dashed" />
          <span>Target zone ($1k-$2k/deliverable)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm bg-chart-1" />
          <span>Actual $/Deliverable</span>
        </div>
      </div>
    </>
  );
}

function AdSpendChart({ data }: { data: ProcessedClientWeek[] }) {
  const maxPercent = Math.max(...data.map((d) => d.agencyPercent), 50);
  // Ensure Y-axis is at least 50% so target zone is always visible
  const interval = maxPercent > 50 ? 10 : 10;
  const yMax = Math.ceil(maxPercent / interval) * interval;
  const ticks = Array.from({ length: Math.floor(yMax / interval) + 1 }, (_, i) => i * interval);

  return (
    <>
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 60, bottom: 40 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(0, 0%, 22%)"
            vertical={false}
          />
          <ReferenceArea
            y1={15}
            y2={50}
            fill="hsl(148, 58%, 72%)"
            fillOpacity={0.2}
            stroke="hsl(148, 58%, 72%)"
            strokeOpacity={0.5}
            strokeDasharray="4 2"
          />
          <XAxis
            dataKey="weekLabel"
            tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(0, 0%, 22%)" }}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}%`}
            domain={[0, yMax]}
            ticks={ticks}
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(0, 0%, 16%)",
              border: "1px solid hsl(0, 0%, 22%)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "13px",
            }}
            labelStyle={{ color: "hsl(0, 0%, 89%)", fontWeight: 600, marginBottom: 4 }}
            formatter={(value: number, _name: string, entry: any) => {
              const item = entry.payload as ProcessedClientWeek;
              return [
                `${value.toFixed(1)}% (${formatCurrency(item.agencySpend)} / ${formatCurrency(item.totalSpend)})`,
                "% of Ad Spend",
              ];
            }}
            labelFormatter={(label) => `Week of ${label}`}
          />
          <Bar
            dataKey="agencyPercent"
            fill="hsl(22, 77%, 70%)"
            radius={[4, 4, 0, 0]}
            maxBarSize={50}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-4 w-8 rounded-sm bg-success/20 border border-success/50 border-dashed" />
          <span>Target zone (15%-50%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm bg-chart-1" />
          <span>Actual % of Ad Spend</span>
        </div>
      </div>
    </>
  );
}

export function ClientMonthlyChart({ clientName, data, adSpendData }: ClientMonthlyChartProps) {
  const [viewMode, setViewMode] = useState<string>("cost");

  if (data.length === 0 && (!adSpendData || adSpendData.length === 0)) {
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
            onValueChange={(val) => { if (val) setViewMode(val); }}
            size="sm"
            className="bg-secondary/30 rounded-md p-0.5"
          >
            <ToggleGroupItem
              value="cost"
              className="text-xs px-3 py-1 h-7 data-[state=on]:bg-secondary data-[state=on]:text-foreground rounded-sm"
            >
              $/Deliverable
            </ToggleGroupItem>
            <ToggleGroupItem
              value="adspend"
              className="text-xs px-3 py-1 h-7 data-[state=on]:bg-secondary data-[state=on]:text-foreground rounded-sm"
            >
              % Ad Spend
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {viewMode === "cost" ? (
          <CostPerDeliverableChart data={data} />
        ) : adSpendData && adSpendData.length > 0 ? (
          <AdSpendChart data={adSpendData} />
        ) : (
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">No ad spend data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
