import { describe, it, expect } from "vitest";
import { actualAdSpendByClientMonth } from "../adSpendActuals";

const rows = [
  { name: "2026-05 Bambu Earth", client: { name: "Bambu Earth" }, totalSpend: 200000 },
  { name: "2026-04 Bambu Earth", client: { name: "Bambu Earth" }, totalSpend: 180000 },
  { name: "2026-05 Rejuvia", client: { name: "Rejuvia" }, totalSpend: 400000 },
  { name: "bad", client: null, totalSpend: 999 },
];

describe("actualAdSpendByClientMonth", () => {
  it("indexes total ad spend by client name and YYYY-MM month key", () => {
    const map = actualAdSpendByClientMonth(rows);
    expect(map.get("bambu earth")?.get("2026-05")).toBe(200000);
    expect(map.get("bambu earth")?.get("2026-04")).toBe(180000);
    expect(map.get("rejuvia")?.get("2026-05")).toBe(400000);
  });
  it("skips rows with no client or unparseable month", () => {
    const map = actualAdSpendByClientMonth(rows);
    expect([...map.keys()]).not.toContain("bad");
  });
});
