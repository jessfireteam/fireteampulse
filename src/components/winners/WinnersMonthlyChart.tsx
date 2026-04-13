import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart,
} from "recharts";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import type { MonthlyWinners } from "@/hooks/useWinnersData";

interface Props {
  data: MonthlyWinners[];
}

export function WinnersMonthlyChart({ data }: Props) {
  if (!data.length) return null;

  return (
    <div className="space-y-3">
      <SectionHeader title="Winners by Month" subtitle="Monthly winner count since tracking began" />
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm p-4">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="month"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="count"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "13px",
              }}
              formatter={(value: number, name: string) => {
                if (name === "winRate") return [`${(value * 100).toFixed(1)}%`, "Win Rate"];
                if (name === "winners") return [value, "Winners"];
                return [value, "Total Ads"];
              }}
            />
            <Bar
              yAxisId="count"
              dataKey="total"
              fill="hsl(var(--muted-foreground))"
              opacity={0.2}
              radius={[4, 4, 0, 0]}
              name="total"
            />
            <Bar
              yAxisId="count"
              dataKey="winners"
              fill="hsl(var(--primary))"
              opacity={0.8}
              radius={[4, 4, 0, 0]}
              name="winners"
            />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="winRate"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              name="winRate"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
