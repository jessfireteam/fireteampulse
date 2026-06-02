import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PnlTab } from "../PnlTab";
import { emptyCostConfig } from "@/lib/forecast/types";
import type { ScenarioClient } from "@/lib/forecast/types";

const months = ["Jun", "Jul", "Aug"];
const client: ScenarioClient = {
  id: "1", name: "Acme", videosByMonth: [10, 10, 10], staticsByMonth: [5, 5, 5], enabled: true, hypothetical: false,
  pricing: { minFee: 3000, tiers: [{ upTo: null, rate: 5 }] },
  adSpendByMonth: [100000, 100000, 100000], agencyPctByMonth: [40, 40, 40],
  oneOffsByMonth: [10000, 0, 0], oneOffLabelsByMonth: ["Onboarding", "", ""],
};

const costConfig = {
  ...emptyCostConfig(3),
  nonProdSalaryByMonth: [37000, 37000, 37000],
  overheadLines: [{ id: "sw", label: "Software", byMonth: [7000, 7000, 7000] }],
  team: [
    { id: "v", name: "Ed", side: "video" as const, monthlyCost: 8000, startMonthIndex: 0, employment: "salary" as const },
    { id: "s", name: "Dee", side: "static" as const, monthlyCost: 4000, startMonthIndex: 0 },
  ],
};

describe("PnlTab", () => {
  it("renders revenue, cost and profit rows without throwing", () => {
    expect(() =>
      render(
        <PnlTab
          clients={[client]}
          costConfig={costConfig}
          monthLabels={months}
          onUpdate={() => {}}
          onUpdateCost={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
