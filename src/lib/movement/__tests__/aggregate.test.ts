import { describe, expect, it } from "vitest";
import { aggregate } from "../aggregate";
import type { SpendRow } from "../spend";

const ACCOUNTS = new Map<string, string>([
  ["acct-gn", "Ground News"],
  ["acct-hl", "Honeylove"],
]);

const row = (
  account_id: string,
  ad_name: string,
  report_date: string,
  spend: number,
  campaign_name: string | null = "Prospecting",
  ad_id: string | null = "120000000000001"
): SpendRow => ({ account_id, ad_name, report_date, spend, campaign_name, ad_id });

// Current week 2026-07-20..26, prior week 2026-07-13..19.
const CUR: [string, string] = ["2026-07-20", "2026-07-26"];
const PRI: [string, string] = ["2026-07-13", "2026-07-19"];

const run = (rows: SpendRow[]) =>
  aggregate(rows, ACCOUNTS, CUR[0], CUR[1], PRI[0], PRI[1]);

describe("aggregate", () => {
  it("sums an ad's days into the window that contains them", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-20", 100),
      row("acct-gn", "Ad A", "2026-07-21", 150),
      row("acct-gn", "Ad A", "2026-07-14", 900),
    ]);
    expect(account.spend).toBe(250);
    expect(account.priorSpend).toBe(900);
  });

  it("ignores rows outside both windows, so a wider fetch can be re-sliced", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-20", 100),
      row("acct-gn", "Ad A", "2026-07-06", 5_000), // two weeks earlier
      row("acct-gn", "Ad A", "2026-08-03", 5_000), // the week after
    ]);
    expect(account.spend).toBe(100);
    expect(account.priorSpend).toBe(0);
  });

  it("keeps ad names whose text contains spaces and separators intact", () => {
    // The first cut keyed on `client + " " + ad_name` and split it back apart,
    // which mangles every real ad name in the roster.
    const name = "Video - News Headlines - 01d - UGC | App - Fireteam - 12/06/2026";
    const [account] = run([
      row("acct-gn", name, "2026-07-14", 20),
      row("acct-gn", name, "2026-07-20", 9_000),
    ]);
    expect(account.movement.breakout[0].name).toBe(name);
  });

  it("does not merge same-named ads that live in different accounts", () => {
    const rows = [
      row("acct-gn", "Shared Name", "2026-07-20", 9_000),
      row("acct-hl", "Shared Name", "2026-07-20", 40_000),
    ];
    const byClient = new Map(run(rows).map((a) => [a.client, a]));
    expect(byClient.get("Ground News")!.spend).toBe(9_000);
    expect(byClient.get("Honeylove")!.spend).toBe(40_000);
  });

  it("drops rows for accounts with no client mapping", () => {
    const out = run([row("acct-nobody", "Orphan", "2026-07-20", 9_000)]);
    expect(out).toHaveLength(0);
  });

  it("computes agency share from the ad names", () => {
    const [account] = run([
      row("acct-gn", "Video - Fireteam - A", "2026-07-20", 750),
      row("acct-gn", "Video - Mercedes - B", "2026-07-20", 250),
    ]);
    expect(account.oursPct).toBeCloseTo(75);
  });

  it("flags an ad that gained a campaign without losing its original", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-14", 20, "Testing"),
      row("acct-gn", "Ad A", "2026-07-20", 5_000, "Testing"),
      row("acct-gn", "Ad A", "2026-07-21", 5_000, "Scaling"),
    ]);
    expect(account.movement.breakout[0].duplicated).toBe(true);
  });

  it("does not flag an ad that merely changed campaign", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-14", 20, "Testing"),
      row("acct-gn", "Ad A", "2026-07-20", 5_000, "Scaling"),
    ]);
    expect(account.movement.breakout[0].duplicated).toBe(false);
  });

  it("ignores a campaign the ad was attached to but never spent in", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-14", 20, "Testing"),
      row("acct-gn", "Ad A", "2026-07-20", 5_000, "Testing"),
      row("acct-gn", "Ad A", "2026-07-21", 0, "Paused Campaign"),
    ]);
    expect(account.movement.breakout[0].duplicated).toBe(false);
  });

  it("treats a null spend as zero rather than breaking the sum", () => {
    const [account] = run([
      { ...row("acct-gn", "Ad A", "2026-07-20", 0), spend: null },
      row("acct-gn", "Ad A", "2026-07-21", 500),
    ]);
    expect(account.spend).toBe(500);
  });

  it("orders accounts by current spend", () => {
    const out = run([
      row("acct-gn", "Ad A", "2026-07-20", 1_000),
      row("acct-hl", "Ad B", "2026-07-20", 90_000),
    ]);
    expect(out.map((a) => a.client)).toEqual(["Honeylove", "Ground News"]);
  });
});

describe("ad ids for deep-linking", () => {
  it("collects every id that spent under a name this period", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-14", 20, "Testing", "id-old"),
      row("acct-gn", "Ad A", "2026-07-20", 5_000, "Testing", "id-a"),
      row("acct-gn", "Ad A", "2026-07-21", 5_000, "Scaling", "id-b"),
    ]);
    expect([...account.movement.breakout[0].adIds].sort()).toEqual(["id-a", "id-b"]);
    expect(account.movement.breakout[0].accountId).toBe("acct-gn");
  });

  it("falls back to prior ids for a stopped ad, which is the row worth opening", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-14", 25_000, "Scaling", "id-gone"),
    ]);
    expect(account.movement.established[0].current).toBe(0);
    expect(account.movement.established[0].adIds).toEqual(["id-gone"]);
  });

  it("ignores ids from rows that did not spend", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-20", 5_000, "Testing", "id-a"),
      row("acct-gn", "Ad A", "2026-07-21", 0, "Testing", "id-zero"),
    ]);
    expect(account.movement.breakout[0].adIds).toEqual(["id-a"]);
  });

  it("survives a null ad_id without inventing one", () => {
    const [account] = run([
      row("acct-gn", "Ad A", "2026-07-20", 5_000, "Testing", null),
    ]);
    expect(account.movement.breakout[0].adIds).toEqual([]);
  });
});
