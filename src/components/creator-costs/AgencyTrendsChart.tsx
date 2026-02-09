import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { MonthlyAgencyData } from "@/hooks/useCreatorCostsData";

interface AgencyTrendsChartProps {
  data: MonthlyAgencyData[];
}

function formatDollars(value: number): string {
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function AgencyTrendsChart({ data }: AgencyTrendsChartProps) {
  const maxSpend = Math.max(...data.map((d) => d.totalSpend), 1);
  const yMaxRight = Math.ceil(maxSpend / 1000) * 1000 || 1000;
  const maxAvg = Math.max(
    ...data.map((d) => Math.max(d.avgPerPayment, d.avgPerCreator)),
    1
  );
  const yMaxLeft = Math.ceil(maxAvg / 100) * 100 || 500;

  return (
    <div className="h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 60, left: 60, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 22%)" vertical={false} />
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
            yAxisId="left"
            tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={[0, yMaxLeft]}
            tickFormatter={(v) => `$${v}`}
            width={50}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={[0, yMaxRight]}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
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
                  <p style={{ color: "hsl(0, 0%, 89%)", fontWeight: 600, marginBottom: 6 }}>
                    {label}
                  </p>
                  <p style={{ color: "hsl(22, 77%, 70%)" }}>
                    Total Spend: {formatDollars(d.totalSpend)}
                  </p>
                  <p style={{ color: "hsl(358, 58%, 56%)" }}>
                    Avg/Payment: {formatDollars(d.avgPerPayment)}
                  </p>
                  <p style={{ color: "hsl(38, 100%, 78%)" }}>
                    Avg/Creator: {formatDollars(d.avgPerCreator)}
                  </p>
                  <p style={{ color: "hsl(234, 28%, 66%)", marginTop: 4, fontSize: 12 }}>
                    {d.paymentCount} payments · {d.uniqueCreators} creators
                  </p>
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="top"
            height={30}
            formatter={(value: string) => (
              <span style={{ color: "hsl(234, 28%, 66%)", fontSize: 11 }}>{value}</span>
            )}
          />
          <Bar
            yAxisId="right"
            dataKey="totalSpend"
            name="Total Spend"
            fill="hsl(22, 77%, 70%)"
            opacity={0.25}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="avgPerPayment"
            name="Avg/Payment"
            stroke="hsl(358, 58%, 56%)"
            strokeWidth={2}
            dot={{ fill: "hsl(358, 58%, 56%)", r: 3 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="avgPerCreator"
            name="Avg/Creator"
            stroke="hsl(38, 100%, 78%)"
            strokeWidth={2}
            dot={{ fill: "hsl(38, 100%, 78%)", r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
