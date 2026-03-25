import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useClientMonthsData } from "@/hooks/useFiberyData";
import { useProcessedClientWeeks } from "@/hooks/useClientWeeksData";
import { useDeliverablesData } from "@/hooks/useDeliverablesData";
import { useExpensesData } from "@/hooks/useExpensesData";
import { Skeleton } from "@/components/ui/skeleton";
import { CostPerDeliverableChart, MonthlyData } from "./CostPerDeliverableChart";
import { AdSpendChart } from "./AdSpendChart";
import { DeliverablesChart } from "./DeliverablesChart";
import { CreatorCostsChart } from "./CreatorCostsChart";
import { queryFibery, ClientsResponse } from "@/lib/fibery";
import { format, parseISO } from "date-fns";

function useClientsData() {
  return useQuery({
    queryKey: ["fibery-clients"],
    queryFn: () => queryFibery<ClientsResponse>("clients"),
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });
}

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
    const monthMatch = cm.name?.match(/^(\d{4}-\d{2})/);
    const monthStr = monthMatch ? monthMatch[1] : "";
    const clientName = cm.client?.name || "Unknown";

    if (!monthStr || monthStr > currentMonthStr) return;

    const ppm = cm.pricingPlanMonths?.[0];
    if (!ppm) return;

    const costPerDeliverable = ppm.costPerDeliverable || 0;
    const deliverables = ppm.deliverablesShipped || 0;
    const revenue = ppm.revenue || 0;

    const effectiveCPD = costPerDeliverable > 0
      ? costPerDeliverable
      : (deliverables > 0 && revenue > 0 ? revenue / deliverables : 0);

    if (effectiveCPD > 0 || deliverables > 0) {
      processed.push({
        client: clientName,
        month: monthStr,
        deliverables,
        revenue,
        costPerDeliverable: effectiveCPD,
      });
    }
  });

  processed.sort((a, b) => b.month.localeCompare(a.month));
  return processed;
}

// Group data by client
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
    MonthlyData[]
  > = {};

  data.forEach((item) => {
    if (!clientData[item.client]) {
      clientData[item.client] = [];
    }

    let monthLabel = item.month;
    try {
      monthLabel = format(parseISO(`${item.month}-01`), "MMM ''yy");
    } catch {
      // Keep original
    }

    clientData[item.client].push({
      month: item.month,
      monthLabel,
      costPerDeliverable: item.costPerDeliverable,
      deliverables: item.deliverables,
      fireTeamSpend: item.revenue,
    });
  });

  Object.keys(clientData).forEach((client) => {
    clientData[client].sort((a, b) => a.month.localeCompare(b.month));
  });

  return clientData;
}

export function ClientEconomics() {
  const [viewMode, setViewMode] = useState<string>("cost");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const { data: clientMonthsData, isLoading: monthsLoading, error: monthsError } = useClientMonthsData();
  const { data: clientWeeksData, isLoading: weeksLoading } = useProcessedClientWeeks();
  const { data: deliverablesData, isLoading: deliverablesLoading } = useDeliverablesData();
  const { data: expensesData, isLoading: expensesLoading } = useExpensesData();
  const { data: clientsData, isLoading: clientsLoading } = useClientsData();

  const isLoading = monthsLoading || weeksLoading || deliverablesLoading || expensesLoading || clientsLoading;
  const error = monthsError;

  // Build active/inactive client names from Fibery
  const clientStatuses = useMemo(() => {
    const active: string[] = [];
    const inactive: string[] = [];
    if (clientsData?.findClients) {
      clientsData.findClients.forEach((c) => {
        const name = c.name?.trim();
        if (!name) return;
        const status = c.status?.name?.toLowerCase();
        if (status === "active") {
          active.push(name);
        } else {
          inactive.push(name);
        }
      });
    }
    active.sort((a, b) => a.localeCompare(b));
    inactive.sort((a, b) => a.localeCompare(b));
    return { active, inactive };
  }, [clientsData]);

  const combinedData = useMemo(() => {
    if (!clientMonthsData?.findClientMonths) return [];
    return processClientEconomicsData(clientMonthsData.findClientMonths);
  }, [clientMonthsData]);

  const clientChartData = useMemo(() => {
    return groupByClient(combinedData);
  }, [combinedData]);

  // Build list of all clients that have any data, sorted with active first
  const allClientsWithData = useMemo(() => {
    const clientSet = new Set<string>();
    
    Object.keys(clientChartData).forEach(c => clientSet.add(c));
    Object.keys(clientWeeksData).forEach(c => clientSet.add(c));
    Object.keys(deliverablesData).forEach(c => clientSet.add(c));
    Object.keys(expensesData).forEach(c => clientSet.add(c));

    const activeLC = clientStatuses.active.map(c => c.toLowerCase());
    const all = Array.from(clientSet);
    
    const active = clientStatuses.active.filter(ac => 
      all.some(c => c.toLowerCase() === ac.toLowerCase())
    );
    const inactive = all
      .filter(c => !activeLC.includes(c.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    return { active, inactive, all: [...active, ...inactive] };
  }, [clientChartData, clientWeeksData, deliverablesData, expensesData, clientStatuses]);

  // Auto-select first active client when data loads
  const effectiveClient = selectedClient || allClientsWithData.active[0] || allClientsWithData.all[0] || "";

  // Get data for selected client (case-insensitive matching)
  const currentData = useMemo(() => {
    if (!effectiveClient) return { cpd: [], adSpend: undefined, deliverables: undefined, expenses: undefined };
    const find = (obj: Record<string, any>) =>
      Object.keys(obj).find(k => k.trim().toLowerCase() === effectiveClient.trim().toLowerCase());

    const cpdKey = find(clientChartData);
    const adKey = find(clientWeeksData);
    const delKey = find(deliverablesData);
    const expKey = find(expensesData);

    return {
      cpd: cpdKey ? clientChartData[cpdKey] : [],
      adSpend: adKey ? clientWeeksData[adKey] : undefined,
      deliverables: delKey ? deliverablesData[delKey] : undefined,
      expenses: expKey ? expensesData[expKey] : undefined,
    };
  }, [effectiveClient, clientChartData, clientWeeksData, deliverablesData, expensesData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Client Economics" />
        <Skeleton className="h-[400px]" />
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
      <SectionHeader title="Client Economics" />

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          {/* Controls row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            {/* Active client buttons + inactive dropdown */}
            <div className="flex flex-wrap items-center gap-1.5">
              {allClientsWithData.active.map((client) => (
                <button
                  key={client}
                  onClick={() => setSelectedClient(client)}
                  className={`text-[11px] px-2.5 py-1 h-7 rounded-sm transition-colors ${
                    effectiveClient === client
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/30 text-foreground hover:bg-secondary/50"
                  }`}
                >
                  {client}
                </button>
              ))}
              {allClientsWithData.inactive.length > 0 && (
                <Select
                  value={allClientsWithData.inactive.some(c => c === effectiveClient) ? effectiveClient : ""}
                  onValueChange={setSelectedClient}
                >
                  <SelectTrigger className="w-32 h-7 text-[11px] bg-secondary/30 border-border/30 px-2.5">
                    <SelectValue placeholder="Inactive..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allClientsWithData.inactive.map((client) => (
                      <SelectItem key={client} value={client}>
                        {client}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Metric toggle */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(val) => { if (val) setViewMode(val); }}
              size="sm"
              className="bg-secondary/30 rounded-md p-0.5"
            >
              <ToggleGroupItem
                value="cost"
                className="text-[11px] px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm"
              >
                $/Deliv
              </ToggleGroupItem>
              <ToggleGroupItem
                value="adspend"
                className="text-[11px] px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm"
              >
                % Ad Spend
              </ToggleGroupItem>
              <ToggleGroupItem
                value="deliverables"
                className="text-[11px] px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm"
              >
                Deliverables
              </ToggleGroupItem>
              <ToggleGroupItem
                value="expenses"
                className="text-[11px] px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-sm"
              >
                Creator Costs
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Chart */}
          {viewMode === "cost" ? (
            currentData.cpd.length > 0 ? (
              <CostPerDeliverableChart data={currentData.cpd} />
            ) : (
              <EmptyState label="cost per deliverable" />
            )
          ) : viewMode === "adspend" ? (
            currentData.adSpend && currentData.adSpend.length > 0 ? (
              <AdSpendChart data={currentData.adSpend} />
            ) : (
              <EmptyState label="ad spend" />
            )
          ) : viewMode === "deliverables" ? (
            currentData.deliverables &&
            currentData.deliverables.months.some((m) => m.count > 0 || m.scheduledCount > 0) ? (
              <DeliverablesChart data={currentData.deliverables} />
            ) : (
              <EmptyState label="deliverables" />
            )
          ) : currentData.expenses &&
            currentData.expenses.months.some((m) => m.totalCost > 0) ? (
            <CreatorCostsChart data={currentData.expenses} />
          ) : (
            <EmptyState label="creator cost" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-[300px] flex items-center justify-center">
      <p className="text-muted-foreground text-sm">
        No {label} data available for this client
      </p>
    </div>
  );
}
