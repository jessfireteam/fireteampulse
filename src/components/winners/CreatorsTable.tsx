import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CreatorWinnerStats } from "@/hooks/useWinnersData";
import { ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreatorsTableProps {
  creators: CreatorWinnerStats[];
}

type SortKey = "displayName" | "totalProjects" | "winningProjects" | "windex";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 30;
// Hide creators with very few projects — Windex is too noisy below this threshold
const MIN_PROJECTS_DEFAULT = 3;

export function CreatorsTable({ creators }: CreatorsTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("windex");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let result = creators;
    if (!showAll) {
      result = result.filter((c) => c.totalProjects >= MIN_PROJECTS_DEFAULT);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.displayName.toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => {
      // Nulls (no Windex) always go to the bottom
      if (sortKey === "windex") {
        if (a.windex === null && b.windex === null) return 0;
        if (a.windex === null) return 1;
        if (b.windex === null) return -1;
      }
      let aVal: string | number, bVal: string | number;
      switch (sortKey) {
        case "displayName": aVal = a.displayName.toLowerCase(); bVal = b.displayName.toLowerCase(); break;
        case "totalProjects": aVal = a.totalProjects; bVal = b.totalProjects; break;
        case "winningProjects": aVal = a.winningProjects; bVal = b.winningProjects; break;
        case "windex": aVal = a.windex ?? 0; bVal = b.windex ?? 0; break;
        default: return 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [creators, search, sortKey, sortDir, showAll]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hiddenCount = creators.length - filtered.length - (search.trim() ? 0 : 0);

  const SortHeader = ({ label, col, className }: { label: string; col: SortKey; className?: string }) => (
    <TableHead
      className={cn("cursor-pointer select-none text-muted-foreground font-semibold text-xs hover:text-foreground transition-colors", className)}
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sortKey === col ? "text-primary" : "text-muted-foreground/50")} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search creators..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 bg-muted/30 border-border/50 h-9 text-sm"
          />
        </div>
        <button
          onClick={() => { setShowAll(!showAll); setPage(0); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAll
            ? `Hide creators with < ${MIN_PROJECTS_DEFAULT} projects`
            : `Show all (incl. < ${MIN_PROJECTS_DEFAULT} projects)`}
        </button>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <SortHeader label="Creator" col="displayName" className="px-3" />
              <SortHeader label="# Projects" col="totalProjects" className="text-center px-2" />
              <SortHeader label="Winners" col="winningProjects" className="text-center px-2" />
              <SortHeader label="Windex" col="windex" className="text-center px-2" />
              <TableHead className="text-muted-foreground font-semibold text-xs px-3">Last Winner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((c) => (
              <TableRow key={c.displayName} className="border-border/30 hover:bg-muted/20">
                <TableCell className="font-medium text-foreground text-sm py-2 px-3">
                  {c.displayName}
                </TableCell>
                <TableCell className="text-center font-mono text-sm px-2">
                  {c.totalProjects}
                </TableCell>
                <TableCell className="text-center font-mono text-sm px-2">
                  <WinnersCell creator={c} />
                </TableCell>
                <TableCell className="text-center px-2">
                  <WindexCell creator={c} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground px-3">
                  {c.winnerProjectNames[0]?.winnerDate?.slice(0, 10) ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No creators match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filtered.length === 0
            ? "0 creators"
            : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          {!showAll && !search.trim() && hiddenCount > 0 && (
            <span className="ml-2 text-xs">({hiddenCount} hidden — fewer than {MIN_PROJECTS_DEFAULT} completed projects)</span>
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border border-border/50 disabled:opacity-30 hover:bg-muted/30 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded border border-border/50 disabled:opacity-30 hover:bg-muted/30 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WindexCell({ creator }: { creator: CreatorWinnerStats }) {
  if (creator.windex === null) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }
  const color =
    creator.windex >= 150 ? "text-emerald-400" :
    creator.windex >= 100 ? "text-emerald-500/80" :
    creator.windex >= 70 ? "text-amber-500" :
    "text-red-500/80";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("font-mono text-sm font-medium cursor-help", color)}>
          {creator.windex}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {creator.winningProjects} winners on {creator.totalProjects} completed projects
          <br />
          {Math.round(creator.rawWinRate * 100)}% raw win rate · expected ~{creator.expectedWinners.toFixed(1)} winners
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function WinnersCell({ creator }: { creator: CreatorWinnerStats }) {
  if (creator.winningProjects === 0) {
    return <span className="text-xs text-muted-foreground">0</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-primary font-medium">{creator.winningProjects}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold">Winning projects:</p>
          <ul className="text-xs space-y-0.5">
            {creator.winnerProjectNames.slice(0, 10).map((w, i) => (
              <li key={i} className="truncate">
                <span className="text-muted-foreground">{w.client}:</span> {w.name}
              </li>
            ))}
            {creator.winnerProjectNames.length > 10 && (
              <li className="text-muted-foreground/60">+{creator.winnerProjectNames.length - 10} more</li>
            )}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
