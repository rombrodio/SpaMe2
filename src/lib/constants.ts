/** Default timezone for all scheduling logic. */
export const TZ = "Asia/Jerusalem";

/** Default currency. */
export const CURRENCY = "ILS";

/** Standard result type for engine/action functions. */
export type ActionResult =
  | { success: true; data: Record<string, unknown> }
  | { error: Record<string, string[]> };
