import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mount-test the New Biz page. Pulse sits behind Google SSO and the leads table
// is partners-only at the database level, so this is the only way to see the page
// render without signing in as a real person (same reasoning as Movement's test).
//
// Only auth and the Supabase client are mocked: the real useNewBizLeads runs, so
// the business-day math, the medians and the urgency sort are all under test.

const rows = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: { email: "niki@fireteam.is" }, signOut: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: rows.current, error: null }),
      }),
    }),
  },
}));

import NewBiz from "./NewBiz";
import { businessDaysBetween } from "@/hooks/useNewBizLeads";

const lead = (o: Partial<Record<string, unknown>>) => ({
  thread_id: "t-" + Math.random().toString(36).slice(2),
  brand: "Brand", contact_name: null, contact_email: null, source: "team@",
  referral_source: null, status: "our-turn", first_contact_at: null, first_reply_at: null,
  last_msg_at: null, last_msg_from: null, call_at: null, closed_at: null, owner: null,
  card_ts: null, research: null, notes: null, ...o,
});

// Frozen "now" = Monday 2026-08-31 09:00 ET, the morning after the radar launched.
const NOW = new Date("2026-08-31T13:00:00Z");

beforeEach(() => {
  // shouldAdvanceTime keeps real time flowing under the frozen Date, so the
  // hook's promise still resolves and waitFor is not deadlocked.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const mount = async () => {
  render(
    <MemoryRouter>
      <NewBiz />
    </MemoryRouter>
  );
  // let the hook's promise resolve
  await vi.waitFor(() => expect(screen.queryByText("Needs attention")).toBeTruthy());
};

describe("businessDaysBetween", () => {
  it("skips weekends", () => {
    // Fri 2026-08-28 -> Mon 2026-08-31 is one business day, not three.
    expect(businessDaysBetween(new Date("2026-08-28T17:00:00Z"), new Date("2026-08-31T13:00:00Z"))).toBe(1);
  });
  it("counts a plain weekday run", () => {
    expect(businessDaysBetween(new Date("2026-08-24T12:00:00Z"), new Date("2026-08-28T12:00:00Z"))).toBe(4);
  });
  it("is zero for the same day", () => {
    expect(businessDaysBetween(new Date("2026-08-31T09:00:00Z"), new Date("2026-08-31T18:00:00Z"))).toBe(0);
  });
});

describe("NewBiz page", () => {
  it("renders the pipeline, ranks our-turn leads first, and links the Slack card", async () => {
    rows.current = [
      lead({
        thread_id: "1a0495f99b4899a8", brand: "BugMD (eJam)", contact_name: "Suraj",
        status: "our-turn", first_contact_at: "2026-08-28T17:16:22Z",
        last_msg_at: "2026-08-28T17:16:22Z", last_msg_from: "prospect",
        card_ts: "1788146095.136899", referral_source: "a former FireTeam contact",
      }),
      lead({
        thread_id: "brahmin", brand: "Brahmin", status: "their-turn",
        first_contact_at: "2026-08-25T15:50:31Z", first_reply_at: "2026-08-26T21:48:58Z",
        last_msg_at: "2026-08-26T21:48:58Z", last_msg_from: "us",
      }),
      lead({
        thread_id: "won-one", brand: "Oliver Charles", status: "won",
        first_contact_at: "2026-01-07T20:10:38Z", first_reply_at: "2026-01-08T17:51:25Z",
        closed_at: "2026-01-19T00:00:00Z",
      }),
      lead({
        thread_id: "dormant-one", brand: "Mucho Brands", status: "dormant",
        first_contact_at: "2026-03-28T23:30:18Z", first_reply_at: "2026-04-01T01:57:52Z",
        notes: "REVISIT: out of budget, wants to revisit when testing budget grows.",
      }),
    ];

    await mount();

    // Open pipeline counts only the live stages (our-turn + their-turn), not won/dormant.
    expect(screen.getByText("Open pipeline").closest("div")?.parentElement?.textContent).toContain("2");

    // The unanswered lead is row one; Brahmin (waiting on them) sits below it.
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("BugMD (eJam)")).toBeTruthy();
    expect(within(bodyRows[0]).getByText(/Waiting on us 1 business day/)).toBeTruthy();

    // Slack permalink is built from the card ts with the dot stripped.
    const link = within(bodyRows[0]).getByRole("link") as HTMLAnchorElement;
    expect(link.href).toBe("https://fireteamis.slack.com/archives/CV4F9TYNR/p1788146095136899");

    // Revisit section surfaces the dormant lead and its note.
    expect(screen.getByText("Mucho Brands")).toBeTruthy();
    expect(screen.getByText(/wants to revisit/)).toBeTruthy();
  });

  it("puts our own ball above a longer silence on theirs", async () => {
    // Regression: a their-turn lead quiet for weeks used to outrank a lead we
    // had not answered, which is backwards - we can only act on our own side.
    rows.current = [
      lead({
        thread_id: "stale-theirs", brand: "TWS", status: "their-turn",
        first_contact_at: "2026-08-05T16:46:39Z", first_reply_at: "2026-08-05T20:00:00Z",
        last_msg_at: "2026-08-06T22:04:51Z", last_msg_from: "us",
      }),
      lead({
        thread_id: "fresh-ours", brand: "BugMD (eJam)", status: "our-turn",
        first_contact_at: "2026-08-28T17:16:22Z",
        last_msg_at: "2026-08-28T17:16:22Z", last_msg_from: "prospect",
      }),
    ];
    await mount();
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("BugMD (eJam)")).toBeTruthy();
    expect(within(bodyRows[1]).getByText("TWS")).toBeTruthy();
  });

  it("counts the waiting clock from a call booked off-thread", async () => {
    // Regression: Lux's email thread ended 2026-08-13 but the call happened on
    // the 28th, so the page claimed 13 days of silence on a lead we had just
    // spoken to. The clock runs from the most recent contact of any kind.
    rows.current = [
      lead({
        thread_id: "lux", brand: "Lux.com", status: "proposal",
        first_contact_at: "2026-07-29T01:09:12Z", first_reply_at: "2026-07-30T18:20:14Z",
        last_msg_at: "2026-08-13T02:43:41Z", last_msg_from: "us",
        call_at: "2026-08-28T14:30:00Z",
      }),
    ];
    await mount();
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("1d")).toBeTruthy();
  });

  it("shows the all-clear when no lead is waiting on us", async () => {
    rows.current = [
      lead({
        thread_id: "quiet", brand: "Brahmin", status: "their-turn",
        first_contact_at: "2026-08-25T15:50:31Z", first_reply_at: "2026-08-26T21:48:58Z",
        last_msg_at: "2026-08-26T21:48:58Z", last_msg_from: "us",
      }),
    ];
    await mount();
    expect(screen.getByText("Waiting on us").closest("div")?.parentElement?.textContent).toContain("0");
  });

  it("hides everything from a non-partner", async () => {
    rows.current = [];
    vi.resetModules();
    vi.doMock("@/hooks/useAuth", () => ({
      useAuth: () => ({ loading: false, user: { email: "someone@fireteam.is" }, signOut: vi.fn() }),
    }));
    const { default: Gated } = await import("./NewBiz");
    render(
      <MemoryRouter>
        <Gated />
      </MemoryRouter>
    );
    expect(screen.getByText("Partners only")).toBeTruthy();
  });
});
