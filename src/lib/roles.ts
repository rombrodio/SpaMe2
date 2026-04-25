/**
 * Centralised role → portal mapping. Kept in a tiny pure module so:
 *   - middleware (Edge runtime) can import it without pulling in
 *     server-only utilities
 *   - tests can assert the matrix without spinning up Next
 *
 * If you add a new role, update both the type union and the map.
 */
export type UserRole = "super_admin" | "receptionist" | "therapist";

/** Landing path for a signed-in user of the given role. */
export function portalForRole(role: string | null | undefined): string {
  if (role === "super_admin") return "/admin";
  if (role === "receptionist") return "/reception";
  if (role === "therapist") return "/therapist";
  return "/login";
}

/**
 * Can the given role access a path prefix? Returns the correct
 * portal to redirect to on mismatch (or null when allowed).
 *
 * Rules:
 *   - /admin/* → super_admin only
 *   - /reception/* → receptionist OR super_admin (super admin has
 *       full Texter-inbox visibility per the product vision)
 *   - /therapist/* → therapist only
 */
export function allowedOrRedirect(
  pathname: string,
  role: string | null | undefined
): { allowed: true } | { allowed: false; redirectTo: string } {
  if (pathname.startsWith("/admin")) {
    if (role === "super_admin") return { allowed: true };
    return { allowed: false, redirectTo: portalForRole(role) };
  }
  if (pathname.startsWith("/reception")) {
    if (role === "receptionist" || role === "super_admin") {
      return { allowed: true };
    }
    return { allowed: false, redirectTo: portalForRole(role) };
  }
  if (pathname.startsWith("/therapist")) {
    if (role === "therapist") return { allowed: true };
    return { allowed: false, redirectTo: portalForRole(role) };
  }
  // Anything else isn't role-gated — assume allowed.
  return { allowed: true };
}
