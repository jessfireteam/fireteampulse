/**
 * Thumbnails for whatever ads the movement page is currently showing.
 *
 * Deliberately keyed on the ads actually on screen rather than the whole
 * account: the page lists only ads that cleared the movement threshold, which
 * is a few hundred rows across every account, not the ~5,500 that had any spend
 * in the window.
 *
 * Cached for the session, because stepping between periods re-shows many of the
 * same ads and a thumbnail never changes once stored.
 */
import { useEffect, useState } from "react";
import { fetchThumbnails } from "@/lib/movement/thumbnails";

const cache = new Map<string, string>();
/** Ads already looked up and known to have nothing, so we stop re-asking. */
const misses = new Set<string>();

export function useThumbnails(adIds: string[]) {
  const [thumbs, setThumbs] = useState<Map<string, string>>(cache);

  // A stable key: the same set of ads in a different order must not refetch.
  const key = [...new Set(adIds)].sort().join(",");

  useEffect(() => {
    if (!key) return;
    const wanted = key.split(",").filter((id) => !cache.has(id) && !misses.has(id));
    if (wanted.length === 0) {
      setThumbs(new Map(cache));
      return;
    }
    let live = true;
    void fetchThumbnails(wanted).then((found) => {
      for (const [id, url] of found) cache.set(id, url);
      for (const id of wanted) if (!found.has(id)) misses.add(id);
      if (live) setThumbs(new Map(cache));
    });
    return () => {
      live = false;
    };
  }, [key]);

  return thumbs;
}
