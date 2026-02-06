import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { usePacingData } from "@/hooks/usePacingData";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = {
  createdCurrent: "hsl(22, 77%, 70%)",   // salmon/orange
  shippedCurrent: "hsl(148, 58%, 72%)",   // green/teal
  createdPrevious: "hsl(22, 77%, 70%)",
  shippedPrevious: "hsl(148, 58%, 72%)",
};

export function PacingChart() {
  const { points, currentMonthLabel, previousMonthLabel, isLoading, error } = usePacingData();

  if (isLoading) {
    return <Skeleton className="h-80" />;
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load pacing data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          Monthly Pacing — Created & Shipped
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(0, 0%, 22%)"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(0, 0%, 22%)" }}
                label={{ value: "Day of month", position: "insideBottomRight", offset: -5, fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: "hsl(0, 0%, 100%)", strokeOpacity: 0.1 }}
                contentStyle={{
                  backgroundColor: "hsl(0, 0%, 14%)",
                  border: "1px solid hsl(0, 0%, 22%)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
                labelStyle={{ color: "hsl(0, 0%, 89%)", fontWeight: 600 }}
                labelFormatter={(day) => `Day ${day}`}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    createdCurrent: `Created (${currentMonthLabel})`,
                    shippedCurrent: `Shipped (${currentMonthLabel})`,
                    createdPrevious: `Created (${previousMonthLabel})`,
                    shippedPrevious: `Shipped (${previousMonthLabel})`,
                  };
                  return [value, labels[name] || name];
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: "16px" }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    createdCurrent: `Created (${currentMonthLabel})`,
                    shippedCurrent: `Shipped (${currentMonthLabel})`,
                    createdPrevious: `Created (${previousMonthLabel})`,
                    shippedPrevious: `Shipped (${previousMonthLabel})`,
                  };
                  return labels[value] || value;
                }}
              />
              {/* Current month — solid lines */}
              <Line
                type="monotone"
                dataKey="createdCurrent"
                stroke={COLORS.createdCurrent}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: COLORS.createdCurrent }}
              />
              <Line
                type="monotone"
                dataKey="shippedCurrent"
                stroke={COLORS.shippedCurrent}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: COLORS.shippedCurrent }}
              />
              {/* Previous month — dashed lines */}
              <Line
                type="monotone"
                dataKey="createdPrevious"
                stroke={COLORS.createdPrevious}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeOpacity={0.45}
                dot={false}
                activeDot={{ r: 3, fill: COLORS.createdPrevious, fillOpacity: 0.5 }}
              />
              <Line
                type="monotone"
                dataKey="shippedPrevious"
                stroke={COLORS.shippedPrevious}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeOpacity={0.45}
                dot={false}
                activeDot={{ r: 3, fill: COLORS.shippedPrevious, fillOpacity: 0.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
