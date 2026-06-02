interface ClientMonthRow {
  name: string;
  client: { name: string } | null;
  totalSpend: number | null;
}

/** Map client-name (lowercased) -> ("YYYY-MM" -> total ad spend). */
export function actualAdSpendByClientMonth(rows: ClientMonthRow[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const client = r.client?.name?.trim().toLowerCase();
    const monthKey = r.name?.match(/(\d{4}-\d{2})/)?.[1];
    if (!client || !monthKey) continue;
    if (!out.has(client)) out.set(client, new Map());
    out.get(client)!.set(monthKey, r.totalSpend ?? 0);
  }
  return out;
}
