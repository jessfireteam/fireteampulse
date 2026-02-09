import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ClientExpenses } from "@/hooks/useExpensesData";

interface CreatorCostsChartProps {
  data: ClientExpenses;
}

function formatDollars(value: number): string {
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function CreatorCostsChart({ data }: CreatorCostsChartProps) {
  const chartData = data.months.map((m) => ({
    label: m.monthLabel,
    totalCost: m.totalCost,
    expenseCount: m.expenseCount,
    unpaidAmount: m.unpaidAmount,
    unbilledAmount: m.unbilledAmount,
  }));

  const maxCost = Math.max(...chartData.map((d) => d.totalCost), 1);
  const yMax = Math.ceil(maxCost / 1000) * 1000 || 1000;

  return (
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
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload, label }) => {
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
                    {label}
                  </p>
                  <p style={{ color: "hsl(0, 0%, 89%)" }}>
                    Total: {formatDollars(d.totalCost)}
                  </p>
                  <p style={{ color: "hsl(0, 0%, 89%)" }}>
                    {d.expenseCount} expense{d.expenseCount !== 1 ? "s" : ""}
                  </p>
                  {d.unpaidAmount > 0 && (
                    <p style={{ color: "hsl(0, 60%, 70%)" }}>
                      Unpaid: {formatDollars(d.unpaidAmount)}
                    </p>
                  )}
                  {d.unbilledAmount > 0 && (
                    <p style={{ color: "hsl(40, 60%, 70%)" }}>
                      Not billed to client: {formatDollars(d.unbilledAmount)}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="totalCost"
            fill="hsl(22, 77%, 70%)"
            radius={[4, 4, 0, 0]}
            maxBarSize={50}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
