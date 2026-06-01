// src/lib/forecast/assetType.ts
export type AssetType = "video" | "static";

/** Mirrors classifyType() in ProjectsTimeline.tsx, lowercased. */
export function classifyAssetType(name: string, typeName: string | null | undefined): AssetType {
  const t = (typeName ?? "").toLowerCase();
  if (t) {
    if (t.includes("static")) return "static";
    if (t.includes("video") || t.includes("ugc")) return "video";
    if (t.includes("graphic") || t.includes("design")) return "static";
  }
  const n = (name ?? "").toLowerCase();
  if (n.includes("video") || n.includes("ugc") || n.includes("reel") || n.includes("tiktok")) return "video";
  return "static";
}
