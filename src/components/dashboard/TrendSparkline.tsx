import { LineChart, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Minus } from "lucide-react";

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
  
  const getTrendColor = () => {
    if (olderAvg === 0 && recentAvg === 0) return "text-muted-foreground";
    if (olderAvg === 0) return "text-emerald-500";
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (change > 15) return "text-emerald-500";
    if (change < -15) return "text-rose-500";
    return "text-muted-foreground";
  };
  
  const color = getTrendColor();
  
  // If no data, show dash
  if (total === 0) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <Minus className="h-3 w-3 text-muted-foreground/50" />
      </div>
    );
  }
  
  return (
    <div className={cn("flex items-center justify-center", className)}>
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
  );
}
