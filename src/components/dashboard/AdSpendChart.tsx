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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdSpendChart({ data }: { data: ProcessedClientWeek[] }) {
  const maxPercent = Math.max(...data.map((d) => d.agencyPercent), 50);
  const interval = 10;
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
              cursor={false}
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
              labelFormatter={(label) => label}
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
