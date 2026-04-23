/**
 * SMS + WhatsApp copy for manager-facing assignment notifications.
 *
 * Messages are short, action-oriented, and include a deep link to the
 * `/admin/assignments` screen so the manager can jump straight from
 * phone to the right booking.
 *
 * Hebrew-first: the manager runs the spa day-to-day in Hebrew. WhatsApp
 * templates (Meta-approved) use the same variable order so the copy
 * team can maintain parity.
 *
 * SMS segment math:
 *  - Hebrew uses UCS-2 encoding: 70 chars per segment.
 *  - We aim for 1 segment when possible, 2 segments max.
 */

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";

function fmtDateTime(startAt: Date | string): string {
  const d = startAt instanceof Date ? startAt : new Date(startAt);
  const local = toZonedTime(d, TZ);
  return `${format(local, "dd/MM")} ${format(local, "HH:mm")}`;
}

function genderLabelHe(pref: "male" | "female" | "any"): string {
  if (pref === "male") return "זכר";
  if (pref === "female") return "נקבה";
  return "ללא העדפה";
}

export interface ManagerUnassignedSmsInput {
  serviceName: string;
  startAt: Date | string;
  genderPreference: "male" | "female" | "any";
  assignUrl: string;
}

/**
 * New paid-but-unassigned booking — manager should pick a therapist.
 * Fires from the post-payment success page (Phase 4).
 *
 * Example:
 *   ספאמי: הזמנה חדשה ללא שיוך
 *   עיסוי שוודי 25/05 14:00 (ללא העדפה)
 *   <url>
 */
export function buildManagerUnassignedSms(
  input: ManagerUnassignedSmsInput
): string {
  return [
    "ספאמי: הזמנה חדשה ללא שיוך",
    `${input.serviceName} ${fmtDateTime(input.startAt)} (${genderLabelHe(
      input.genderPreference
    )})`,
    input.assignUrl,
  ].join("\n");
}

export interface ManagerReassignSmsInput {
  therapistName: string;
  serviceName: string;
  startAt: Date | string;
  reason?: string;
  assignUrl: string;
}

/**
 * Therapist declined an assignment — manager should pick someone else.
 * Fires from the therapist-decline server action (Phase 6).
 */
export function buildManagerReassignSms(
  input: ManagerReassignSmsInput
): string {
  const reasonLine = input.reason
    ? `סיבה: ${input.reason}`
    : "";
  return [
    `ספאמי: ${input.therapistName} דחה הזמנה`,
    `${input.serviceName} ${fmtDateTime(input.startAt)}`,
    reasonLine,
    input.assignUrl,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ManagerEscalationSmsInput {
  serviceName: string;
  startAt: Date | string;
  hoursUntilStart: number;
  assignUrl: string;
}

/**
 * Unassigned booking is close to start time — manager nudge.
 * Fires from the assignment-monitor cron (Phase 6).
 */
export function buildManagerEscalationSms(
  input: ManagerEscalationSmsInput
): string {
  const hrs = Math.max(1, Math.round(input.hoursUntilStart));
  return [
    `ספאמי: דחוף — הזמנה עוד ${hrs} שעות ללא מטפל`,
    `${input.serviceName} ${fmtDateTime(input.startAt)}`,
    input.assignUrl,
  ].join("\n");
}

export interface ManagerConfirmationTimeoutSmsInput {
  therapistName: string;
  serviceName: string;
  startAt: Date | string;
  assignUrl: string;
}

/**
 * Therapist hasn't accepted/declined within the 2h SLA — manager nudge.
 * Fires from the assignment-monitor cron (Phase 6).
 */
export function buildManagerConfirmationTimeoutSms(
  input: ManagerConfirmationTimeoutSmsInput
): string {
  return [
    `ספאמי: ${input.therapistName} טרם אישר הזמנה`,
    `${input.serviceName} ${fmtDateTime(input.startAt)}`,
    input.assignUrl,
  ].join("\n");
}
