"use server";

import { createClient } from "@/lib/supabase/server";
import { customerSchema } from "@/lib/schemas/customer";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";

export async function getCustomers(filters?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  rows: Array<{
    id: string;
    full_name: string | null;
    phone: string;
    email: string | null;
    notes: string | null;
    created_at: string;
  }>;
  total: number;
}> {
  const supabase = await createClient();
  const limit = filters?.limit ?? 25;
  const offset = filters?.offset ?? 0;
  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .order("full_name")
    .range(offset, offset + limit - 1);

  if (filters?.q?.trim()) {
    const q = filters.q.trim().replace(/[%_]/g, "");
    // Normalise the query as a phone so "0501234" matches "+9725012345…".
    const phoneQ = normalizeIsraeliPhone(q);
    const phoneClause = phoneQ.startsWith("+") ? phoneQ.slice(1) : q;
    query = query.or(
      `full_name.ilike.%${q}%,phone.ilike.%${phoneClause}%,email.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * Lightweight typeahead search — returns up to 20 customers matching the
 * query across name/phone/email. Used by the customer combobox on New
 * Booking and by the sidebar global search.
 */
export async function searchCustomersForCombobox(q: string) {
  const trimmed = q.trim();
  if (trimmed.length === 0) {
    const { data } = await (await createClient())
      .from("customers")
      .select("id, full_name, phone, email")
      .order("full_name")
      .limit(20);
    return data ?? [];
  }
  const supabase = await createClient();
  const clean = trimmed.replace(/[%_]/g, "");
  const phoneQ = normalizeIsraeliPhone(clean);
  const phoneClause = phoneQ.startsWith("+") ? phoneQ.slice(1) : clean;
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .or(
      `full_name.ilike.%${clean}%,phone.ilike.%${phoneClause}%,email.ilike.%${clean}%`
    )
    .order("full_name")
    .limit(20);
  return data ?? [];
}

/**
 * Look up a customer by exact E.164 phone. Used by create flows to warn
 * about potential duplicates before inserting a new row.
 */
export async function findCustomerByPhone(phone: string) {
  const normalized = normalizeIsraeliPhone(phone);
  if (!normalized.startsWith("+")) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .eq("phone", normalized)
    .maybeSingle();
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

export async function createCustomer(
  formData: FormData,
  options?: { force?: boolean }
): Promise<
  | { error: Record<string, string[]> }
  | {
      success: true;
      customer: {
        id: string;
        full_name: string | null;
        phone: string;
        email: string | null;
      };
    }
  | {
      duplicate: {
        id: string;
        full_name: string | null;
        phone: string;
        email: string | null;
      };
    }
> {
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

  // SPA-101: block duplicate creation by default. Caller opts in via
  // `force: true` once the admin confirms they really want a new row.
  if (!options?.force) {
    const existing = await findCustomerByPhone(data.phone);
    if (existing) {
      return { duplicate: existing };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from("customers")
    .insert(data)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "create",
    entityType: "customer",
    entityId: inserted.id,
    newData: inserted,
  });

  revalidatePath("/admin/customers");
  return { success: true, customer: inserted };
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("customers")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "customer",
    entityId: id,
    oldData: oldRow ?? undefined,
    newData: updated,
  });

  revalidatePath("/admin/customers");
  return { success: true };
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "delete",
    entityType: "customer",
    entityId: id,
    oldData: oldRow ?? undefined,
  });

  revalidatePath("/admin/customers");
  return { success: true };
}
