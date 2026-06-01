// src/lib/forecast/__tests__/baseline.test.ts
import { describe, it, expect } from "vitest";
import { computeClientBaselines } from "../baseline";

function p(client: string, doneDate: string) {
  return { doneDate, client: { name: client } };
}

describe("computeClientBaselines", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("derives monthly run-rate from the last 4 completed weeks", () => {
    const projects = [
      p("Acme", "2026-05-04"), p("Acme", "2026-05-05"),
      p("Acme", "2026-05-11"), p("Acme", "2026-05-12"),
      p("Acme", "2026-05-18"), p("Acme", "2026-05-19"),
      p("Acme", "2026-05-25"), p("Acme", "2026-05-26"),
    ];
    const [acme] = computeClientBaselines(projects, now, 12);
    expect(acme.client).toBe("Acme");
    expect(acme.monthlyRate).toBe(9);
  });

  it("flags an upward trend when recent weeks outpace prior weeks", () => {
    const projects = [
      p("Ramp", "2026-03-16"),
      p("Ramp", "2026-05-04"), p("Ramp", "2026-05-11"),
      p("Ramp", "2026-05-18"), p("Ramp", "2026-05-25"),
      p("Ramp", "2026-05-05"), p("Ramp", "2026-05-12"),
      p("Ramp", "2026-05-19"), p("Ramp", "2026-05-26"),
    ];
    const [ramp] = computeClientBaselines(projects, now, 12);
    expect(ramp.trendPct).not.toBeNull();
    expect(ramp.trendPct!).toBeGreaterThan(0);
  });

  it("excludes the current partial week from counts", () => {
    const projects = [p("Acme", "2026-06-01")];
    const result = computeClientBaselines(projects, now, 12);
    expect(result.find((r) => r.client === "Acme")).toBeUndefined();
  });
});
