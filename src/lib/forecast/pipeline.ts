// src/lib/forecast/pipeline.ts
import { addMonths, format } from "date-fns";
import type { PipelineConfig, ScenarioClient } from "./types";

/**
 * Stamp the standing new-business assumption into ScenarioClient rows.
 *
 * Deterministic on (config, referenceDate): same inputs → byte-identical rows, so generating
 * at load time never reads as an edit and the no-write-on-load invariant holds. Names are
 * calendar-anchored ("Pipeline · Oct '26"), which gives saved hand-edits of a pipeline row a
 * stable key to pin against across sessions. As months roll forward the generation window
 * slides with them — a rolling assumption, not a fixed list — and any row someone edited
 * survives on its own as a saved hypothetical even after the window moves past it.
 */
export function generatePipelineClients(
  config: PipelineConfig | undefined,
  horizon: number,
  referenceDate: Date,
): ScenarioClient[] {
  if (!config?.enabled) return [];
  const every = Math.max(1, Math.round(config.everyNMonths));
  const first = Math.min(Math.max(0, Math.round(config.firstMonthIndex)), horizon - 1);

  const rows: ScenarioClient[] = [];
  for (let m = first; m < horizon; m += every) {
    const label = format(addMonths(referenceDate, m), "MMM ''yy");
    const videos = new Array(horizon).fill(0);
    const statics = new Array(horizon).fill(0);
    for (let i = m; i < horizon; i++) {
      videos[i] = config.videosPerMonth;
      statics[i] = config.staticsPerMonth;
    }
    rows.push({
      // Deterministic id: never minted from a counter, so regeneration is stable within a
      // session and reconcileScenario's name-keyed matching does the cross-session work.
      id: `pipeline-${label.replace(/[^A-Za-z0-9]+/g, "-")}`,
      name: `Pipeline · ${label}`,
      videosByMonth: videos,
      staticsByMonth: statics,
      enabled: true,
      hypothetical: true,
      pipeline: true,
      newBusiness: true,
      pricing: { minFee: config.minFee, tiers: [] },
      startMonthIndex: m,
    });
  }
  return rows;
}

/**
 * Replace the generated rows inside an existing client list after a config change, preserving
 * everything a person has touched: non-pipeline rows always survive, and a pipeline row whose
 * volumes were pinned (manualVolumes) survives under its name if the new config still
 * generates that month. Fresh months are appended; unpinned stale months drop.
 */
export function replaceGeneratedRows(
  current: ScenarioClient[],
  fresh: ScenarioClient[],
): ScenarioClient[] {
  const freshByName = new Map(fresh.map((c) => [c.name, c]));
  const kept: ScenarioClient[] = [];
  for (const c of current) {
    if (!c.pipeline) {
      kept.push(c);
      continue;
    }
    const replacement = freshByName.get(c.name);
    if (replacement) {
      kept.push(c.manualVolumes ? { ...replacement, videosByMonth: c.videosByMonth, staticsByMonth: c.staticsByMonth, manualVolumes: true, enabled: c.enabled, pricing: c.pricing } : { ...replacement, enabled: c.enabled });
      freshByName.delete(c.name);
    }
    // No replacement -> the window moved or the config shrank; unpinned generated row drops.
  }
  return [...kept, ...freshByName.values()];
}
