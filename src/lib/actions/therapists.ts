"use server";

import { createClient } from "@/lib/supabase/server";
import {
  therapistSchema,
  availabilityRuleSchema,
  timeOffSchema,
} from "@/lib/schemas/therapist";
import { revalidatePath } from "next/cache";

// ── Therapist CRUD ──

export async function getTherapists() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapists")
    .select("*")
    .order("full_name");
  if (error) throw new Error(error.message);
  return data;
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

export async function createTherapist(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = therapistSchema.safeParse({
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
    color: parsed.data.color || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("therapists").insert(data);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/therapists");
  return { success: true };
}

export async function updateTherapist(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = therapistSchema.safeParse({
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
    color: parsed.data.color || null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("therapists")
    .update(data)
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/therapists");
  return { success: true };
}

export async function deleteTherapist(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("therapists").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

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
