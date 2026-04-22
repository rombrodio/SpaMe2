"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import {
  upsertVoucherMappingSchema,
  deleteVoucherMappingSchema,
} from "@/lib/schemas/payment";

export interface VoucherMappingRow {
  service_id: string;
  provider: "dts" | "vpay";
  provider_sku: string;
  created_at: string;
}

export async function getVoucherMappings(
  serviceId: string
): Promise<VoucherMappingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_voucher_mappings")
    .select("*")
    .eq("service_id", serviceId)
    .order("provider")
    .order("provider_sku");
  if (error) throw new Error(error.message);
  return (data ?? []) as VoucherMappingRow[];
}

export async function upsertVoucherMapping(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = upsertVoucherMappingSchema.safeParse({
    service_id: raw.service_id,
    provider: raw.provider,
    provider_sku: typeof raw.provider_sku === "string"
      ? raw.provider_sku.trim()
      : "",
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("service_voucher_mappings")
    .upsert(
      {
        service_id: parsed.data.service_id,
        provider: parsed.data.provider,
        provider_sku: parsed.data.provider_sku,
      },
      { onConflict: "service_id,provider,provider_sku" }
    );
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "create",
    entityType: "service_voucher_mapping",
    entityId: parsed.data.service_id,
    newData: {
      provider: parsed.data.provider,
      provider_sku: parsed.data.provider_sku,
    },
  });

  revalidatePath(`/admin/services/${parsed.data.service_id}`);
  return { success: true };
}

export async function deleteVoucherMapping(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = deleteVoucherMappingSchema.safeParse({
    service_id: raw.service_id,
    provider: raw.provider,
    provider_sku: typeof raw.provider_sku === "string"
      ? raw.provider_sku.trim()
      : "",
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("service_voucher_mappings")
    .delete()
    .eq("service_id", parsed.data.service_id)
    .eq("provider", parsed.data.provider)
    .eq("provider_sku", parsed.data.provider_sku);
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "delete",
    entityType: "service_voucher_mapping",
    entityId: parsed.data.service_id,
    oldData: {
      provider: parsed.data.provider,
      provider_sku: parsed.data.provider_sku,
    },
  });

  revalidatePath(`/admin/services/${parsed.data.service_id}`);
  return { success: true };
}
