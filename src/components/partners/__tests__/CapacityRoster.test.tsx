import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CapacityRoster } from "../CapacityRoster";
import { resolveRoleSupply, type MeasuredPerson } from "@/lib/forecast/supply";
import type { ProductionPerson } from "@/lib/forecast/types";

const monthLabels = ["Aug", "Sep", "Oct", "Nov"];
const H = monthLabels.length;

// The real roster shape: Vaiv following his actuals, Khushboo capped below hers, John typed with
// no history, Mark not production, and nobody on Design.
const team: ProductionPerson[] = [
  { id: "v", name: "Vaiv", side: "video", monthlyCost: 1500, startMonthIndex: 0, role: "Video" },
  { id: "k", name: "Khushboo", side: "video", monthlyCost: 1300, startMonthIndex: 0, role: "Video", capacityPerWeek: 4 },
  { id: "j", name: "John", side: "both", monthlyCost: 6250, startMonthIndex: 2, role: "Copywriters", capacityPerWeek: 8 },
  { id: "m", name: "Mark", side: "both", monthlyCost: 6700, startMonthIndex: 0 },
];
const measured: MeasuredPerson[] = [
  { name: "Vaiv Singh", role: "Video", actualPerWeek: 6 },
  { name: "khushboo@fireteam.is", role: "Video", actualPerWeek: 6 },
  { name: "Erik Furtado", role: "Design", actualPerWeek: 11 },
];

function renderRoster(onUpdatePerson = vi.fn(), onAddPerson = vi.fn()) {
  render(
    <CapacityRoster
      team={team}
      resolved={resolveRoleSupply(team, measured, H)}
      monthLabels={monthLabels}
      onUpdatePerson={onUpdatePerson}
      onAddPerson={onAddPerson}
    />,
  );
  return { onUpdatePerson, onAddPerson };
}

const rowFor = (name: string) => screen.getByDisplayValue(name).closest("tr")!;

describe("CapacityRoster", () => {
  it("adds a capacity-only person without touching the P&L money form", () => {
    const { onAddPerson } = renderRoster();
    fireEvent.click(screen.getByText("+ Add person (capacity only)"));
    expect(onAddPerson).toHaveBeenCalledWith("New person");
  });

  it("lets the person's name be typed right in the table — names are the join key to actuals", () => {
    const { onUpdatePerson } = renderRoster();
    fireEvent.change(screen.getByDisplayValue("Mark"), { target: { value: "Mark Datola" } });
    expect(onUpdatePerson).toHaveBeenCalledWith("m", { name: "Mark Datola" });
  });

  it("shows each person's recent actual next to the max we set", () => {
    renderRoster();
    const row = rowFor("Khushboo");
    expect(within(row).getByText("6")).toBeTruthy();
    expect(within(row).getByLabelText("Max per week for Khushboo")).toHaveValue(4);
  });

  it("flags someone running above the max we set for them", () => {
    renderRoster();
    // Khushboo is averaging 6 against a max of 4.
    expect(within(rowFor("Khushboo")).getByText(/over the max you set/i)).toBeTruthy();
    // Vaiv has no max, so he can't be over one.
    expect(within(rowFor("Vaiv")).queryByText(/over the max/i)).toBeNull();
  });

  it("says when a person is following actuals because no max is set", () => {
    renderRoster();
    expect(within(rowFor("Vaiv")).getByText(/following actuals/i)).toBeTruthy();
  });

  it("uses the actual as the placeholder so the box is never a blank guess", () => {
    renderRoster();
    expect(within(rowFor("Vaiv")).getByLabelText("Max per week for Vaiv")).toHaveAttribute(
      "placeholder",
      "6",
    );
  });

  it("flags a person with no Fibery history instead of showing them as zero", () => {
    renderRoster();
    expect(within(rowFor("John")).getByText(/no history/i)).toBeTruthy();
  });

  it("shows a hire's start month against their name", () => {
    renderRoster();
    expect(within(rowFor("John")).getByText(/from Oct/)).toBeTruthy();
  });

  it("totals the role ceiling against what the role actually produces", () => {
    renderRoster();
    // Video: Vaiv follows actuals (6) + Khushboo capped at 4 = 10 ceiling, against 12 actual.
    const total = screen.getByLabelText("Video Editing ceiling");
    expect(within(total).getByText("12")).toBeTruthy();
    expect(within(total).getByText("10")).toBeTruthy();
    expect(within(total).getByText(/above the max we set/i)).toBeTruthy();
  });

  it("says outright when a role has nobody assigned and is reading actuals", () => {
    renderRoster();
    // Both Creative Review and Design are unassigned here.
    expect(screen.getAllByText(/Nobody assigned/i).length).toBeGreaterThanOrEqual(2);
    // Design's line quotes Erik's 11/wk.
    expect(screen.getByText(/11\/wk that/)).toBeTruthy();
    expect(screen.queryByLabelText("Design ceiling")).toBeNull();
  });

  it("groups a person with no role separately, with no cost shown", () => {
    renderRoster();
    expect(screen.getByText("Not assigned to a production role")).toBeTruthy();
    expect(within(rowFor("Mark")).getByLabelText("Role for Mark")).toHaveValue("");
    // This is the capacity side; money lives on the P&L tab.
    expect(screen.queryByText(/6,700/)).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("clearing the max box goes back to following actuals", () => {
    const { onUpdatePerson } = renderRoster();
    fireEvent.change(within(rowFor("Khushboo")).getByLabelText("Max per week for Khushboo"), {
      target: { value: "" },
    });
    expect(onUpdatePerson).toHaveBeenCalledWith("k", { capacityPerWeek: undefined });
  });

  it("dropping the role clears the max, so no number survives in the wrong unit", () => {
    const { onUpdatePerson } = renderRoster();
    fireEvent.change(within(rowFor("John")).getByLabelText("Role for John"), {
      target: { value: "" },
    });
    expect(onUpdatePerson).toHaveBeenCalledWith("j", {
      role: undefined,
      capacityPerWeek: undefined,
    });
  });
});
