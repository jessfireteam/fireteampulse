import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PnlTab } from "../PnlTab";
import { emptyCostConfig } from "@/lib/forecast/types";
import type { ScenarioClient } from "@/lib/forecast/types";

const months = ["Jun", "Jul", "Aug"];
const client: ScenarioClient = {
  id: "1", name: "Acme", videosByMonth: [], staticsByMonth: [], enabled: true, hypothetical: false,
  pricing: { minFee: 3000, tiers: [{ upTo: null, rate: 5 }] },
  adSpendByMonth: [100000, 100000, 100000], agencyPctByMonth: [40, 40, 40],
};

describe("PnlTab", () => {
  it("renders revenue, cost and profit rows without throwing", () => {
    expect(() =>
      render(
        <PnlTab
          clients={[client]}
          costConfig={emptyCostConfig(3)}
          monthLabels={months}
          deliverablesByMonth={[10, 12, 15]}
          onUpdate={() => {}}
          onUpdateCost={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
