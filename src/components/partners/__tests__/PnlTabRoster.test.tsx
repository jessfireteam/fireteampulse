import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PnlTab } from "../PnlTab";
import { emptyCostConfig, type CostConfig, type ProductionPerson } from "@/lib/forecast/types";
import { resolveRoleSupply, type MeasuredPerson } from "@/lib/forecast/supply";

vi.mock("@/hooks/useQbActuals", () => ({ useQbActuals: () => ({ data: undefined }) }));

const monthLabels = ["Aug", "Sep", "Oct"];
const H = monthLabels.length;

const team: ProductionPerson[] = [
  // Follows her measured actuals (no typed capacity).
  { id: "k", name: "Khushboo", side: "video", monthlyCost: 2000, startMonthIndex: 0, role: "Video" },
  // Typed capacity, and no Fibery history to fall back on.
  { id: "j", name: "John", side: "both", monthlyCost: 6250, startMonthIndex: 0, role: "Copywriters", capacityPerWeek: 8 },
  // Cost only.
  { id: "m", name: "Mark", side: "both", monthlyCost: 6700, startMonthIndex: 0 },
];
const measured: MeasuredPerson[] = [{ name: "khushboo@fireteam.is", role: "Video", maxWeek26: 3 }];

const costConfig: CostConfig = { ...emptyCostConfig(H), team };

function renderTab(onUpdateCost = vi.fn()) {
  const resolved = resolveRoleSupply(team, { Account: 9, "Creative Review": 8, Copywriters: 5, Design: 6, Video: 4 }, measured, H);
  render(
    <PnlTab
      clients={[]}
      costConfig={costConfig}
      monthLabels={monthLabels}
      onUpdate={() => {}}
      onUpdateCost={onUpdateCost}
      supplyRows={resolved.perPerson}
    />,
  );
  return onUpdateCost;
}

const rowFor = (name: string) => screen.getByDisplayValue(name).closest("div")!;

describe("PnlTab roster capacity", () => {
  it("offers the production roles but not Account, whose model is per-client", () => {
    renderTab();
    const roleSelect = within(rowFor("Khushboo")).getByLabelText("Role");
    const options = Array.from(roleSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Video Editing");
    expect(options).toContain("Copywriting");
    expect(options).toContain("Cost only");
    expect(options).not.toContain("Account");
  });

  it("shows the measured week as the placeholder when capacity is blank", () => {
    renderTab();
    const input = within(rowFor("Khushboo")).getByLabelText("Capacity per week");
    expect(input).toHaveAttribute("placeholder", "3");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("labels the unit per role, so briefs are never confused with deliverables", () => {
    renderTab();
    expect(within(rowFor("Khushboo")).getByText("videos/wk")).toBeTruthy();
    expect(within(rowFor("John")).getByText("briefs/wk")).toBeTruthy();
  });

  it("flags a person with no matching Fibery history rather than implying zero", () => {
    renderTab();
    expect(within(rowFor("John")).getByText(/no actuals/i)).toBeTruthy();
    expect(within(rowFor("Khushboo")).queryByText(/no actuals/i)).toBeNull();
  });

  it("clearing the capacity box goes back to following measured actuals", () => {
    const onUpdateCost = renderTab();
    const input = within(rowFor("John")).getByLabelText("Capacity per week");
    fireEvent.change(input, { target: { value: "" } });
    const patched = onUpdateCost.mock.calls[0][0].team.find((p: ProductionPerson) => p.id === "j");
    expect(patched.capacityPerWeek).toBeUndefined();
  });

  it("dropping the role drops the capacity with it, so no number survives in the wrong unit", () => {
    const onUpdateCost = renderTab();
    const roleSelect = within(rowFor("John")).getByLabelText("Role");
    fireEvent.change(roleSelect, { target: { value: "" } });
    const patched = onUpdateCost.mock.calls[0][0].team.find((p: ProductionPerson) => p.id === "j");
    expect(patched.role).toBeUndefined();
    expect(patched.capacityPerWeek).toBeUndefined();
  });

  it("shows no capacity controls at all for a cost-only person", () => {
    renderTab();
    expect(within(rowFor("Mark")).queryByLabelText("Capacity per week")).toBeNull();
  });

  it("keeps cost fields intact when capacity is edited", () => {
    const onUpdateCost = renderTab();
    const input = within(rowFor("John")).getByLabelText("Capacity per week");
    fireEvent.change(input, { target: { value: "10" } });
    const patched = onUpdateCost.mock.calls[0][0].team.find((p: ProductionPerson) => p.id === "j");
    expect(patched.capacityPerWeek).toBe(10);
    expect(patched.monthlyCost).toBe(6250);
    expect(patched.side).toBe("both");
  });
});
