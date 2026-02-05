import { Card, CardContent } from "@/components/ui/card";
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
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ClientMonthlyChart({ clientName, data }: ClientMonthlyChartProps) {
  if (data.length === 0) {
    return null;
  }

  // Cap Y-axis at $4,000 to show detail in the $1k-$2k target range
  const Y_AXIS_CAP = 4000;
  const hasClippedValues = data.some((d) => d.costPerDeliverable > Y_AXIS_CAP);

  // Calculate actual max for proper scaling
  const actualMax = Math.max(...data.map((d) => d.costPerDeliverable));
  const effectiveMax = Math.min(actualMax, Y_AXIS_CAP);
  
  console.log(`[Chart ${clientName}] Data:`, data.map(d => ({ month: d.monthLabel, cost: d.costPerDeliverable })));
  console.log(`[Chart ${clientName}] Max value: ${actualMax}, Effective max: ${effectiveMax}`);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{clientName}</h3>
          {hasClippedValues && (
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
              * Values above $4k are clipped
            </span>
          )}
        </div>
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
              {/* Target range band: $1,000 - $2,000 - mint green */}
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
      </CardContent>
    </Card>
  );
}
