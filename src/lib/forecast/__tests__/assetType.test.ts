import { describe, it, expect } from "vitest";
import { classifyAssetType } from "../assetType";

describe("classifyAssetType", () => {
  it("classifies by type name keywords", () => {
    expect(classifyAssetType("Whatever", "UGC Video")).toBe("video");
    expect(classifyAssetType("Whatever", "Static Graphic")).toBe("static");
  });
  it("falls back to project name when type is missing", () => {
    expect(classifyAssetType("New Reel for TikTok", null)).toBe("video");
    expect(classifyAssetType("Headline test", null)).toBe("static");
  });
  it("treats STATIC - UGC as static (static wins over ugc)", () => {
    expect(classifyAssetType("BE - Woman Outdoors", "STATIC - UGC")).toBe("static");
    expect(classifyAssetType("X", "STATIC")).toBe("static");
    expect(classifyAssetType("X", "VIDEO - LoFi")).toBe("video");
  });
});
