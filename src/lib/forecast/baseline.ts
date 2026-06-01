// src/lib/forecast/baseline.ts
import { startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import { WEEKS_PER_MONTH, type ClientBaseline } from "./types";

interface MinimalProject {
  doneDate: string | null;
  client: { name: string } | null;
}

/**
 * Parse a Fibery date as a local-midnight Date. Date-only strings ("2026-05-04")
 * otherwise parse as UTC midnight, which drifts across local week boundaries
 * produced by date-fns and mis-buckets completions by a day in negative-offset
 * timezones. Datetime strings are parsed as-is.
 */
function parseLocalDate(d: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(d);
  if (dateOnly) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
}

export function computeClientBaselines(
  projects: MinimalProject[],
  referenceDate: Date,
  windowWeeks: number,
): ClientBaseline[] {
  // Anchor week boundaries on the local-midnight of the reference calendar day so
  // they line up with the local-midnight doneDates parsed below (see parseLocalDate).
  const refLocal = new Date(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );
  const weeks = Array.from({ length: windowWeeks }, (_, i) => {
    const weeksAgo = windowWeeks - i;
    const start = startOfWeek(subWeeks(refLocal, weeksAgo), { weekStartsOn: 1 });
    const end = endOfWeek(start, { weekStartsOn: 1 });
    return { start, end };
  });

  const perClient = new Map<string, number[]>();
  projects.forEach((proj) => {
    const name = proj.client?.name;
    if (!name || !proj.doneDate) return;
    const done = parseLocalDate(proj.doneDate);
    weeks.forEach((w, idx) => {
      if (isWithinInterval(done, { start: w.start, end: w.end })) {
        if (!perClient.has(name)) perClient.set(name, new Array(windowWeeks).fill(0));
        perClient.get(name)![idx] += 1;
      }
    });
  });

  const baselines: ClientBaseline[] = [];
  perClient.forEach((weeklyCounts, client) => {
    const last4 = weeklyCounts.slice(-4).reduce((s, v) => s + v, 0);
    if (last4 === 0) return;
    const prior8 = weeklyCounts.slice(-12, -4).reduce((s, v) => s + v, 0);
    const last4Avg = last4 / 4;
    const prior8Avg = prior8 / 8;
    const trendPct = prior8Avg > 0 ? Math.round((last4Avg / prior8Avg - 1) * 100) : null;
    const monthlyRate = Math.round((last4 / 4) * WEEKS_PER_MONTH);
    baselines.push({ client, monthlyRate, trendPct, weeklyCounts });
  });

  baselines.sort((a, b) => b.monthlyRate - a.monthlyRate);
  return baselines;
}
