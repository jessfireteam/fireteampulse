import { Input } from "@/components/ui/input";
import { FORECAST_ROLES, type TypedCalibration, type Calibration } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

interface Props {
  calibration: TypedCalibration;
  onChange: (next: TypedCalibration) => void;
}

const round2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

export function CalibrationTable({ calibration, onChange }: Props) {
  const setCell = (kind: "video" | "static", roleKey: keyof Calibration, value: number) =>
    onChange({ ...calibration, [kind]: { ...calibration[kind], [roleKey]: value } });

  return (
    <div className="space-y-3">
      <SectionHeader title="Calibration — tasks per asset (advanced)" />
      <div className="space-y-2">
        <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span className="w-24 text-right">per video</span>
          <span className="w-24 text-right">per static</span>
        </div>
        {FORECAST_ROLES.map((role) => (
          <div key={role.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{role.display}</span>
            <div className="flex gap-3">
              <Input type="number" step="0.1" min="0" className="w-24 font-mono text-right"
                value={round2(calibration.video[role.key])}
                onChange={(e) => setCell("video", role.key, parseFloat(e.target.value) || 0)} />
              <Input type="number" step="0.1" min="0" className="w-24 font-mono text-right"
                value={round2(calibration.static[role.key])}
                onChange={(e) => setCell("static", role.key, parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
