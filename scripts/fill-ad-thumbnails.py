#!/usr/bin/env python3
"""
Fill fb_ad_creative with ad thumbnails for the Movement page.

WHY THIS EXISTS AT ALL. Meta's Insights API is what fills fb_ad_spend, and it
carries no creative imagery whatsoever. The thumbnail lives on the Ad's creative
object, which is a separate Graph read, so "put the Ads Manager thumbnail on the
row" is a fetch we have to run ourselves rather than a column we forgot to
select.

WHY IT STORES BYTES AND NOT URLS. Meta signs thumbnail_url with an `oe` expiry
two to five days out (measured against live ads on 2026-08-03). The Movement
page's whole point is stepping back through earlier periods, so a stored URL
would leave every historical view rendering broken images within a week. We
download once into the public ad-thumbnails bucket and keep only the path.

WHY TWO HOPS. thumbnail_width/thumbnail_height are silently ignored when
thumbnail_url is requested nested under the ad (`ads?fields=creative{...}`) —
you get 64x64 regardless. Requested on the adcreative node directly they work,
so hop 1 maps ad -> creative id and hop 2 reads creatives at THUMB_PX. Both hops
batch 50 ids per request, which is why a 6.5k-ad backfill is ~260 Graph calls
rather than 13,000.

Keyed on ad_id because that is what fb_ad_spend and the page have, but the image
is stored per creative, so ads sharing a creative share one upload.

Run:  python3 scripts/fill-ad-thumbnails.py [--min-spend 400] [--limit N] [--dry-run]
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse as up
import urllib.request
from concurrent.futures import ThreadPoolExecutor

GRAPH = "https://graph.facebook.com/v21.0"
N8N = "https://hirefireteam.app.n8n.cloud/api/v1"
MCP_JSON = "/Users/jessbachman/fireteam/.mcp.json"

BUCKET = "ad-thumbnails"
THUMB_PX = 320  # 64px is Meta's default and looks soft on retina; 320 is ~14KB
BATCH = 50      # Graph's ?ids= limit
WORKERS = 12


# --------------------------------------------------------------------------
# credentials — read from the n8n instance so there is one place to rotate them
# --------------------------------------------------------------------------

def http(url, *, headers=None, data=None, method=None, raw=False, timeout=90):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    return body if raw else json.loads(body)


def load_secrets():
    key = json.load(open(MCP_JSON))["mcpServers"]["n8n"]["env"]["N8N_API_KEY"]
    rows = http(f"{N8N}/variables", headers={"X-N8N-API-KEY": key})["data"]
    v = {r["key"]: r["value"] for r in rows}
    missing = [k for k in ("META_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_KEY") if k not in v]
    if missing:
        sys.exit(f"n8n is missing variables: {', '.join(missing)}")
    return v["META_ACCESS_TOKEN"], v["SUPABASE_PROJECT_REF"], v["SUPABASE_SERVICE_KEY"]


# --------------------------------------------------------------------------
# supabase
# --------------------------------------------------------------------------

class Supa:
    def __init__(self, ref, service_key):
        self.base = f"https://{ref}.supabase.co"
        self.h = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

    def todo(self, min_spend, limit):
        """Ads worth a thumbnail that do not have one yet.

        The floor mirrors the page's own absolute threshold: an ad that never
        cleared $400 in its life can never appear in a Movement block, so
        fetching its creative would be pure cost.
        """
        body = {"min_spend": min_spend, "row_limit": limit}
        return http(f"{self.base}/rest/v1/rpc/ads_needing_thumbnails",
                    headers={**self.h, "Content-Type": "application/json"},
                    data=json.dumps(body).encode(), method="POST")

    def stored_creatives(self):
        """{creative_id: thumb_path} for everything already stored. Paged,
        because PostgREST caps a response at 1000 rows."""
        out, offset = {}, 0
        while True:
            rows = http(
                f"{self.base}/rest/v1/fb_ad_creative"
                f"?select=creative_id,thumb_path&thumb_path=not.is.null"
                f"&limit=1000&offset={offset}", headers=self.h)
            if not rows:
                return out
            for r in rows:
                out[r["creative_id"]] = r["thumb_path"]
            offset += 1000

    def upload(self, path, blob, content_type):
        url = f"{self.base}/storage/v1/object/{BUCKET}/{up.quote(path)}"
        http(url, headers={**self.h, "Content-Type": content_type, "x-upsert": "true"},
             data=blob, method="POST", raw=True)

    def upsert(self, rows):
        if not rows:
            return
        http(f"{self.base}/rest/v1/fb_ad_creative?on_conflict=ad_id",
             headers={**self.h, "Content-Type": "application/json",
                      "Prefer": "resolution=merge-duplicates,return=minimal"},
             data=json.dumps(rows).encode(), method="POST", raw=True)


# --------------------------------------------------------------------------
# meta
# --------------------------------------------------------------------------

def graph_ids(token, ids, fields, **extra):
    """Batched ?ids= read. Returns {} rather than raising when the whole batch
    is rejected — a single deleted ad can 400 the request, and losing one batch
    must not abort a 6,000-ad backfill."""
    q = up.urlencode({"ids": ",".join(ids), "fields": fields, "access_token": token, **extra})
    try:
        return http(f"{GRAPH}/?{q}")
    except urllib.error.HTTPError:
        if len(ids) == 1:
            return {}
        mid = len(ids) // 2  # bisect so one bad id costs one id, not the batch
        out = graph_ids(token, ids[:mid], fields, **extra)
        out.update(graph_ids(token, ids[mid:], fields, **extra))
        return out


def fetch_bytes(url):
    try:
        return http(url, raw=True, timeout=60)
    except Exception:
        return None


def rescale(blob, px=THUMB_PX):
    """Square-crop and shrink to px. Only used on the object_story_spec fallback,
    which comes back at full creative size (1080x1920 and ~170KB); leaving those
    unresized would make a row cost 100x what the Graph thumbnail costs."""
    from io import BytesIO
    from PIL import Image
    im = Image.open(BytesIO(blob)).convert("RGB")
    side = min(im.size)
    left, top = (im.width - side) // 2, (im.height - side) // 2
    im = im.crop((left, top, left + side, top + side)).resize((px, px), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, "JPEG", quality=82, optimize=True)
    return buf.getvalue()


def real_cover(token, creative_id):
    """The creative's own cover image, for creatives Graph will not thumbnail.

    When the token lacks full rights on the underlying asset, Meta does not
    error — it returns object_type PRIVACY_CHECK_FAIL and hands back the
    advertiser's brand logo as thumbnail_url. That is worse than no image: every
    such ad renders the identical square, so the column looks populated while
    telling you nothing. Measured on Honeylove, 23 of 400 sampled ads collapsed
    onto one logo this way.

    object_story_spec still carries the true cover, so this refetches from there
    and downsizes it to match the normal path.
    """
    d = http(f"{GRAPH}/{creative_id}?" + up.urlencode({
        "fields": "object_story_spec{video_data{image_url},link_data{picture}}",
        "access_token": token}))
    oss = d.get("object_story_spec") or {}
    url = ((oss.get("video_data") or {}).get("image_url")
           or (oss.get("link_data") or {}).get("picture"))
    if not url:
        return None
    blob = fetch_bytes(url)
    try:
        return rescale(blob) if blob else None
    except Exception:
        return blob


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-spend", type=float, default=400,
                    help="lifetime spend floor; matches the page's own threshold")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--recheck-privacy", action="store_true",
                    help="re-pull creatives Meta answered with a brand logo")
    args = ap.parse_args()

    token, ref, service_key = load_secrets()
    supa = Supa(ref, service_key)

    if args.recheck_privacy:
        recheck_privacy(supa, token, args.dry_run)
        return

    # PostgREST caps a response at 1000 rows, so one call is a page and not the
    # whole worklist. Each pass writes fb_ad_creative rows, which is exactly what
    # the RPC excludes, so re-asking walks the backlog down to nothing.
    total_ok = total_skipped = total_failed = total_creatives = 0
    while True:
        todo = supa.todo(args.min_spend, args.limit)
        print(f"{len(todo)} ads need a thumbnail")
        if not todo or args.dry_run:
            break
        ok, skipped, failed, creatives = fill(supa, token, todo)
        total_ok += ok
        total_skipped += skipped
        total_failed += failed
        total_creatives += creatives
        if args.limit:  # an explicit limit means "just this many", not "drain"
            break

    print(f"\ndone: {total_ok} stored ({total_creatives} distinct creatives), "
          f"{total_skipped} without a thumbnail, {total_failed} unreadable")


def recheck_privacy(supa, token, dry_run=False):
    """Repair creatives already stored as the advertiser's logo.

    Separate from the main fill because those rows look successful — status
    'ok', a real path, a real JPEG — so nothing in the incremental path would
    ever revisit them. Safe to re-run; creatives that thumbnail normally are
    left untouched.
    """
    stored = supa.stored_creatives()
    print(f"checking {len(stored)} stored creatives for logo substitution")

    bad = []
    ids = sorted(stored)
    for i in range(0, len(ids), BATCH):
        got = graph_ids(token, ids[i:i + BATCH], "object_type")
        bad += [c for c, v in got.items() if v.get("object_type") == "PRIVACY_CHECK_FAIL"]
        print(f"  {min(i + BATCH, len(ids))}/{len(ids)} checked · {len(bad)} substituted", flush=True)

    print(f"{len(bad)} creatives returned a logo instead of the ad")
    if not bad or dry_run:
        return

    fixed = 0
    def repair(cid):
        nonlocal fixed
        try:
            blob = real_cover(token, cid)
            if not blob:
                return
            supa.upload(stored[cid], blob, "image/jpeg")
            fixed += 1
        except Exception as e:
            print(f"  repair failed {cid}: {e}", file=sys.stderr)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(repair, bad))
    print(f"replaced {fixed} of {len(bad)} with the creative's real cover")


def fill(supa, token, todo):
    """One pass over a worklist of {ad_id, account_id} rows."""

    by_ad_account = {r["ad_id"]: r["account_id"] for r in todo}
    ad_ids = list(by_ad_account)

    uploaded = {}   # creative_id -> stored path
    done = ok = skipped = failed = 0

    for i in range(0, len(ad_ids), BATCH):
        chunk = ad_ids[i:i + BATCH]

        # hop 1: ad -> creative id
        hop1 = graph_ids(token, chunk, "creative{id}")
        creative_of = {a: (v.get("creative") or {}).get("id") for a, v in hop1.items()}

        # hop 2: creative -> sized thumbnail url (only ones we have not stored)
        want = sorted({c for c in creative_of.values() if c and c not in uploaded})
        hop2 = {}
        for j in range(0, len(want), BATCH):
            hop2.update(graph_ids(token, want[j:j + BATCH], "thumbnail_url,object_type",
                                  thumbnail_width=THUMB_PX, thumbnail_height=THUMB_PX))

        def grab(cid):
            meta = hop2.get(cid, {})
            # PRIVACY_CHECK_FAIL means thumbnail_url is the brand logo, not the
            # ad. Go to object_story_spec for the creative's real cover instead.
            if meta.get("object_type") == "PRIVACY_CHECK_FAIL":
                try:
                    blob = real_cover(token, cid)
                    if blob:
                        return cid, blob
                except Exception:
                    pass
            url = meta.get("thumbnail_url")
            return cid, (fetch_bytes(url) if url else None)

        with ThreadPoolExecutor(WORKERS) as pool:
            blobs = list(pool.map(grab, want))

        def store(item):
            cid, blob = item
            if not blob:
                return
            acct = next((by_ad_account[a] for a, c in creative_of.items() if c == cid), "unknown")
            path = f"{acct}/{cid}.jpg"
            try:
                supa.upload(path, blob, "image/jpeg")
                uploaded[cid] = path
            except Exception as e:
                print(f"  upload failed {cid}: {e}", file=sys.stderr)

        with ThreadPoolExecutor(WORKERS) as pool:
            list(pool.map(store, blobs))

        rows = []
        for ad in chunk:
            cid = creative_of.get(ad)
            path = uploaded.get(cid) if cid else None
            status = "ok" if path else ("no_thumbnail" if cid else "error")
            rows.append({"ad_id": ad, "account_id": by_ad_account[ad], "creative_id": cid,
                         "thumb_path": path, "status": status})
            ok += status == "ok"
            skipped += status == "no_thumbnail"
            failed += status == "error"
        supa.upsert(rows)

        done += len(chunk)
        print(f"  {done}/{len(ad_ids)} ads · {ok} stored · {skipped} no thumbnail · {failed} unreadable",
              flush=True)

    return ok, skipped, failed, len(uploaded)


if __name__ == "__main__":
    main()
