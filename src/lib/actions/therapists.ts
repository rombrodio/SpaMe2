"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  therapistSchema,
  availabilityRuleSchema,
  timeOffSchema,
} from "@/lib/schemas/therapist";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getAppUrl } from "@/lib/app-url";

// ── Therapist CRUD ──

/**
 * List therapists. Legacy callers get the plain array for backwards-compat;
 * the admin list page can ask for pagination + search via `filters`.
 */
export async function getTherapists(filters?: {
  q?: string;
  limit?: number;
  offset?: number;
  activeOnly?: boolean;
}) {
  const supabase = await createClient();
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  let query = supabase
    .from("therapists")
    .select("*", { count: "exact" })
    .order("full_name")
    .range(offset, offset + limit - 1);

  if (filters?.activeOnly) query = query.eq("is_active", true);

  if (filters?.q?.trim()) {
    const clean = filters.q.trim().replace(/[%_]/g, "");
    query = query.or(
      `full_name.ilike.%${clean}%,phone.ilike.%${clean}%,email.ilike.%${clean}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getTherapist(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapists")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Invite a Supabase Auth user by email and link them to a therapist row.
 * Uses the service-role admin client to (a) create the auth user and
 * (b) set profiles.therapist_id. The handle_new_user trigger creates the
 * profile row automatically with role='therapist'.
 */
async function sendTherapistInvite(
  therapistId: string,
  email: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const admin = createAdminClient();

    // If an auth user already exists with this email, just link the profile.
    const { data: existing } = await admin
      .from("profiles")
      .select("id, therapist_id")
      .eq("therapist_id", therapistId)
      .maybeSingle();
    if (existing) {
      return { ok: true };
    }

    const siteUrl = getAppUrl();
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { therapist_id: therapistId },
        redirectTo: `${siteUrl}/callback?next=/set-password`,
      });

    if (inviteError || !inviteData?.user) {
      return {
        ok: false,
        message: inviteError?.message || "Unknown invite error",
      };
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ therapist_id: therapistId })
      .eq("id", inviteData.user.id);

    if (profileError) {
      return {
        ok: false,
        message: `Invite sent but profile link failed: ${profileError.message}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function createTherapist(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const sendInvite =
    raw.send_invite === "on" || raw.send_invite === "true";
  // Coerce empty-string gender from the form to undefined before Zod.
  const genderRaw = typeof raw.gender === "string" ? raw.gender : "";
  const parsed = therapistSchema.safeParse({
    ...raw,
    gender: genderRaw === "" ? undefined : genderRaw,
    is_active: raw.is_active === "on" || raw.is_active === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  if (sendInvite && !parsed.data.email) {
    return {
      error: { email: ["Email is required when sending an invite"] },
    };
  }

  // Gender is required when creating a new therapist (legacy rows are
  // the only ones allowed to have null gender — see 00017 migration).
  if (!parsed.data.gender) {
    return {
      error: {
        gender: ["Gender is required for new therapists"],
      },
    };
  }

  const data = {
    ...parsed.data,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    color: parsed.data.color || null,
    gender: parsed.data.gender,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from("therapists")
    .insert(data)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "create",
    entityType: "therapist",
    entityId: inserted.id,
    newData: inserted,
  });

  let warning: string | undefined;
  if (sendInvite && parsed.data.email) {
    const result = await sendTherapistInvite(inserted.id, parsed.data.email);
    if (!result.ok) {
      warning = `Therapist created but invite failed: ${result.message}`;
    }
  }

  revalidatePath("/admin/therapists");
  return { success: true, data: inserted, warning };
}

/**
 * Re-send an invite / password-setup email for a therapist.
 *
 * If the therapist already has a confirmed auth user (they clicked the
 * original invite but never set a password), we send a password-recovery
 * email instead of a new invite — Supabase won't re-invite a confirmed
 * user, but recovery works and lands them on /set-password.
 */
export async function resendInvite(therapistId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: therapist, error: fetchErr } = await supabase
    .from("therapists")
    .select("id, email")
    .eq("id", therapistId)
    .maybeSingle();

  if (fetchErr || !therapist) {
    return { error: { _form: ["Therapist not found"] } };
  }
  if (!therapist.email) {
    return {
      error: { _form: ["Therapist has no email address on file"] },
    };
  }

  const admin = createAdminClient();

  // Check if the therapist already has a linked & confirmed auth user.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("therapist_id", therapistId)
    .maybeSingle();

  if (profile) {
    // User already confirmed their email (clicked original invite).
    // Server-side recovery emails don't work with Supabase PKCE because
    // the code_verifier must live in the therapist's browser cookies.
    // Return a message telling the admin to direct them to "Forgot password?".
    return {
      success: true,
      warning:
        "This therapist already accepted their invite. " +
        'Ask them to use "Forgot password?" on the login page to set their password.',
    };
  } else {
    // No auth user yet — send the original invite flow.
    const result = await sendTherapistInvite(therapistId, therapist.email);
    if (!result.ok) {
      return { error: { _form: [result.message] } };
    }
  }

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "therapist",
    entityId: therapistId,
    newData: { action: "resend_invite", email: therapist.email },
  });

  revalidatePath(`/admin/therapists/${therapistId}`);
  return { success: true };
}

/**
 * Check whether a therapist has a linked Supabase Auth user
 * (i.e. a profiles row where therapist_id = this therapist's id).
 * Used by the edit form to show/hide the "Resend invite" button.
 */
export async function getTherapistAuthStatus(
  therapistId: string
): Promise<{ hasAuthUser: boolean }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("therapist_id", therapistId)
    .maybeSingle();
  return { hasAuthUser: !!data };
}

export async function updateTherapist(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const genderRaw = typeof raw.gender === "string" ? raw.gender : "";
  const parsed = therapistSchema.safeParse({
    ...raw,
    gender: genderRaw === "" ? undefined : genderRaw,
    is_active: raw.is_active === "on" || raw.is_active === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // On edit, we allow saving without gender (legacy support) BUT if the
  // admin picked a value we always persist it. Undefined from the Zod
  // parse means "admin didn't pick" — omit the field to preserve the
  // prior DB value.
  const data: Record<string, unknown> = {
    ...parsed.data,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    color: parsed.data.color || null,
  };
  if (parsed.data.gender === undefined) {
    delete data.gender;
  } else {
    data.gender = parsed.data.gender;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("therapists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("therapists")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "therapist",
    entityId: id,
    oldData: oldRow ?? undefined,
    newData: updated,
  });

  revalidatePath("/admin/therapists");
  return { success: true };
}

export async function deleteTherapist(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("therapists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("therapists").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "delete",
    entityType: "therapist",
    entityId: id,
    oldData: oldRow ?? undefined,
  });

  revalidatePath("/admin/therapists");
  return { success: true };
}

// ── Therapist Services (junction) ──

export async function getTherapistServices(therapistId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapist_services")
    .select("service_id, services(id, name)")
    .eq("therapist_id", therapistId);
  if (error) throw new Error(error.message);
  return data;
}

export async function setTherapistServices(
  therapistId: string,
  serviceIds: string[]
) {
  const supabase = await createClient();

  // Remove existing
  const { error: delError } = await supabase
    .from("therapist_services")
    .delete()
    .eq("therapist_id", therapistId);
  if (delError) return { error: { _form: [delError.message] } };

  // Insert new
  if (serviceIds.length > 0) {
    const rows = serviceIds.map((service_id) => ({
      therapist_id: therapistId,
      service_id,
    }));
    const { error: insError } = await supabase
      .from("therapist_services")
      .insert(rows);
    if (insError) return { error: { _form: [insError.message] } };
  }

  revalidatePath(`/admin/therapists/${therapistId}`);
  return { success: true };
}

// ── Availability Rules ──

export async function getAvailabilityRules(therapistId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapist_availability_rules")
    .select("*")
    .eq("therapist_id", therapistId)
    .order("day_of_week")
    .order("start_time");
  if (error) throw new Error(error.message);
  return data;
}

export async function createAvailabilityRule(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = availabilityRuleSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const data = {
    ...parsed.data,
    valid_until: parsed.data.valid_until || null,
  };

  const supabase = await createClient();

  // DEF-007: prevent overlapping rules for the same (therapist, day_of_week).
  // Two rules overlap when newStart < existingEnd AND newEnd > existingStart.
  // Fetch the day's existing rules and check in JS — this is a small list.
  const { data: existing } = await supabase
    .from("therapist_availability_rules")
    .select("start_time, end_time")
    .eq("therapist_id", parsed.data.therapist_id)
    .eq("day_of_week", parsed.data.day_of_week);

  const overlap = (existing ?? []).find(
    (r: { start_time: string; end_time: string }) =>
      parsed.data.start_time < r.end_time &&
      parsed.data.end_time > r.start_time
  );
  if (overlap) {
    return {
      error: {
        start_time: [
          `Overlaps with the existing ${overlap.start_time}–${overlap.end_time} rule on this day.`,
        ],
      },
    };
  }

  const { error } = await supabase
    .from("therapist_availability_rules")
    .insert(data);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/therapists/${parsed.data.therapist_id}`);
  return { success: true };
}

export async function deleteAvailabilityRule(
  id: string,
  therapistId: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("therapist_availability_rules")
    .delete()
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/therapists/${therapistId}`);
  return { success: true };
}

// ── Time Off ──

export async function getTimeOffs(therapistId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapist_time_off")
    .select("*")
    .eq("therapist_id", therapistId)
    .order("start_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createTimeOff(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = timeOffSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("therapist_time_off")
    .insert(parsed.data);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/therapists/${parsed.data.therapist_id}`);
  return { success: true };
}

export async function deleteTimeOff(id: string, therapistId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("therapist_time_off")
    .delete()
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/therapists/${therapistId}`);
  return { success: true };
}
