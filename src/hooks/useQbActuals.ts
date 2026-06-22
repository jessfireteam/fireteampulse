// Reads QuickBooks billed-fee actuals for the CURRENT month from Supabase
// (table `qb_billed_fees`, populated by the n8n sync). Revenue-side only.
// Keyed by lowercased Pulse client name so PnlTab can match against scenario
// clients. The table is not in the generated Supabase types yet, so we use a
// loosely-typed client (same pattern as useScenario).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const db = supabase as unknown as { from: (table: string) => any };

export interface QbActuals {
  byClient: Map<string, number>; // lowercased client name -> billed amount this month
  total: number;
  monthKey: string; // 'YYYY-MM' of the current month
  syncedAt: string | null; // most recent sync timestamp across rows, if any
  loaded: boolean;
}

export function useQbActuals(): QbActuals {
  const monthKey = format(new Date(), "yyyy-MM");
  const [state, setState] = useState<QbActuals>({
    byClient: new Map(),
    total: 0,
    monthKey,
    syncedAt: null,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await db
          .from("qb_billed_fees")
          .select("client_name, amount, synced_at")
          .eq("month", monthKey);
        if (cancelled) return;
        const byClient = new Map<string, number>();
        let total = 0;
        let syncedAt: string | null = null;
        if (!error && Array.isArray(data)) {
          for (const r of data) {
            const name = String(r.client_name ?? "").trim().toLowerCase();
            if (!name) continue;
            const amt = Number(r.amount) || 0;
            byClient.set(name, (byClient.get(name) ?? 0) + amt);
            total += amt;
            if (r.synced_at && (!syncedAt || r.synced_at > syncedAt)) syncedAt = r.synced_at;
          }
        }
        setState({ byClient, total, monthKey, syncedAt, loaded: true });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  return state;
}
