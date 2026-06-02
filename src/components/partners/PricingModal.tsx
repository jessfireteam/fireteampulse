import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ClientPricing, PricingTier } from "@/lib/forecast/types";

export interface ActiveWindow {
  startMonthIndex: number;
  endMonthIndex: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthLabels: string[];
  initial?: { name: string; pricing?: ClientPricing; startMonthIndex?: number; endMonthIndex?: number | null };
  onSave: (name: string, pricing: ClientPricing, window: ActiveWindow) => void;
}

// Sentinel select value for the "Ongoing" (no end) option; maps to null on save.
const ONGOING = "ongoing";

// Editable tier shape: upTo is a string so the field can be cleared (empty = "and above").
interface DraftTier {
  upTo: string;
  rate: string;
}

const DEFAULT_TIERS: DraftTier[] = [
  { upTo: "100000", rate: "7" },
  { upTo: "250000", rate: "6" },
  { upTo: "", rate: "5" },
];
const DEFAULT_MIN_FEE = "3000";
const DEFAULT_BASE_FEE = "0";

function toDraftTiers(tiers?: PricingTier[]): DraftTier[] {
  if (!tiers || tiers.length === 0) return DEFAULT_TIERS.map((t) => ({ ...t }));
  return tiers.map((t) => ({ upTo: t.upTo === null ? "" : String(t.upTo), rate: String(t.rate) }));
}

export function PricingModal({ open, onOpenChange, monthLabels, initial, onSave }: Props) {
  const [name, setName] = useState("");
  const [baseFee, setBaseFee] = useState(DEFAULT_BASE_FEE);
  const [minFee, setMinFee] = useState(DEFAULT_MIN_FEE);
  const [tiers, setTiers] = useState<DraftTier[]>(DEFAULT_TIERS.map((t) => ({ ...t })));
  const [startMonth, setStartMonth] = useState("0");
  const [endMonth, setEndMonth] = useState(ONGOING);
  const [error, setError] = useState<string | null>(null);

  // Reset form state whenever the modal opens (or its initial values change).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setBaseFee(initial?.pricing ? String(initial.pricing.baseFee ?? 0) : DEFAULT_BASE_FEE);
    setMinFee(initial?.pricing ? String(initial.pricing.minFee) : DEFAULT_MIN_FEE);
    setTiers(toDraftTiers(initial?.pricing?.tiers));
    setStartMonth(String(initial?.startMonthIndex ?? 0));
    setEndMonth(initial?.endMonthIndex == null ? ONGOING : String(initial.endMonthIndex));
    setError(null);
  }, [open, initial]);

  const setTier = (i: number, patch: Partial<DraftTier>) =>
    setTiers((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTier = () => setTiers((ts) => [...ts, { upTo: "", rate: "" }]);
  const removeTier = (i: number) => setTiers((ts) => ts.filter((_, idx) => idx !== i));

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Client name is required.");
      return;
    }
    const baseFeeNum = parseFloat(baseFee);
    if (!Number.isFinite(baseFeeNum) || baseFeeNum < 0) {
      setError("Base fee must be 0 or greater.");
      return;
    }
    const minFeeNum = parseFloat(minFee);
    if (!Number.isFinite(minFeeNum) || minFeeNum < 0) {
      setError("Minimum fee must be 0 or greater.");
      return;
    }
    if (tiers.length === 0) {
      setError("Add at least one pricing tier.");
      return;
    }

    // Parse tiers. Empty upTo => the "and above" (null) tier. Rate must be numeric.
    const parsed: PricingTier[] = [];
    for (const t of tiers) {
      const rate = parseFloat(t.rate);
      if (!Number.isFinite(rate)) {
        setError("Every tier needs a numeric rate.");
        return;
      }
      const upToStr = t.upTo.trim();
      if (upToStr === "") {
        parsed.push({ upTo: null, rate });
      } else {
        const upTo = parseFloat(upToStr);
        if (!Number.isFinite(upTo) || upTo <= 0) {
          setError("Tier upper bounds must be positive numbers.");
          return;
        }
        parsed.push({ upTo, rate });
      }
    }

    const nullTiers = parsed.filter((t) => t.upTo === null);
    if (nullTiers.length > 1) {
      setError("Only one tier can be the final \"and above\" tier (leave its upper bound empty).");
      return;
    }

    const nonNull = parsed.filter((t) => t.upTo !== null) as Array<PricingTier & { upTo: number }>;
    // Strictly ascending check on the numeric bounds.
    const sortedBounds = [...nonNull].sort((a, b) => a.upTo - b.upTo);
    for (let i = 1; i < sortedBounds.length; i++) {
      if (sortedBounds[i].upTo === sortedBounds[i - 1].upTo) {
        setError("Tier upper bounds must be strictly ascending (no duplicates).");
        return;
      }
    }

    // Defensive sort: non-null tiers ascending, then the single null tier last.
    const finalTiers: PricingTier[] = [...sortedBounds, ...nullTiers];

    const startMonthIndex = parseInt(startMonth, 10) || 0;
    const endMonthIndex = endMonth === ONGOING ? null : parseInt(endMonth, 10);
    if (endMonthIndex != null && endMonthIndex < startMonthIndex) {
      setError("\"Active through\" must be on or after \"Active from\".");
      return;
    }

    onSave(trimmedName, { baseFee: baseFeeNum, minFee: minFeeNum, tiers: finalTiers }, { startMonthIndex, endMonthIndex });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit pricing" : "Add client / pricing"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Client Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prospective client" />
          </div>

          <div className="flex gap-3">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Base Fee ($)</label>
              <Input type="number" min="0" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Minimum Fee ($)</label>
              <Input type="number" min="0" value={minFee} onChange={(e) => setMinFee(e.target.value)} className="font-mono" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Pricing Tiers — leave "Up to" empty for the final "and above" tier
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  placeholder="Up to ($)"
                  value={t.upTo}
                  onChange={(e) => setTier(i, { upTo: e.target.value })}
                  className="font-mono"
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Rate (%)"
                  value={t.rate}
                  onChange={(e) => setTier(i, { rate: e.target.value })}
                  className="font-mono w-24"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTier(i)}
                  aria-label="Remove tier"
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addTier}>+ Add Tier</Button>
          </div>

          <div className="flex gap-3">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Active from</label>
              <select
                aria-label="Active from"
                className="w-full bg-background border border-input rounded px-2 h-9 text-sm"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              >
                <option value="0">Now</option>
                {monthLabels.slice(1).map((l, idx) => (
                  <option key={idx + 1} value={idx + 1}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Active through</label>
              <select
                aria-label="Active through"
                className="w-full bg-background border border-input rounded px-2 h-9 text-sm"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
              >
                <option value={ONGOING}>Ongoing</option>
                {monthLabels.map((l, idx) => (
                  <option key={idx} value={idx}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
