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
import { useClientMonthsData, processClientMonths } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClientSmallMultiples } from "./ClientSmallMultiples";

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">$/Deliverable target:</span>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-success" />
          <span className="text-muted-foreground">&lt;$1,000 (over-resourced)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: "hsl(215, 20%, 55%)" }} />
          <span className="text-muted-foreground">$1,000-$2,000 (target)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-destructive" />
          <span className="text-muted-foreground">&gt;$2,000 (under-resourced)</span>
        </div>
      </div>

      {/* Small Multiples Bar Charts */}
      <ClientSmallMultiples 
        chartData={chartData} 
        tableData={tableData} 
        clients={clients} 
      />

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