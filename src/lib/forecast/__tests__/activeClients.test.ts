import { describe, it, expect } from "vitest";
import { activeClientNames, filterActiveHistories } from "../activeClients";
import type { ClientHistory } from "../types";

const hist = (client: string): ClientHistory => ({ client, videosByMonth: [0,0,0], staticsByMonth: [0,0,0], seedVideos: 0, seedStatics: 0 });

describe("activeClientNames", () => {
  it("keeps Active, drops Inactive/Retired and the Fireteam internal entity", () => {
    const set = activeClientNames([
      { name: "Bambu Earth", status: { name: "Active" } },
      { name: "Subtl Beauty", status: { name: "Inactive" } },
      { name: "Dog Friendly Co.", status: { name: "Retired" } },
      { name: "Fireteam", status: { name: "Active" } },
    ]);
    expect(set.has("bambu earth")).toBe(true);
    expect(set.has("subtl beauty")).toBe(false);
    expect(set.has("dog friendly co.")).toBe(false);
    expect(set.has("fireteam")).toBe(false);
  });
});

describe("filterActiveHistories", () => {
  it("keeps only active clients, case-insensitively", () => {
    const active = new Set(["bambu earth"]);
    const result = filterActiveHistories([hist("Bambu Earth"), hist("Dog Friendly Co.")], active);
    expect(result.map((h) => h.client)).toEqual(["Bambu Earth"]);
  });
});
