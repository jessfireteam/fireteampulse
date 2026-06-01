// src/lib/__tests__/partners.test.ts
import { describe, it, expect } from "vitest";
import { isPartner } from "../partners";

describe("isPartner", () => {
  it("accepts an allowlisted partner email case-insensitively", () => {
    expect(isPartner("Jess@FireTeam.is")).toBe(true);
  });
  it("rejects a non-partner fireteam email", () => {
    expect(isPartner("emily@fireteam.is")).toBe(false);
  });
  it("rejects null/undefined", () => {
    expect(isPartner(null)).toBe(false);
    expect(isPartner(undefined)).toBe(false);
  });
});
