import { useQuery } from "@tanstack/react-query";
import { queryFibery, LeadsResponse, LeadCompany } from "@/lib/fibery";
import { useMemo } from "react";
import { format, parseISO, subMonths, subWeeks, startOfWeek, startOfMonth, differenceInDays } from "date-fns";

export interface ActiveLead {
  name: string;
  email: string | null;
  website: string | null;
  owner: string | null;
  lastContacted: string | null;
  firstContact: string | null;
  daysSinceLastContact: number;
  contacts: { name: string | null; email: string | null }[];
  temperature: "hot" | "warm" | "cooling" | "cold";
}

export interface MonthlyLeadVolume {
  label: string;
  count: number;
}

export interface WeeklyLeadVolume {
  label: string;
  count: number;
  weekStart: string;
}

export interface GhostedLead {
  name: string;
  website: string | null;
  lastContacted: string | null;
  daysSinceLastContact: number;
  firstContact: string | null;
  owner: string | null;
}

function getTemperature(days: number): ActiveLead["temperature"] {
  if (days <= 3) return "hot";
  if (days <= 7) return "warm";
  if (days <= 14) return "cooling";
  return "cold";
}

const TEMP_ORDER: Record<string, number> = { cold: 0, cooling: 1, warm: 2, hot: 3 };

export function usePipelineData() {
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ["fibery-leads"],
    queryFn: () => queryFibery<LeadsResponse>("leads"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const processed = useMemo(() => {
    if (!rawData?.findCompanies) {
      return { activeLeads: [], needAttentionCount: 0, monthlyVolume: [], weeklyVolume: [], avgPerMonth: 0, avgPerWeek: 0, ghostedLeads: [] };
    }

    const companies = rawData.findCompanies;
    const now = new Date();

    // Active Pipeline
    const activeLeads: ActiveLead[] = companies
      .filter((c) => c.stage?.name === "In progress")
      .map((c) => ({
        name: c.name || "Unknown",
        email: c.email,
        website: c.website,
        owner: c.owner?.name || null,
        lastContacted: c.lastContacted,
        firstContact: c.firstContact,
        daysSinceLastContact: c.daysSinceLastContact ?? 999,
        contacts: (c.contacts || []).map((ct) => ({ name: ct.name, email: ct.normalisedEmail })),
        temperature: getTemperature(c.daysSinceLastContact ?? 999),
      }))
      .sort((a, b) => TEMP_ORDER[a.temperature] - TEMP_ORDER[b.temperature] || b.daysSinceLastContact - a.daysSinceLastContact);

    const needAttentionCount = activeLeads.filter((l) => l.daysSinceLastContact >= 8).length;

    // Lead Volume - Monthly (last 12 months)
    const monthBuckets = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i);
      monthBuckets.set(format(d, "yyyy-MM"), 0);
    }
    companies.forEach((c) => {
      const dateStr = c.firstContact || c.creationDate;
      if (!dateStr) return;
      // Exclude bulk-imported records: no firstContact and creationDate in Aug 2025
      if (!c.firstContact && c.creationDate && c.creationDate.startsWith("2025-08")) return;
      const key = format(parseISO(dateStr), "yyyy-MM");
      if (monthBuckets.has(key)) monthBuckets.set(key, (monthBuckets.get(key) || 0) + 1);
    });
    const monthlyVolume: MonthlyLeadVolume[] = Array.from(monthBuckets.entries()).map(([key, count]) => ({
      label: format(parseISO(key + "-01"), "MMM yy"),
      count,
    }));

    // Lead Volume - Weekly (last 12 weeks)
    const weekBuckets = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      weekBuckets.set(format(ws, "yyyy-MM-dd"), 0);
    }
    companies.forEach((c) => {
      const dateStr = c.firstContact || c.creationDate;
      if (!dateStr) return;
      const ws = startOfWeek(parseISO(dateStr), { weekStartsOn: 1 });
      const key = format(ws, "yyyy-MM-dd");
      if (weekBuckets.has(key)) weekBuckets.set(key, (weekBuckets.get(key) || 0) + 1);
    });
    const weeklyVolume: WeeklyLeadVolume[] = Array.from(weekBuckets.entries()).map(([key, count]) => ({
      label: format(parseISO(key), "MMM d"),
      count,
      weekStart: key,
    }));

    const totalMonths = monthlyVolume.length || 1;
    const totalWeeks = weeklyVolume.length || 1;
    const totalLeadsInRange = monthlyVolume.reduce((s, m) => s + m.count, 0);
    const totalLeadsWeekly = weeklyVolume.reduce((s, w) => s + w.count, 0);

    // Ghosted leads (last 6 months)
    const sixMonthsAgo = subMonths(now, 6);
    const ghostedLeads: GhostedLead[] = companies
      .filter((c) => {
        if (c.stage?.name !== "Ghosted") return false;
        const lastDate = c.lastContacted ? parseISO(c.lastContacted) : null;
        return lastDate && lastDate >= sixMonthsAgo;
      })
      .map((c) => ({
        name: c.name || "Unknown",
        website: c.website,
        lastContacted: c.lastContacted,
        daysSinceLastContact: c.daysSinceLastContact ?? 0,
        firstContact: c.firstContact,
        owner: c.owner?.name || null,
      }))
      .sort((a, b) => a.daysSinceLastContact - b.daysSinceLastContact);

    return {
      activeLeads,
      needAttentionCount,
      monthlyVolume,
      weeklyVolume,
      avgPerMonth: Math.round(totalLeadsInRange / totalMonths * 10) / 10,
      avgPerWeek: Math.round(totalLeadsWeekly / totalWeeks * 10) / 10,
      ghostedLeads,
    };
  }, [rawData]);

  return { ...processed, isLoading, error: error as Error | null };
}

export function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const days = differenceInDays(new Date(), parseISO(dateStr));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
