import { describe, it, expect } from "vitest";
import { reconcileScenario, reconcileCost, scenarioSignature } from "../reconcileScenario";
import { emptyCostConfig } from "../types";
import type { ScenarioClient, CostConfig } from "../types";

const H = 12;
const c = (name: string, over: Partial<ScenarioClient> = {}): ScenarioClient => ({
  id: `id-${Math.random()}`, // ids are ephemeral; reconcile must key by name
  name,
  videosByMonth: new Array(H).fill(0),
  staticsByMonth: new Array(H).fill(0),
  enabled: true,
  hypothetical: false,
  ...over,
});
const names = (arr: ScenarioClient[]) => arr.map((x) => x.name).sort();
const vids = (arr: ScenarioClient[], name: string) => arr.find((x) => x.name === name)?.videosByMonth[0];

describe("reconcileScenario", () => {
  it("absorbs a client the other tab added while I made no edits", () => {
    const baseline = [c("Acme")];
    const mine = [c("Acme")]; // unchanged
    const theirs = [c("Acme"), c("Rachyl Co")]; // they added a line
    const r = reconcileScenario(baseline, mine, theirs);
    expect(names(r)).toEqual(["Acme", "Rachyl Co"]);
  });

  it("keeps my just-added line even though a stale remote doesn't have it", () => {
    const baseline = [c("Acme")];
    const mine = [c("Acme"), c("My New Line")];
    const theirs = [c("Acme")]; // remote hasn't seen my add
    const r = reconcileScenario(baseline, mine, theirs);
    expect(names(r)).toEqual(["Acme", "My New Line"]);
  });

  it("merges concurrent edits to different clients (both survive)", () => {
    const baseline = [c("Acme", { videosByMonth: new Array(H).fill(1) }), c("Beta", { videosByMonth: new Array(H).fill(1) })];
    const mine = [c("Acme", { videosByMonth: new Array(H).fill(9) }), c("Beta", { videosByMonth: new Array(H).fill(1) })]; // I edited Acme
    const theirs = [c("Acme", { videosByMonth: new Array(H).fill(1) }), c("Beta", { videosByMonth: new Array(H).fill(7) })]; // they edited Beta
    const r = reconcileScenario(baseline, mine, theirs);
    expect(vids(r, "Acme")).toBe(9); // my edit
    expect(vids(r, "Beta")).toBe(7); // their edit
  });

  it("honors a remote deletion for a client I never touched", () => {
    const baseline = [c("Acme"), c("Gone Co")];
    const mine = [c("Acme"), c("Gone Co")]; // untouched
    const theirs = [c("Acme")]; // they deleted Gone Co
    const r = reconcileScenario(baseline, mine, theirs);
    expect(names(r)).toEqual(["Acme"]);
  });

  it("keeps a client I edited even if the other tab deleted it (no data loss)", () => {
    const baseline = [c("Acme"), c("Contested", { videosByMonth: new Array(H).fill(1) })];
    const mine = [c("Acme"), c("Contested", { videosByMonth: new Array(H).fill(5) })]; // I edited it
    const theirs = [c("Acme")]; // they deleted it
    const r = reconcileScenario(baseline, mine, theirs);
    expect(names(r)).toEqual(["Acme", "Contested"]);
    expect(vids(r, "Contested")).toBe(5);
  });

  it("my version wins a true same-client conflict", () => {
    const baseline = [c("Acme", { videosByMonth: new Array(H).fill(1) })];
    const mine = [c("Acme", { videosByMonth: new Array(H).fill(9) })];
    const theirs = [c("Acme", { videosByMonth: new Array(H).fill(4) })];
    const r = reconcileScenario(baseline, mine, theirs);
    expect(vids(r, "Acme")).toBe(9);
  });

  it("matches by name regardless of differing ephemeral ids", () => {
    const baseline = [c("Acme")];
    const mine = [{ ...c("Acme"), id: "tab-a-1" }];
    const theirs = [{ ...c("Acme"), id: "tab-b-99", videosByMonth: new Array(H).fill(3) }];
    const r = reconcileScenario(baseline, mine, theirs);
    expect(r).toHaveLength(1);
    expect(vids(r, "Acme")).toBe(3); // their edit adopted, not duplicated
  });
});

describe("reconcileCost", () => {
  const cfg = (over: Partial<CostConfig>): CostConfig => ({ ...emptyCostConfig(H), ...over });
  it("keeps mine when I changed cost config", () => {
    const base = cfg({ rentByMonth: new Array(H).fill(100) });
    const mine = cfg({ rentByMonth: new Array(H).fill(200) });
    const theirs = cfg({ rentByMonth: new Array(H).fill(100) });
    expect(reconcileCost(base, mine, theirs).rentByMonth[0]).toBe(200);
  });
  it("adopts theirs when I didn't touch cost config", () => {
    const base = cfg({ rentByMonth: new Array(H).fill(100) });
    const mine = cfg({ rentByMonth: new Array(H).fill(100) });
    const theirs = cfg({ rentByMonth: new Array(H).fill(300) });
    expect(reconcileCost(base, mine, theirs).rentByMonth[0]).toBe(300);
  });
});

describe("scenarioSignature", () => {
  it("is stable across id changes and key ordering", () => {
    const a = scenarioSignature([{ ...c("Acme"), id: "1" }], emptyCostConfig(H));
    const b = scenarioSignature([{ ...c("Acme"), id: "2" }], emptyCostConfig(H));
    expect(a).toBe(b);
  });
  it("changes when a client value changes", () => {
    const a = scenarioSignature([c("Acme")], emptyCostConfig(H));
    const b = scenarioSignature([c("Acme", { videosByMonth: new Array(H).fill(1) })], emptyCostConfig(H));
    expect(a).not.toBe(b);
  });
});
