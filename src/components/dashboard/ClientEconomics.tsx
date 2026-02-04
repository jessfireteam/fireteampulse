import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { useClientMonthsData, processClientMonths } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Color palette for clients
const COLORS = [
  "hsl(18, 100%, 60%)",
  "hsl(32, 95%, 55%)",
  "hsl(45, 93%, 47%)",
  "hsl(195, 90%, 55%)",
  "hsl(280, 80%, 60%)",
  "hsl(340, 82%, 60%)",
  "hsl(160, 70%, 50%)",
  "hsl(220, 70%, 60%)",
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ClientEconomics() {
  const [clientFilter, setClientFilter] = useState<string>("all");
  const { data, isLoading, error } = useClientMonthsData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Client Economics" />
        <Skeleton className="h-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Client Economics" />
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load client economics data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const clientMonths = data?.findClientMonths || [];
  const { tableData, chartData, clients } = processClientMonths(clientMonths);

  // Filter table data by client
  const filteredTableData =
    clientFilter === "all"
      ? tableData
      : tableData.filter((item) => item.client === clientFilter);

  // Get clients for chart (limited to avoid clutter)
  const chartClients = clients.slice(0, 8);

  return (
    <div className="space-y-6">
      <SectionHeader title="Client Economics">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48 bg-secondary/50 border-border/50">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client} value={client}>
                {client}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SectionHeader>

      {/* Line Chart */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">
            Cost per Deliverable Over Time
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(217, 33%, 18%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(217, 33%, 18%)" }}
                />
                <YAxis
                  tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 47%, 10%)",
                    border: "1px solid hsl(217, 33%, 18%)",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                  labelStyle={{ color: "hsl(210, 40%, 96%)", fontWeight: 600 }}
                  formatter={(value: number) => [formatCurrency(value), "Cost/Del"]}
                />
                <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
                <ReferenceLine
                  y={1000}
                  stroke="hsl(142, 76%, 45%)"
                  strokeDasharray="5 5"
                  label={{ value: "$1k", fill: "hsl(142, 76%, 45%)", fontSize: 10 }}
                />
                <ReferenceLine
                  y={2000}
                  stroke="hsl(0, 84%, 60%)"
                  strokeDasharray="5 5"
                  label={{ value: "$2k", fill: "hsl(0, 84%, 60%)", fontSize: 10 }}
                />
                {chartClients.map((client, index) => (
                  <Line
                    key={client}
                    type="monotone"
                    dataKey={client}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: COLORS[index % COLORS.length] }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold">Client</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Month</TableHead>
                  <TableHead className="text-right text-muted-foreground font-semibold">
                    Ad Spend
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-semibold">
                    FireTeam Fee
                  </TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold">
                    Deliverables
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-semibold">
                    $/Deliverable
                  </TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTableData.map((item) => (
                    <TableRow key={item.id} className="border-border/50">
                      <TableCell className="font-medium">{item.client}</TableCell>
                      <TableCell className="text-muted-foreground">{item.month}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.totalSpend)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.fireTeamSpend)}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {item.actualDeliverables}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.costPerDeliverable !== null
                          ? formatCurrency(item.costPerDeliverable)
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.flag === "over" && (
                          <Badge className="bg-success/20 text-success hover:bg-success/30">
                            Over-resourced
                          </Badge>
                        )}
                        {item.flag === "under" && (
                          <Badge className="bg-destructive/20 text-destructive hover:bg-destructive/30">
                            Under-resourced
                          </Badge>
                        )}
                        {item.flag === "normal" && (
                          <Badge variant="secondary" className="opacity-50">
                            Normal
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}