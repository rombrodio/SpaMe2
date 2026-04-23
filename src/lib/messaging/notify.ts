/**
 * Notification dispatcher for the deferred-assignment feature.
 *
 * Each notifyXxx() helper:
 *   1. Resolves the recipient (on-call manager from spa_settings, or
 *      the therapist's phone passed by the caller).
 *   2. Sends SMS + WhatsApp in parallel via src/lib/messaging/twilio.ts.
 *   3. Falls back gracefully: if WhatsApp isn't configured (no Content
 *      SID, Meta template not yet approved), SMS still ships. If the
 *      manager phone isn't configured, we log a warning and return —
 *      no exception propagates to webhooks/crons.
 *   4. Writes an audit entry with per-channel results for observability.
 *
 * Design tenets:
 *  - Idempotency is the caller's job. This module never dedupes.
 *  - Failures don't throw. Business logic (booking save) must complete
 *    even when notifications break.
 *  - All template copy lives under src/lib/messaging/templates/.
 */

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { sendSms, sendWhatsApp, type SendSmsResult } from "./twilio";
import { getOnCallManager } from "./on-call-manager";
import {
  buildManagerUnassignedSms,
  buildManagerReassignSms,
  buildManagerEscalationSms,
  buildManagerConfirmationTimeoutSms,
} from "./templates/assignment-manager";
import { buildTherapistRequestSms } from "./templates/assignment-therapist";
import { writeAuditLog } from "@/lib/audit";

type GenderPreference = "male" | "female" | "any";

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

interface DispatchOutcome {
  sms: SendSmsResult;
  whatsapp: SendSmsResult;
}

async function dispatchSmsAndWhatsApp(params: {
  to: string | null;
  smsBody: string;
  waContentSid: string | null | undefined;
  waVariables: Record<string, string>;
}): Promise<DispatchOutcome> {
  if (!params.to) {
    const err: SendSmsResult = {
      ok: false,
      reason: "config_error",
      message: "Recipient phone is not configured",
    };
    return { sms: err, whatsapp: err };
  }
  const [sms, whatsapp] = await Promise.all([
    sendSms({ to: params.to, body: params.smsBody }),
    sendWhatsApp({
      to: params.to,
      contentSid: params.waContentSid,
      variables: params.waVariables,
    }),
  ]);
  return { sms, whatsapp };
}

function describeOutcome(outcome: DispatchOutcome): Record<string, unknown> {
  return {
    sms_ok: outcome.sms.ok,
    sms_message: outcome.sms.ok ? outcome.sms.messageSid : outcome.sms.message,
    whatsapp_ok: outcome.whatsapp.ok,
    whatsapp_message: outcome.whatsapp.ok
      ? outcome.whatsapp.messageSid
      : outcome.whatsapp.message,
  };
}

// ─────────────────────────────────────────────────────────────
// Manager notifications — recipient resolved from spa_settings
// ─────────────────────────────────────────────────────────────

export interface NotifyManagerUnassignedInput {
  bookingId: string;
  serviceName: string;
  startAt: Date | string;
  genderPreference: GenderPreference;
  assignUrl: string;
}

export async function notifyManagerUnassigned(
  input: NotifyManagerUnassignedInput
): Promise<DispatchOutcome> {
  const manager = await getOnCallManager();
  const body = buildManagerUnassignedSms({
    serviceName: input.serviceName,
    startAt: input.startAt,
    genderPreference: input.genderPreference,
    assignUrl: input.assignUrl,
  });
  const outcome = await dispatchSmsAndWhatsApp({
    to: manager.phone,
    smsBody: body,
    waContentSid: process.env.TWILIO_WA_TEMPLATE_MANAGER_ALERT,
    waVariables: {
      "1": input.serviceName,
      "2": formatDateTimeForTemplate(input.startAt),
      "3": genderLabelForTemplate(input.genderPreference),
      "4": input.assignUrl,
    },
  });
  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "notification",
    entityId: input.bookingId,
    newData: { kind: "manager_unassigned", ...describeOutcome(outcome) },
  });
  return outcome;
}

export interface NotifyManagerReassignInput {
  bookingId: string;
  therapistName: string;
  serviceName: string;
  startAt: Date | string;
  reason?: string;
  assignUrl: string;
}

export async function notifyManagerReassign(
  input: NotifyManagerReassignInput
): Promise<DispatchOutcome> {
  const manager = await getOnCallManager();
  const body = buildManagerReassignSms({
    therapistName: input.therapistName,
    serviceName: input.serviceName,
    startAt: input.startAt,
    reason: input.reason,
    assignUrl: input.assignUrl,
  });
  const outcome = await dispatchSmsAndWhatsApp({
    to: manager.phone,
    smsBody: body,
    waContentSid: process.env.TWILIO_WA_TEMPLATE_MANAGER_REASSIGN,
    waVariables: {
      "1": input.therapistName,
      "2": input.serviceName,
      "3": formatDateTimeForTemplate(input.startAt),
      "4": input.assignUrl,
    },
  });
  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "notification",
    entityId: input.bookingId,
    newData: { kind: "manager_reassign", ...describeOutcome(outcome) },
  });
  return outcome;
}

export interface NotifyManagerEscalationInput {
  bookingId: string;
  serviceName: string;
  startAt: Date | string;
  hoursUntilStart: number;
  assignUrl: string;
}

export async function notifyManagerEscalation(
  input: NotifyManagerEscalationInput
): Promise<DispatchOutcome> {
  const manager = await getOnCallManager();
  const body = buildManagerEscalationSms({
    serviceName: input.serviceName,
    startAt: input.startAt,
    hoursUntilStart: input.hoursUntilStart,
    assignUrl: input.assignUrl,
  });
  const outcome = await dispatchSmsAndWhatsApp({
    to: manager.phone,
    smsBody: body,
    waContentSid: process.env.TWILIO_WA_TEMPLATE_MANAGER_ESCALATION,
    waVariables: {
      "1": String(Math.max(1, Math.round(input.hoursUntilStart))),
      "2": input.serviceName,
      "3": formatDateTimeForTemplate(input.startAt),
      "4": input.assignUrl,
    },
  });
  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "notification",
    entityId: input.bookingId,
    newData: { kind: "manager_escalation", ...describeOutcome(outcome) },
  });
  return outcome;
}

export interface NotifyManagerConfirmationTimeoutInput {
  bookingId: string;
  therapistName: string;
  serviceName: string;
  startAt: Date | string;
  assignUrl: string;
}

export async function notifyManagerConfirmationTimeout(
  input: NotifyManagerConfirmationTimeoutInput
): Promise<DispatchOutcome> {
  const manager = await getOnCallManager();
  const body = buildManagerConfirmationTimeoutSms({
    therapistName: input.therapistName,
    serviceName: input.serviceName,
    startAt: input.startAt,
    assignUrl: input.assignUrl,
  });
  const outcome = await dispatchSmsAndWhatsApp({
    to: manager.phone,
    smsBody: body,
    // Reuses the reassign WhatsApp template: same variable shape
    // (therapist name, service, date/time, url). Can be split later if
    // Meta approves a distinct template.
    waContentSid: process.env.TWILIO_WA_TEMPLATE_MANAGER_REASSIGN,
    waVariables: {
      "1": input.therapistName,
      "2": input.serviceName,
      "3": formatDateTimeForTemplate(input.startAt),
      "4": input.assignUrl,
    },
  });
  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "notification",
    entityId: input.bookingId,
    newData: {
      kind: "manager_confirmation_timeout",
      ...describeOutcome(outcome),
    },
  });
  return outcome;
}

// ─────────────────────────────────────────────────────────────
// Therapist notifications — caller supplies the phone
// ─────────────────────────────────────────────────────────────

export interface NotifyTherapistRequestInput {
  bookingId: string;
  therapistPhone: string | null;
  serviceName: string;
  startAt: Date | string;
  customerFirstName: string;
  confirmUrl: string;
}

export async function notifyTherapistRequest(
  input: NotifyTherapistRequestInput
): Promise<DispatchOutcome> {
  const body = buildTherapistRequestSms({
    serviceName: input.serviceName,
    startAt: input.startAt,
    customerFirstName: input.customerFirstName,
    confirmUrl: input.confirmUrl,
  });
  const outcome = await dispatchSmsAndWhatsApp({
    to: input.therapistPhone,
    smsBody: body,
    waContentSid: process.env.TWILIO_WA_TEMPLATE_THERAPIST_REQUEST,
    waVariables: {
      "1": input.serviceName,
      "2": formatDateTimeForTemplate(input.startAt),
      "3": input.customerFirstName || "",
      "4": input.confirmUrl,
    },
  });
  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "notification",
    entityId: input.bookingId,
    newData: { kind: "therapist_request", ...describeOutcome(outcome) },
  });
  return outcome;
}

// ─────────────────────────────────────────────────────────────
// Internal formatting helpers
// ─────────────────────────────────────────────────────────────

function formatDateTimeForTemplate(startAt: Date | string): string {
  // WhatsApp templates receive plain strings in the `contentVariables`
  // payload; we format the same way as the SMS copy so both channels
  // agree. Jerusalem timezone is enforced.
  const d = startAt instanceof Date ? startAt : new Date(startAt);
  const local = toZonedTime(d, TZ);
  return `${format(local, "dd/MM")} ${format(local, "HH:mm")}`;
}

function genderLabelForTemplate(pref: GenderPreference): string {
  if (pref === "male") return "זכר";
  if (pref === "female") return "נקבה";
  return "ללא העדפה";
}
