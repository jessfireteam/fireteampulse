/**
 * Where the money moved — the classification behind the movement page.
 *
 * Ported from buddy-plays/weekly_report.py, which posts the Monday summary to
 * #buddys-garden. The two must agree, so the reasoning is carried across rather
 * than left behind in the Python. Its test suite came with it.
 *
 * TWO POPULATIONS, BECAUSE THEY ARE MANAGED DIFFERENTLY.
 * Every client runs new creative in testing ad sets or campaigns, and when an
 * ad looks good it is duplicated into a scaling campaign, which is where spend
 * ramps. Those are two different questions:
 *
 *   BREAKING OUT - which small ads are now taking real spend. Ranked on what
 *                  the ad is NOW, never on its multiple: 141x off $13 is a
 *                  smaller bet than 2x off $4,000, and ranking by multiple
 *                  would put every $50 ad on top of the list.
 *   ESTABLISHED  - what moved among ads already running. Ranked on absolute
 *                  dollars, because $3,000 to $10,000 is a bigger event than a
 *                  400x off $4 despite being only 3x. Falls rank with rises,
 *                  and an established ad going to zero is a large fall.
 *
 * The split is on what the ad spent BEFORE, not on which campaign it sits in.
 * Campaign names cannot carry it: there are only 121 campaigns across the
 * roster, but Ground News names all six of its "Prospecting" with no layer
 * marker and FabFitFun calls testing "SANDBOX", so a keyword ladder would
 * classify about six accounts and quietly mislabel the rest.
 *
 * The first block is not called "testing" on purpose. It was, until the split
 * was checked against the two accounts whose campaigns are named clearly enough
 * to check against. Rejuvia agreed at 88%. Honeylove came back at 39%, because
 * it is large enough that its 0.5% floor is $2,758 and plenty of ads inside
 * scaling campaigns spend less than that in a week. The block is right about
 * what it measures and wrong about where those ads live, so it is named for the
 * former.
 */

export interface AdWeek {
  name: string;
  prior: number;
  current: number;
  duplicated: boolean;
  /** The Meta ad account this ad ran in, for deep-linking. */
  accountId: string;
  /**
   * Every Meta ad id that carried this name in the current period.
   *
   * Usually one, but 14% of names map to several and one Ground News ad name
   * spans 23 — the same creative duplicated across ad sets and campaigns, which
   * is the mechanic the `duplicated` flag tracks. The link selects all of them
   * rather than picking one arbitrarily and sending the reader to a fragment of
   * the spend they just read.
   */
  adIds: string[];
}

export interface Move extends AdWeek {
  /** What the row is ranked on: current spend for breakout, |delta| otherwise. */
  rank: number;
  ours: boolean;
}

export interface Movement {
  breakout: Move[];
  established: Move[];
}

/**
 * An ad's change must be this share of the account's own week to be listed, and
 * this many dollars regardless, so a small account does not report $40 moves.
 */
export const MOVE_SHARE = 0.01;

/**
 * $400 is where an ad starts looking like a decision rather than a trial. Only
 * 12% of launches ever clear it in a week, so it is already a selective line.
 *
 * It was $250, the number several accounts test at, and what the data showed
 * when that was checked over 6,103 observed first weeks is worth recording
 * because it is not what anyone expected: there is no pile of ads at $250 or
 * $350. The distribution decays smoothly with no bump anywhere, 64% of launches
 * spend under $50, and the median first week is $3 on Aberlite, $4 on Ground
 * News and $12 on Rejuvia. Honeylove is the lone account whose launches look
 * like a mandated per-ad budget, at a $162 median.
 *
 * There is no survival cliff either — continuation into a second week is a flat
 * 65-78% from $0 to $2,500 — so this floor is a judgment about what is worth
 * reading, not a boundary discovered in the data.
 */
export const MOVE_FLOOR = 400;

/** Starting or stopping gets a lower bar than growing or shrinking. */
export const EVENT_SHARE = 0.005;

/** The agency-attribution rule. Kept character-identical to buddy-plays/agency.py. */
const AGENCY = /(?:firetea|fite|(?<![A-Za-z])(?:ft|fire)(?![A-Za-z]))/i;

export function isAgency(adName: string): boolean {
  return AGENCY.test(adName || "");
}

/**
 * A deep link that opens this ad, selected, in Meta Ads Manager.
 *
 * The ad name on its own is only a search term — it tells you what to go and
 * hunt for. `fb_ad_spend` already carries `ad_id` and `account_id`, so the link
 * costs nothing extra: no Motion lookup, no Adnova call, no id mapping that can
 * drift. Ads Manager takes a comma-separated `selected_ad_ids`, so a creative
 * running under one name across several ad sets arrives with all of its
 * instances selected.
 *
 * Returns null when there is no id to link to, so the caller renders plain text
 * rather than a link that goes somewhere useless.
 */
export function adsManagerUrl(accountId: string, adIds: string[]): string | null {
  if (!accountId || adIds.length === 0) return null;
  const ids = [...adIds].sort().join(",");
  return (
    "https://adsmanager.facebook.com/adsmanager/manage/ads" +
    `?act=${encodeURIComponent(accountId)}&selected_ad_ids=${encodeURIComponent(ids)}`
  );
}

/**
 * Did this ad get copied into an additional campaign since last week?
 *
 * Requires the COUNT to rise, not merely the set to differ. An ad that left one
 * campaign and entered another has been moved, not duplicated — the first cut
 * of this tested only for a new campaign and labelled a Ground News ad as
 * scaling while it shed $20,914.
 */
export function wasDuplicated(now: Set<string>, was: Set<string>): boolean {
  if (was.size === 0 || now.size <= was.size) return false;
  for (const c of now) if (!was.has(c)) return true;
  return false;
}

/**
 * Split one account's ads into the two populations.
 *
 * Thresholds are a share of the account's own week, because the same $1,500 is
 * a rounding error in Honeylove and a fifth of Mighty Munch. Splitting on prior
 * spend rather than on a ratio also puts a $500 -> $10,000 graduation into
 * ESTABLISHED, ranked on its $9,500 — the event — rather than into BREAKING OUT
 * on a 20x that flatters it.
 */
export function classify(ads: AdWeek[], accountSpend: number): Movement {
  const moveFloor = Math.max(MOVE_SHARE * accountSpend, MOVE_FLOOR);
  const eventFloor = Math.max(EVENT_SHARE * accountSpend, MOVE_FLOOR);
  const breakout: Move[] = [];
  const established: Move[] = [];

  for (const ad of ads) {
    const row = { ...ad, ours: isAgency(ad.name), rank: 0 };
    if (ad.prior < eventFloor) {
      if (ad.current >= eventFloor) breakout.push({ ...row, rank: ad.current });
    } else if (Math.abs(ad.current - ad.prior) >= moveFloor) {
      established.push({ ...row, rank: Math.abs(ad.current - ad.prior) });
    }
  }
  breakout.sort((a, b) => b.rank - a.rank);
  established.sort((a, b) => b.rank - a.rank);
  return { breakout, established };
}

/**
 * The most recent Monday-Sunday week that ENDED on or before `anchor`.
 *
 * Anchored to the latest report_date WITH DATA, never a computed "yesterday": a
 * day's rows land the following morning, so a computed window silently reports
 * a short period as a full one.
 */
export function lastCompleteWeek(anchor: string): [string, string] {
  const d = new Date(anchor + "T00:00:00Z");
  // getUTCDay is 0=Sunday; step back to the most recent Sunday, staying put
  // when the anchor already is one, because that week is complete.
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - d.getUTCDay());
  const monday = new Date(sunday);
  monday.setUTCDate(sunday.getUTCDate() - 6);
  return [iso(monday), iso(sunday)];
}

/** The Monday on or before a date, which is the week a day belongs to. */
export function weekStart(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(monday);
}

export function shiftDays(day: string, days: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
