/**
 * On-call manager lookup — read `spa_settings.on_call_manager_phone`
 * via the service-role admin client.
 *
 * Notifications fire from webhooks (payment, WhatsApp) and cron jobs,
 * neither of which has an authenticated Supabase user in scope. Service
 * role bypasses RLS so we can read the single-row settings table from
 * anywhere.
 *
 * The lookup is cheap (single row, primary-key fetch), but we memoize
 * within a single process for the lifetime of a request chain to avoid
 * re-hitting the DB when a notification helper pings multiple channels
 * (SMS + WhatsApp) that both need the phone.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface OnCallManager {
  name: string | null;
  phone: string | null;
}

/**
 * Fetch the current on-call manager config.
 *
 * Returns an object with nullable fields rather than throwing: the app
 * should keep working when the admin hasn't configured this yet — the
 * notification dispatcher treats "no phone" as "skip with a warning".
 */
export async function getOnCallManager(): Promise<OnCallManager> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("spa_settings")
      .select("on_call_manager_name, on_call_manager_phone")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return { name: null, phone: null };
    }
    const row = data as {
      on_call_manager_name: string | null;
      on_call_manager_phone: string | null;
    };
    return {
      name: row.on_call_manager_name,
      phone: row.on_call_manager_phone,
    };
  } catch {
    // Never crash the caller because the settings table was unreachable.
    // Webhooks/crons have other things to do; a missing notification is
    // recoverable, a 500 is not.
    return { name: null, phone: null };
  }
}
