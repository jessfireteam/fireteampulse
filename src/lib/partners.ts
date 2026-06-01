// src/lib/partners.ts

/**
 * The three FireTeam partners. Forecast + financial surfaces are visible only
 * to these emails, layered on top of the existing @fireteam.is Google auth.
 */
export const PARTNER_EMAILS = new Set<string>([
  "jess@fireteam.is",
  "rachyl@fireteam.is",
  "niki@fireteam.is",
]);

export function isPartner(email?: string | null): boolean {
  if (!email) return false;
  return PARTNER_EMAILS.has(email.toLowerCase());
}
