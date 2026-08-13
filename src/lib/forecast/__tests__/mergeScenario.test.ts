import { describe, it, expect } from "vitest";
import { mergeScenario } from "../mergeScenario";
import type { ClientPlan, ScenarioClient } from "../types";

const H = 12;
let n = 0; const makeId = () => `id-${++n}`;
const plan = (client: string, videos = 0, statics = 0, over: Partial<ClientPlan> = {}): ClientPlan => ({ client, max: videos + statics, min: null, videoShare: 0.5, mixSource: "client", videos, statics, source: "max", ...over });
const saved = (name: string, over: Partial<ScenarioClient> = {}): ScenarioClient => ({ id: "x", name, videosByMonth: new Array(H).fill(0), staticsByMonth: new Array(H).fill(0), enabled: true, hypothetical: false, ...over });

describe("mergeScenario", () => {
  it("seeds active clients flat from the derived plan when no saved entry", () => {
    const r = mergeScenario([plan("Acme", 5, 2)], [], H, makeId);
    expect(r).toHaveLength(1);
    expect(r[0].videosByMonth).toEqual(new Array(H).fill(5));
    expect(r[0].staticsByMonth).toEqual(new Array(H).fill(2));
  });
  it("REPLACES saved volumes that were never explicitly edited (the staleness fix)", () => {
    const stale = new Array(H).fill(9);
    const r = mergeScenario(
      [plan("Acme", 5, 2)],
      [saved("Acme", { videosByMonth: stale, staticsByMonth: stale })],
      H,
      makeId,
    );
    expect(r[0].videosByMonth).toEqual(new Array(H).fill(5));
    expect(r[0].staticsByMonth).toEqual(new Array(H).fill(2));
    expect(r[0].manualVolumes).toBeUndefined();
  });
  it("keeps a saved row whose months VARY, even with no manualVolumes flag (migration)", () => {
    // A derived row is flat by construction, so varying months are proof of a deliberate
    // ramp. Ground News and Spacelift both have one in the live scenario.
    const ramp = new Array(H).fill(4);
    ramp[0] = 1;
    ramp[1] = 2;
    const r = mergeScenario(
      [plan("Ground News", 24, 6)],
      [saved("Ground News", { videosByMonth: ramp })],
      H,
      makeId,
    );
    expect(r[0].videosByMonth).toEqual(ramp);
    expect(r[0].manualVolumes).toBe(true);
  });
  it("detects a shaped ramp in the statics array too", () => {
    const ramp = new Array(H).fill(3);
    ramp[5] = 0; // a paused month
    const r = mergeScenario(
      [plan("Acme", 5, 2)],
      [saved("Acme", { staticsByMonth: ramp })],
      H,
      makeId,
    );
    expect(r[0].staticsByMonth).toEqual(ramp);
    expect(r[0].manualVolumes).toBe(true);
  });
  it("keeps saved volumes when the client is flagged manualVolumes", () => {
    const mine = new Array(H).fill(9);
    const r = mergeScenario(
      [plan("Acme", 5, 2)],
      [saved("Acme", { videosByMonth: mine, staticsByMonth: mine, manualVolumes: true })],
      H,
      makeId,
    );
    expect(r[0].videosByMonth).toEqual(mine);
    expect(r[0].staticsByMonth).toEqual(mine);
    expect(r[0].manualVolumes).toBe(true);
  });
  it("leaves manualVolumes absent rather than false, so it never reads as a diff", () => {
    const r = mergeScenario([plan("Acme", 5, 2)], [], H, makeId);
    expect("manualVolumes" in r[0]).toBe(true);
    expect(r[0].manualVolumes).toBeUndefined();
  });
  it("still takes enabled from the saved entry", () => {
    const r = mergeScenario([plan("Acme", 5, 2)], [saved("Acme", { enabled: false })], H, makeId);
    expect(r[0].enabled).toBe(false);
  });
  it("keeps saved hypothetical clients not in the active roster", () => {
    const r = mergeScenario([plan("Acme")], [saved("Prospect X", { hypothetical: true, videosByMonth: new Array(H).fill(3) })], H, makeId);
    expect(r.map((c) => c.name)).toContain("Prospect X");
  });
  it("never re-derives a hypothetical client's volumes", () => {
    const v = new Array(H).fill(3);
    const r = mergeScenario([plan("Acme", 5, 2)], [saved("Prospect X", { hypothetical: true, videosByMonth: v })], H, makeId);
    expect(r.find((c) => c.name === "Prospect X")!.videosByMonth).toEqual(v);
  });
  it("drops saved non-hypothetical entries for clients no longer active", () => {
    const r = mergeScenario([plan("Acme")], [saved("Retired Co")], H, makeId);
    expect(r.map((c) => c.name)).toEqual(["Acme"]);
  });
  it("ignores manual month arrays of the wrong length", () => {
    const r = mergeScenario([plan("Acme", 5, 2)], [saved("Acme", { videosByMonth: [1, 2, 3], manualVolumes: true })], H, makeId);
    expect(r[0].videosByMonth).toEqual(new Array(H).fill(5));
  });
  it("preserves saved revenue fields (pricing/adSpend/agencyPct) across a re-derive", () => {
    const pricing = { minFee: 3000, tiers: [{ upTo: null, rate: 5 }] };
    const r = mergeScenario(
      [plan("Acme", 5, 2)],
      [saved("Acme", { pricing, adSpendByMonth: new Array(H).fill(100000), agencyPctByMonth: new Array(H).fill(40) })],
      H,
      makeId,
    );
    expect(r[0].pricing).toEqual(pricing);
    expect(r[0].adSpendByMonth).toEqual(new Array(H).fill(100000));
    expect(r[0].agencyPctByMonth).toEqual(new Array(H).fill(40));
  });
  it("preserves saved active-window months for an active client", () => {
    const r = mergeScenario(
      [plan("Acme", 5, 2)],
      [saved("Acme", { startMonthIndex: 1, endMonthIndex: 6 })],
      H,
      makeId,
    );
    expect(r[0].startMonthIndex).toBe(1);
    expect(r[0].endMonthIndex).toBe(6);
  });
  it("preserves saved active-window months for a hypothetical client", () => {
    const r = mergeScenario(
      [plan("Acme")],
      [saved("Prospect X", { hypothetical: true, startMonthIndex: 3, endMonthIndex: null })],
      H,
      makeId,
    );
    const px = r.find((c) => c.name === "Prospect X")!;
    expect(px.startMonthIndex).toBe(3);
    expect(px.endMonthIndex).toBeNull();
  });
  it("preserves the newBusiness flag for both active and hypothetical clients", () => {
    const r = mergeScenario(
      [plan("Acme", 5, 2)],
      [
        saved("Acme", { newBusiness: true }),
        saved("Prospect X", { hypothetical: true, newBusiness: true }),
      ],
      H,
      makeId,
    );
    expect(r.find((c) => c.name === "Acme")!.newBusiness).toBe(true);
    expect(r.find((c) => c.name === "Prospect X")!.newBusiness).toBe(true);
  });
  it("adds generated pipeline rows and lets a saved same-name row carry the edits", () => {
    const gen: ScenarioClient = {
      id: "pipeline-oct", name: "Pipeline · Oct '26",
      videosByMonth: new Array(H).fill(6), staticsByMonth: new Array(H).fill(6),
      enabled: true, hypothetical: true, pipeline: true,
      pricing: { minFee: 5000, tiers: [] },
      startMonthIndex: 2,
    };
    const savedRow = saved("Pipeline · Oct '26", {
      enabled: false, // unchecked persists
      pricing: { minFee: 9000, tiers: [] },
      videosByMonth: new Array(H).fill(3),
      staticsByMonth: new Array(H).fill(3),
      manualVolumes: true,
      pipeline: true,
      hypothetical: true,
    });
    const r = mergeScenario([plan("Acme", 5, 2)], [savedRow], H, makeId, [gen]);
    const p = r.find((c) => c.name === "Pipeline · Oct '26")!;
    expect(p.enabled).toBe(false);
    expect(p.pricing?.minFee).toBe(9000);
    expect(p.videosByMonth).toEqual(new Array(H).fill(3));
    expect(p.pipeline).toBe(true);
    // Not duplicated by the hypothetical carry-over.
    expect(r.filter((c) => c.name === "Pipeline · Oct '26")).toHaveLength(1);
  });

  it("drops a stale unpinned pipeline row but carries a pinned one", () => {
    const stale = saved("Pipeline · Sep '26", { pipeline: true, hypothetical: true });
    const pinned = saved("Pipeline · Aug '26", {
      pipeline: true, hypothetical: true, manualVolumes: true,
      videosByMonth: new Array(H).fill(4), staticsByMonth: new Array(H).fill(0),
    });
    // Generator no longer produces either month.
    const r = mergeScenario([plan("Acme", 5, 2)], [stale, pinned], H, makeId, []);
    expect(r.map((c) => c.name)).not.toContain("Pipeline · Sep '26");
    expect(r.find((c) => c.name === "Pipeline · Aug '26")!.videosByMonth).toEqual(new Array(H).fill(4));
  });

  it("preserves saved one-off fees for an active client", () => {
    const oneOffs = new Array(H).fill(0); oneOffs[0] = 10000;
    const r = mergeScenario(
      [plan("Acme", 5, 2)],
      [saved("Acme", { oneOffsByMonth: oneOffs })],
      H,
      makeId,
    );
    expect(r[0].oneOffsByMonth).toEqual(oneOffs);
  });
});
