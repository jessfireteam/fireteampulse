import { describe, it, expect } from "vitest";
import { isClientActive } from "../active";
describe("isClientActive", () => {
  it("ongoing client (defaults) is active every month", () => {
    expect(isClientActive({}, 0)).toBe(true);
    expect(isClientActive({}, 11)).toBe(true);
  });
  it("respects end month (offboard)", () => {
    const c = { endMonthIndex: 0 }; // active through month 0 only
    expect(isClientActive(c, 0)).toBe(true);
    expect(isClientActive(c, 1)).toBe(false);
  });
  it("respects start month (future signing)", () => {
    const c = { startMonthIndex: 2 };
    expect(isClientActive(c, 1)).toBe(false);
    expect(isClientActive(c, 2)).toBe(true);
  });
  it("disabled is never active", () => {
    expect(isClientActive({ enabled: false }, 5)).toBe(false);
  });
});
