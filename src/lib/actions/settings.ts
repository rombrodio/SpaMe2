"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { spaSettingsSchema } from "@/lib/schemas/settings";
import { normalizePhoneIL } from "@/lib/messaging/twilio";
import { writeAuditLog } from "@/lib/audit";

/**
 * Admin-only CRUD for spa_settings. The notification dispatcher
 * (src/lib/messaging/on-call-manager.ts) reads the same row via the
 * service-role client because it runs in webhook/cron contexts with no
 * authed user. RLS on spa_settings is defined in migration 00019 and
 * allows SELECT+UPDATE to super_admin only — these actions inherit
 * that guard by going through the cookie-auth client below.
 */

export interface SpaSettingsRow {
  on_call_manager_name: string | null;
  on_call_manager_phone: string | null;
  updated_at: string;
}

export async function getSpaSettings(): Promise<SpaSettingsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spa_settings")
    .select("on_call_manager_name, on_call_manager_phone, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return data as SpaSettingsRow;
}

export async function updateSpaSettings(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = spaSettingsSchema.safeParse({
    on_call_manager_name:
      typeof raw.on_call_manager_name === "string"
        ? raw.on_call_manager_name.trim()
        : "",
    on_call_manager_phone:
      typeof raw.on_call_manager_phone === "string"
        ? raw.on_call_manager_phone.trim()
        : "",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Normalize the phone to E.164 before persisting so every downstream
  // consumer (Twilio SMS + WhatsApp) gets a consistent format.
  const normalizedPhone =
    parsed.data.on_call_manager_phone === ""
      ? null
      : normalizePhoneIL(parsed.data.on_call_manager_phone);
  if (parsed.data.on_call_manager_phone !== "" && !normalizedPhone) {
    return {
      error: {
        on_call_manager_phone: ["Invalid Israeli phone number"],
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("spa_settings")
    .select("on_call_manager_name, on_call_manager_phone")
    .eq("id", 1)
    .maybeSingle();

  const { error } = await supabase
    .from("spa_settings")
    .update({
      on_call_manager_name:
        parsed.data.on_call_manager_name === ""
          ? null
          : parsed.data.on_call_manager_name,
      on_call_manager_phone: normalizedPhone,
    })
    .eq("id", 1);
  if (error) {
    return { error: { _form: [error.message] } };
  }

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "spa_settings",
    entityId: "1",
    oldData: oldRow ?? undefined,
    newData: {
      on_call_manager_name:
        parsed.data.on_call_manager_name === ""
          ? null
          : parsed.data.on_call_manager_name,
      on_call_manager_phone: normalizedPhone,
    },
  });

  revalidatePath("/admin/settings");
  return { success: true };
}
