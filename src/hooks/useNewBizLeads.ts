// Reads the new-business pipeline from Supabase (table `newbiz_leads`, written by
// the newbiz-radar sweep twice each weekday). The table is not in the generated
// Supabase types, so we use a loosely-typed client - same pattern as useQbActuals.
//
// The table is partners-only at the database level (RLS on auth.jwt() email), so a
// non-partner gets an empty array here even if they reach the route.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (table: string) => any };

const SLACK_WORKSPACE = "fireteamis";
const OPPORTUNITY_CHANNEL = "CV4F9TYNR";

/** Stages where the lead is still alive and someone should be doing something. */
export const OPEN_STATUSES = ["our-turn", "their-turn", "call-booked", "proposal"] as const;
/** Business days a their-turn thread can sit before it's worth a bump. */
export const STALE_AFTER_DAYS = 5;
/** The first-reply target. Bars above this read as slow on the response-time chart. */
export const REPLY_TARGET_HOURS = 24;

export interface NewBizLead {
  thread_id: string;
  brand: string | null;
  contact_name: string | null;
  contact_email: string | null;
  source: string | null;
  referral_source: string | null;
  status: string;
  first_contact_at: string | null;
  first_reply_at: string | null;
  last_msg_at: string | null;
  last_msg_from: string | null;
  call_at: string | null;
  closed_at: string | null;
  owner: string | null;
  card_ts: string | null;
  research: string | null;
  notes: string | null;
}

export interface AttentionItem extends NewBizLead {
  /** Business days since the last message on the thread. */
  waitingDays: number;
  /** Why this is on the list, in plain words. */
  reason: string;
  /** 0 = most urgent. Drives sort order and the dot color. */
  severity: 0 | 1 | 2;
  cardUrl: string | null;
}

export interface MonthPoint {
  key: string;        // 'YYYY-MM'
  label: string;      // 'Mar'
  inquiries: number;
  medianReplyHours: number | null;
}

export interface NewBizData {
  leads: NewBizLead[];
  attention: AttentionItem[];
  revisit: NewBizLead[];
  months: MonthPoint[];
  openCount: number;
  waitingOnUs: number;
  outcomes: { won: number; passed: number; ghosted: number; dormant: number };
  medianReplyHours90d: number | null;
  slowestOpenDays: number;
  isLoading: boolean;
  error: string | null;
}

/** Weekdays between two dates. Holidays are not modelled - close enough for a nudge. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (!(from instanceof Date) || isNaN(from.getTime())) return 0;
  let days = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) days++;
  }
  return days;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function slackCardUrl(cardTs: string | null): string | null {
  if (!cardTs) return null;
  return `https://${SLACK_WORKSPACE}.slack.com/archives/${OPPORTUNITY_CHANNEL}/p${cardTs.replace(".", "")}`;
}

export function useNewBizLeads(): NewBizData {
  const [leads, setLeads] = useState<NewBizLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await db
          .from("newbiz_leads")
          .select("*")
          .order("first_contact_at", { ascending: false });
        if (cancelled) return;
        if (err) {
          setError(err.message ?? "Could not load leads.");
        } else {
          setLeads(Array.isArray(data) ? (data as NewBizLead[]) : []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load leads.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const now = new Date();

    const attention: AttentionItem[] = leads
      .filter((l) => OPEN_STATUSES.includes(l.status as (typeof OPEN_STATUSES)[number]))
      .map((l) => {
        // Calls are booked off-thread, so the newest email is not always the
        // newest contact. Lux's thread looked 13 days cold while the call had
        // happened the previous Friday - clock from whichever came last.
        const stamps = [l.last_msg_at, l.call_at]
          .filter(Boolean)
          .map((s) => new Date(s as string))
          .filter((d) => !isNaN(d.getTime()) && d <= now);
        const last = stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null;
        const waitingDays = last ? businessDaysBetween(last, now) : 0;

        // Anything where WE owe the next move outranks everything else, however
        // long a prospect has been quiet. A one-day-old unanswered inquiry is
        // more urgent than a three-week silence on their side.
        let reason = "";
        let severity: 0 | 1 | 2 = 2;
        if (l.status === "our-turn") {
          reason = waitingDays === 0 ? "Came in today, needs a reply" : `Waiting on us ${waitingDays} business ${waitingDays === 1 ? "day" : "days"}`;
          severity = 0;
        } else if (l.status === "proposal") {
          reason = "Proposal or scope owed";
          severity = 0;
        } else if (l.status === "their-turn") {
          reason = waitingDays >= STALE_AFTER_DAYS ? `Quiet ${waitingDays} business days, worth a bump` : `Waiting on them (${waitingDays}d)`;
          severity = waitingDays >= STALE_AFTER_DAYS ? 1 : 2;
        } else {
          reason = l.call_at ? "Call booked" : "In progress";
          severity = 2;
        }

        return { ...l, waitingDays, reason, severity, cardUrl: slackCardUrl(l.card_ts) };
      })
      .sort((a, b) => a.severity - b.severity || b.waitingDays - a.waitingDays);

    // Months: last 12, oldest first, so the charts read left to right.
    const months: MonthPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inMonth = leads.filter((l) => l.first_contact_at?.startsWith(key));
      const replyHours = inMonth
        .filter((l) => l.first_contact_at && l.first_reply_at)
        .map((l) => (new Date(l.first_reply_at!).getTime() - new Date(l.first_contact_at!).getTime()) / 3_600_000)
        .filter((h) => h >= 0);
      months.push({
        key,
        label: d.toLocaleString("en-US", { month: "short" }),
        inquiries: inMonth.length,
        medianReplyHours: median(replyHours),
      });
    }

    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    const recentReplyHours = leads
      .filter((l) => l.first_contact_at && l.first_reply_at && l.first_contact_at >= ninetyDaysAgo)
      .map((l) => (new Date(l.first_reply_at!).getTime() - new Date(l.first_contact_at!).getTime()) / 3_600_000)
      .filter((h) => h >= 0);

    const count = (s: string) => leads.filter((l) => l.status === s).length;

    return {
      leads,
      attention,
      revisit: leads.filter((l) => l.status === "dormant"),
      months,
      openCount: leads.filter((l) => OPEN_STATUSES.includes(l.status as (typeof OPEN_STATUSES)[number])).length,
      waitingOnUs: attention.filter((a) => a.status === "our-turn" || a.status === "proposal").length,
      outcomes: { won: count("won"), passed: count("passed"), ghosted: count("ghosted"), dormant: count("dormant") },
      medianReplyHours90d: median(recentReplyHours),
      slowestOpenDays: attention.reduce((max, a) => Math.max(max, a.status === "our-turn" || a.status === "proposal" ? a.waitingDays : 0), 0),
      isLoading,
      error,
    };
  }, [leads, isLoading, error]);
}
