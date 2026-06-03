// Month-over-month color: neutral if flat/first month, green if up vs prior
// month, red if down. Shared by the P&L grid (fee/ad-spend/agency%) and the
// Capacity grid (videos/statics) so both use identical rules.
export function momColor(arr: number[] | undefined, i: number): string {
  if (!arr || i === 0) return "";
  const cur = arr[i] ?? 0;
  const prev = arr[i - 1] ?? 0;
  if (cur > prev) return "text-emerald-500";
  if (cur < prev) return "text-destructive";
  return "";
}
