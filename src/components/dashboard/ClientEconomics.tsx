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
import { useClientMonthsData, useProjectsData } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientMonthlyChart } from "./ClientWeeklyChart";
import { format, parseISO, subMonths } from "date-fns";

// Count deliverables from Projects endpoint by client + month
function countDeliverablesFromProjects(
  projects: Array<{
    id: string;
    name: string;
    doneDate: string | null;
    client: { name: string } | null;
  }>
) {
  const deliverablesByClientMonth: Record<string, number> = {};
  const now = new Date();
  const twelveMonthsAgo = subMonths(now, 12);

  projects.forEach((p) => {
    if (!p.doneDate || !p.client?.name) return;
    
    const doneDate = new Date(p.doneDate);
    // Only count projects from the last 12 months
    if (doneDate < twelveMonthsAgo || doneDate > now) return;

    const month = p.doneDate.substring(0, 7); // "2026-01"
    const key = `${p.client.name}-${month}`;
    deliverablesByClientMonth[key] = (deliverablesByClientMonth[key] || 0) + 1;
  });

  console.log('[Economics] Deliverables from Projects:', deliverablesByClientMonth);
  return deliverablesByClientMonth;
}

// Join Projects deliverables with Stats fee data
function processClientEconomicsData(
  clientMonths: Array<{
    id: string;
    name: string;
    client: { name: string } | null;
    month: { name: string } | null;
    fireTeamSpend: number | null;
    totalSpend: number | null;
  }>,
  deliverablesByClientMonth: Record<string, number>
) {
  const now = new Date();
  const currentMonthStr = format(now, "yyyy-MM");

  // Build a map of client-month -> fireTeamSpend
  const feesByClientMonth: Record<string, number> = {};
  clientMonths.forEach((cm) => {
    const monthMatch = cm.name?.match(/^(\d{4}-\d{2})/);
    const monthStr = monthMatch ? monthMatch[1] : cm.month?.name || "";
    const clientName = cm.client?.name || "Unknown";
    
    if (monthStr && monthStr <= currentMonthStr) {
      const key = `${clientName}-${monthStr}`;
      feesByClientMonth[key] = cm.fireTeamSpend || 0;
      
      // Debug: show what values we're using
      console.log('[Economics] Fee Data:', clientName, monthStr, 
        'fireTeamSpend:', cm.fireTeamSpend, 
        'totalSpend:', cm.totalSpend);
    }
  });

  console.log('[Economics] Fees from Stats:', feesByClientMonth);

  // Combine: get all unique client-month keys
  const allKeys = new Set([
    ...Object.keys(deliverablesByClientMonth),
    ...Object.keys(feesByClientMonth),
  ]);

  const combined: Array<{
    client: string;
    month: string;
    deliverables: number;
    fireTeamSpend: number;
    costPerDeliverable: number;
  }> = [];

  allKeys.forEach((key) => {
    const [client, month] = [
      key.substring(0, key.lastIndexOf("-")),
      key.substring(key.lastIndexOf("-") - 4, key.lastIndexOf("-") + 3),
    ];
    
    // Parse the key properly: "ClientName-2026-01" -> client = "ClientName", month = "2026-01"
    const parts = key.split("-");
    const monthPart = `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
    const clientPart = parts.slice(0, -2).join("-");

    const deliverables = deliverablesByClientMonth[key] || 0;
    const fireTeamSpend = feesByClientMonth[key] || 0;
    const costPerDeliverable = deliverables > 0 ? fireTeamSpend / deliverables : 0;

    // Only include if we have both deliverables and fee data
    if (deliverables > 0 && fireTeamSpend > 0) {
      console.log('[Economics] Combined:', clientPart, monthPart, 
        'Fee:', fireTeamSpend, 'Deliverables:', deliverables, 
        '$/Deliverable:', costPerDeliverable);
      
      combined.push({
        client: clientPart,
        month: monthPart,
        deliverables,
        fireTeamSpend,
        costPerDeliverable,
      });
    }
  });

  // Sort by month descending
  combined.sort((a, b) => b.month.localeCompare(a.month));

  console.log('[Economics] Combined data:', combined.slice(0, 10));

  return combined;
}

// Group data by client for charts
function groupByClient(
  data: Array<{
    client: string;
    month: string;
    deliverables: number;
    fireTeamSpend: number;
    costPerDeliverable: number;
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

  data.forEach((item) => {
    if (!clientData[item.client]) {
      clientData[item.client] = [];
    }

    let monthLabel = item.month;
    try {
      monthLabel = format(parseISO(`${item.month}-01`), "MMM yy");
    } catch {
      // Keep original
    }

    clientData[item.client].push({
      month: item.month,
      monthLabel,
      costPerDeliverable: item.costPerDeliverable,
      deliverables: item.deliverables,
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
  const { data: clientMonthsData, isLoading: loadingMonths, error: errorMonths } = useClientMonthsData();
  const { data: projectsData, isLoading: loadingProjects, error: errorProjects } = useProjectsData();

  const isLoading = loadingMonths || loadingProjects;
  const error = errorMonths || errorProjects;

  // Count deliverables from Projects
  const deliverablesByClientMonth = useMemo(() => {
    if (!projectsData?.findProjects) return {};
    return countDeliverablesFromProjects(projectsData.findProjects);
  }, [projectsData]);

  // Combine with fee data
  const combinedData = useMemo(() => {
    if (!clientMonthsData?.findClientMonths) return [];
    return processClientEconomicsData(
      clientMonthsData.findClientMonths,
      deliverablesByClientMonth
    );
  }, [clientMonthsData, deliverablesByClientMonth]);

  // Group by client
  const clientChartData = useMemo(() => {
    return groupByClient(combinedData);
  }, [combinedData]);

  // Get clients sorted by total deliverables
  const sortedClients = useMemo(() => {
    return Object.entries(clientChartData)
      .map(([client, data]) => ({
        client,
        totalDeliverables: data.reduce((sum, d) => sum + d.deliverables, 0),
        data,
      }))
      .sort((a, b) => b.totalDeliverables - a.totalDeliverables);
  }, [clientChartData]);

  const allClients = sortedClients.map((c) => c.client);

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Client Economics" />
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
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
      <SectionHeader title="Client Economics ($/Deliverable)">
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
    </div>
  );
}
