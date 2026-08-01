/**
 * Loads the two compared periods for the movement page.
 *
 * Windows are rolling and anchored to the newest report_date that actually has
 * rows, never to today. A day's rows land the following morning, so a window
 * computed from the clock silently reports a short period as a full one — the
 * trap the Python version documents and the reason both ends come from the data.
 *
 * Fetches are cached per (days, offset) for the session, so stepping back and
 * forth through periods costs one round trip each and then nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountMovement, aggregate } from "@/lib/movement/aggregate";
import { shiftDays } from "@/lib/movement/movement";
import { accountMap, fetchSpend, latestReportDate } from "@/lib/movement/spend";

export interface MovementWindow {
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
}

export interface MovementData {
  accounts: AccountMovement[];
  window: MovementWindow;
  anchor: string;
  total: number;
  priorTotal: number;
}

interface State {
  data: MovementData | null;
  isLoading: boolean;
  error: string | null;
  progress: { done: number; total: number } | null;
}

const cache = new Map<string, MovementData>();

/** Both windows, ending at `anchor` and stepped back by `offset` periods. */
export function windowFor(anchor: string, days: number, offset: number): MovementWindow {
  const currentEnd = shiftDays(anchor, -days * offset);
  const currentStart = shiftDays(currentEnd, -(days - 1));
  const priorEnd = shiftDays(currentStart, -1);
  const priorStart = shiftDays(priorEnd, -(days - 1));
  return { currentStart, currentEnd, priorStart, priorEnd };
}

export function useMovementData(days: number, offset: number) {
  const [state, setState] = useState<State>({
    data: null,
    isLoading: true,
    error: null,
    progress: null,
  });
  // Guards against a slow earlier request overwriting a newer selection.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const key = `${days}:${offset}`;
    const hit = cache.get(key);
    if (hit) {
      setState({ data: hit, isLoading: false, error: null, progress: null });
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null, progress: null }));
    try {
      const [anchor, accounts] = await Promise.all([latestReportDate(), accountMap()]);
      if (!anchor) throw new Error("fb_ad_spend has no rows");
      const win = windowFor(anchor, days, offset);
      const rows = await fetchSpend(win.priorStart, win.currentEnd, (done, total) => {
        if (requestId.current === id) {
          setState((s) => ({ ...s, progress: { done, total } }));
        }
      });
      const built = aggregate(
        rows,
        accounts,
        win.currentStart,
        win.currentEnd,
        win.priorStart,
        win.priorEnd
      );
      const data: MovementData = {
        accounts: built,
        window: win,
        anchor,
        total: built.reduce((sum, a) => sum + a.spend, 0),
        priorTotal: built.reduce((sum, a) => sum + a.priorSpend, 0),
      };
      cache.set(key, data);
      if (requestId.current === id) {
        setState({ data, isLoading: false, error: null, progress: null });
      }
    } catch (err) {
      if (requestId.current === id) {
        setState({
          data: null,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
          progress: null,
        });
      }
    }
  }, [days, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
