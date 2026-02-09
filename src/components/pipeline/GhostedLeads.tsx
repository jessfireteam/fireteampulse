import { GhostedLead, formatRelativeDate } from "@/hooks/usePipelineData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  leads: GhostedLead[];
}

function daysColor(days: number): string {
  if (days <= 14) return "text-green-400";
  if (days <= 30) return "text-yellow-400";
  if (days <= 60) return "text-orange-400";
  return "text-red-400";
}

export function GhostedLeads({ leads }: Props) {
  if (leads.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No recently ghosted leads</p>;
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Last Contacted</TableHead>
            <TableHead>Days Ago</TableHead>
            <TableHead>First Contact</TableHead>
            <TableHead>Owner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{lead.name}</TableCell>
              <TableCell>
                {lead.website ? (
                  <a
                    href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
                  >
                    {lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-sm">
                {lead.lastContacted ? format(parseISO(lead.lastContacted), "MMM d, yyyy") : "—"}
              </TableCell>
              <TableCell className={`font-medium ${daysColor(lead.daysSinceLastContact)}`}>
                {lead.daysSinceLastContact}d
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {lead.firstContact ? format(parseISO(lead.firstContact), "MMM d, yyyy") : "—"}
              </TableCell>
              <TableCell className="text-sm">{lead.owner || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
