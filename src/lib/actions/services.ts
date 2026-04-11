"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceSchema } from "@/lib/schemas/service";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";

export async function getServices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function getService(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createService(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = serviceSchema.safeParse({
    ...raw,
    is_active: raw.is_active === "on" || raw.is_active === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from("services")
    .insert(parsed.data)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "create",
    entityType: "service",
    entityId: inserted.id,
    newData: inserted,
  });

  revalidatePath("/admin/services");
  return { success: true };
}

export async function updateService(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = serviceSchema.safeParse({
    ...raw,
    is_active: raw.is_active === "on" || raw.is_active === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("services")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "service",
    entityId: id,
    oldData: oldRow ?? undefined,
    newData: updated,
  });

  revalidatePath("/admin/services");
  return { success: true };
}

export async function deleteService(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "delete",
    entityType: "service",
    entityId: id,
    oldData: oldRow ?? undefined,
  });

  revalidatePath("/admin/services");
  return { success: true };
}
