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
import { CreatorSummary, formatRelativeDate } from "@/hooks/useCreatorCostsData";
import { CreatorSparkline } from "./CreatorSparkline";
import { ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreatorTableProps {
  creators: CreatorSummary[];
}

type SortKey = "creatorName" | "totalPaid" | "projectCount" | "averagePerProject" | "lastPaymentDate";
type SortDir = "asc" | "desc";

function formatDollars(value: number): string {
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const PAGE_SIZE = 30;

export function CreatorTable({ creators }: CreatorTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalPaid");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

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
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.creatorName.toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      switch (sortKey) {
        case "creatorName": aVal = a.creatorName.toLowerCase(); bVal = b.creatorName.toLowerCase(); break;
        case "totalPaid": aVal = a.totalPaid; bVal = b.totalPaid; break;
        case "projectCount": aVal = a.projectCount; bVal = b.projectCount; break;
        case "averagePerProject": aVal = a.averagePerProject; bVal = b.averagePerProject; break;
        case "lastPaymentDate": aVal = a.lastPaymentDate; bVal = b.lastPaymentDate; break;
        default: return 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [creators, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search creators..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-9 bg-muted/30 border-border/50 h-9 text-sm"
        />
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <SortHeader label="Creator Name" col="creatorName" className="px-3" />
              <SortHeader label="Total Paid" col="totalPaid" className="text-right px-3" />
              <SortHeader label="# Projects" col="projectCount" className="text-center px-2" />
              <SortHeader label="Avg/Project" col="averagePerProject" className="text-right px-3" />
              <TableHead className="text-muted-foreground font-semibold text-xs px-3">Clients</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs text-center px-1 w-28">Trend</TableHead>
              <SortHeader label="Last Active" col="lastPaymentDate" className="text-right px-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((creator) => (
              <TableRow key={creator.creatorName} className="border-border/30 hover:bg-muted/20">
                <TableCell className="font-medium text-foreground text-sm py-2 px-3">
                  {creator.creatorName}
                </TableCell>
                <TableCell className="text-right font-mono text-sm px-3">
                  {formatDollars(creator.totalPaid)}
                </TableCell>
                <TableCell className="text-center font-mono text-sm px-2">
                  {creator.projectCount}
                </TableCell>
                <TableCell className="text-right font-mono text-sm px-3">
                  {formatDollars(creator.averagePerProject)}
                </TableCell>
                <TableCell className="text-sm px-3 max-w-[200px]">
                  <ClientsList clients={creator.clients} />
                </TableCell>
                <TableCell className="text-center px-1">
                  <CreatorSparkline payments={creator.payments} />
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground px-3">
                  {creator.lastPaymentDate ? formatRelativeDate(creator.lastPaymentDate) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
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
        </div>
      )}
    </div>
  );
}

function ClientsList({ clients }: { clients: string[] }) {
  if (clients.length <= 3) {
    return <span className="text-muted-foreground">{clients.join(", ")}</span>;
  }
  const visible = clients.slice(0, 3);
  const rest = clients.slice(3);
  return (
    <span className="text-muted-foreground">
      {visible.join(", ")}{" "}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-primary cursor-help">+{rest.length} more</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{rest.join(", ")}</p>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
