"use server";

import { createClient } from "@/lib/supabase/server";
import { customerSchema } from "@/lib/schemas/customer";
import { revalidatePath } from "next/cache";

export async function getCustomers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("full_name");
  if (error) throw new Error(error.message);
  return data;
}

export async function getCustomer(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createCustomer(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = customerSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const data = {
    ...parsed.data,
    email: parsed.data.email || null,
    notes: parsed.data.notes || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert(data);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/customers");
  return { success: true };
}

export async function updateCustomer(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = customerSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const data = {
    ...parsed.data,
    email: parsed.data.email || null,
    notes: parsed.data.notes || null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update(data)
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/customers");
  return { success: true };
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/customers");
  return { success: true };
}
