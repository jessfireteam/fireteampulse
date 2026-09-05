import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { PartnerGate } from "@/components/partners/PartnerGate";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NeedsAttention } from "@/components/newbiz/NeedsAttention";
import { InquiryVolumeChart } from "@/components/newbiz/InquiryVolumeChart";
import { ResponseTimeChart } from "@/components/newbiz/ResponseTimeChart";
import { useNewBizLeads, slackCardUrl, REPLY_TARGET_HOURS } from "@/hooks/useNewBizLeads";
import { Inbox, AlarmClock, Timer, Trophy, ExternalLink } from "lucide-react";

function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return "<1h";
  if (h < 48) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function NewBizInner() {
  const {
    attention, revisit, months, openCount, waitingOnUs, outcomes,
    medianReplyHours90d, slowestOpenDays, leads, isLoading, error,
  } = useNewBizLeads();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-card/50">
        <CardContent className="p-6 text-sm">
          <p className="font-medium text-destructive">Could not load the pipeline.</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const decided = outcomes.won + outcomes.passed + outcomes.ghosted;

  return (
    <div className="space-y-12">
      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Open pipeline"
            value={openCount}
            subtitle={`${leads.length} inquiries tracked all time`}
            icon={Inbox}
          />
          <KPICard
            title="Waiting on us"
            value={waitingOnUs}
            subtitle={slowestOpenDays > 0 ? `oldest sitting ${slowestOpenDays} business days` : "nothing overdue"}
            icon={AlarmClock}
          />
          <KPICard
            title="Median first reply"
            value={formatHours(medianReplyHours90d)}
            subtitle={`last 90 days · ${REPLY_TARGET_HOURS}h target`}
            icon={Timer}
          />
          <KPICard
            title="Won"
            value={outcomes.won}
            subtitle={decided > 0 ? `of ${decided} decided (${Math.round((outcomes.won / decided) * 100)}%)` : "none decided yet"}
            icon={Trophy}
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Needs attention" />
        <p className="mb-4 text-sm text-muted-foreground">
          Open leads, most urgent first. The radar refreshes this twice each weekday.
        </p>
        <NeedsAttention items={attention} />
      </section>

      <section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-foreground">Inquiries per month</h3>
              <p className="mb-4 text-xs text-muted-foreground">Everything that reached team@, last 12 months</p>
              <InquiryVolumeChart months={months} />
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-foreground">How fast we reply</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Median time to first reply. Red months went over the {REPLY_TARGET_HOURS} hour target.
              </p>
              <ResponseTimeChart months={months} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader title="Worth revisiting" />
        <p className="mb-4 text-sm text-muted-foreground">
          Leads that stalled on budget or timing and said to come back later.
        </p>
        {revisit.length === 0 ? (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">Nothing parked right now.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {revisit.map((lead) => {
              const url = slackCardUrl(lead.card_ts);
              return (
                <Card key={lead.thread_id} className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardContent className="space-y-2 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{lead.brand ?? "Unnamed"}</span>
                      {lead.first_contact_at && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(lead.first_contact_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                    {lead.notes && <p className="text-xs leading-relaxed text-muted-foreground">{lead.notes}</p>}
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Card <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function NewBiz() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(18_100%_60%_/_0.05),_transparent_50%)] pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader />
        <PartnerGate>
          <NewBizInner />
        </PartnerGate>
      </div>
    </div>
  );
}
