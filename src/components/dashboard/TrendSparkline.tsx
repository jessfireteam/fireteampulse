import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { Minus } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { format, subWeeks, startOfWeek } from "date-fns";

interface TrendSparklineProps {
  data: number[]; // 8 weeks of data, oldest to newest (week -8 to week -1)
  maxWeek26?: number; // highest single-week completions over last 26 weeks
  className?: string;
}

// Use current date dynamically

export function TrendSparkline({ data, maxWeek26, className }: TrendSparklineProps) {
  const total = data.reduce((sum, v) => sum + v, 0);
  
  // Calculate week dates for each data point
  const chartData = data.map((value, index) => {
    const weeksAgo = data.length - index; // index 0 = oldest, last index = 1 week ago
    const weekStart = startOfWeek(subWeeks(new Date(), weeksAgo), { weekStartsOn: 1 });
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
    return {
      week: index,
      value,
      weekLabel: `${format(weekStart, "MMM d")}-${format(weekEnd, "d")}`,
      fullDate: `${format(weekStart, "MMM d")}–${format(weekEnd, "MMM d, yyyy")}`,
    };
  });
  
  // Calculate trend direction
  const len = data.length;
  const recentAvg = (data[len - 2] + data[len - 1]) / 2; // Last 2 weeks
  const olderSlice = data.slice(0, len - 2);
  const olderAvg = olderSlice.length > 0 ? olderSlice.reduce((s, v) => s + v, 0) / olderSlice.length : 0;
  
  const getTrendColor = () => {
    if (olderAvg === 0 && recentAvg === 0) return "text-muted-foreground";
    if (olderAvg === 0) return "text-emerald-500";
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (change > 15) return "text-emerald-500";
    if (change < -15) return "text-rose-500";
    return "text-muted-foreground";
  };
  
  const getStrokeColor = () => {
    if (olderAvg === 0 && recentAvg === 0) return "hsl(215, 20%, 55%)";
    if (olderAvg === 0) return "hsl(160, 70%, 50%)";
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (change > 15) return "hsl(160, 70%, 50%)";
    if (change < -15) return "hsl(350, 80%, 60%)";
    return "hsl(215, 20%, 55%)";
  };
  
  const color = getTrendColor();
  const strokeColor = getStrokeColor();
  
  // If no data, show dash
  if (total === 0) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <Minus className="h-3 w-3 text-muted-foreground/50" />
      </div>
    );
  }
  
  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className={cn("flex items-center justify-center cursor-pointer", className)}>
          <div className="w-24 h-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  dot={false}
                  className={color}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent 
        className="w-80 p-4 bg-card border-border/50"
        side="bottom"
        align="center"
        sideOffset={8}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Weekly Completions</h4>
            <span className="text-xs text-muted-foreground">Last {data.length} weeks</span>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="hsl(217, 33%, 18%)" 
                  vertical={false} 
                />
                <XAxis
                  dataKey="weekLabel"
                  tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(217, 33%, 18%)" }}
                />
                <YAxis
                  tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 47%, 10%)",
                    border: "1px solid hsl(217, 33%, 18%)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                  }}
                  labelStyle={{ color: "hsl(210, 40%, 96%)", fontWeight: 600, marginBottom: 4 }}
                  formatter={(value: number) => [`${value} completed`, ""]}
                  labelFormatter={(_, payload) => {
                    if (payload && payload[0]) {
                      return payload[0].payload.fullDate;
                    }
                    return "";
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={strokeColor}
                  strokeWidth={2}
                  dot={{ fill: strokeColor, strokeWidth: 0, r: 4 }}
                  activeDot={{ fill: strokeColor, strokeWidth: 2, stroke: "hsl(222, 47%, 10%)", r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
            <span>Total: {total} items</span>
            <span>Avg: {(total / data.length).toFixed(1)} / week</span>
            {maxWeek26 !== undefined && <span>Peak: {maxWeek26} / week</span>}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
