import { useState, useMemo } from "react";
import { format, subMonths } from "date-fns";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Legend,
} from "recharts";
import { useAccountsData } from "@/hooks/useAccountsData";
import type { ClientMonthlySpendEntry, ClientWinRate } from "@/hooks/useAccountsData";
import type { ProcessedClientWeek } from "@/hooks/useClientWeeksData";
import { TrendingUp, TrendingDown, Minus, MessageSquare } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Monthly Spend Chart ──────────────────────────────────────────────────────

function MonthlySpendChart({ data }: { data: ClientMonthlySpendEntry[] }) {
  if (data.length === 0) {
    return <EmptyState label="monthly spend" />;
  }
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 20, left: 60, bottom: 40 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,22%)" vertical={false} />
          <XAxis
            dataKey="monthLabel"
            tick={{ fill: "hsl(234,28%,66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(0,0%,22%)" }}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fill: "hsl(234,28%,66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={52}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              backgroundColor: "hsl(0,0%,16%)",
              border: "1px solid hsl(0,0%,22%)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "13px",
            }}
            labelStyle={{ color: "hsl(0,0%,89%)", fontWeight: 600, marginBottom: 4 }}
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === "totalSpend" ? "Total Spend" : "FT Spend",
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "hsl(234,28%,66%)", paddingTop: 4 }}
            formatter={(value) => (value === "totalSpend" ? "Total Spend" : "FT Spend")}
          />
          <Bar dataKey="totalSpend" fill="hsl(234,28%,50%)" radius={[3, 3, 0, 0]} maxBarSize={40} />
          <Bar dataKey="ftSpend" fill="hsl(22,77%,70%)" radius={[3, 3, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── FT % of Ad Spend chart (weekly) ─────────────────────────────────────────

function WeeklyFTChart({ data }: { data: ProcessedClientWeek[] }) {
  if (data.length === 0) return <EmptyState label="weekly FT spend" />;

  const maxPercent = Math.max(...data.map((d) => d.agencyPercent), 50);
  const interval = 10;
  const yMax = Math.ceil(maxPercent / interval) * interval;
  const ticks = Array.from({ length: Math.floor(yMax / interval) + 1 }, (_, i) => i * interval);

  return (
    <>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 52, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,22%)" vertical={false} />
            <ReferenceArea
              y1={15}
              y2={50}
              fill="hsl(148,58%,72%)"
              fillOpacity={0.15}
              stroke="hsl(148,58%,72%)"
              strokeOpacity={0.4}
              strokeDasharray="4 2"
            />
            <XAxis
              dataKey="weekLabel"
              tick={{ fill: "hsl(234,28%,66%)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "hsl(0,0%,22%)" }}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: "hsl(234,28%,66%)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={[0, yMax]}
              ticks={ticks}
              width={44}
            />
            <Tooltip
              cursor={false}
              contentStyle={{
                backgroundColor: "hsl(0,0%,16%)",
                border: "1px solid hsl(0,0%,22%)",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "13px",
              }}
              labelStyle={{ color: "hsl(0,0%,89%)", fontWeight: 600, marginBottom: 4 }}
              formatter={(value: number, _name: string, entry: any) => {
                const item = entry.payload as ProcessedClientWeek;
                return [
                  `${value.toFixed(1)}% (${formatCurrency(item.agencySpend)} / ${formatCurrency(item.totalSpend)})`,
                  "% of Ad Spend",
                ];
              }}
            />
            <Bar dataKey="agencyPercent" fill="hsl(22,77%,70%)" radius={[4, 4, 0, 0]} maxBarSize={50} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-6 rounded-sm bg-success/20 border border-success/50 border-dashed" />
          <span>Target 15%–50%</span>
        </div>
      </div>
    </>
  );
}

// ─── Fee per Deliverable chart (monthly) ─────────────────────────────────────

function FeePerDeliverableChart({ data }: { data: ClientMonthlySpendEntry[] }) {
  const chartData = data.filter((d) => d.costPerDeliverable > 0);
  if (chartData.length === 0) return <EmptyState label="fee per deliverable" />;

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 60, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,22%)" vertical={false} />
          <ReferenceArea
            y1={1000}
            y2={2000}
            fill="hsl(148,58%,72%)"
            fillOpacity={0.15}
            stroke="hsl(148,58%,72%)"
            strokeOpacity={0.4}
            strokeDasharray="4 2"
          />
          <XAxis
            dataKey="monthLabel"
            tick={{ fill: "hsl(234,28%,66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(0,0%,22%)" }}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fill: "hsl(234,28%,66%)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            domain={[0, 4000]}
            ticks={[0, 1000, 2000, 3000, 4000]}
            width={52}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              backgroundColor: "hsl(0,0%,16%)",
              border: "1px solid hsl(0,0%,22%)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "13px",
            }}
            labelStyle={{ color: "hsl(0,0%,89%)", fontWeight: 600, marginBottom: 4 }}
            formatter={(value: number, _name: string, entry: any) => {
              const item = entry.payload as ClientMonthlySpendEntry;
              return [
                `${formatCurrency(value)} (${item.deliverables} delivered)`,
                "Fee / Deliverable",
              ];
            }}
          />
          <Bar dataKey="costPerDeliverable" fill="hsl(22,77%,70%)" radius={[4, 4, 0, 0]} maxBarSize={50} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Win Rate Card ────────────────────────────────────────────────────────────

function WinRateCard({ winRate }: { winRate: ClientWinRate | undefined }) {
  if (!winRate) {
    return (
      <div className="h-32 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No win rate data available</p>
      </div>
    );
  }

  const { current, previous, change, allTime } = winRate;

  const changeBadge = () => {
    if (change === null) return null;
    if (change > 0) {
      return (
        <Badge className="gap-1 bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/20">
          <TrendingUp className="h-3 w-3" />
          +{change}pp
        </Badge>
      );
    }
    if (change < 0) {
      return (
        <Badge className="gap-1 bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/20">
          <TrendingDown className="h-3 w-3" />
          {change}pp
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 bg-muted/50 text-muted-foreground border-border/30 hover:bg-muted/50">
        <Minus className="h-3 w-3" />
        No change
      </Badge>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-8 py-2">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">This Month</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">
            {current !== null ? `${current}%` : "—"}
          </span>
          {changeBadge()}
        </div>
        {previous !== null && (
          <p className="text-xs text-muted-foreground">vs {previous}% last month</p>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">All Time</p>
        <span className="text-2xl font-semibold text-foreground/80">
          {allTime !== null ? `${allTime}%` : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── Slack Highlights Placeholder ────────────────────────────────────────────

function SlackHighlights({ client }: { client: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
      <MessageSquare className="h-8 w-8 opacity-40" />
      <p className="text-sm">Slack highlights coming soon</p>
      <p className="text-xs opacity-60">Will surface key updates for {client} from the past 30 days</p>
    </div>
  );
}

// ─── Shared empty state ───────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <p className="text-sm text-muted-foreground">No {label} data available</p>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Accounts() {
  const [selectedClient, setSelectedClient] = useState<string>("");

  const {
    monthlySpend,
    weeklyFT,
    winRates,
    activeClients,
    inactiveClients,
    isLoading,
    error,
  } = useAccountsData();

  const effectiveClient =
    selectedClient || activeClients[0] || inactiveClients[0] || "";

  // Case-insensitive lookup helper
  const findKey = (obj: Record<string, unknown>, target: string) =>
    Object.keys(obj).find((k) => k.trim().toLowerCase() === target.trim().toLowerCase());

  const clientMonthlySpend = useMemo(() => {
    if (!effectiveClient) return [];
    const key = findKey(monthlySpend, effectiveClient);
    return key ? monthlySpend[key] : [];
  }, [effectiveClient, monthlySpend]);

  const clientWeeklyFT = useMemo(() => {
    if (!effectiveClient) return [];
    const key = findKey(weeklyFT as Record<string, unknown>, effectiveClient);
    return key ? (weeklyFT as Record<string, any>)[key] : [];
  }, [effectiveClient, weeklyFT]);

  const clientWinRate = useMemo(() => {
    if (!effectiveClient) return undefined;
    const key = findKey(winRates, effectiveClient);
    return key ? winRates[key] : undefined;
  }, [effectiveClient, winRates]);

  const snapshotEntry = useMemo(() => {
    if (!clientMonthlySpend.length) return undefined;
    const prevMonthStr = format(subMonths(new Date(), 1), "yyyy-MM");
    return (
      clientMonthlySpend.find((d) => d.month === prevMonthStr) ??
      clientMonthlySpend.filter((d) => d.month < format(new Date(), "yyyy-MM")).slice(-1)[0]
    );
  }, [clientMonthlySpend]);

  const snapshotTitle = snapshotEntry
    ? `Last Month — ${snapshotEntry.monthLabel}`
    : "Last Month Snapshot";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <DashboardHeader />
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[320px] w-full" />
            <Skeleton className="h-[320px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <DashboardHeader />
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-6">
              <p className="text-destructive">Failed to load accounts data</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(18_100%_60%_/_0.05),_transparent_50%)] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader />

        <div className="space-y-6">
          {/* Page heading */}
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Account Manager View</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Client economics, spend efficiency, and creative performance
            </p>
          </div>

          {/* Client selector */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {activeClients.map((client) => (
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
                {inactiveClients.length > 0 && (
                  <Select
                    value={
                      inactiveClients.some((c) => c === effectiveClient)
                        ? effectiveClient
                        : ""
                    }
                    onValueChange={setSelectedClient}
                  >
                    <SelectTrigger className="w-32 h-7 text-[11px] bg-secondary/30 border-border/30 px-2.5">
                      <SelectValue placeholder="Inactive..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inactiveClients.map((client) => (
                        <SelectItem key={client} value={client}>
                          {client}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>

          {effectiveClient && (
            <>
              {/* Two-column summary stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Win Rate */}
                <Section title="Win Rate">
                  <WinRateCard winRate={clientWinRate} />
                </Section>

                {/* Latest completed month at-a-glance */}
                <Section title={snapshotTitle}>
                  {snapshotEntry ? (
                    <div className="flex flex-wrap gap-6 py-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Spend</p>
                        <p className="text-2xl font-bold">{formatCurrency(snapshotEntry.totalSpend)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">FT Spend</p>
                        <p className="text-2xl font-bold">{formatCurrency(snapshotEntry.ftSpend)}</p>
                        <p className="text-xs text-muted-foreground">{snapshotEntry.ftPct}% of total</p>
                      </div>
                      {snapshotEntry.costPerDeliverable > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Fee / Deliv</p>
                          <p className="text-2xl font-bold">{formatCurrency(snapshotEntry.costPerDeliverable)}</p>
                          <p className="text-xs text-muted-foreground">{snapshotEntry.deliverables} delivered</p>
                        </div>
                      )}
                    </div>
                  ) : <EmptyState label="snapshot" />}
                </Section>
              </div>

              {/* Monthly Spend (Total vs FT) */}
              <Section title="Monthly Spend — Total vs FireTeam (last 6 months)">
                <MonthlySpendChart data={clientMonthlySpend} />
              </Section>

              {/* Weekly FT % of Ad Spend */}
              <Section title="Weekly FT % of Ad Spend">
                <WeeklyFTChart data={clientWeeklyFT} />
              </Section>

              {/* Fee per Deliverable */}
              <Section title="Fee per Deliverable (monthly)">
                <FeePerDeliverableChart data={clientMonthlySpend} />
              </Section>

              {/* Slack Highlights */}
              <Section title="Slack Highlights — Last 30 Days">
                <SlackHighlights client={effectiveClient} />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
