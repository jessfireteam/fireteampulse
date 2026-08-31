import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { REPLY_TARGET_HOURS, type MonthPoint } from "@/hooks/useNewBizLeads";

// Two states, not two series: on-target vs over the target line. The reference
// line is labelled, so the colour is never the only thing carrying the meaning.
const ON_TARGET = "hsl(var(--chart-1))";
const OVER_TARGET = "hsl(var(--destructive))";

function formatHours(h: number): string {
  if (h < 1) return "under an hour";
  if (h < 48) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)} days`;
}

function ReplyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const h = payload[0].value as number;
  const over = h > REPLY_TARGET_HOURS;
  return (
    <div className="rounded-md border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-muted-foreground">Median first reply: {formatHours(h)}</div>
      {over && <div className="mt-0.5 text-destructive">Over the {REPLY_TARGET_HOURS}h target</div>}
    </div>
  );
}

export function ResponseTimeChart({ months }: { months: MonthPoint[] }) {
  const data = months.map((m) => ({ ...m, hours: m.medianReplyHours ?? 0, hasData: m.medianReplyHours != null }));
  const max = Math.max(...data.map((d) => d.hours), REPLY_TARGET_HOURS);

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            domain={[0, Math.ceil(max * 1.15)]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={38}
            tickFormatter={(v: number) => (v >= 48 ? `${Math.round(v / 24)}d` : `${v}h`)}
          />
          <Tooltip content={<ReplyTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
          <ReferenceLine
            y={REPLY_TARGET_HOURS}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            label={{
              value: `${REPLY_TARGET_HOURS}h target`,
              position: "insideTopRight",
              fill: "hsl(var(--muted-foreground))",
              fontSize: 10,
            }}
          />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.hours > REPLY_TARGET_HOURS ? OVER_TARGET : ON_TARGET} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
