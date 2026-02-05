import { LineChart, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendSparklineProps {
  data: number[]; // 5 weeks of data, oldest to newest
  className?: string;
}

export function TrendSparkline({ data, className }: TrendSparklineProps) {
  const chartData = data.map((value, index) => ({ week: index, value }));
  const total = data.reduce((sum, v) => sum + v, 0);
  
  // Calculate trend direction
  const recentAvg = (data[3] + data[4]) / 2; // Last 2 weeks
  const olderAvg = (data[0] + data[1] + data[2]) / 3; // First 3 weeks
  
  const getTrendInfo = () => {
    if (olderAvg === 0 && recentAvg === 0) return { direction: "flat", color: "text-muted-foreground" };
    if (olderAvg === 0) return { direction: "up", color: "text-emerald-500" };
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (change > 15) return { direction: "up", color: "text-emerald-500" };
    if (change < -15) return { direction: "down", color: "text-rose-500" };
    return { direction: "flat", color: "text-muted-foreground" };
  };
  
  const { direction, color } = getTrendInfo();
  
  // If no data, show dash
  if (total === 0) {
    return (
      <div className={cn("flex items-center justify-center gap-1", className)}>
        <Minus className="h-3 w-3 text-muted-foreground/50" />
      </div>
    );
  }
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="w-16 h-6">
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
      {direction === "up" && <TrendingUp className={cn("h-3 w-3", color)} />}
      {direction === "down" && <TrendingDown className={cn("h-3 w-3", color)} />}
      {direction === "flat" && <Minus className={cn("h-3 w-3", color)} />}
    </div>
  );
}
