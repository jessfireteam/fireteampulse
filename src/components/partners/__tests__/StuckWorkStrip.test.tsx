import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuckWorkStrip } from "../StuckWorkStrip";
import type { StuckStage } from "@/lib/forecast/stuck";

const stages: StuckStage[] = [
  { key: "brief", label: "Write brief", count: 6, unassigned: 0, clientCourt: 0, medianDaysLate: 12 },
  { key: "briefQc", label: "Brief QC & client OK", note: "upstream QC", count: 11, unassigned: 0, clientCourt: 4, medianDaysLate: 20 },
  { key: "casting", label: "Casting & intake", count: 15, unassigned: 0, clientCourt: 0, medianDaysLate: 9 },
  { key: "assign", label: "Assign", count: 8, unassigned: 0, clientCourt: 0, medianDaysLate: 30 },
  { key: "produce", label: "Produce", count: 12, unassigned: 8, clientCourt: 0, medianDaysLate: 25 },
  { key: "revisions", label: "Revisions", count: 0, unassigned: 0, clientCourt: 0, medianDaysLate: 0 },
  { key: "deliverableQc", label: "Deliverable QC", note: "downstream QC", count: 40, unassigned: 0, clientCourt: 0, medianDaysLate: 14 },
  { key: "ship", label: "Ship", count: 38, unassigned: 0, clientCourt: 17, medianDaysLate: 15 },
];

describe("StuckWorkStrip", () => {
  it("renders every stage in walking order with its count", () => {
    render(<StuckWorkStrip stages={stages} />);
    expect(screen.getByText(/1\. Write brief/)).toBeTruthy();
    expect(screen.getByText(/8\. Ship/)).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("labels the two QC stages so upstream and downstream stay distinct", () => {
    render(<StuckWorkStrip stages={stages} />);
    expect(screen.getByText("upstream QC")).toBeTruthy();
    expect(screen.getByText("downstream QC")).toBeTruthy();
  });

  it("calls out unassigned late work in red text", () => {
    render(<StuckWorkStrip stages={stages} />);
    expect(screen.getByText("8 unassigned")).toBeTruthy();
  });

  it("calls out blockers sitting in the client's court", () => {
    render(<StuckWorkStrip stages={stages} />);
    expect(screen.getByText("17 waiting on client")).toBeTruthy();
    expect(screen.getByText("4 waiting on client")).toBeTruthy();
  });

  it("shows median lateness only where something is late", () => {
    render(<StuckWorkStrip stages={stages} />);
    expect(screen.getByText("~25d late")).toBeTruthy();
    expect(screen.queryByText("~0d late")).toBeNull();
  });
});
