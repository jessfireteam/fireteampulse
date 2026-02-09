import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { Minus } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CreatorPayment } from "@/hooks/useCreatorCostsData";
import { format, parseISO } from "date-fns";

interface CreatorSparklineProps {
  payments: CreatorPayment[];
  className?: string;
}

function formatDollars(value: number): string {
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function CreatorSparkline({ payments, className }: CreatorSparklineProps) {
  if (payments.length === 0) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <Minus className="h-3 w-3 text-muted-foreground/50" />
      </div>
    );
  }

  const chartData = payments.map((p, i) => ({
    index: i,
    amount: p.amount,
    date: p.date,
    client: p.client,
    label: format(parseISO(p.date), "MMM d"),
    fullDate: format(parseISO(p.date), "MMM d, yyyy"),
  }));

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className={cn("flex items-center justify-center cursor-pointer", className)}>
          <div className="w-24 h-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(22, 77%, 70%)"
                  strokeWidth={1.5}
                  dot={false}
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
            <h4 className="text-sm font-semibold text-foreground">Payment History</h4>
            <span className="text-xs text-muted-foreground">{payments.length} payments</span>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 22%)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(0, 0%, 22%)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "hsl(234, 28%, 66%)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={45}
                />
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload;
                    return (
                      <div
                        style={{
                          backgroundColor: "hsl(0, 0%, 16%)",
                          border: "1px solid hsl(0, 0%, 22%)",
                          borderRadius: "6px",
                          padding: "8px 12px",
                          fontSize: "12px",
                        }}
                      >
                        <p style={{ color: "hsl(0, 0%, 89%)", fontWeight: 600 }}>{d.fullDate}</p>
                        <p style={{ color: "hsl(22, 77%, 70%)" }}>{formatDollars(d.amount)}</p>
                        <p style={{ color: "hsl(234, 28%, 66%)" }}>{d.client}</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(22, 77%, 70%)"
                  strokeWidth={2}
                  dot={{ fill: "hsl(22, 77%, 70%)", strokeWidth: 0, r: 3 }}
                  activeDot={{ fill: "hsl(22, 77%, 70%)", strokeWidth: 2, stroke: "hsl(0, 0%, 14%)", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
            <span>Total: {formatDollars(payments.reduce((s, p) => s + p.amount, 0))}</span>
            <span>Avg: {formatDollars(payments.reduce((s, p) => s + p.amount, 0) / payments.length)}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
