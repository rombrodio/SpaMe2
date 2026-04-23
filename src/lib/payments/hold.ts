/**
 * Pure predicates for booking hold state.
 *
 * Lives outside any React render scope so server/client components can
 * call these without triggering react-hooks-purity lint warnings about
 * Date.now() / new Date().
 */

export function isHoldExpired(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const deadline = Date.parse(iso);
  if (Number.isNaN(deadline)) return false;
  return deadline <= Date.now();
}

export function holdMinutesRemaining(
  iso: string | null | undefined
): number | null {
  if (!iso) return null;
  const deadline = Date.parse(iso);
  if (Number.isNaN(deadline)) return null;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 60_000);
}
