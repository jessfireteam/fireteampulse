import { describe, it, expect } from "vitest";
import { mergeScenario } from "../mergeScenario";
import type { ClientHistory, ScenarioClient } from "../types";

const H = 12;
let n = 0; const makeId = () => `id-${++n}`;
const hist = (client: string, sv = 0, ss = 0): ClientHistory => ({ client, videosByMonth: [0,0,0], staticsByMonth: [0,0,0], seedVideos: sv, seedStatics: ss });
const saved = (name: string, over: Partial<ScenarioClient> = {}): ScenarioClient => ({ id: "x", name, videosByMonth: new Array(H).fill(0), staticsByMonth: new Array(H).fill(0), enabled: true, hypothetical: false, ...over });

describe("mergeScenario", () => {
  it("seeds active clients flat from run-rate when no saved entry", () => {
    const r = mergeScenario([hist("Acme", 5, 2)], [], H, makeId);
    expect(r).toHaveLength(1);
    expect(r[0].videosByMonth).toEqual(new Array(H).fill(5));
    expect(r[0].staticsByMonth).toEqual(new Array(H).fill(2));
  });
  it("overrides an active client's months/enabled from the saved entry", () => {
    const v = new Array(H).fill(9);
    const r = mergeScenario([hist("Acme", 5, 2)], [saved("Acme", { videosByMonth: v, enabled: false })], H, makeId);
    expect(r[0].videosByMonth).toEqual(v);
    expect(r[0].enabled).toBe(false);
  });
  it("keeps saved hypothetical clients not in the active roster", () => {
    const r = mergeScenario([hist("Acme")], [saved("Prospect X", { hypothetical: true, videosByMonth: new Array(H).fill(3) })], H, makeId);
    expect(r.map((c) => c.name)).toContain("Prospect X");
  });
  it("drops saved non-hypothetical entries for clients no longer active", () => {
    const r = mergeScenario([hist("Acme")], [saved("Retired Co")], H, makeId);
    expect(r.map((c) => c.name)).toEqual(["Acme"]);
  });
  it("ignores saved month arrays of the wrong length", () => {
    const r = mergeScenario([hist("Acme", 5)], [saved("Acme", { videosByMonth: [1,2,3] })], H, makeId);
    expect(r[0].videosByMonth).toEqual(new Array(H).fill(5));
  });
});
