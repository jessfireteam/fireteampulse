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
import { usePacingData, PacingDayPoint } from "@/hooks/usePacingData";
import { Skeleton } from "@/components/ui/skeleton";

const COLOR = "hsl(22, 77%, 70%)"; // salmon/orange for both

interface SinglePacingChartProps {
  title: string;
  data: PacingDayPoint[];
  currentKey: keyof PacingDayPoint;
  previousKey: keyof PacingDayPoint;
  currentMonthLabel: string;
  previousMonthLabel: string;
}

function SinglePacingChart({
  title,
  data,
  currentKey,
  previousKey,
  currentMonthLabel,
  previousMonthLabel,
}: SinglePacingChartProps) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {title}
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(0, 0%, 22%)"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(0, 0%, 22%)" }}
              />
              <YAxis
                tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
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
                    [currentKey]: currentMonthLabel,
                    [previousKey]: previousMonthLabel,
                  };
                  return [value, labels[name] || name];
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: "12px" }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    [currentKey]: currentMonthLabel,
                    [previousKey]: previousMonthLabel,
                  };
                  return labels[value] || value;
                }}
              />
              {/* Current month — solid */}
              <Line
                type="monotone"
                dataKey={currentKey}
                stroke={COLOR}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: COLOR }}
              />
              {/* Previous month — dashed */}
              <Line
                type="monotone"
                dataKey={previousKey}
                stroke={COLOR}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeOpacity={0.4}
                dot={false}
                activeDot={{ r: 3, fill: COLOR, fillOpacity: 0.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function PacingChart() {
  const { points, currentMonthLabel, previousMonthLabel, isLoading, error } = usePacingData();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
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
    <div className="grid gap-4 sm:grid-cols-2">
      <SinglePacingChart
        title="Projects Created"
        data={points}
        currentKey="createdCurrent"
        previousKey="createdPrevious"
        currentMonthLabel={currentMonthLabel}
        previousMonthLabel={previousMonthLabel}
      />
      <SinglePacingChart
        title="Projects Shipped"
        data={points}
        currentKey="shippedCurrent"
        previousKey="shippedPrevious"
        currentMonthLabel={currentMonthLabel}
        previousMonthLabel={previousMonthLabel}
      />
    </div>
  );
}
