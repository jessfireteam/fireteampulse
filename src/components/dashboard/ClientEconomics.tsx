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
import { useClientMonthsData, useProjectsData, processClientMonths } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClientWeeklyChart } from "./ClientWeeklyChart";
import { startOfWeek, format, parseISO, subMonths } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Process projects into weekly $/deliverable per client
function processProjectsForWeeklyEconomics(
  projects: Array<{
    id: string;
    name: string;
    doneDate: string | null;
    client: { name: string } | null;
  }>,
  clientMonthFees: Map<string, number> // Map of "ClientName-YYYY-MM" -> fireTeamSpend
) {
  const now = new Date();
  const sixMonthsAgo = subMonths(now, 6);

  // Group projects by client and week
  const clientWeeklyData: Record<
    string,
    Record<string, { deliverables: number; week: string }>
  > = {};

  projects.forEach((project) => {
    if (!project.doneDate || !project.client?.name) return;

    const doneDate = parseISO(project.doneDate);
    if (doneDate < sixMonthsAgo || doneDate > now) return;

    const clientName = project.client.name;
    const weekStart = startOfWeek(doneDate, { weekStartsOn: 1 });
    const weekKey = format(weekStart, "yyyy-MM-dd");

    if (!clientWeeklyData[clientName]) {
      clientWeeklyData[clientName] = {};
    }
    if (!clientWeeklyData[clientName][weekKey]) {
      clientWeeklyData[clientName][weekKey] = { deliverables: 0, week: weekKey };
    }
    clientWeeklyData[clientName][weekKey].deliverables++;
  });

  // Calculate weekly fee by distributing monthly fee across weeks
  // For simplicity, we'll divide monthly fee by 4.33 (avg weeks per month)
  const result: Record<
    string,
    Array<{
      week: string;
      weekLabel: string;
      costPerDeliverable: number;
      deliverables: number;
      fee: number;
    }>
  > = {};

  Object.entries(clientWeeklyData).forEach(([clientName, weeks]) => {
    const weeklyArray = Object.entries(weeks)
      .map(([weekKey, data]) => {
        // Get the month for this week to find the fee
        const weekDate = parseISO(weekKey);
        const monthKey = `${clientName}-${format(weekDate, "yyyy-MM")}`;
        const monthlyFee = clientMonthFees.get(monthKey) || 0;
        const weeklyFee = monthlyFee / 4.33; // Approximate weeks per month

        const costPerDeliverable =
          data.deliverables > 0 ? weeklyFee / data.deliverables : 0;

        return {
          week: weekKey,
          weekLabel: format(weekDate, "MMM d"),
          costPerDeliverable,
          deliverables: data.deliverables,
          fee: weeklyFee,
        };
      })
      .filter((d) => d.deliverables > 0)
      .sort((a, b) => a.week.localeCompare(b.week));

    if (weeklyArray.length > 0) {
      result[clientName] = weeklyArray;
    }
  });

  return result;
}

export function ClientEconomics() {
  const [clientFilter, setClientFilter] = useState<string>("top5");
  const { data: clientMonthsData, isLoading: loadingMonths, error: errorMonths } = useClientMonthsData();
  const { data: projectsData, isLoading: loadingProjects, error: errorProjects } = useProjectsData();

  const isLoading = loadingMonths || loadingProjects;
  const error = errorMonths || errorProjects;

  // Process data
  const { tableData, clients: allClients, clientMonthFees } = useMemo(() => {
    if (!clientMonthsData?.findClientMonths) {
      return { tableData: [], clients: [], clientMonthFees: new Map<string, number>() };
    }

    const processed = processClientMonths(clientMonthsData.findClientMonths);
    
    // Build a map of client-month -> fireTeamSpend
    const feeMap = new Map<string, number>();
    processed.tableData.forEach((item) => {
      const key = `${item.client}-${item.month}`;
      feeMap.set(key, item.fireTeamSpend);
    });

    return {
      tableData: processed.tableData,
      clients: processed.clients,
      clientMonthFees: feeMap,
    };
  }, [clientMonthsData]);

  // Process weekly economics
  const weeklyEconomics = useMemo(() => {
    if (!projectsData?.findProjects) return {};
    return processProjectsForWeeklyEconomics(projectsData.findProjects, clientMonthFees);
  }, [projectsData, clientMonthFees]);

  // Get clients sorted by total deliverables (top 5)
  const sortedClients = useMemo(() => {
    return Object.entries(weeklyEconomics)
      .map(([client, data]) => ({
        client,
        totalDeliverables: data.reduce((sum, d) => sum + d.deliverables, 0),
        data,
      }))
      .sort((a, b) => b.totalDeliverables - a.totalDeliverables);
  }, [weeklyEconomics]);

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
      <SectionHeader title="Client Economics (Weekly)">
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
                No weekly data available for selected clients
              </p>
            </CardContent>
          </Card>
        ) : (
          displayClients.map(({ client, data }) => (
            <ClientWeeklyChart key={client} clientName={client} data={data} />
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