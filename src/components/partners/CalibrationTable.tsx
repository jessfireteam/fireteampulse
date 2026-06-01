// src/components/partners/CalibrationTable.tsx
import { Input } from "@/components/ui/input";
import { FORECAST_ROLES, type Calibration } from "@/lib/forecast/types";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

interface Props {
  calibration: Calibration;
  onChange: (next: Calibration) => void;
}

export function CalibrationTable({ calibration, onChange }: Props) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Calibration — role-tasks per asset" />
      <div className="space-y-2">
        {FORECAST_ROLES.map((role) => (
          <div key={role.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{role.display}</span>
            <Input
              type="number"
              step="0.1"
              min="0"
              className="w-24 font-mono text-right"
              value={Number.isFinite(calibration[role.key]) ? Math.round(calibration[role.key] * 100) / 100 : 0}
              onChange={(e) =>
                onChange({ ...calibration, [role.key]: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
