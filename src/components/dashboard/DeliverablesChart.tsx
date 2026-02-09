import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ClientDeliverables } from "@/hooks/useDeliverablesData";

interface DeliverablesChartProps {
  data: ClientDeliverables;
}

// SVG pattern for the scheduled/dashed portion
function StripePattern() {
  return (
    <defs>
      <pattern
        id="stripe-pattern"
        patternUnits="userSpaceOnUse"
        width="6"
        height="6"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" fill="hsl(22, 77%, 70%)" fillOpacity={0.25} />
        <line
          x1="0" y1="0" x2="0" y2="6"
          stroke="hsl(22, 77%, 70%)"
          strokeWidth="2"
          strokeOpacity={0.5}
        />
      </pattern>
    </defs>
  );
}

export function DeliverablesChart({ data }: DeliverablesChartProps) {
  const chartData = data.months.map((m) => ({
    label: m.monthLabel,
    completed: m.count,
    scheduled: m.scheduledCount,
  }));

  const maxCount = Math.max(
    ...chartData.map((d) => d.completed + d.scheduled),
    1
  );
  const yMax = Math.ceil(maxCount / 5) * 5 || 5;

  return (
    <>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 60, bottom: 40 }}
          >
            <StripePattern />
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
              cursor={false}
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
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const completed = (payload.find((p) => p.dataKey === "completed")?.value as number) ?? 0;
                const scheduled = (payload.find((p) => p.dataKey === "scheduled")?.value as number) ?? 0;
                const total = completed + scheduled;

                return (
                  <div
                    style={{
                      backgroundColor: "hsl(0, 0%, 16%)",
                      border: "1px solid hsl(0, 0%, 22%)",
                      borderRadius: "8px",
                      padding: "12px",
                      fontSize: "13px",
                    }}
                  >
                    <p style={{ color: "hsl(0, 0%, 89%)", fontWeight: 600, marginBottom: 4 }}>
                      {label}
                    </p>
                    {scheduled > 0 ? (
                      <>
                        <p style={{ color: "hsl(0, 0%, 89%)" }}>
                          {completed} completed, {scheduled} scheduled ({total} total)
                        </p>
                      </>
                    ) : (
                      <p style={{ color: "hsl(0, 0%, 89%)" }}>
                        {completed} projects completed
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="completed"
              stackId="deliverables"
              fill="hsl(22, 77%, 70%)"
              radius={[0, 0, 0, 0]}
              maxBarSize={50}
            />
            <Bar
              dataKey="scheduled"
              stackId="deliverables"
              fill="url(#stripe-pattern)"
              stroke="hsl(22, 77%, 70%)"
              strokeWidth={1}
              strokeOpacity={0.4}
              radius={[4, 4, 0, 0]}
              maxBarSize={50}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm bg-chart-1" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded-sm border border-chart-1/50"
            style={{
              background:
                "repeating-linear-gradient(45deg, transparent, transparent 2px, hsl(22 77% 70% / 0.3) 2px, hsl(22 77% 70% / 0.3) 4px)",
            }}
          />
          <span>Scheduled (this month)</span>
        </div>
      </div>
    </>
  );
}
