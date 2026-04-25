"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  receptionistSchema,
  receptionistAvailabilityRuleSchema,
} from "@/lib/schemas/receptionist";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getAppUrl } from "@/lib/app-url";

// ── Receptionist CRUD ──

export async function getReceptionists(filters?: {
  q?: string;
  limit?: number;
  offset?: number;
  activeOnly?: boolean;
}) {
  const supabase = await createClient();
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  let query = supabase
    .from("receptionists")
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

export async function getReceptionist(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receptionists")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Invite a Supabase Auth user by email and link them to a receptionist row.
 *
 * The handle_new_user trigger creates the profile row with role='therapist'
 * as its default (see 00013_fix_advisor_warnings.sql). After invite, we
 * explicitly UPDATE the profile to set role='receptionist' AND the
 * receptionist_id FK so the middleware can route them to /reception on login.
 */
async function sendReceptionistInvite(
  receptionistId: string,
  email: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("profiles")
      .select("id, receptionist_id")
      .eq("receptionist_id", receptionistId)
      .maybeSingle();
    if (existing) {
      return { ok: true };
    }

    const siteUrl = getAppUrl();
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { receptionist_id: receptionistId },
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
      .update({
        role: "receptionist",
        receptionist_id: receptionistId,
      })
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

export async function createReceptionist(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const sendInvite =
    raw.send_invite === "on" || raw.send_invite === "true";
  const parsed = receptionistSchema.safeParse({
    ...raw,
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

  const data = {
    ...parsed.data,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from("receptionists")
    .insert(data)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "create",
    entityType: "receptionist",
    entityId: inserted.id,
    newData: inserted,
  });

  let warning: string | undefined;
  if (sendInvite && parsed.data.email) {
    const result = await sendReceptionistInvite(
      inserted.id,
      parsed.data.email
    );
    if (!result.ok) {
      warning = `Receptionist created but invite failed: ${result.message}`;
    }
  }

  revalidatePath("/admin/receptionists");
  return { success: true, data: inserted, warning };
}

/**
 * Re-send an invite / password-setup email. Same rules as the therapist
 * equivalent: if the auth user already exists and confirmed, point them
 * to "Forgot password?" instead.
 */
export async function resendReceptionistInvite(receptionistId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: receptionist, error: fetchErr } = await supabase
    .from("receptionists")
    .select("id, email")
    .eq("id", receptionistId)
    .maybeSingle();

  if (fetchErr || !receptionist) {
    return { error: { _form: ["Receptionist not found"] } };
  }
  if (!receptionist.email) {
    return {
      error: { _form: ["Receptionist has no email address on file"] },
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("receptionist_id", receptionistId)
    .maybeSingle();

  if (profile) {
    return {
      success: true,
      warning:
        "This receptionist already accepted their invite. " +
        'Ask them to use "Forgot password?" on the login page to set their password.',
    };
  } else {
    const result = await sendReceptionistInvite(
      receptionistId,
      receptionist.email
    );
    if (!result.ok) {
      return { error: { _form: [result.message] } };
    }
  }

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "receptionist",
    entityId: receptionistId,
    newData: { action: "resend_invite", email: receptionist.email },
  });

  revalidatePath(`/admin/receptionists/${receptionistId}`);
  return { success: true };
}

export async function getReceptionistAuthStatus(
  receptionistId: string
): Promise<{ hasAuthUser: boolean }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("receptionist_id", receptionistId)
    .maybeSingle();
  return { hasAuthUser: !!data };
}

export async function updateReceptionist(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = receptionistSchema.safeParse({
    ...raw,
    is_active: raw.is_active === "on" || raw.is_active === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const data = {
    ...parsed.data,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("receptionists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("receptionists")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "receptionist",
    entityId: id,
    oldData: oldRow ?? undefined,
    newData: updated,
  });

  revalidatePath("/admin/receptionists");
  return { success: true };
}

export async function deleteReceptionist(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("receptionists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("receptionists")
    .delete()
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "delete",
    entityType: "receptionist",
    entityId: id,
    oldData: oldRow ?? undefined,
  });

  revalidatePath("/admin/receptionists");
  return { success: true };
}

// ── On-duty availability ──

export async function getReceptionistAvailabilityRules(
  receptionistId: string
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receptionist_availability_rules")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("day_of_week")
    .order("start_time");
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Resolve the caller's own receptionist_id from their profile.
 * Used by the receptionist portal to scope availability actions.
 */
export async function getMyReceptionistId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("receptionist_id")
    .eq("id", user.id)
    .maybeSingle();
  return data?.receptionist_id ?? null;
}

export async function createReceptionistAvailabilityRule(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = receptionistAvailabilityRuleSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const data = {
    ...parsed.data,
    valid_until: parsed.data.valid_until || null,
  };

  const supabase = await createClient();

  // Same-day overlap guard mirrors the therapist-rule guard in
  // src/lib/actions/therapists.ts.
  const { data: existing } = await supabase
    .from("receptionist_availability_rules")
    .select("start_time, end_time")
    .eq("receptionist_id", parsed.data.receptionist_id)
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
    .from("receptionist_availability_rules")
    .insert(data);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/receptionists/${parsed.data.receptionist_id}`);
  revalidatePath("/reception/availability");
  return { success: true };
}

export async function deleteReceptionistAvailabilityRule(
  id: string,
  receptionistId: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("receptionist_availability_rules")
    .delete()
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/receptionists/${receptionistId}`);
  revalidatePath("/reception/availability");
  return { success: true };
}
