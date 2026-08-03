/**
 * Where the money moved — every account, ours and theirs.
 *
 * The read-side companion to the Monday #buddys-garden post. That message keeps
 * the roster summary, because it interrupts and is good at deciding which
 * account to open; this page holds the detail, because it has no length limit,
 * can sort, and lets the period be a control instead of a decision baked in
 * when the job ran.
 */
import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, Copy, ExternalLink, ImageOff, Loader2, RefreshCw,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { useMovementData } from "@/hooks/useMovementData";
import { useThumbnails } from "@/hooks/useThumbnails";
import type { AccountMovement } from "@/lib/movement/aggregate";
import { adsManagerUrl, type Move } from "@/lib/movement/movement";
import { Button } from "@/components/ui/button";

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 28, label: "28 days" },
];

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const signed = (n: number) =>
  (n >= 0 ? "+" : "") +
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * The ad's creative, at the size Ads Manager shows it.
 *
 * An ad name encodes what the team meant to make; the thumbnail is the only
 * thing on the row that says what actually ran. A name maps to several ad ids
 * (14% of them do), but those are the same creative duplicated across ad sets,
 * so the first id that resolves is the right one to show.
 *
 * Always occupies its square, thumbnail or not. Rows that shrink when an image
 * is missing make the table jitter as thumbnails stream in.
 */
function Thumb({ move, thumbs }: { move: Move; thumbs: Map<string, string> }) {
  const src = move.adIds.map((id) => thumbs.get(id)).find(Boolean);
  if (!src) {
    return (
      <div
        className="h-10 w-10 shrink-0 rounded border border-border/60 bg-muted/30 flex items-center justify-center"
        title="No thumbnail stored for this ad"
      >
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>
    );
  }
  // Deliberately no hover-to-enlarge. The obvious CSS version gets cropped to
  // the column by the table's own clipping, and escaping that needs a portal
  // and JS positioning for a row that already links straight to Ads Manager.
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-10 w-10 shrink-0 rounded border border-border/60 object-cover bg-muted/30"
    />
  );
}

function MoveRow({
  move, kind, thumbs,
}: {
  move: Move;
  kind: "breakout" | "established";
  thumbs: Map<string, string>;
}) {
  const delta = move.current - move.prior;
  const href = adsManagerUrl(move.accountId, move.adIds);
  const how =
    kind === "breakout"
      ? move.prior <= 0
        ? "new"
        : `${Math.round(move.current / move.prior).toLocaleString()}× from ${money(move.prior)}`
      : move.current === 0
        ? `${money(move.prior)} → stopped`
        : `${money(move.prior)} → ${money(move.current)}`;
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20">
      <td className="py-1.5 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
        {kind === "breakout" ? (
          money(move.current)
        ) : (
          <span className={delta >= 0 ? "text-emerald-500" : "text-rose-500"}>
            {signed(delta)}
          </span>
        )}
      </td>
      <td className="py-1.5 pr-4 text-right font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap">
        {how}
      </td>
      <td className="py-1.5 pr-3 whitespace-nowrap">
        <span
          className={
            move.ours
              ? "rounded px-1.5 py-0.5 text-xs font-medium bg-primary/20 text-primary"
              : "rounded px-1.5 py-0.5 text-xs text-muted-foreground"
          }
        >
          {move.ours ? "ours" : "not ours"}
        </span>
        {move.duplicated && (
          <span
            className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400"
            title="Now running in a campaign it was not in last period, while still running where it was"
          >
            <Copy className="h-3 w-3" />
            duplicated
          </span>
        )}
      </td>
      {/* Thumbnail and name share a cell so the image sits against the name the
          way it does in Ads Manager, rather than in a column of its own. */}
      <td className="py-1.5 text-sm">
        <div className="flex items-center gap-2.5">
          <Thumb move={move} thumbs={thumbs} />
          <span className="break-all">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-start gap-1 hover:text-primary hover:underline underline-offset-2"
                title={
                  move.adIds.length > 1
                    ? `Open all ${move.adIds.length} ads with this name in Ads Manager`
                    : "Open in Ads Manager"
                }
              >
                {move.name}
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0 group-hover:opacity-70" />
              </a>
            ) : (
              move.name
            )}
          </span>
        </div>
      </td>
    </tr>
  );
}

function Block({
  title, blurb, rows, kind, totalLabel, thumbs,
}: {
  title: string;
  blurb: string;
  rows: Move[];
  kind: "breakout" | "established";
  totalLabel: string;
  thumbs: Map<string, string>;
}) {
  if (rows.length === 0) return null;
  const sum = rows.reduce((t, r) => t + r.rank, 0);
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-sm font-semibold tracking-wide uppercase">{title}</h3>
        <span className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "ad" : "ads"}, {money(sum)} {totalLabel}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>
      <table className="w-full mt-2 text-sm">
        <tbody>
          {/* No cap. The Slack post truncates because a message has to; a page does not. */}
          {rows.map((m) => (
            <MoveRow key={m.name} move={m} kind={kind} thumbs={thumbs} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Account({
  account, thumbs,
}: {
  account: AccountMovement;
  thumbs: Map<string, string>;
}) {
  const delta = account.spend - account.priorSpend;
  const pct = account.priorSpend ? (100 * delta) / account.priorSpend : null;
  const { breakout, established } = account.movement;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-lg font-bold">{account.client}</h2>
        <span className="font-mono tabular-nums">{money(account.spend)}</span>
        <span
          className={`inline-flex items-center gap-0.5 text-sm font-mono tabular-nums ${
            delta >= 0 ? "text-emerald-500" : "text-rose-500"
          }`}
        >
          {delta >= 0 ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {signed(delta)}
          {pct !== null && ` (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`}
        </span>
        {account.oursPct !== null && (
          <span className="text-sm text-muted-foreground">
            ours {account.oursPct.toFixed(1)}%
            {account.priorOursPct !== null &&
              ` (${account.oursPct - account.priorOursPct >= 0 ? "+" : ""}${(
                account.oursPct - account.priorOursPct
              ).toFixed(1)}pt)`}
          </span>
        )}
      </div>
      {breakout.length === 0 && established.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing moved more than {money(Math.max(0.01 * account.spend, 400))} this period.
        </p>
      )}
      <Block
        title="Breaking out"
        blurb="Was small last period, now taking real spend. Ranked on what the ad is now, not its multiple."
        rows={breakout}
        kind="breakout"
        totalLabel="taking"
        thumbs={thumbs}
      />
      <Block
        title="Established"
        blurb="Already running, and moved. Ranked on absolute dollars, falls alongside rises."
        rows={established}
        kind="established"
        totalLabel="moved"
        thumbs={thumbs}
      />
    </section>
  );
}

export default function Movement() {
  const { loading } = useAuth();
  const [days, setDays] = useState(7);
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error, progress, reload } = useMovementData(days, offset);

  const rosterDelta = useMemo(() => {
    if (!data?.priorTotal) return null;
    return (100 * (data.total - data.priorTotal)) / data.priorTotal;
  }, [data]);

  // Only the ads that made it onto the page, not every ad that had spend.
  const shownAdIds = useMemo(() => {
    if (!data) return [];
    return data.accounts.flatMap((a) =>
      [...a.movement.breakout, ...a.movement.established].flatMap((m) => m.adIds)
    );
  }, [data]);
  const thumbs = useThumbnails(shownAdIds);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        <DashboardHeader />

        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div>
            <h1 className="text-xl font-bold">Where the money moved</h1>
            <p className="text-sm text-muted-foreground">
              Every account, ours and theirs. Thresholds scale with each account&rsquo;s own spend.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg bg-muted/30 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setDays(p.days)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    days === p.days
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setOffset(offset + 1)}>
              ← earlier
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 1))}
            >
              later →
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void reload()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {data && (
          <p className="text-sm text-muted-foreground mb-6 font-mono tabular-nums">
            {data.window.currentStart} → {data.window.currentEnd} vs {data.window.priorStart} →{" "}
            {data.window.priorEnd} · {data.accounts.length} accounts · {money(data.total)}
            {rosterDelta !== null &&
              ` (${rosterDelta >= 0 ? "+" : ""}${rosterDelta.toFixed(0)}%)`}
            {" · data through "}
            {data.anchor}
          </p>
        )}

        {isLoading && (
          <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">
              {progress
                ? `Loading spend… ${progress.done}/${progress.total} pages`
                : "Loading spend…"}
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Could not load ad spend</p>
            <p className="text-muted-foreground mt-1">{error}</p>
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            {data.accounts.map((a) => (
              <Account key={a.client} account={a} thumbs={thumbs} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
