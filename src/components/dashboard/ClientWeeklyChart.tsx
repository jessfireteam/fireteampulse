import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";

interface MonthlyData {
  month: string;
  monthLabel: string;
  costPerDeliverable: number;
  deliverables: number;
  fireTeamSpend: number;
}

interface ClientMonthlyChartProps {
  clientName: string;
  data: MonthlyData[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ClientMonthlyChart({ clientName, data }: ClientMonthlyChartProps) {
  if (data.length === 0) {
    return null;
  }

  // Cap Y-axis at $15,000 to make target band visible
  const Y_AXIS_CAP = 15000;
  const hasClippedValues = data.some((d) => d.costPerDeliverable > Y_AXIS_CAP);

  // Clip data for display
  const displayData = data.map((d) => ({
    ...d,
    displayValue: Math.min(d.costPerDeliverable, Y_AXIS_CAP),
    isClipped: d.costPerDeliverable > Y_AXIS_CAP,
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{clientName}</h3>
          {hasClippedValues && (
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
              * Values above $15k are clipped
            </span>
          )}
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              margin={{ top: 20, right: 30, left: 60, bottom: 40 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(217, 33%, 18%)"
                vertical={false}
              />
              {/* Target range band: $1,000 - $2,000 - semi-transparent green */}
              <ReferenceArea
                y1={1000}
                y2={2000}
                fill="hsl(142, 76%, 36%)"
                fillOpacity={0.25}
                stroke="hsl(142, 76%, 45%)"
                strokeOpacity={0.4}
                strokeDasharray="4 2"
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(217, 33%, 18%)" }}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                domain={[0, Y_AXIS_CAP]}
                ticks={[0, 1000, 2000, 5000, 10000, 15000]}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(222, 47%, 10%)",
                  border: "1px solid hsl(217, 33%, 18%)",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "13px",
                }}
                labelStyle={{ color: "hsl(210, 40%, 96%)", fontWeight: 600, marginBottom: 4 }}
                formatter={(value: number, name: string, props: { payload: { costPerDeliverable: number; isClipped: boolean } }) => {
                  // Show actual value in tooltip, not clipped
                  const actualValue = props.payload.costPerDeliverable;
                  return [formatCurrency(actualValue), "$/Deliverable"];
                }}
                labelFormatter={(label) => label}
              />
              <Bar
                dataKey="displayValue"
                fill="hsl(25, 95%, 53%)"
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-4 w-8 rounded-sm bg-[hsl(142,76%,36%)]/25 border border-[hsl(142,76%,45%)]/40 border-dashed" />
            <span>Target zone ($1k-$2k/deliverable)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-sm bg-[hsl(25,95%,53%)]" />
            <span>Actual $/Deliverable</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
