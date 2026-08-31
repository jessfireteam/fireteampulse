import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { MonthPoint } from "@/hooks/useNewBizLeads";

// Single series, so no legend: the section title names it.
const BAR = "hsl(var(--chart-1))";

function VolumeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const n = payload[0].value as number;
  return (
    <div className="rounded-md border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-muted-foreground">
        {n} {n === 1 ? "inquiry" : "inquiries"}
      </div>
    </div>
  );
}

export function InquiryVolumeChart({ months }: { months: MonthPoint[] }) {
  const max = Math.max(...months.map((m) => m.inquiries), 1);

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={months} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, Math.ceil(max * 1.2)]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip content={<VolumeTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
          <Bar dataKey="inquiries" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {months.map((m) => (
              <Cell key={m.key} fill={BAR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
