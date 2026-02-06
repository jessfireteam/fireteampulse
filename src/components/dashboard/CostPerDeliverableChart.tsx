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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export type { MonthlyData };

export function CostPerDeliverableChart({ data }: { data: MonthlyData[] }) {
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
