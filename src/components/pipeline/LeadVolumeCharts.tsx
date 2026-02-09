import { MonthlyLeadVolume, WeeklyLeadVolume } from "@/hooks/usePipelineData";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Props {
  monthlyVolume: MonthlyLeadVolume[];
  weeklyVolume: WeeklyLeadVolume[];
  avgPerMonth: number;
  avgPerWeek: number;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-popover px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">{payload[0].value} lead{payload[0].value !== 1 ? "s" : ""}</p>
    </div>
  );
}

export function LeadVolumeCharts({ monthlyVolume, weeklyVolume, avgPerMonth, avgPerWeek }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Leads per Month</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyVolume} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 22%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "hsl(234 28% 66%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(234 28% 66%)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTooltip />} cursor={false} />
                <Bar dataKey="count" fill="hsl(22 77% 70%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Leads per Week</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyVolume} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 22%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "hsl(234 28% 66%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(234 28% 66%)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTooltip />} cursor={false} />
                <Bar dataKey="count" fill="hsl(22 77% 70%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Avg {avgPerMonth} leads/month — Avg {avgPerWeek} leads/week
      </p>
    </div>
  );
}
