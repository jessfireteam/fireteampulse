import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { aggregate } from "@/lib/movement/aggregate";
import type { SpendRow } from "@/lib/movement/spend";

// Mount-test the movement page so a JSX or shape mistake surfaces here rather
// than as a white screen in prod, which the build will not catch. Pulse sits
// behind Google SSO, so this is also the only way to see the page render
// without signing in as a real person.

const state = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false, user: null }) }));
vi.mock("@/hooks/useMovementData", () => ({
  useMovementData: (days: number, offset: number) => {
    state.current.lastArgs = [days, offset];
    return state.current.value;
  },
}));

import Movement from "./Movement";

const ACCOUNTS = new Map([["act-718314128916749", "Ground News"]]);
const row = (
  ad_name: string,
  report_date: string,
  spend: number,
  campaign_name: string | null = "Prospecting",
  ad_id: string | null = "120000000000001"
): SpendRow => ({
  account_id: "act-718314128916749", ad_name, report_date, spend, campaign_name, ad_id,
});

// A breakout ad, a rise, a fall, a stop, and a duplication, on one account.
const ROWS: SpendRow[] = [
  // Duplicating into a second campaign creates a second ad id under the same
  // name, which is the case the link has to select both halves of.
  row("Video - News&Yapper - Fireteam", "2026-07-14", 13, "Testing", "id-orig"),
  row("Video - News&Yapper - Fireteam", "2026-07-20", 9_000, "Testing", "id-orig"),
  row("Video - News&Yapper - Fireteam", "2026-07-21", 1, "Scaling", "id-copy"),
  row("Video - Founder TedX - Mercedes", "2026-07-14", 8_050),
  row("Video - Founder TedX - Mercedes", "2026-07-20", 21_870),
  row("Video - News Template - Fireteam", "2026-07-14", 36_774),
  row("Video - News Template - Fireteam", "2026-07-20", 15_860),
  row("Video - Then And Now - Fireteam", "2026-07-14", 5_613),
];

const accounts = aggregate(
  ROWS, ACCOUNTS, "2026-07-20", "2026-07-26", "2026-07-13", "2026-07-19"
);

const loaded = {
  data: {
    accounts,
    window: {
      currentStart: "2026-07-20", currentEnd: "2026-07-26",
      priorStart: "2026-07-13", priorEnd: "2026-07-19",
    },
    anchor: "2026-07-30",
    total: accounts.reduce((t, a) => t + a.spend, 0),
    priorTotal: accounts.reduce((t, a) => t + a.priorSpend, 0),
  },
  isLoading: false,
  error: null,
  progress: null,
  reload: vi.fn(),
};

const mount = () => render(<MemoryRouter><Movement /></MemoryRouter>);

beforeEach(() => {
  state.current = { value: loaded };
});

describe("Movement page renders", () => {
  it("mounts and shows the account with both blocks", () => {
    mount();
    expect(screen.getByText("Where the money moved")).toBeTruthy();
    expect(screen.getByText("Ground News")).toBeTruthy();
    expect(screen.getByText(/Breaking out/i)).toBeTruthy();
    expect(screen.getByText(/^Established$/i)).toBeTruthy();
  });

  it("shows the window and the data-through date, not a date derived from today", () => {
    mount();
    expect(screen.getByText(/2026-07-20 → 2026-07-26/)).toBeTruthy();
    expect(screen.getByText(/data through 2026-07-30/)).toBeTruthy();
  });

  it("renders a breakout ad on its current size with its multiple", () => {
    mount();
    // $13 -> $9,001 is a ~692x, but the row leads with what it is now.
    expect(screen.getByText("$9,001")).toBeTruthy();
    expect(screen.getByText(/× from \$13/)).toBeTruthy();
  });

  it("marks the duplicated ad and attributes ours vs not ours", () => {
    mount();
    expect(screen.getAllByText("duplicated").length).toBe(1);
    expect(screen.getAllByText("ours").length).toBeGreaterThan(0);
    expect(screen.getAllByText("not ours").length).toBeGreaterThan(0);
  });

  it("shows a stopped established ad as stopped rather than as a zero", () => {
    mount();
    expect(screen.getByText(/\$5,613 → stopped/)).toBeTruthy();
  });

  it("caps nothing — every qualifying ad is on the page", () => {
    mount();
    const total =
      accounts[0].movement.breakout.length + accounts[0].movement.established.length;
    expect(total).toBe(4);
    expect(screen.queryByText(/and \d+ more/)).toBeNull();
  });

  it("changing the period asks the hook for the new window", () => {
    mount();
    fireEvent.click(screen.getByText("28 days"));
    expect(state.current.lastArgs).toEqual([28, 0]);
  });

  it("stepping earlier increments the offset, and later is disabled at the newest", () => {
    mount();
    const later = screen.getByText(/later/);
    expect((later.closest("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText(/earlier/));
    expect(state.current.lastArgs).toEqual([7, 1]);
  });

  it("shows page progress while loading rather than a bare spinner", () => {
    state.current = {
      value: { ...loaded, data: null, isLoading: true, progress: { done: 12, total: 35 } },
    };
    mount();
    expect(screen.getByText(/12\/35 pages/)).toBeTruthy();
  });

  it("surfaces a fetch failure instead of rendering an empty page", () => {
    state.current = {
      value: { ...loaded, data: null, isLoading: false, error: "fb_ad_spend unreachable (503)" },
    };
    mount();
    expect(screen.getByText("Could not load ad spend")).toBeTruthy();
    expect(screen.getByText(/503/)).toBeTruthy();
  });

  it("says so plainly when an account had no qualifying movement", () => {
    state.current = {
      value: {
        ...loaded,
        data: {
          ...loaded.data,
          accounts: [{
            client: "Flewd", spend: 60_716, priorSpend: 57_838,
            oursPct: 21.4, priorOursPct: 21.0,
            movement: { breakout: [], established: [] },
          }],
        },
      },
    };
    mount();
    const card = screen.getByText("Flewd").closest("section")!;
    expect(within(card).getByText(/Nothing moved more than/)).toBeTruthy();
  });
});

describe("Ads Manager links", () => {
  it("links each ad name into its own ad account", () => {
    mount();
    const link = screen.getByText("Video - Founder TedX - Mercedes").closest("a")!;
    expect(link.getAttribute("href")).toContain("act=act-718314128916749");
    expect(link.getAttribute("href")).toContain("adsmanager.facebook.com");
    // Opens away from the dashboard, and without handing the opener over.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("says how many ads a multi-id link will select", () => {
    mount();
    const link = screen.getByText("Video - News&Yapper - Fireteam").closest("a")!;
    expect(link.getAttribute("title")).toMatch(/Open all 2 ads/);
  });

  it("renders a plain name when there is no id to link to", () => {
    const noIds = aggregate(
      [row("Unlinkable Ad", "2026-07-14", 20, "Testing", null),
       row("Unlinkable Ad", "2026-07-20", 9_000, "Testing", null)],
      ACCOUNTS, "2026-07-20", "2026-07-26", "2026-07-13", "2026-07-19"
    );
    state.current = { value: { ...loaded, data: { ...loaded.data, accounts: noIds } } };
    mount();
    expect(screen.getByText("Unlinkable Ad").closest("a")).toBeNull();
  });
});
