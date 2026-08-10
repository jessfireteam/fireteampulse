import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { processWinnersData } from "@/hooks/useWinnersData";
import { buildFixtureProjects } from "@/hooks/useWinnersData.fixture";
import { ContributorTable } from "./ContributorTable";
import { WinnersSummary } from "./WinnersSummary";
import type { Contributor } from "@/hooks/useWinnersData";

// Mount-test the winners UI so a JSX/shape mistake surfaces here rather than as
// a white screen in prod (the build won't catch it).
const data = processWinnersData(buildFixtureProjects(), "all", new Set<string>());

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
      },
    };
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
    const spark = screen.getByRole("img", { name: /Book trend over the last/i });
    expect(spark.querySelectorAll("rect").length).toBe(5);
  });

  it("WinnersSummary mounts and names a top performer with an adjusted index", () => {
    render(<WinnersSummary data={data} contributors={data.contributors} />);
    expect(screen.getByText("Top Performer")).toBeTruthy();
    expect(screen.getAllByText(/W Index .*adj/).length).toBeGreaterThan(0);
  });
});
