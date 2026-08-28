/**
 * Ad thumbnails for the movement rows, read from `fb_ad_creative`.
 *
 * The images are NOT Meta URLs. Meta signs `thumbnail_url` with an expiry two
 * to five days out, and this page's whole point is stepping back through
 * earlier periods, so linking Meta directly would leave every historical view
 * rendering broken images within a week. `scripts/fill-ad-thumbnails.py`
 * downloads each one into the public `ad-thumbnails` bucket in the same project
 * as `fb_ad_spend`; this module only resolves ad ids to stored paths.
 *
 * Fetched separately from the spend rows rather than folded into
 * `useMovementData`, so the numbers paint immediately and the images fill in.
 * Spend is the thing being read; a thumbnail arriving 200ms later costs nothing.
 *
 * The `fb_ad_creative` lookup goes through spend-proxy (JWT-gated) since direct
 * anon access to the FB Ads project was revoked; the resolved images still load
 * straight from that project's PUBLIC `ad-thumbnails` bucket, which is a public
 * image CDN by design and unaffected by the table/RPC lockdown.
 */
import { spendFetch, spendRestUrl, SPEND_PROXY_BASE } from "./spendClient";

// Origin of the FB Ads project, derived from the proxy URL, for building the
// public bucket image URLs (these are `<img>` srcs, not proxied reads).
const FB_ADS_ORIGIN = new URL(SPEND_PROXY_BASE).origin;
const PUBLIC_BUCKET = `${FB_ADS_ORIGIN}/storage/v1/object/public/ad-thumbnails`;

/**
 * Ad ids per request. PostgREST takes the id list in the query string and
 * servers cap a URL somewhere north of 8KB; a Meta ad id is 18 characters, so
 * 300 keeps the URL under 6KB with room for the rest of the query.
 */
const CHUNK = 300;

/** Requests in flight, matching the spend fetcher's own pool. */
const IN_FLIGHT = 4;

interface CreativeRow {
  ad_id: string;
  thumb_path: string | null;
}

/**
 * Resolve ad ids to public thumbnail URLs.
 *
 * Ads with no row, or a row recorded as having no usable creative, are simply
 * absent from the map — the caller renders a placeholder rather than a gap, so
 * a missing thumbnail never shifts the layout.
 */
export async function fetchThumbnails(adIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (adIds.length === 0) return out;

  const unique = [...new Set(adIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  let next = 0;
  const worker = async () => {
    for (;;) {
      const chunk = chunks[next++];
      if (!chunk) return;
      const url = spendRestUrl(
        "fb_ad_creative",
        `?select=ad_id,thumb_path&thumb_path=not.is.null` +
          `&ad_id=in.(${chunk.join(",")})`
      );
      // A thumbnail is decoration. If the lookup fails the page still reports
      // the spend correctly, so this must never surface as a page-level error.
      const res = await spendFetch(url).catch(() => null);
      if (!res || !res.ok) continue;
      for (const row of (await res.json()) as CreativeRow[]) {
        if (row.thumb_path) out.set(row.ad_id, `${PUBLIC_BUCKET}/${row.thumb_path}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, chunks.length) }, () => worker()));
  return out;
}
