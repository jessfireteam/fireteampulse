import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RunwayTable } from "../RunwayTable";
import type { RunwayRole } from "@/lib/forecast/runway";

const monthLabels = ["Aug", "Sep", "Oct", "Nov"];

const roles: RunwayRole[] = [
  {
    role: "Video", display: "Video Editing", hireUnit: 8, hireUnitSource: "team",
    nowGap: 1.1, monthGaps: [0.8, 0.2, -0.4, -0.6],
    hireBy: "Sep", firstDeficitLabel: "Nov", blocked: false,
  },
  {
    role: "Casting", display: "Casting", hireUnit: 11, hireUnitSource: "override",
    nowGap: -0.3, monthGaps: [-0.4, -0.7, -1.0, -1.0],
    hireBy: "Aug", firstDeficitLabel: "Sep", blocked: false,
  },
  {
    role: "Copywriters", display: "Copywriting", hireUnit: 10, hireUnitSource: "default",
    nowGap: 0, monthGaps: [0, 0, 0, 0], hireBy: null, firstDeficitLabel: null,
    blocked: true, blockedReason: "set a max for everyone in this role",
  },
];

function renderTable(onLeadWeeksChange = vi.fn(), onHireUnitChange = vi.fn()) {
  render(
    <RunwayTable
      roles={roles}
      monthLabels={monthLabels}
      hireLeadWeeks={6}
      onLeadWeeksChange={onLeadWeeksChange}
      onHireUnitChange={onHireUnitChange}
    />,
  );
  return { onLeadWeeksChange, onHireUnitChange };
}

describe("RunwayTable", () => {
  it("explains the unit in plain words, not compression", () => {
    renderTable();
    expect(screen.getByText(/Every number is a count of people/)).toBeTruthy();
    expect(screen.getByText(/minus/)).toBeTruthy();
    expect(screen.getByText(/weeks to find and onboard someone/)).toBeTruthy();
    // The jargon is gone.
    expect(screen.queryByText(/req/i)).toBeNull();
    expect(screen.getByText("Start hiring by")).toBeTruthy();
  });

  it("prints signed gaps and the start-hiring date only where a role breaks", () => {
    renderTable();
    expect(screen.getByText("+1.1")).toBeTruthy();
    expect(screen.getAllByText("-1.0").length).toBeGreaterThan(0);
    const table = screen.getByText("Role").closest("table")!;
    const video = within(table).getByText("Video Editing").closest("tr")!;
    expect(video.textContent).toContain("Sep");
  });

  it("renders a blocked role as a sentence, not numbers", () => {
    renderTable();
    const table = screen.getByText("Role").closest("table")!;
    const copy = within(table).getByText("Copywriting").closest("tr")!;
    expect(copy.textContent).toContain("blocked: set a max for everyone in this role");
  });

  it("stretches the table to the container", () => {
    renderTable();
    const table = screen.getByText("Role").closest("table")!;
    expect(table.className).toContain("w-full");
  });

  it("shows the derived unit as placeholder, pins an override on typing, and reverts", () => {
    const { onHireUnitChange } = renderTable();
    // Team-derived unit: shown as placeholder, box empty.
    const video = screen.getByLabelText("One hire's weekly output for Video Editing") as HTMLInputElement;
    expect(video.placeholder).toBe("8");
    expect(video.value).toBe("");
    // Overridden unit: shown as the value, with a revert.
    const casting = screen.getByLabelText("One hire's weekly output for Casting") as HTMLInputElement;
    expect(casting.value).toBe("11");
    fireEvent.change(video, { target: { value: "10" } });
    expect(onHireUnitChange).toHaveBeenCalledWith("Video", 10);
    fireEvent.click(screen.getByText("revert"));
    expect(onHireUnitChange).toHaveBeenCalledWith("Casting", undefined);
  });

  it("badges a role still on the frozen default", () => {
    renderTable();
    expect(screen.getByText("default")).toBeTruthy();
  });

  it("wires the lead-time input straight through", () => {
    const { onLeadWeeksChange } = renderTable();
    fireEvent.change(screen.getByLabelText("Hiring lead time in weeks"), { target: { value: "8" } });
    expect(onLeadWeeksChange).toHaveBeenCalledWith(8);
  });
});
