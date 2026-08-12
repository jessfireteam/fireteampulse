import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ScenarioBuilder } from "../ScenarioBuilder";
import { deriveClientPlans, type PlanClientInput } from "@/lib/forecast/plan";
import { mergeScenario } from "@/lib/forecast/mergeScenario";
import type { ClientHistory } from "@/lib/forecast/types";

const H = 3;
const monthLabels = ["Aug", "Sep", "Oct"];
const historyLabels = ["May", "Jun", "Jul"];

// The live roster and Fibery Maxes as of 2026-08-12, with trailing mixes in the shape the
// real completions show (Ground News video-heavy, FabFitFun static-heavy, Spacelift a single
// project, Eyemos nothing and no Max set).
const clients: PlanClientInput[] = [
  { name: "Ground News", status: { name: "Active" }, maxDeliverablesPerMonth: 30, minDeliverablesPerMonth: 5 },
  { name: "FabFitFun", status: { name: "Active" }, maxDeliverablesPerMonth: 27, minDeliverablesPerMonth: 6 },
  { name: "Spacelift", status: { name: "Active" }, maxDeliverablesPerMonth: 16, minDeliverablesPerMonth: 6 },
  { name: "Eyemos", status: { name: "Active" }, maxDeliverablesPerMonth: null, minDeliverablesPerMonth: null },
];
const histories: ClientHistory[] = [
  { client: "Ground News", videosByMonth: [12, 14, 13], staticsByMonth: [2, 3, 2], seedVideos: 13, seedStatics: 2 },
  { client: "FabFitFun", videosByMonth: [3, 4, 3], staticsByMonth: [15, 17, 16], seedVideos: 3, seedStatics: 16 },
  { client: "Spacelift", videosByMonth: [0, 0, 0], staticsByMonth: [0, 1, 0], seedVideos: 0, seedStatics: 0 },
];

let n = 0;
const build = (saved: Parameters<typeof mergeScenario>[1] = []) =>
  mergeScenario(deriveClientPlans(clients, histories), saved, H, () => `id-${++n}`);

const rowFor = (name: string) => {
  const input = screen.getByDisplayValue(name);
  return input.closest("tr")!;
};

describe("ScenarioBuilder plan display", () => {
  it("shows each client's Fibery plan and its derived video/static split", () => {
    const plans = deriveClientPlans(clients, histories);
    render(
      <ScenarioBuilder
        clients={build()}
        historyLabels={historyLabels}
        monthLabels={monthLabels}
        histories={histories}
        plans={plans}
        onUpdate={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    // Ground News: 30/mo, 39 of 46 recent projects were video (85%) -> 25 videos, 5 statics.
    expect(within(rowFor("Ground News")).getByText(/plan 30\/mo/)).toBeTruthy();
    expect(within(rowFor("Ground News")).getByText(/25v \/ 5s/)).toBeTruthy();

    // FabFitFun: same 27/mo cap, but its own mix inverts the split -> mostly statics.
    expect(within(rowFor("FabFitFun")).getByText(/plan 27\/mo/)).toBeTruthy();
    expect(within(rowFor("FabFitFun")).getByText(/5v \/ 22s/)).toBeTruthy();
  });

  it("labels a thin-sample client as using the agency mix rather than inventing 0% video", () => {
    const plans = deriveClientPlans(clients, histories);
    render(
      <ScenarioBuilder
        clients={build()}
        historyLabels={historyLabels}
        monthLabels={monthLabels}
        histories={histories}
        plans={plans}
        onUpdate={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    const row = rowFor("Spacelift");
    expect(within(row).getByText(/agency mix/)).toBeTruthy();
    expect(within(row).getByText(/plan 16\/mo/)).toBeTruthy();
  });

  it("flags a client with no Max set in Fibery instead of showing a silent zero", () => {
    const plans = deriveClientPlans(clients, histories);
    render(
      <ScenarioBuilder
        clients={build()}
        historyLabels={historyLabels}
        monthLabels={monthLabels}
        histories={histories}
        plans={plans}
        onUpdate={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(within(rowFor("Eyemos")).getByText(/no max set/i)).toBeTruthy();
  });

  it("marks a client manual when a volume cell is typed into", () => {
    const onUpdate = vi.fn();
    const built = build();
    render(
      <ScenarioBuilder
        clients={built}
        historyLabels={historyLabels}
        monthLabels={monthLabels}
        histories={histories}
        plans={deriveClientPlans(clients, histories)}
        onUpdate={onUpdate}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    const gn = built.find((c) => c.name === "Ground News")!;
    // The row's number inputs are the future months; history cells are read-only text.
    const cell = within(rowFor("Ground News")).getAllByRole("spinbutton")[0];
    fireEvent.change(cell, { target: { value: "18" } });
    expect(onUpdate).toHaveBeenCalledWith(
      gn.id,
      expect.objectContaining({ manualVolumes: true }),
    );
  });

  it("offers revert on an edited client, which clears the flag and restores the plan", () => {
    const onUpdate = vi.fn();
    const edited = build([
      {
        id: "saved-gn",
        name: "Ground News",
        videosByMonth: [18, 18, 18],
        staticsByMonth: [1, 1, 1],
        enabled: true,
        hypothetical: false,
        manualVolumes: true,
      },
    ]);
    render(
      <ScenarioBuilder
        clients={edited}
        historyLabels={historyLabels}
        monthLabels={monthLabels}
        histories={histories}
        plans={deriveClientPlans(clients, histories)}
        onUpdate={onUpdate}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    const row = rowFor("Ground News");
    expect(within(row).getByText(/edited/i)).toBeTruthy();
    fireEvent.click(within(row).getByText(/revert/i));
    expect(onUpdate).toHaveBeenCalledWith(edited.find((c) => c.name === "Ground News")!.id, {
      manualVolumes: undefined,
      videosByMonth: [25, 25, 25],
      staticsByMonth: [5, 5, 5],
    });
  });

  it("does not offer revert on a client that follows the plan", () => {
    render(
      <ScenarioBuilder
        clients={build()}
        historyLabels={historyLabels}
        monthLabels={monthLabels}
        histories={histories}
        plans={deriveClientPlans(clients, histories)}
        onUpdate={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(within(rowFor("FabFitFun")).queryByText(/revert/i)).toBeNull();
  });
});
