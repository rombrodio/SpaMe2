/**
 * SPA-101 — Israeli phone normalization to E.164.
 *
 * Israeli mobile numbers are 05X-XXXXXXX; landlines are 0Y-XXXXXXX where Y
 * is 2-9. The country code is +972 and the leading 0 of the local number
 * is dropped. This helper accepts everyday Israeli formats and produces
 * a canonical `+972XXXXXXXXX` string for storage.
 *
 * Handling:
 *   - whitespace, dashes, parentheses, en/em dashes, dots → stripped
 *   - "972..." or "+972..." → "+972..." (unchanged content)
 *   - "0YXXXXXXXX"        → "+972YXXXXXXXX"
 *   - "YXXXXXXXX" 9 digits with leading 5-9 → "+972YXXXXXXXX"
 *   - anything else → returned trimmed (best-effort); schema validates after
 */
export function normalizeIsraeliPhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  // Remove every character that isn't a digit or a leading +.
  const leadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");

  if (digits.length === 0) return "";

  // Already in international form: 972...
  if (digits.startsWith("972")) {
    return `+${digits}`;
  }

  // Local Israeli 10-digit "0YXXXXXXXX" — strip the 0 and prepend +972.
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+972${digits.slice(1)}`;
  }

  // Local Israeli 9-digit "YXXXXXXXX" (no leading zero).
  if (digits.length === 9 && /^[2-9]/.test(digits)) {
    return `+972${digits}`;
  }

  // Preserve explicit international prefix; otherwise return best-effort.
  return leadingPlus ? `+${digits}` : digits;
}

/**
 * Returns true when `value` is a well-formed E.164 phone number.
 * E.164 is `+` followed by 1 country code + national number, up to 15 digits.
 */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
