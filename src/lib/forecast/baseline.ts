// src/lib/forecast/baseline.ts
import { startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import { WEEKS_PER_MONTH, type ClientBaseline } from "./types";
import { parseLocalDate } from "./dates";

interface MinimalProject {
  doneDate: string | null;
  client: { name: string } | null;
}

export function computeClientBaselines(
  projects: MinimalProject[],
  referenceDate: Date,
  windowWeeks: number,
): ClientBaseline[] {
  const weeks = Array.from({ length: windowWeeks }, (_, i) => {
    const weeksAgo = windowWeeks - i;
    const start = startOfWeek(subWeeks(referenceDate, weeksAgo), { weekStartsOn: 1 });
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
