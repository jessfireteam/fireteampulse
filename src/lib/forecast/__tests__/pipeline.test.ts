import { describe, it, expect } from "vitest";
import { generatePipelineClients, replaceGeneratedRows } from "../pipeline";
import type { PipelineConfig, ScenarioClient } from "../types";

const H = 12;
const REF = new Date(2026, 7, 1); // Aug '26

const config = (over: Partial<PipelineConfig> = {}): PipelineConfig => ({
  enabled: true,
  everyNMonths: 1,
  firstMonthIndex: 2,
  videosPerMonth: 6,
  staticsPerMonth: 6,
  minFee: 5000,
  ...over,
});

describe("generatePipelineClients", () => {
  it("is deterministic: same config and date produce byte-identical rows", () => {
    const a = generatePipelineClients(config(), H, REF);
    const b = generatePipelineClients(config(), H, REF);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("stamps one client per cadence step from the first month to the horizon", () => {
    const rows = generatePipelineClients(config({ everyNMonths: 2 }), H, REF);
    expect(rows.map((r) => r.startMonthIndex)).toEqual([2, 4, 6, 8, 10]);
  });

  it("anchors names to calendar months so saved edits have a stable key", () => {
    const rows = generatePipelineClients(config(), H, REF);
    expect(rows[0].name).toBe("Pipeline · Oct '26");
    expect(rows[3].name).toBe("Pipeline · Jan '27");
  });

  it("volumes are zero before the signing month and flat at size after", () => {
    const [first] = generatePipelineClients(config(), H, REF);
    expect(first.videosByMonth.slice(0, 2)).toEqual([0, 0]);
    expect(first.videosByMonth.slice(2)).toEqual(new Array(H - 2).fill(6));
    expect(first.startMonthIndex).toBe(2);
    expect(first.pricing).toEqual({ minFee: 5000, tiers: [] });
    expect(first.pipeline).toBe(true);
    expect(first.hypothetical).toBe(true);
  });

  it("returns nothing when disabled or absent", () => {
    expect(generatePipelineClients(config({ enabled: false }), H, REF)).toEqual([]);
    expect(generatePipelineClients(undefined, H, REF)).toEqual([]);
  });
});

describe("replaceGeneratedRows", () => {
  const gen = (name: string, v = 6): ScenarioClient => ({
    id: `pipeline-${name}`,
    name,
    videosByMonth: new Array(H).fill(v),
    staticsByMonth: new Array(H).fill(v),
    enabled: true,
    hypothetical: true,
    pipeline: true,
  });

  it("leaves real clients alone and swaps generated rows for fresh ones", () => {
    const real: ScenarioClient = { ...gen("Acme"), pipeline: undefined, hypothetical: false };
    const out = replaceGeneratedRows([real, gen("Pipeline · Oct '26", 6)], [gen("Pipeline · Oct '26", 9)]);
    expect(out.find((c) => c.name === "Acme")).toBe(real);
    expect(out.find((c) => c.name === "Pipeline · Oct '26")!.videosByMonth[0]).toBe(9);
  });

  it("keeps pinned volumes and the enabled flag across a config change", () => {
    const pinned = { ...gen("Pipeline · Oct '26", 3), manualVolumes: true, enabled: false };
    const out = replaceGeneratedRows([pinned], [gen("Pipeline · Oct '26", 9)]);
    const row = out.find((c) => c.name === "Pipeline · Oct '26")!;
    expect(row.videosByMonth[0]).toBe(3);
    expect(row.enabled).toBe(false);
    expect(row.manualVolumes).toBe(true);
  });

  it("drops unpinned rows the new config no longer generates, appends new months", () => {
    const out = replaceGeneratedRows(
      [gen("Pipeline · Oct '26"), gen("Pipeline · Nov '26")],
      [gen("Pipeline · Nov '26"), gen("Pipeline · Jan '27")],
    );
    expect(out.map((c) => c.name)).toEqual(["Pipeline · Nov '26", "Pipeline · Jan '27"]);
  });
});
