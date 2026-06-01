// src/lib/forecast/dates.ts

/**
 * Parse a Fibery date value as LOCAL time. Date-only strings ("YYYY-MM-DD")
 * become local midnight (not UTC midnight), so they bucket correctly against
 * date-fns week boundaries, which are computed in local time. Full datetime
 * strings pass through to the native Date parser unchanged.
 */
export function parseLocalDate(value: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}
