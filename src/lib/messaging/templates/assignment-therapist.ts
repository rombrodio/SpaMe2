/**
 * SMS + WhatsApp copy for the therapist "please confirm your new
 * assignment" notification. Hebrew-first, anonymous towards the
 * customer (per anonymization policy) — therapist sees service + time
 * + customer first name but not their last name or phone.
 */

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";

export interface TherapistRequestSmsInput {
  serviceName: string;
  startAt: Date | string;
  /**
   * Customer's first name only, for the therapist's comfort. Pass empty
   * string if the booking has no customer info yet (shouldn't happen).
   */
  customerFirstName: string;
  confirmUrl: string;
}

function fmtDateTime(startAt: Date | string): string {
  const d = startAt instanceof Date ? startAt : new Date(startAt);
  const local = toZonedTime(d, TZ);
  return `${format(local, "dd/MM")} ${format(local, "HH:mm")}`;
}

/**
 * "Please confirm your new assignment within 2 hours".
 *
 * Example:
 *   ספאמי: שובצת להזמנה
 *   עיסוי שוודי 25/05 14:00 עבור דני
 *   יש לאשר תוך שעתיים: <url>
 */
export function buildTherapistRequestSms(
  input: TherapistRequestSmsInput
): string {
  const customerLine = input.customerFirstName
    ? `${input.serviceName} ${fmtDateTime(input.startAt)} עבור ${input.customerFirstName}`
    : `${input.serviceName} ${fmtDateTime(input.startAt)}`;

  return [
    "ספאמי: שובצת להזמנה",
    customerLine,
    `יש לאשר תוך שעתיים: ${input.confirmUrl}`,
  ].join("\n");
}
