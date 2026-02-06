import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ClientDeliverables } from "@/hooks/useDeliverablesData";

interface DeliverablesChartProps {
  data: ClientDeliverables;
}

export function DeliverablesChart({ data }: DeliverablesChartProps) {
  const chartData = [
    ...data.months.map((m) => ({
      label: m.monthLabel,
      count: m.count,
      isUpcoming: false,
    })),
    {
      label: "Upcoming",
      count: data.upcomingCount,
      isUpcoming: true,
    },
  ];

  const maxCount = Math.max(...chartData.map((d) => d.count), 1);
  const yMax = Math.ceil(maxCount / 5) * 5 || 5;

  return (
    <>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 60, bottom: 40 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(0, 0%, 22%)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
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
              domain={[0, yMax]}
              allowDecimals={false}
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
              labelStyle={{
                color: "hsl(0, 0%, 89%)",
                fontWeight: 600,
                marginBottom: 4,
              }}
              itemStyle={{
                color: "hsl(0, 0%, 89%)",
              }}
              formatter={(value: number, _name: string, entry: any) => {
                const item = entry.payload;
                if (item.isUpcoming) {
                  return [`${value} projects due`, "Next 30 days"];
                }
                return [`${value} projects completed`, item.label];
              }}
              labelFormatter={(label) =>
                label === "Upcoming" ? "Next 30 days" : label
              }
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={
                    entry.isUpcoming
                      ? "hsl(22, 77%, 70%)"
                      : "hsl(22, 77%, 70%)"
                  }
                  fillOpacity={entry.isUpcoming ? 0.5 : 1}
                  stroke={entry.isUpcoming ? "hsl(22, 77%, 70%)" : undefined}
                  strokeWidth={entry.isUpcoming ? 2 : 0}
                  strokeDasharray={entry.isUpcoming ? "6 3" : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm bg-chart-1" />
          <span>Completed projects</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm bg-chart-1/50 border border-chart-1 border-dashed" />
          <span>Upcoming (next 30 days)</span>
        </div>
      </div>
    </>
  );
}
