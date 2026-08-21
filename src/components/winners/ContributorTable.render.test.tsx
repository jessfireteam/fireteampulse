import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { processWinnersData } from "@/hooks/useWinnersData";
import {
  buildFixtureProjects,
  buildTrendFixtureProjects,
  TREND_FIXTURE_NAMES,
  TREND_FIXTURE_NOW,
} from "@/hooks/useWinnersData.fixture";
import { ContributorTable } from "./ContributorTable";
import { WinnersSummary } from "./WinnersSummary";
import type { Contributor } from "@/hooks/useWinnersData";

// Mount-test the winners UI so a JSX/shape mistake surfaces here rather than as
// a white screen in prod (the build won't catch it).
const data = processWinnersData(buildFixtureProjects(), "all", new Set<string>());

// Captured by the AM cell test below and reused by the expansion test, so the
// two stay describing the same contributor.
let amFixture: Contributor;

describe("Winners UI renders", () => {
  it("ContributorTable mounts, shows role sections and an n/a (full-coverage) chip", () => {
    render(<ContributorTable contributors={data.contributors} clientStats={data.clientStats} />);
    expect(screen.getByText("Contributor Performance")).toBeTruthy();
    expect(screen.getAllByText(/Copywriters/).length).toBeGreaterThan(0);
    // Boss (CD) is unmeasurable -> renders an n/a chip.
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
  });

  it("expanding a row renders the per-client breakdown", () => {
    render(<ContributorTable contributors={data.contributors} clientStats={data.clientStats} />);
    const star = screen.getAllByText(/Star Writer/i)[0];
    fireEvent.click(star.closest("tr")!);
    expect(screen.getAllByText("Delta").length).toBeGreaterThan(0);
  });

  it("renders the AM Book Trend cell and caption instead of n/a", () => {
    const am: Contributor = {
      name: "Book Manager",
      role: "Account Manager (AM)",
      rolePublicId: "8",
      type: "internal",
      totalProjects: 40,
      actualWinners: 8,
      expectedWinners: 0,
      rawWinRate: 0.2,
      performanceIndex: null,
      shrunkIndex: null,
      significant: false,
      measurable: false,
      recentProjects: 0,
      recentActualWinners: 0,
      recentExpectedWinners: 0,
      recentPerformanceIndex: null,
      clientBreakdown: { Cli: { total: 40, winners: 8, expectedWinners: 0, clientRate: 0, measurable: false } },
      amTrend: {
        index: 145,
        actual: 8,
        projects: 40,
        expected: 5.5,
        significant: false,
        scoreLabel: "Mar '26–May '26",
        baselineLabel: "Nov '25–Feb '26",
        series: [
          { label: "Nov '25–Jan '26", index: 88, significant: false },
          { label: "Dec '25–Feb '26", index: 102, significant: false },
          { label: "Jan '26–Mar '26", index: null, significant: false },
          { label: "Feb '26–Apr '26", index: 130, significant: false },
          { label: "Mar '26–May '26", index: 145, significant: false },
        ],
        clients: [
          { name: "Anchor Co", projects: 30, winners: 6, expected: 4.2, baselineProjects: 48, baselineWinners: 5 },
          { name: "Fresh Co", projects: 10, winners: 2, expected: 1.3, baselineProjects: 0, baselineWinners: 0 },
        ],
      },
    };
    amFixture = am;
    render(<ContributorTable contributors={[am]} clientStats={data.clientStats} />);
    expect(screen.getByText("145")).toBeTruthy();
    expect(screen.getAllByText(/Book Trend/).length).toBeGreaterThan(0);
    expect(screen.getByText(/trend/)).toBeTruthy();
    // Ads / Winners / Expected reflect the trend window (40 / 8 / 5.5), not
    // all-time or the collapsed LOO expected.
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("5.5")).toBeTruthy();
    expect(screen.getByText(/completed in/i)).toBeTruthy();
    // The rolling-window sparkline renders, with a bar per window (the null
    // window included, drawn flat on the midline).
    const spark = screen.getByRole("img", { name: /Book trend across/i });
    // One bar per window; the null window draws a flat marker on the midline.
    expect(spark.querySelectorAll("rect").length).toBe(5);
  });

  // The AM expanded panel used to reuse the craft Windex's leave-one-out
  // breakdown, which for an AM shows "n/a" against every client they solely
  // own — i.e. their entire real book — while producing a number only for
  // accounts they barely touch. It now shows the score-window detail that
  // actually adds up to the index above it.
  it("expanding an AM row shows score-window client detail, not n/a", () => {
    render(<ContributorTable contributors={[amFixture]} clientStats={data.clientStats} />);
    fireEvent.click(screen.getByText("Book Manager").closest("tr")!);

    const panel = screen.getByText("Anchor Co").closest("table")!;
    const cells = [...panel.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent))
      .filter((row) => row.length > 0);
    // Anchor Co: 30 ads, 6 winners, 4.2 expected, +1.8 delta, own 5/48 baseline.
    expect(cells[0]).toEqual(["Anchor Co", "30", "6", "4.2", "+1.8", "5 of 48 (10%)"]);
    // A client with no prior-window history is flagged rather than blanked.
    expect(cells[1]?.[5]).toBe("new");
    // No client in an AM's own book should read as unmeasurable any more.
    expect(panel.textContent).not.toContain("n/a");
    // Caption names both windows. Text is split across <span>s, so read the
    // containing cell rather than using a single-node text query.
    const caption = panel.closest("td")!.textContent ?? "";
    expect(caption).toContain("Mar '26–May '26");
    expect(caption).toContain("Nov '25–Feb '26");
  });

  it("drops the client-mix column in favour of the trend column", () => {
    render(<ContributorTable contributors={data.contributors} clientStats={data.clientStats} />);
    expect(screen.queryByText("Client Mix")).toBeNull();
    expect(screen.getAllByText("Trend").length).toBeGreaterThan(0);
  });

  it("WinnersSummary mounts and names a top performer with an adjusted index", () => {
    render(<WinnersSummary data={data} contributors={data.contributors} />);
    expect(screen.getByText("Top Performer")).toBeTruthy();
    expect(screen.getAllByText(/W Index .*adj/).length).toBeGreaterThan(0);
  });
});

// A craft-role row's Trend column is a hand-rolled SVG, so a mount test is the
// only thing that catches a shape mistake before it white-screens the page.
describe("craft-role W Index trend renders", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TREND_FIXTURE_NOW));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  const trendData = () => processWinnersData(buildTrendFixtureProjects(), "all", new Set<string>());

  it("draws a bar per published window and names the span above the table", () => {
    const d = trendData();
    render(<ContributorTable contributors={d.contributors} clientStats={d.clientStats} />);
    const spark = screen.getAllByRole("img", { name: /W Index across/i })[0];
    const windows = d.contributors.find((c) => c.name === TREND_FIXTURE_NAMES.trend)!.windexTrend!;
    expect(spark.querySelectorAll("rect").length).toBeGreaterThanOrEqual(windows.length);
    // The window span is stated once for the table rather than per row.
    expect(screen.getByText(/rolling 3-month/i).textContent).toContain("Sep '25–Nov '25");
    expect(screen.getByText(/rolling 3-month/i).textContent).toContain("Mar '26–May '26");
  });

  it("expanding a row shows the windows as numbers that match the bars", () => {
    const d = trendData();
    render(<ContributorTable contributors={d.contributors} clientStats={d.clientStats} />);
    fireEvent.click(screen.getByText(TREND_FIXTURE_NAMES.trend).closest("tr")!);

    const table = screen.getByText("Sep '25–Nov '25").closest("table")!;
    // `tbody tr` would also match this table's header row: the selector is
    // resolved against the document and only then filtered to descendants, and
    // the whole table sits inside the outer shadcn <tbody>. Filter on cells.
    const rows = [...table.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent))
      .filter((row) => row.length > 0);
    // Window, ads, winners, expected, raw index, adjusted index.
    expect(rows[0]).toEqual(["Sep '25–Nov '25", "30", "9", "3.0", "300", "220"]);
    expect(rows[rows.length - 1]).toEqual(["Mar '26–May '26", "10", "0", "1.0", "0", "67"]);
    // The all-time per-client breakdown is still there below it.
    expect(screen.getAllByText("Delta").length).toBeGreaterThan(0);
  });

  it("shows a dash, not an empty cell, when there is no measurable trend", () => {
    const d = trendData();
    const solo = d.contributors.find((c) => c.name === TREND_FIXTURE_NAMES.solo)!;
    render(<ContributorTable contributors={[solo]} clientStats={d.clientStats} />);
    // The Expected column also renders an em dash, so identify the trend cell
    // by its explanation rather than by the glyph.
    const cell = screen.getByTitle(/Not enough completed work across windows/i);
    expect(cell.textContent).toBe("\u2014");
  });
});
