import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { ClientStat } from "@/hooks/useWinnersData";

interface Props {
  clients: ClientStat[];
}

function rateColor(rate: number): string {
  if (rate > 0.04) return "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
  if (rate > 0.025) return "text-yellow-400 border-yellow-400/30 bg-yellow-400/10";
  if (rate > 0.015) return "text-orange-400 border-orange-400/30 bg-orange-400/10";
  if (rate > 0) return "text-red-400 border-red-400/30 bg-red-400/10";
  return "text-muted-foreground border-border bg-muted/20";
}

export function ClientBaseline({ clients }: Props) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <SectionHeader title="Client Win Rate Baseline" />
        <Tooltip>
          <TooltipTrigger>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            A contributor working primarily on high-rate clients has a natural advantage. The Performance Index corrects for this.
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        The expected rate at which ads for each client become winners. Used to normalize individual performance.
      </p>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {clients.map((client) => (
          <Card
            key={client.name}
            className={`min-w-[140px] shrink-0 border ${rateColor(client.winRate)}`}
          >
            <CardContent className="p-4">
              <p className="text-xs font-medium truncate opacity-80">{client.name}</p>
              <p className="text-2xl font-bold mt-1">
                {(client.winRate * 100).toFixed(0)}%
              </p>
              <p className="text-xs opacity-60 mt-1">
                {client.winners} of {client.total}
              </p>
            </CardContent>
          </Card>
        ))}
        {clients.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No client data available.</p>
        )}
      </div>
    </section>
  );
}
