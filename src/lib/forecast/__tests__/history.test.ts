import { describe, it, expect } from "vitest";
import { computeClientHistory } from "../history";

function proj(client: string, doneDate: string, typeName: string, name = "P") {
  return { client: { name: client }, doneDate, name, type: { name: typeName } };
}

describe("computeClientHistory", () => {
  const now = new Date(2026, 5, 1); // June 1 2026 -> past months: Mar, Apr, May

  it("buckets past months by client and asset type", () => {
    const projects = [
      proj("Acme", "2026-05-10", "Video"),
      proj("Acme", "2026-05-12", "Static"),
      proj("Acme", "2026-04-10", "Video"),
    ];
    const [acme] = computeClientHistory(projects as never, now, 3);
    expect(acme.client).toBe("Acme");
    expect(acme.videosByMonth).toHaveLength(3); // Mar, Apr, May
    expect(acme.staticsByMonth).toHaveLength(3);
    // May (newest, index 2): 1 video, 1 static; April (index 1): 1 video
    expect(acme.videosByMonth[2]).toBe(1);
    expect(acme.staticsByMonth[2]).toBe(1);
    expect(acme.videosByMonth[1]).toBe(1);
  });

  it("excludes the current month and provides nonneg seeds", () => {
    const projects = [proj("Acme", "2026-06-15", "Video")]; // current month -> excluded
    const result = computeClientHistory(projects as never, now, 3);
    // no past activity -> client filtered out
    expect(result.find((r) => r.client === "Acme")).toBeUndefined();
  });
});
