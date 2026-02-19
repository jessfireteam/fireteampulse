import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Cell,
} from "recharts";

interface ClientChartData {
  client: string;
  data: Array<{
    month: string;
    costPerDeliverable: number;
    flag: "over" | "normal" | "under";
  }>;
}

interface ClientSmallMultiplesProps {
  chartData: Array<{
    month: string;
    [client: string]: string | number;
  }>;
  tableData: Array<{
    client: string;
    month: string;
    costPerDeliverable: number | null;
    flag: "over" | "normal" | "under" | null;
  }>;
  clients: string[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getBarColor(flag: "over" | "normal" | "under" | null): string {
  switch (flag) {
    case "over":
      return "hsl(142, 76%, 45%)"; // Green
    case "under":
      return "hsl(0, 84%, 60%)"; // Red
    default:
      return "hsl(215, 20%, 55%)"; // Gray
  }
}

export function ClientSmallMultiples({ tableData, clients }: ClientSmallMultiplesProps) {
  // Group data by client
  const clientCharts: ClientChartData[] = clients
    .map((client) => {
      const clientData = tableData
        .filter((item) => item.client === client && item.costPerDeliverable !== null)
        .map((item) => ({
          month: item.month,
          costPerDeliverable: item.costPerDeliverable!,
          flag: item.flag || "normal",
        }))
        // Sort chronologically for the chart
        .sort((a, b) => a.month.localeCompare(b.month));

      return {
        client,
        data: clientData,
      };
    })
    .filter((c) => c.data.length > 0); // Only show clients with data

  if (clientCharts.length === 0) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No client data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {clientCharts.map(({ client, data }) => (
        <Card key={client} className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <h4 className="mb-3 truncate text-sm font-medium" title={client}>
              {client}
            </h4>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  margin={{ top: 10, right: 5, left: 5, bottom: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(217, 33%, 18%)"
                    vertical={false}
                  />
                  {/* Target range band */}
                  <ReferenceArea
                    y1={1000}
                    y2={2000}
                    fill="hsl(215, 20%, 55%)"
                    fillOpacity={0.15}
                  />
                  <ReferenceLine
                    y={1000}
                    stroke="hsl(142, 76%, 45%)"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                  <ReferenceLine
                    y={2000}
                    stroke="hsl(0, 84%, 60%)"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 9 }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(217, 33%, 18%)" }}
                    angle={-45}
                    textAnchor="end"
                    height={40}
                    tickFormatter={(value) => {
                      // "2025-01" -> "Jan '25"
                      try {
                        const [year, month] = value.split("-");
                        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                        return `${months[parseInt(month, 10) - 1]} '${year.slice(2)}`;
                      } catch {
                        return value;
                      }
                    }}
                  />
                  <YAxis
                    tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    domain={[0, "auto"]}
                    width={35}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(222, 47%, 10%)",
                      border: "1px solid hsl(217, 33%, 18%)",
                      borderRadius: "8px",
                      padding: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "hsl(210, 40%, 96%)", fontWeight: 600 }}
                    formatter={(value: number) => [formatCurrency(value), "$/Del"]}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="costPerDeliverable" radius={[2, 2, 0, 0]}>
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.flag)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}