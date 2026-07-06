import { useState, useMemo, Fragment } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ROLE_LABELS } from "@/hooks/useWinnersData";
import type { Contributor, ClientStat } from "@/hooks/useWinnersData";

interface Props {
  contributors: Contributor[];
  clientStats: ClientStat[];
}

function indexColor(pi: number | null): string {
  if (pi === null) return "bg-muted text-muted-foreground";
  if (pi >= 110) return "bg-emerald-500/20 text-emerald-400";
  if (pi >= 100) return "bg-emerald-500/10 text-emerald-300";
  if (pi >= 90) return "bg-yellow-500/15 text-yellow-400";
  if (pi >= 80) return "bg-orange-500/15 text-orange-400";
  return "bg-red-500/15 text-red-400";
}

function AmTrendCell({ trend }: { trend: NonNullable<Contributor["amTrend"]> }) {
  if (trend.index === null) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs w-fit bg-muted text-muted-foreground" title="Not enough recent projects to compute a book trend.">
        n/a
      </span>
    );
  }
  const smallSample = trend.projects < 20;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-semibold w-fit ${indexColor(trend.index)}`}
        title={`Book Trend: ${trend.scoreLabel} book scored against its own ${trend.baselineLabel} baseline (client difficulty cancels; agency-drift adjusted). ${trend.actual} winners on ${trend.projects} projects. ★ = unlikely to be noise.`}
      >
        {trend.index}
        {trend.significant && <span>★</span>}
      </span>
      <span className="text-[10px] text-muted-foreground/70 px-1.5">
        trend{smallSample ? " · thin" : ""}
      </span>
    </div>
  );
}

function clientRateColor(rate: number): string {
  if (rate > 0.04) return "bg-emerald-500";
  if (rate > 0.025) return "bg-yellow-500";
  if (rate > 0.015) return "bg-orange-500";
  if (rate > 0) return "bg-red-500";
  return "bg-muted-foreground/40";
}

function ClientMixBar({ breakdown, total }: { breakdown: Record<string, { total: number; clientRate: number }>; total: number }) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1].total - a[1].total);
  return (
    <div className="flex h-4 w-full min-w-[100px] max-w-[180px] overflow-hidden rounded-sm" title="Client mix">
      {entries.map(([name, data]) => {
        const pct = (data.total / total) * 100;
        return (
          <div
            key={name}
            className={`${clientRateColor(data.clientRate)} opacity-80`}
            style={{ width: `${pct}%`, minWidth: pct > 0 ? "2px" : 0 }}
            title={`${name}: ${data.total} projects (${(data.clientRate * 100).toFixed(0)}% client rate)`}
          />
        );
      })}
    </div>
  );
}

const ROLE_ORDER = ["11", "1", "6", "8", "9"]; // CW, VE, GD, AM, CD
const ROLE_FULL_NAMES: Record<string, string> = {
  "1": "Video Editors",
  "6": "Graphic Designers",
  "8": "Account Managers",
  "9": "Creative Directors",
  "11": "Copywriters",
};

function sortContributors(list: Contributor[], sortKey: "pi" | "winners" | "projects"): Contributor[] {
  const copy = [...list];
  copy.sort((a, b) => {
    if (sortKey === "pi") {
      // AMs rank by their Book Trend index; everyone else by the shrunk index
      // (so a lucky small sample doesn't top a proven large one). Unmeasurable
      // / thin rows fall to the bottom.
      const val = (c: Contributor) =>
        c.rolePublicId === "8" ? c.amTrend?.index ?? null : (c.measurable ? c.shrunkIndex : null);
      const av = val(a);
      const bv = val(b);
      const aIneligible = a.totalProjects < 5 || av === null;
      const bIneligible = b.totalProjects < 5 || bv === null;
      if (aIneligible && !bIneligible) return 1;
      if (!aIneligible && bIneligible) return -1;
      return (bv ?? 0) - (av ?? 0);
    }
    if (sortKey === "winners") return b.actualWinners - a.actualWinners;
    return b.totalProjects - a.totalProjects;
  });
  return copy;
}

function RoleTable({ roleId, contributors }: { roleId: string; contributors: Contributor[] }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"pi" | "winners" | "projects">("pi");
  const sorted = useMemo(() => sortContributors(contributors, sortKey), [contributors, sortKey]);

  if (contributors.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground/80 px-1">
        {ROLE_FULL_NAMES[roleId] ?? roleId}
        <span className="ml-2 text-xs font-normal text-muted-foreground">({contributors.length})</span>
      </h3>
      {roleId === "8" && (
        <p className="text-xs text-muted-foreground px-1 -mt-1">
          W Index here is a <span className="font-medium">Book Trend</span> (not client-adjusted): each AM's recent book scored against its own prior-period baseline, so it reflects whether the book is winning more than before.
          {sorted[0]?.amTrend && (
            <> Ads / Winners / Expected below are for the scored window (<span className="font-medium">{sorted[0].amTrend.scoreLabel}</span> vs {sorted[0].amTrend.baselineLabel} baseline), not all-time.</>
          )}
          {" "}Noisy quarter-to-quarter — read the direction, not the point.
        </p>
      )}
      <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Client Mix</TableHead>
              <TableHead className="cursor-pointer hover:text-foreground" onClick={() => setSortKey("projects")}>
                Ads{sortKey === "projects" ? " ↓" : ""}
              </TableHead>
              <TableHead className="cursor-pointer hover:text-foreground" onClick={() => setSortKey("winners")}>
                Winners{sortKey === "winners" ? " ↓" : ""}
              </TableHead>
              <TableHead>Expected</TableHead>
              <TableHead className="cursor-pointer hover:text-foreground" onClick={() => setSortKey("pi")} title="Raw W Index (actual ÷ expected winners), with the shrunk, noise-adjusted value below. ★ = difference from 100 is unlikely to be noise (~90% confidence).">
                W Index{sortKey === "pi" ? " ↓" : ""}
              </TableHead>
              <TableHead>Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => {
              const key = `${c.type}_${c.name}_${c.rolePublicId}`;
              const isExpanded = expandedRow === key;
              const insufficientData = c.totalProjects < 5;

              // AMs are scored on the Book Trend, which is computed over a
              // recent window — not all-time and not the (collapsed) LOO
              // expectation. Show that window's figures so the row reconciles
              // (winners ÷ expected ≈ the trend index) instead of pairing
              // all-time winners with a meaningless 0.1 expected.
              const amWindow = c.rolePublicId === "8" ? c.amTrend : undefined;
              const adsDisplay = amWindow ? amWindow.projects : c.totalProjects;
              const winnersDisplay = amWindow ? amWindow.actual : c.actualWinners;
              const expectedDisplay = amWindow ? amWindow.expected : c.expectedWinners;
              const winRateDisplay = amWindow
                ? (amWindow.projects > 0 ? amWindow.actual / amWindow.projects : 0)
                : c.rawWinRate;

              return (
                <Fragment key={key}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : key)}
                  >
                    <TableCell className="w-8 pr-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{c.name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {c.type === "external" && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Ext
                            </Badge>
                          )}
                          {insufficientData && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 opacity-60">
                              &lt;5 projects
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ClientMixBar breakdown={c.clientBreakdown} total={c.totalProjects} />
                    </TableCell>
                    <TableCell>{adsDisplay}</TableCell>
                    <TableCell>{winnersDisplay}</TableCell>
                    <TableCell>
                      {expectedDisplay > 0 ? expectedDisplay.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell>
                      {c.rolePublicId === "8" && c.amTrend ? (
                        <AmTrendCell trend={c.amTrend} />
                      ) : !c.measurable ? (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs w-fit bg-muted text-muted-foreground"
                          title="Not measurable — this person covers ~all of their clients' projects, so there is no independent baseline to compare against."
                        >
                          n/a
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-semibold w-fit ${indexColor(insufficientData ? null : c.shrunkIndex)}`}>
                            {insufficientData ? "—" : c.performanceIndex}
                            {c.significant && !insufficientData && (
                              <span title="Difference from 100 is unlikely to be noise (~90% confidence)">★</span>
                            )}
                          </span>
                          {!insufficientData && c.shrunkIndex !== null && (
                            <span className="text-[10px] text-muted-foreground/70 px-1.5" title="Noise-adjusted (shrunk toward 100 for small samples)">
                              adj: {c.shrunkIndex}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(winRateDisplay * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/20 px-8 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="text-left py-1 pr-4">Client</th>
                              <th className="text-left py-1 pr-4">Projects</th>
                              <th className="text-left py-1 pr-4">Winners</th>
                              <th className="text-left py-1 pr-4">Expected</th>
                              <th className="text-left py-1">Delta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(c.clientBreakdown)
                              .sort((a, b) => b[1].total - a[1].total)
                              .map(([clientName, bd]) => {
                                const delta = bd.winners - bd.expectedWinners;
                                return (
                                  <tr key={clientName}>
                                    <td className="py-1 pr-4 font-medium">{clientName}</td>
                                    <td className="py-1 pr-4">{bd.total}</td>
                                    <td className="py-1 pr-4">{bd.winners}</td>
                                    <td className="py-1 pr-4">{bd.measurable ? bd.expectedWinners.toFixed(1) : "n/a"}</td>
                                    {bd.measurable ? (
                                      <td className={`py-1 ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                                      </td>
                                    ) : (
                                      <td className="py-1 text-muted-foreground/60" title="Sole contributor for this client — no independent baseline.">—</td>
                                    )}
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ContributorTable({ contributors, clientStats }: Props) {
  // Group by role
  const grouped = useMemo(() => {
    const groups: Record<string, Contributor[]> = {};
    contributors.forEach((c) => {
      if (c.totalProjects < 10) return;
      if (!groups[c.rolePublicId]) groups[c.rolePublicId] = [];
      groups[c.rolePublicId].push(c);
    });
    return groups;
  }, [contributors]);

  if (contributors.length === 0) {
    return (
      <section>
        <SectionHeader title="Contributor Performance" />
        <p className="text-sm text-muted-foreground mt-4">
          No winners have been tagged in this period. Winners are tracked in Fibery using the "Winner - [Client Name]" tag on versions.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader title="Contributor Performance" />
      <div className="mt-4 space-y-6">
        {ROLE_ORDER.filter((id) => grouped[id]?.length).map((roleId) => (
          <RoleTable key={roleId} roleId={roleId} contributors={grouped[roleId]} />
        ))}
      </div>
    </section>
  );
}
