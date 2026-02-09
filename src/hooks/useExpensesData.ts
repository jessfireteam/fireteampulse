import { useQuery } from "@tanstack/react-query";
import { queryFibery, ClientExpensesResponse } from "@/lib/fibery";
import { useMemo } from "react";
import { format, parseISO, subMonths } from "date-fns";

export interface MonthExpenses {
  monthKey: string;
  monthLabel: string;
  totalCost: number;
  expenseCount: number;
  unpaidAmount: number;
  unbilledAmount: number;
}

export interface ClientExpenses {
  clientName: string;
  months: MonthExpenses[];
}

function useClientExpensesQuery() {
  return useQuery({
    queryKey: ["fibery-client-expenses"],
    queryFn: () => queryFibery<ClientExpensesResponse>("client-expenses"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function useExpensesData(): {
  data: Record<string, ClientExpenses>;
  isLoading: boolean;
  error: Error | null;
} {
  const { data: expensesData, isLoading, error } = useClientExpensesQuery();

  const processed = useMemo(() => {
    const result: Record<string, ClientExpenses> = {};
    if (!expensesData?.findExpenses) return result;

    // Build last 5 months + current
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      months.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM yy"),
      });
    }

    const ensureClient = (clientName: string) => {
      if (!result[clientName]) {
        result[clientName] = {
          clientName,
          months: months.map((m) => ({
            monthKey: m.key,
            monthLabel: m.label,
            totalCost: 0,
            expenseCount: 0,
            unpaidAmount: 0,
            unbilledAmount: 0,
          })),
        };
      }
    };

    expensesData.findExpenses.forEach((exp) => {
      const clientName = exp.client?.name?.trim();
      if (!clientName || !exp.date) return;

      const monthKey = format(parseISO(exp.date), "yyyy-MM");
      if (!months.some((m) => m.key === monthKey)) return;

      ensureClient(clientName);

      const monthEntry = result[clientName].months.find((m) => m.monthKey === monthKey);
      if (!monthEntry) return;

      const amount = exp.amount ?? 0;
      monthEntry.totalCost += amount;
      monthEntry.expenseCount++;
      if (exp.paid === false) monthEntry.unpaidAmount += amount;
      if (exp.billedToClient === false) monthEntry.unbilledAmount += amount;
    });

    return result;
  }, [expensesData]);

  return { data: processed, isLoading, error: error as Error | null };
}
