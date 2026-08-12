import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SupplyPanel } from "../SupplyPanel";
import { resolveRoleSupply, type MeasuredPerson } from "@/lib/forecast/supply";
import type { ProductionPerson, RolePeaks } from "@/lib/forecast/types";

const monthLabels = ["Aug", "Sep", "Oct", "Nov"];
const H = monthLabels.length;

// Copywriters measured at 6 against 5 declared, so the cells in that row are distinguishable
// and the drift stays inside the 20% band that would badge it.
const peaks: RolePeaks = {
  Account: 9, "Creative Review": 8, Copywriters: 6, Design: 6, Video: 4,
};

// The real shape: Shreya writing now, John joining in Oct, Khushboo following her actuals,
// and nobody assigned to Account.
const team: ProductionPerson[] = [
  { id: "s", name: "Shreya", side: "both", monthlyCost: 4000, startMonthIndex: 0, role: "Copywriters", capacityPerWeek: 5 },
  { id: "j", name: "John", side: "both", monthlyCost: 6250, startMonthIndex: 2, role: "Copywriters", capacityPerWeek: 8 },
  { id: "k", name: "Khushboo", side: "video", monthlyCost: 2000, startMonthIndex: 0, role: "Video" },
  { id: "m", name: "Mark", side: "both", monthlyCost: 6700, startMonthIndex: 0 },
];
const measured: MeasuredPerson[] = [{ name: "khushboo@fireteam.is", role: "Video", maxWeek26: 3 }];

function renderPanel() {
  const resolved = resolveRoleSupply(team, peaks, measured, H);
  render(
    <SupplyPanel
      supply={resolved.supply}
      measuredPeaks={peaks}
      perPerson={resolved.perPerson}
      monthLabels={monthLabels}
    />,
  );
  return resolved;
}

const roleRow = (label: string) => screen.getByText(label).closest("tr")!;

describe("SupplyPanel", () => {
  it("shows a role's ceiling now and at the end of the horizon, so a hire's step is visible", () => {
    renderPanel();
    const row = roleRow("Copywriting");
    // Shreya alone now (5), plus John from Oct (13).
    expect(within(row).getByText("5")).toBeTruthy();
    expect(within(row).getByText("13")).toBeTruthy();
    expect(within(row).getByText(/John 8 \(from Oct\)/)).toBeTruthy();
  });

  it("names the people behind each role instead of showing a bare number", () => {
    renderPanel();
    expect(within(roleRow("Copywriting")).getByText(/Shreya 5/)).toBeTruthy();
    // Khushboo follows her measured week (3) and is marked with the asterisk.
    expect(within(roleRow("Video Editing")).getByText(/Khushboo 3\*/)).toBeTruthy();
  });

  it("says outright when a role is still coming from measured actuals", () => {
    renderPanel();
    expect(within(roleRow("Account")).getByText(/from measured actuals/i)).toBeTruthy();
  });

  it("flags declared capacity that has drifted far from what people actually complete", () => {
    renderPanel();
    // Copywriting declares 5 now against a measured peak of 5 -> no flag. Video declares
    // nothing (follows measured) -> no flag either.
    expect(within(roleRow("Copywriting")).queryByText(/%$/)).toBeNull();
    // Now overstate Design badly and check the drift badge appears.
    const inflated: ProductionPerson[] = [
      { id: "e", name: "Erik", side: "static", monthlyCost: 5000, startMonthIndex: 0, role: "Design", capacityPerWeek: 20 },
    ];
    const resolved = resolveRoleSupply(inflated, peaks, [], H);
    render(
      <SupplyPanel
        supply={resolved.supply}
        measuredPeaks={peaks}
        perPerson={resolved.perPerson}
        monthLabels={monthLabels}
      />,
    );
    // 20 declared vs 6 measured = +233%
    expect(screen.getByText("+233%")).toBeTruthy();
  });

  it("leaves a cost-only person out of the supply table entirely", () => {
    renderPanel();
    expect(screen.queryByText(/Mark/)).toBeNull();
  });
});
