import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the therapist_id for the currently authenticated therapist user.
 *
 * Looks up the Supabase Auth user from the request cookies, then queries
 * profiles.therapist_id. Redirects to /login on any failure (not
 * authenticated, no profile row, no linked therapist).
 *
 * Must only be called from server components / server actions inside the
 * /therapist route tree — the middleware already enforces role=therapist
 * on those paths.
 */
export async function getCurrentTherapistId(): Promise<string> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("therapist_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.therapist_id) {
    // No linked therapist record — surface as a login redirect since the
    // therapist portal is unusable without it.
    redirect("/login");
  }

  return profile.therapist_id;
}
