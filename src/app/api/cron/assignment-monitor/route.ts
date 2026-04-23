/**
 * Assignment monitor cron (phase 5 — deferred therapist assignment).
 *
 * Runs every 15 minutes and handles two SLA violations:
 *
 *  1. UNASSIGNED escalation — a paid booking whose start time is
 *     within 3 hours and still has no therapist. The on-call manager
 *     is SMS+WhatsApp'd and `manager_alerted_at` is stamped to avoid
 *     re-pinging on the next tick.
 *
 *  2. CONFIRMATION timeout — a `pending_confirmation` booking whose
 *     `confirmation_requested_at` is older than 2 hours means the
 *     therapist hasn't accepted or declined. The manager is nudged so
 *     they can reassign. We stamp `manager_alerted_at` here too; the
 *     stamp is reset whenever a booking goes back to `unassigned`
 *     (see declineAssignmentAction in src/lib/actions/assignments.ts).
 *
 * No auto-assign fallback — per the feature brief, the manager gets
 * alerted repeatedly rather than the system silently picking someone.
 *
 * Scheduled via vercel.json.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyManagerEscalation,
  notifyManagerConfirmationTimeout,
} from "@/lib/messaging/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ESCALATE_WITHIN_MS = 3 * 60 * 60 * 1000; // 3 hours
const CONFIRMATION_SLA_MS = 2 * 60 * 60 * 1000; // 2 hours
// Re-alert cooldown — once we've pinged, don't ping again for 2 hours
// on the SAME booking. Keeps the manager from getting spammed every
// 15 minutes.
const REALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

async function handler(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const results = { unassignedEscalated: 0, confirmationTimedOut: 0 };

    // ── 1. Unassigned bookings close to start ──
    const escalateCutoff = new Date(now.getTime() + ESCALATE_WITHIN_MS);
    const cooldownCutoff = new Date(now.getTime() - REALERT_COOLDOWN_MS);

    const { data: unassignedRows } = await admin
      .from("bookings")
      .select(
        "id, start_at, manager_alerted_at, services(name), therapist_gender_preference"
      )
      .eq("assignment_status", "unassigned")
      .eq("status", "confirmed")
      .gte("start_at", now.toISOString())
      .lte("start_at", escalateCutoff.toISOString());

    for (const raw of (unassignedRows ?? []) as unknown as Array<{
      id: string;
      start_at: string;
      manager_alerted_at: string | null;
      services: { name: string } | null;
      therapist_gender_preference: "male" | "female" | "any";
    }>) {
      if (
        raw.manager_alerted_at &&
        new Date(raw.manager_alerted_at).getTime() > cooldownCutoff.getTime()
      ) {
        continue;
      }
      await admin
        .from("bookings")
        .update({ manager_alerted_at: now.toISOString() })
        .eq("id", raw.id);

      const hoursUntilStart =
        (new Date(raw.start_at).getTime() - now.getTime()) / 3_600_000;
      await notifyManagerEscalation({
        bookingId: raw.id,
        serviceName: raw.services?.name ?? "",
        startAt: raw.start_at,
        hoursUntilStart,
        assignUrl: `${appUrl}/admin/assignments?bookingId=${raw.id}`,
      });
      results.unassignedEscalated++;
    }

    // ── 2. Pending-confirmation bookings past the SLA ──
    const confirmSlaCutoff = new Date(now.getTime() - CONFIRMATION_SLA_MS);

    const { data: pendingRows } = await admin
      .from("bookings")
      .select(
        "id, start_at, manager_alerted_at, confirmation_requested_at, services(name), therapists(full_name)"
      )
      .eq("assignment_status", "pending_confirmation")
      .lte("confirmation_requested_at", confirmSlaCutoff.toISOString());

    for (const raw of (pendingRows ?? []) as unknown as Array<{
      id: string;
      start_at: string;
      manager_alerted_at: string | null;
      confirmation_requested_at: string | null;
      services: { name: string } | null;
      therapists: { full_name: string } | null;
    }>) {
      if (
        raw.manager_alerted_at &&
        new Date(raw.manager_alerted_at).getTime() > cooldownCutoff.getTime()
      ) {
        continue;
      }
      await admin
        .from("bookings")
        .update({ manager_alerted_at: now.toISOString() })
        .eq("id", raw.id);

      await notifyManagerConfirmationTimeout({
        bookingId: raw.id,
        therapistName: raw.therapists?.full_name ?? "Therapist",
        serviceName: raw.services?.name ?? "",
        startAt: raw.start_at,
        assignUrl: `${appUrl}/admin/assignments?bookingId=${raw.id}`,
      });
      results.confirmationTimedOut++;
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron] assignment-monitor unhandled error", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[cron] CRON_SECRET not set; rejecting all /api/cron/* requests"
      );
      return false;
    }
    return true;
  }
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const candidate = match[1].trim();
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
