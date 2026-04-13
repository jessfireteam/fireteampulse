import { useState, useMemo } from "react";
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
      const aIneligible = a.totalProjects < 5 || a.performanceIndex === null;
      const bIneligible = b.totalProjects < 5 || b.performanceIndex === null;
      if (aIneligible && !bIneligible) return 1;
      if (!aIneligible && bIneligible) return -1;
      return (b.performanceIndex ?? 0) - (a.performanceIndex ?? 0);
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
              <TableHead className="cursor-pointer hover:text-foreground" onClick={() => setSortKey("pi")}>
                Index{sortKey === "pi" ? " ↓" : ""}
              </TableHead>
              <TableHead>Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => {
              const key = `${c.type}_${c.name}_${c.rolePublicId}`;
              const isExpanded = expandedRow === key;
              const insufficientData = c.totalProjects < 5;

              return (
                <>
                  <TableRow
                    key={key}
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
                    <TableCell>{c.totalProjects}</TableCell>
                    <TableCell>{c.actualWinners}</TableCell>
                    <TableCell>
                      {c.expectedWinners > 0 ? c.expectedWinners.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-sm font-semibold ${indexColor(insufficientData ? null : c.performanceIndex)}`}>
                        {insufficientData ? "—" : c.performanceIndex !== null ? c.performanceIndex : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(c.rawWinRate * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${key}-detail`}>
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
                                    <td className="py-1 pr-4">{bd.expectedWinners.toFixed(1)}</td>
                                    <td className={`py-1 ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </TableCell>
                    </TableRow>
                  )}
                </>
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
