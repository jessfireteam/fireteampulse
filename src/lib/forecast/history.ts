// src/lib/forecast/history.ts
import { startOfMonth, subMonths } from "date-fns";
import { type ClientHistory } from "./types";
import { parseLocalDate } from "./dates";
import { classifyAssetType } from "./assetType";

interface MinimalProject {
  doneDate: string | null;
  client: { name: string } | null;
  name: string;
  type: { name: string } | null;
}

interface ClientBucket {
  videosByMonth: number[];
  staticsByMonth: number[];
}

export function computeClientHistory(
  projects: MinimalProject[],
  referenceDate: Date,
  historyMonths: number,
): ClientHistory[] {
  // History months are the `historyMonths` full calendar months BEFORE the
  // reference month (exclude current/reference month). oldest -> newest.
  const refMonthStart = startOfMonth(referenceDate);
  const monthStarts = Array.from({ length: historyMonths }, (_, i) => {
    // i=0 -> oldest. e.g. historyMonths=3 from June: subMonths(June,3)=Mar, sub2=Apr, sub1=May
    return startOfMonth(subMonths(refMonthStart, historyMonths - i));
  });
  const monthIndexFor = (d: Date): number => {
    for (let i = 0; i < monthStarts.length; i++) {
      const start = monthStarts[i];
      const next = i + 1 < monthStarts.length ? monthStarts[i + 1] : refMonthStart;
      if (d >= start && d < next) return i;
    }
    return -1;
  };

  const perClient = new Map<string, ClientBucket>();
  projects.forEach((proj) => {
    const name = proj.client?.name;
    if (!name || !proj.doneDate) return;
    const done = parseLocalDate(proj.doneDate);
    const idx = monthIndexFor(done);
    if (idx < 0) return;
    if (!perClient.has(name)) {
      perClient.set(name, {
        videosByMonth: new Array(historyMonths).fill(0),
        staticsByMonth: new Array(historyMonths).fill(0),
      });
    }
    const bucket = perClient.get(name)!;
    if (classifyAssetType(proj.name, proj.type?.name) === "video") bucket.videosByMonth[idx] += 1;
    else bucket.staticsByMonth[idx] += 1;
  });

  const histories: ClientHistory[] = [];
  perClient.forEach((bucket, client) => {
    const total =
      bucket.videosByMonth.reduce((s, v) => s + v, 0) +
      bucket.staticsByMonth.reduce((s, v) => s + v, 0);
    if (total === 0) return;
    const newest = historyMonths - 1;
    histories.push({
      client,
      videosByMonth: bucket.videosByMonth,
      staticsByMonth: bucket.staticsByMonth,
      seedVideos: bucket.videosByMonth[newest] ?? 0,
      seedStatics: bucket.staticsByMonth[newest] ?? 0,
    });
  });

  histories.sort((a, b) => {
    const at = a.videosByMonth.reduce((s, v) => s + v, 0) + a.staticsByMonth.reduce((s, v) => s + v, 0);
    const bt = b.videosByMonth.reduce((s, v) => s + v, 0) + b.staticsByMonth.reduce((s, v) => s + v, 0);
    return bt - at;
  });
  return histories;
}
