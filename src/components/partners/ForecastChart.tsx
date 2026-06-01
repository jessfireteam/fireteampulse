// src/components/partners/ForecastChart.tsx
import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { FORECAST_ROLES, type ForecastResult } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

const COLORS: Record<string, string> = {
  Account: "#60a5fa",
  "Creative Review": "#f59e0b",
  Copywriters: "#a78bfa",
  Design: "#34d399",
  Video: "#fb7185",
};

export function ForecastChart({ result }: { result: ForecastResult }) {
  const data = result.months.map((m) => {
    const row: Record<string, number | string> = { label: m.label };
    FORECAST_ROLES.forEach((role) => {
      row[role.key] = Math.round(m.roles[role.key].utilization * 100);
    });
    return row;
  });

  return (
    <div className="space-y-3">
      <SectionHeader title="Projected utilization (% of peak)" />
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, "dataMax + 20"]} unit="%" />
            <Tooltip />
            <Legend />
            <ReferenceArea y1={50} y2={75} fill="#10b981" fillOpacity={0.08} />
            <ReferenceArea y1={75} y2={85} fill="#f59e0b" fillOpacity={0.1} />
            <ReferenceArea y1={85} y2={1000} fill="#ef4444" fillOpacity={0.1} />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" label="peak" />
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
