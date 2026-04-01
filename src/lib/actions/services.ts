"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceSchema } from "@/lib/schemas/service";
import { revalidatePath } from "next/cache";

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
  const { error } = await supabase.from("services").insert(parsed.data);
  if (error) return { error: { _form: [error.message] } };

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
  const { error } = await supabase
    .from("services")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/services");
  return { success: true };
}

export async function deleteService(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/services");
  return { success: true };
}
