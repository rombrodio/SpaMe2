/**
 * Hebrew SMS template for booking confirmation.
 *
 * SMS segment math (what matters for cost / readability):
 *   - Hebrew is not part of GSM-7 → each segment is max 70 UCS-2 chars.
 *   - Multi-segment messages eat a few chars for UDH headers.
 * Target one segment. The template below runs ~60 chars with typical
 * spa data, leaving headroom for service names up to ~20 chars.
 */

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";

export interface BookingConfirmedSmsInput {
  serviceName: string;
  startAt: Date | string;
  therapistName: string;
  /** Displayed as the signoff line. Defaults to "ספאמי". */
  businessName?: string;
}

/**
 * Build the Hebrew body for the "booking confirmed" SMS.
 *
 * Example output:
 *   אושר ✓ עיסוי שוודי 60 דקות
 *   ב-25/05 14:00 עם דנה
 *   ספאמי
 */
export function buildBookingConfirmedSms(input: BookingConfirmedSmsInput): string {
  const start =
    input.startAt instanceof Date ? input.startAt : new Date(input.startAt);

  // Always render time in Israel TZ so the customer sees their local clock.
  const local = toZonedTime(start, TZ);
  const date = format(local, "dd/MM");
  const time = format(local, "HH:mm");

  const businessName = input.businessName ?? "ספאמי";

  return [
    `אושר ✓ ${input.serviceName}`,
    `ב-${date} ${time} עם ${input.therapistName}`,
    businessName,
  ].join("\n");
}
