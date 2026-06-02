export function isClientActive(
  c: { enabled?: boolean; startMonthIndex?: number; endMonthIndex?: number | null },
  m: number,
): boolean {
  if (c.enabled === false) return false;
  if (m < (c.startMonthIndex ?? 0)) return false;
  if (c.endMonthIndex != null && m > c.endMonthIndex) return false;
  return true;
}
