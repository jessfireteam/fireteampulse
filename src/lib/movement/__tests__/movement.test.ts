/**
 * Ported alongside the logic from buddy-context/tests/test_weekly_report.py.
 *
 * The Monday Slack post and this page must agree, so the tests that pinned the
 * Python's behaviour come across with it. Two things here can be wrong without
 * looking wrong: the window arithmetic can report six days as seven and nothing
 * in the output says so, and the thresholds can quietly hide the movement the
 * page exists to show.
 */
import { describe, expect, it } from "vitest";
import {
  AdWeek,
  MOVE_FLOOR,
  classify,
  isAgency,
  lastCompleteWeek,
  shiftDays,
  wasDuplicated,
  weekStart,
} from "../movement";

const ad = (
  name: string,
  prior: number,
  current: number,
  duplicated = false
): AdWeek => ({ name, prior, current, duplicated });

describe("window arithmetic", () => {
  it.each([
    // 2026-08-02 is a Sunday, so its own week is complete and is the one reported.
    ["2026-08-02", ["2026-07-27", "2026-08-02"]],
    // The Monday run is the real case: it reports the week that ended yesterday.
    ["2026-08-03", ["2026-07-27", "2026-08-02"]],
    // Any midweek anchor falls back to the last week that actually finished.
    ["2026-08-01", ["2026-07-20", "2026-07-26"]],
    ["2026-07-30", ["2026-07-20", "2026-07-26"]],
    ["2026-07-27", ["2026-07-20", "2026-07-26"]],
  ])("last complete week before %s", (anchor, expected) => {
    expect(lastCompleteWeek(anchor as string)).toEqual(expected);
  });

  it("always reports seven whole days that have already finished", () => {
    for (let i = 0; i < 30; i++) {
      const anchor = shiftDays("2026-07-01", i);
      const [start, end] = lastCompleteWeek(anchor);
      expect(shiftDays(start, 6)).toBe(end);
      expect(new Date(start + "T00:00:00Z").getUTCDay()).toBe(1); // Monday
      expect(new Date(end + "T00:00:00Z").getUTCDay()).toBe(0); // Sunday
      expect(end <= anchor).toBe(true);
    }
  });

  it("puts every day in the week beginning its Monday", () => {
    expect(weekStart("2026-07-20")).toBe("2026-07-20"); // Monday itself
    expect(weekStart("2026-07-26")).toBe("2026-07-20"); // Sunday
    expect(weekStart("2026-07-23")).toBe("2026-07-20"); // midweek
    expect(weekStart("2026-07-27")).toBe("2026-07-27"); // next Monday
  });
});

describe("movement thresholds", () => {
  it("scales with the account, so a flat floor cannot invert them", () => {
    // The same $1,500 move is noise in a big account and a fifth of a small one.
    const mover = [ad("mover", 10_000, 11_500)];
    expect(classify(mover, 551_584).established).toHaveLength(0);
    expect(classify(mover, 24_373).established).toHaveLength(1);
  });

  it("puts an ad that was not running into breaking out", () => {
    // The case an earlier version buried entirely: $13 -> $1,890 lost its place
    // to three larger dollar moves and never appeared.
    const groups = classify([ad("ramp", 13, 1_890)], 313_064);
    expect(groups.breakout.map((r) => r.name)).toEqual(["ramp"]);
    expect(groups.established).toHaveLength(0);
  });

  it("ranks breaking out on what the ad is now, not on its multiple", () => {
    // Both priors sit below this account's $1,565 event floor, so only their
    // current size separates them. 141x off $13 is the smaller bet.
    const groups = classify(
      [ad("small_huge_multiple", 13, 1_890), ad("big_modest_multiple", 900, 9_000)],
      313_064
    );
    expect(groups.breakout.map((r) => r.name)).toEqual([
      "big_modest_multiple",
      "small_huge_multiple",
    ]);
  });

  it("keeps a graduation in established, ranked on its dollars", () => {
    // $500 -> $10,000 ranks on the $9,500, not on a 20x that flatters it.
    const groups = classify([ad("graduated", 500, 10_000)], 24_373);
    expect(groups.breakout).toHaveLength(0);
    expect(groups.established.map((r) => r.name)).toEqual(["graduated"]);
  });

  it("ranks falls and rises together by absolute dollars", () => {
    const groups = classify(
      [
        ad("small_rise", 3_000, 5_000),
        ad("big_fall", 40_000, 15_000),
        ad("mid_rise", 3_000, 12_000),
      ],
      100_000
    );
    expect(groups.established.map((r) => r.name)).toEqual([
      "big_fall",
      "mid_rise",
      "small_rise",
    ]);
  });

  it("treats an established ad going to zero as a large fall", () => {
    const groups = classify([ad("gone", 25_000, 0)], 100_000);
    expect(groups.established.map((r) => r.name)).toEqual(["gone"]);
  });

  it("lets starting clear a lower bar than moving", () => {
    // Move floor $1,000, event floor $500.
    expect(classify([ad("grew", 4_000, 4_700)], 100_000).established).toHaveLength(0);
    expect(classify([ad("started", 0, 700)], 100_000).breakout).toHaveLength(1);
  });

  it("does not report trivial dollar moves in tiny accounts", () => {
    // A percentage floor alone would make a $140 move newsworthy here.
    const groups = classify([ad("noise", 100, 240)], 5_000);
    expect(140).toBeLessThan(MOVE_FLOOR);
    expect(groups.breakout).toHaveLength(0);
    expect(groups.established).toHaveLength(0);
  });

  it("does not report an ad that only reaches test budget", () => {
    // Several accounts test around $250, and only 12% of launches clear $400.
    expect(classify([ad("trial", 14, 300)], 24_373).breakout).toHaveLength(0);
    expect(classify([ad("graduating", 14, 1_685)], 24_373).breakout).toHaveLength(1);
  });

  it("ignores ads that ran in neither week", () => {
    const groups = classify([ad("dormant", 0, 0)], 100_000);
    expect(groups.breakout).toHaveLength(0);
    expect(groups.established).toHaveLength(0);
  });

  it("carries the duplication flag through classification", () => {
    const groups = classify([ad("copied", 14, 1_685, true)], 24_373);
    expect(groups.breakout[0].duplicated).toBe(true);
  });
});

describe("duplication", () => {
  it("needs an additional campaign, not a different one", () => {
    // Moved: same count, different campaign.
    expect(wasDuplicated(new Set(["scaling"]), new Set(["testing"]))).toBe(false);
    // Copied: still in the original, now in another as well.
    expect(
      wasDuplicated(new Set(["testing", "scaling"]), new Set(["testing"]))
    ).toBe(true);
  });

  it("does not call a brand new ad a duplication", () => {
    expect(wasDuplicated(new Set(["testing"]), new Set())).toBe(false);
  });

  it("does not call dropping a campaign a duplication", () => {
    expect(
      wasDuplicated(new Set(["scaling"]), new Set(["testing", "scaling"]))
    ).toBe(false);
  });
});

describe("agency attribution", () => {
  it("matches the rule the rest of the stack uses", () => {
    expect(isAgency("Video - News Headlines - UGC - Fireteam - 12/06/2026")).toBe(true);
    expect(isAgency("DS>FiTe>USA>MM - Funny Dog Explainer_v3")).toBe(true);
    expect(isAgency("01 | 07-24-26 | FT | VID | BRDN | Burden Lifter")).toBe(true);
    // Bare words that merely contain the letters must not match.
    expect(isAgency("PRSP-SEAS-DROP50[2404_Big Deal Summer Sale_S3]")).toBe(false);
    expect(isAgency("Video - Founder TedX - UW_Hook1_Mercedes")).toBe(false);
    expect(isAgency("gift_shift_lifter")).toBe(false);
  });
});
