import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { processWinnersData } from "@/hooks/useWinnersData";
import { buildFixtureProjects } from "@/hooks/useWinnersData.fixture";
import { ContributorTable } from "./ContributorTable";
import { WinnersSummary } from "./WinnersSummary";

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

  it("WinnersSummary mounts and names a top performer with an adjusted index", () => {
    render(<WinnersSummary data={data} contributors={data.contributors} />);
    expect(screen.getByText("Top Performer")).toBeTruthy();
    expect(screen.getAllByText(/W Index .*adj/).length).toBeGreaterThan(0);
  });
});
