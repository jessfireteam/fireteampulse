import { ActiveLead, formatRelativeDate } from "@/hooks/usePipelineData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";

const TEMP_CONFIG = {
  hot: { label: "Hot", color: "bg-green-500", border: "border-green-500/30" },
  warm: { label: "Warm", color: "bg-yellow-500", border: "border-yellow-500/30" },
  cooling: { label: "Cooling", color: "bg-orange-500", border: "border-orange-500/30" },
  cold: { label: "Cold", color: "bg-red-500", border: "border-red-500/30" },
};

interface Props {
  leads: ActiveLead[];
  needAttentionCount: number;
}

export function ActivePipeline({ leads, needAttentionCount }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {leads.length} active lead{leads.length !== 1 ? "s" : ""} — {needAttentionCount > 0 ? (
          <span className="text-orange-400 font-medium">{needAttentionCount} need{needAttentionCount !== 1 ? "" : "s"} attention</span>
        ) : (
          <span className="text-green-400">all on track</span>
        )}
      </p>

      {leads.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No active leads</p>
      ) : (
        <div className="grid gap-2">
          {leads.map((lead, i) => {
            const temp = TEMP_CONFIG[lead.temperature];
            return (
              <Card key={i} className={`border-border/50 bg-card/50 ${temp.border}`}>
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  {/* Temperature dot */}
                  <div className={`h-3 w-3 rounded-full flex-shrink-0 ${temp.color}`} title={temp.label} />

                  {/* Name + website */}
                  <div className="flex-1 min-w-[140px]">
                    <span className="font-semibold text-foreground">{lead.name}</span>
                    {lead.website && (
                      <a
                        href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {lead.contacts.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lead.contacts.map((c) => c.name).filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>

                  {/* Owner */}
                  {lead.owner && (
                    <Badge variant="outline" className="text-xs">
                      {lead.owner}
                    </Badge>
                  )}

                  {/* Timing */}
                  <div className="text-right text-xs text-muted-foreground min-w-[120px]">
                    <div>
                      Last contact:{" "}
                      <span className={lead.daysSinceLastContact >= 8 ? "text-orange-400 font-medium" : ""}>
                        {formatRelativeDate(lead.lastContacted)}
                      </span>
                    </div>
                    {lead.firstContact && (
                      <div className="text-muted-foreground/60">
                        Since {format(parseISO(lead.firstContact), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
