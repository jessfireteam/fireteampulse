/**
 * The browser's read path into the FB Ads Supabase project.
 *
 * Direct anon access to that project was revoked 2026-08-28 (its per-client
 * spend and computed fees were readable by anyone holding the anon key, which
 * shipped in this bundle). Reads now go through its `spend-proxy` edge
 * function, which verifies the caller's Pulse session JWT and its @fireteam.is
 * email before touching the data with the service role key.
 *
 * The proxy mirrors PostgREST closely enough that the Movement fetchers only
 * needed their base URL and auth swapped: `${SPEND_PROXY_BASE}/rest/<table>`
 * takes the same query string and Range/Prefer headers `/rest/v1/<table>`
 * took, and returns the same body and Content-Range.
 */
import { supabase } from "@/integrations/supabase/client";

// Public, fixed function URL (env override for local/preview against a branch).
export const SPEND_PROXY_BASE =
  import.meta.env.VITE_SPEND_PROXY_URL ??
  "https://ojqdhqbynccwgowbzhir.supabase.co/functions/v1/spend-proxy";

/** REST URL against the proxy: table + a PostgREST query string (with `?`). */
export function spendRestUrl(table: string, query: string): string {
  return `${SPEND_PROXY_BASE}/rest/${table}${query}`;
}

/**
 * fetch() against the proxy with the current user's Pulse JWT attached. The
 * page is behind the auth gate, so a session is expected; a missing one is a
 * real error rather than a silent empty result.
 */
export async function spendFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in — cannot read ad spend");
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
