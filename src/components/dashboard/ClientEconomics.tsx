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
import { useClientMonthsData } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientMonthlyChart } from "./ClientWeeklyChart";
import { format, parseISO } from "date-fns";

// Process ClientMonths using Fibery's pre-calculated costPerDeliverable
function processClientEconomicsData(
  clientMonths: Array<{
    id: string;
    name: string;
    client: { name: string } | null;
    totalSpend: number | null;
    fireTeamSpend: number | null;
    pricingPlanMonths: Array<{
      revenue: number | null;
      costPerDeliverable: number | null;
      deliverablesShipped: number | null;
    }> | null;
  }>
) {
  const now = new Date();
  const currentMonthStr = format(now, "yyyy-MM");

  const processed: Array<{
    client: string;
    month: string;
    deliverables: number;
    revenue: number;
    costPerDeliverable: number;
  }> = [];

  clientMonths.forEach((cm) => {
    // Extract month from name (format: "2026-01 - ClientName")
    const monthMatch = cm.name?.match(/^(\d{4}-\d{2})/);
    const monthStr = monthMatch ? monthMatch[1] : "";
    const clientName = cm.client?.name || "Unknown";

    // Skip future months or invalid data
    if (!monthStr || monthStr > currentMonthStr) return;

    // Get data from pricingPlanMonths relationship
    const ppm = cm.pricingPlanMonths?.[0];
    if (!ppm) return;

    const costPerDeliverable = ppm.costPerDeliverable || 0;
    const deliverables = ppm.deliverablesShipped || 0;
    const revenue = ppm.revenue || 0;

    // Debug logging
    console.log('[Economics] Fibery Data:', clientName, monthStr,
      'Revenue:', revenue,
      'Deliverables:', deliverables,
      '$/Deliverable:', costPerDeliverable);

    // Only include if we have valid cost per deliverable
    if (costPerDeliverable > 0) {
      processed.push({
        client: clientName,
        month: monthStr,
        deliverables,
        revenue,
        costPerDeliverable,
      });
    }
  });

  // Sort by month descending
  processed.sort((a, b) => b.month.localeCompare(a.month));

  console.log('[Economics] Processed data:', processed.slice(0, 10));

  return processed;
}

// Group data by client for charts
function groupByClient(
  data: Array<{
    client: string;
    month: string;
    deliverables: number;
    revenue: number;
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
      fireTeamSpend: item.revenue, // Using revenue as the fee
    });
  });

  // Sort each client's data chronologically
  Object.keys(clientData).forEach((client) => {
    clientData[client].sort((a, b) => a.month.localeCompare(b.month));
  });

  return clientData;
}

// Active clients list - clients with ongoing work (matching actual data names)
const ACTIVE_CLIENTS = [
  "Rejuvia",
  "FabFitFun",
  "Bambu Earth",
  "Adapt Naturals",
  "After.com",
  "Paperlike",
  "OMGYES",
  "Nutrisense",
  "NOBL Travel",
];

export function ClientEconomics() {
  const [clientFilter, setClientFilter] = useState<string>("active");
  const { data: clientMonthsData, isLoading, error } = useClientMonthsData();

  // Process using Fibery's pre-calculated data
  const combinedData = useMemo(() => {
    if (!clientMonthsData?.findClientMonths) return [];
    return processClientEconomicsData(clientMonthsData.findClientMonths);
  }, [clientMonthsData]);

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

  // Debug: log all available client names
  console.log('[Economics] Available clients:', allClients);
  console.log('[Economics] ACTIVE_CLIENTS list:', ACTIVE_CLIENTS);

  // Filter clients for display - use case-insensitive matching
  const displayClients = useMemo(() => {
    if (clientFilter === "active") {
      const activeClientsLower = ACTIVE_CLIENTS.map(c => c.toLowerCase());
      const filtered = sortedClients.filter((c) => 
        activeClientsLower.includes(c.client.toLowerCase())
      );
      console.log('[Economics] Active filter result:', filtered.map(c => c.client));
      return filtered;
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
            <SelectItem value="active">Active Clients</SelectItem>
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
