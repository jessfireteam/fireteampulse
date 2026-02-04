import { useState, useMemo } from "react";
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
import { useClientMonthsData, processClientMonths } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClientMonthlyChart } from "./ClientWeeklyChart";
import { format, parseISO } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Process table data into monthly chart data per client
function processForMonthlyCharts(
  tableData: Array<{
    client: string;
    month: string;
    costPerDeliverable: number | null;
    actualDeliverables: number;
    fireTeamSpend: number;
  }>
) {
  const clientData: Record<
    string,
    Array<{
      month: string;
      monthLabel: string;
      costPerDeliverable: number;
      deliverables: number;
      fireTeamSpend: number;
    }>
  > = {};

  tableData.forEach((item) => {
    if (!item.month || item.costPerDeliverable === null || item.costPerDeliverable === 0) return;

    const clientName = item.client;
    if (!clientData[clientName]) {
      clientData[clientName] = [];
    }

    // Parse month for label
    let monthLabel = item.month;
    try {
      monthLabel = format(parseISO(`${item.month}-01`), "MMM yy");
    } catch {
      // Keep original if parsing fails
    }

    clientData[clientName].push({
      month: item.month,
      monthLabel,
      costPerDeliverable: item.costPerDeliverable,
      deliverables: item.actualDeliverables,
      fireTeamSpend: item.fireTeamSpend,
    });
  });

  // Sort each client's data chronologically
  Object.keys(clientData).forEach((client) => {
    clientData[client].sort((a, b) => a.month.localeCompare(b.month));
  });

  return clientData;
}

export function ClientEconomics() {
  const [clientFilter, setClientFilter] = useState<string>("top5");
  const { data: clientMonthsData, isLoading, error } = useClientMonthsData();

  // Process data
  const { tableData, clients: allClients } = useMemo(() => {
    if (!clientMonthsData?.findClientMonths) {
      return { tableData: [], clients: [] };
    }
    return processClientMonths(clientMonthsData.findClientMonths);
  }, [clientMonthsData]);

  // Process for monthly charts - uses the SAME data as the table
  const monthlyChartData = useMemo(() => {
    return processForMonthlyCharts(tableData);
  }, [tableData]);

  // Get clients sorted by total deliverables
  const sortedClients = useMemo(() => {
    return Object.entries(monthlyChartData)
      .map(([client, data]) => ({
        client,
        dataPoints: data.length,
        totalDeliverables: data.reduce((sum, d) => sum + d.deliverables, 0),
        data,
      }))
      .sort((a, b) => b.totalDeliverables - a.totalDeliverables);
  }, [monthlyChartData]);

  // Filter clients for display
  const displayClients = useMemo(() => {
    if (clientFilter === "top5") {
      return sortedClients.slice(0, 5);
    } else if (clientFilter === "all") {
      return sortedClients;
    } else {
      return sortedClients.filter((c) => c.client === clientFilter);
    }
  }, [sortedClients, clientFilter]);

  // Filter table data
  const filteredTableData = useMemo(() => {
    if (clientFilter === "top5") {
      const top5Names = sortedClients.slice(0, 5).map((c) => c.client);
      return tableData.filter((item) => top5Names.includes(item.client));
    } else if (clientFilter === "all") {
      return tableData;
    } else {
      return tableData.filter((item) => item.client === clientFilter);
    }
  }, [tableData, clientFilter, sortedClients]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Client Economics" />
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
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

  return (
    <div className="space-y-6">
      <SectionHeader title="Client Economics (Monthly $/Deliverable)">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48 bg-secondary/50 border-border/50">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top5">Top 5 Clients</SelectItem>
            <SelectItem value="all">All Clients</SelectItem>
            {allClients.map((client) => (
              <SelectItem key={client} value={client}>
                {client}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SectionHeader>

      {/* Full-width stacked charts - one per client */}
      <div className="space-y-6">
        {displayClients.length === 0 ? (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">
                No data available for selected clients
              </p>
            </CardContent>
          </Card>
        ) : (
          displayClients.map(({ client, data }) => (
            <ClientMonthlyChart key={client} clientName={client} data={data} />
          ))
        )}
      </div>

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
