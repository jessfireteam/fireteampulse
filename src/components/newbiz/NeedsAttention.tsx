import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Check } from "lucide-react";
import type { AttentionItem } from "@/hooks/useNewBizLeads";

const SEVERITY_DOT = ["bg-destructive", "bg-[hsl(var(--chart-2))]", "bg-muted-foreground/50"];
const SEVERITY_LABEL = ["Needs action", "Soon", "Watching"];

interface Props {
  items: AttentionItem[];
}

export function NeedsAttention({ items }: Props) {
  if (!items.length) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-[hsl(var(--chart-3))]" />
          Nothing waiting. Every open lead is with the prospect.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Brand</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 text-right font-medium">Waiting</th>
                <th className="px-5 py-3 font-medium">Card</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.thread_id}
                  className="border-b border-border/30 transition-colors last:border-0 hover:bg-muted/20"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      {/* Severity is dot + text, never colour alone. */}
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`}
                        aria-label={SEVERITY_LABEL[item.severity]}
                        title={SEVERITY_LABEL[item.severity]}
                      />
                      <span className="font-medium text-foreground">{item.brand ?? "Unnamed"}</span>
                    </div>
                    {item.referral_source && (
                      <span className="ml-[18px] text-xs text-muted-foreground">via {item.referral_source}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{item.reason}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {item.contact_name ?? "—"}
                    {item.contact_email && (
                      <span className="block text-xs text-muted-foreground/70">{item.contact_email}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground">
                    {item.waitingDays}d
                  </td>
                  <td className="px-5 py-3">
                    {item.cardUrl ? (
                      <a
                        href={item.cardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
