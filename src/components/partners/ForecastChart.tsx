// src/components/partners/ForecastChart.tsx
import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { FORECAST_ROLES, type ForecastResult } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

const COLORS: Record<string, string> = {
  Account: "#60a5fa",
  "CD Review": "#f59e0b",
  "AM Review": "#fbbf24",
  Copywriters: "#a78bfa",
  Casting: "#f472b6",
  Design: "#34d399",
  Video: "#fb7185",
};

export function ForecastChart({ result }: { result: ForecastResult }) {
  // Infinite utilization = demand against a zero-capacity role. Pegged to the top of the
  // chart rather than dropped, so the worst state stays visible instead of vanishing.
  const raw = result.months.map((m) => {
    const row: Record<string, number | string> = { label: m.label };
    FORECAST_ROLES.forEach((role) => {
      const u = m.roles[role.key].utilization;
      row[role.key] = Number.isFinite(u) ? Math.round(u * 100) : Number.POSITIVE_INFINITY;
    });
    return row;
  });

  const maxUtil = raw.reduce((max, row) => {
    const rowMax = FORECAST_ROLES.reduce((m, role) => {
      const v = row[role.key] as number;
      return Number.isFinite(v) ? Math.max(m, v) : m;
    }, 0);
    return Math.max(max, rowMax);
  }, 0);
  const domainMax = Math.max(110, Math.ceil((maxUtil + 10) / 10) * 10);
  const data = raw.map((row) => {
    const out: Record<string, number | string> = { label: row.label };
    FORECAST_ROLES.forEach((role) => {
      const v = row[role.key] as number;
      out[role.key] = Number.isFinite(v) ? v : domainMax;
    });
    return out;
  });

  return (
    <div className="space-y-3">
      <SectionHeader title="Projected utilization (% of capacity)" />
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, domainMax]} unit="%" allowDecimals={false} />
            <Tooltip />
            <Legend />
            <ReferenceArea y1={50} y2={75} fill="#10b981" fillOpacity={0.08} />
            <ReferenceArea y1={75} y2={85} fill="#f59e0b" fillOpacity={0.10} />
            <ReferenceArea y1={85} y2={domainMax} fill="#ef4444" fillOpacity={0.10} />
            {/* 100% is the ceiling from the capacity table, not a historical peak. */}
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" label="capacity" />
            {FORECAST_ROLES.map((role) => (
              <Line
                key={role.key}
                type="monotone"
                dataKey={role.key}
                name={role.display}
                stroke={COLORS[role.key]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
