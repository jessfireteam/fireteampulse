import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
      <SectionHeader title="Winners by Month" />
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm p-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="month"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "13px",
              }}
              formatter={(value: number, name: string) => {
                if (name === "winners") return [value, "Winners"];
                return [value, name];
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-xl">
                    <p className="font-medium text-foreground mb-1">{label}</p>
                    <p className="text-primary">Winners: {d.winners}</p>
                    <p className="text-muted-foreground">Total Ads: {d.total}</p>
                    <p className="text-muted-foreground">Win Rate: {(d.winRate * 100).toFixed(1)}%</p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="winners"
              fill="hsl(var(--primary))"
              opacity={0.8}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
