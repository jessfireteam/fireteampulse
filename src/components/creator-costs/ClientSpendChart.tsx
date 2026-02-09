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
import { ClientSpendSummary } from "@/hooks/useCreatorCostsData";

interface ClientSpendChartProps {
  data: ClientSpendSummary[];
}

function formatDollars(value: number): string {
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function ClientSpendChart({ data }: ClientSpendChartProps) {
  // Take top 15 clients
  const chartData = data.slice(0, 15);
  const maxSpend = Math.max(...chartData.map((d) => d.totalSpend), 1);
  const yMax = Math.ceil(maxSpend / 1000) * 1000 || 1000;

  return (
    <div style={{ height: Math.max(300, chartData.length * 36) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 60, left: 120, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 22%)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(0, 0%, 22%)" }}
            domain={[0, yMax]}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            type="category"
            dataKey="clientName"
            tick={{ fill: "hsl(0, 0%, 89%)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const d = payload[0].payload;
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
                    {d.clientName}
                  </p>
                  <p style={{ color: "hsl(22, 77%, 70%)" }}>
                    Total: {formatDollars(d.totalSpend)}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="totalSpend" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {chartData.map((_, index) => (
              <Cell key={index} fill="hsl(22, 77%, 70%)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
