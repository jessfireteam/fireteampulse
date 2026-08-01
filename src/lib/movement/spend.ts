/**
 * Read-side client for the `fb_ad_spend` table, which lives in a DIFFERENT
 * Supabase project from the rest of Pulse.
 *
 * It is the table the daily `fb-spend-daily-pull` n8n workflow writes and that
 * friday-flashback already reads. Access is the publishable (anon) key against
 * an `anon_read_fb_ad_spend` SELECT policy — read-only, no write power, safe in
 * the bundle. That is why this page needs no serverless function and Pulse
 * stays the pure client-side app it is.
 *
 * PAGES GO OUT IN PARALLEL, AND THAT IS THE WHOLE PERFORMANCE STORY.
 * PostgREST caps a page at 1000 rows and silently clips anything larger, so two
 * weeks is 35 pages. friday-flashback walks them one at a time because it stops
 * when a short page comes back. An exact count is one cheap request away
 * though, and knowing the count up front means every page can go at once.
 * Measured against production: 7.54s sequential, 1.79s at six in flight, 1.69s
 * at twelve. Eight is the middle of that plateau.
 */

const URL_BASE = import.meta.env.VITE_SPEND_SUPABASE_URL;
const KEY = import.meta.env.VITE_SPEND_SUPABASE_KEY;

const PAGE = 1000; // PostgREST max-rows; larger pages are silently clipped
const IN_FLIGHT = 8;
const COLUMNS = "report_date,account_id,ad_name,campaign_name,spend";

export interface SpendRow {
  report_date: string;
  account_id: string;
  ad_name: string;
  campaign_name: string | null;
  spend: number | null;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  if (!URL_BASE || !KEY) {
    throw new Error(
      "VITE_SPEND_SUPABASE_URL and VITE_SPEND_SUPABASE_KEY must be set to read ad spend"
    );
  }
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra };
}

function range(start: string, end: string): string {
  return `report_date=gte.${start}&and=(report_date.lte.${end})`;
}

/** The newest date that actually has rows. Never compute the window from today. */
export async function latestReportDate(): Promise<string | null> {
  const url =
    `${URL_BASE}/rest/v1/fb_ad_spend` +
    `?select=report_date&order=report_date.desc&limit=1`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`fb_ad_spend unreachable (${res.status})`);
  const rows = (await res.json()) as { report_date: string }[];
  return rows.length ? rows[0].report_date : null;
}

export async function accountMap(): Promise<Map<string, string>> {
  const url = `${URL_BASE}/rest/v1/account_client?select=account_id,client`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`account_client unreachable (${res.status})`);
  const rows = (await res.json()) as { account_id: string; client: string }[];
  return new Map(rows.map((r) => [r.account_id, r.client]));
}

async function countRows(start: string, end: string): Promise<number> {
  const url = `${URL_BASE}/rest/v1/fb_ad_spend?select=id&${range(start, end)}`;
  const res = await fetch(url, {
    headers: headers({ Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" }),
  });
  if (!res.ok) throw new Error(`fb_ad_spend count failed (${res.status})`);
  const header = res.headers.get("content-range") ?? "";
  const total = Number(header.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function fetchPage(start: string, end: string, page: number): Promise<SpendRow[]> {
  const url =
    `${URL_BASE}/rest/v1/fb_ad_spend?select=${COLUMNS}&${range(start, end)}` +
    `&order=id.asc&limit=${PAGE}&offset=${page * PAGE}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`fb_ad_spend page ${page} failed (${res.status})`);
  return (await res.json()) as SpendRow[];
}

/**
 * Every row in [start, end], fetched with a bounded number of requests in
 * flight. `onProgress` reports pages completed so the page can show movement
 * rather than a blank spinner.
 */
export async function fetchSpend(
  start: string,
  end: string,
  onProgress?: (done: number, total: number) => void
): Promise<SpendRow[]> {
  const total = await countRows(start, end);
  const pages = Math.ceil(total / PAGE);
  if (pages === 0) return [];

  const out: SpendRow[][] = new Array(pages);
  let done = 0;
  let next = 0;

  // A fixed pool rather than Promise.all over every page at once: 35 concurrent
  // requests is not faster than eight and is ruder to the API.
  const worker = async () => {
    for (;;) {
      const page = next++;
      if (page >= pages) return;
      out[page] = await fetchPage(start, end, page);
      onProgress?.(++done, pages);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(IN_FLIGHT, pages) }, () => worker())
  );
  return out.flat();
}
