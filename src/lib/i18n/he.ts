/**
 * Hebrew strings for customer-facing routes (/book and /order/<token>).
 *
 * Deliberately not using `next-intl` in V1 — our customer surface is
 * Hebrew-only and admin is English-only. This single string map is the
 * single source of truth; pages import what they need as `he.some.key`.
 *
 * Keep values:
 *  - short (SMS-friendly where applicable)
 *  - punctuation-aware (Hebrew RTL renders with a few layout gotchas
 *    around parentheses; avoid them where possible)
 *  - free of HTML
 */

export const he = {
  meta: {
    appName: "ספאמי",
    direction: "rtl" as const,
    language: "he" as const,
  },

  common: {
    back: "חזרה",
    cancel: "ביטול",
    close: "סגירה",
    confirm: "אישור",
    continue: "המשך",
    edit: "עריכה",
    save: "שמירה",
    loading: "טוען...",
    required: "שדה חובה",
    errorGeneric: "אירעה שגיאה. נסו שוב.",
    tryAgain: "נסו שוב",
  },

  book: {
    pageTitle: "הזמנת טיפול",
    stepService: {
      heading: "בחרו טיפול",
      subheading: "איזה טיפול מתאים לכם היום?",
      minutes: (n: number) => `${n} דקות`,
      priceLabel: "מחיר",
    },
    stepSlot: {
      heading: "בחרו תאריך ושעה",
      noSlots: "אין זמנים פנויים ליום זה. נסו תאריך אחר.",
      dateLabel: "תאריך",
      timesHeading: "שעות פנויות",
      gender: {
        heading: "העדפת מין המטפל/ת",
        any: "ללא העדפה",
        female: "מטפלת",
        male: "מטפל",
      },
    },
    stepContact: {
      heading: "פרטי התקשרות",
      subheading: "ניצור איתכם קשר ונשלח לכם אישור ב-SMS",
      nameLabel: "שם מלא",
      namePlaceholder: "כפי שמופיע בתעודת הזהות",
      phoneLabel: "טלפון נייד",
      phonePlaceholder: "050-1234567",
      emailLabel: "דוא״ל (לא חובה)",
      notesLabel: "הערות למטפל/ת (לא חובה)",
      submitLabel: "המשך לתשלום",
      errors: {
        name: "אנא הזינו שם מלא",
        phone: "אנא הזינו מספר טלפון ישראלי תקין",
        email: "כתובת דוא״ל לא תקינה",
      },
    },
    slotHeld: (minutes: number) =>
      `הזמן שלכם שמור למשך ${minutes} דקות. השלימו את התשלום כדי לאשר.`,
  },

  order: {
    pageTitle: "סיום הזמנה",
    summary: {
      heading: "פרטי ההזמנה",
      serviceLabel: "טיפול",
      therapistLabel: "מטפל/ת",
      roomLabel: "חדר",
      dateTimeLabel: "תאריך ושעה",
      customerLabel: "לקוח/ה",
      phoneLabel: "טלפון",
      emailLabel: "דוא״ל",
      notesLabel: "הערות",
      editName: "עריכת שם",
      editEmail: "עריכת דוא״ל",
      editNotes: "עריכת הערות",
    },
    holdExpired: {
      heading: "פג תוקף",
      body: "ההזמנה שלכם פגה. אנא התחילו מחדש.",
      ctaRestart: "התחל מחדש",
    },
    methodPicker: {
      heading: "כיצד תרצו לשלם?",
      creditCardFull: {
        title: "כרטיס אשראי — תשלום מלא מיידי",
        subtitle: "חיוב מלא עכשיו בעמוד מאובטח",
      },
      cashAtReception: {
        title: "מזומן בקבלה",
        subtitle:
          "נדרש אימות כרטיס אשראי בלבד לשריון התור. לא מתבצע חיוב כעת. במקרה של אי-הגעה או ביטול מאוחר ייתכן חיוב של דמי ביטול",
      },
      voucherDts: {
        title: "שובר הטבות",
        subtitle: "DTS שווה-כסף — יחידה מול יחידה",
      },
      voucherVpay: {
        title: "שובר טעונה",
        subtitle: "כרטיס רב-ארנק — ניתן גם לתשלום חלקי",
      },
    },
    cancellationPolicy: {
      heading: "מדיניות ביטול",
      summary:
        "ביטול חינם עד 24 שעות לפני הטיפול. ביטול מאוחר או אי-הגעה — דמי ביטול של 5% מהמחיר או 100 ₪, הנמוך מביניהם.",
    },
    cardcom: {
      waiting: "ממתינים לאישור הבנק... העמוד יתעדכן אוטומטית.",
      loadingIframe: "טוען טופס תשלום מאובטח...",
    },
    voucherDts: {
      cardNumberLabel: "מספר כרטיס שובר",
      lookupCta: "בדיקת יתרה",
      pickItemsHeading: "בחרו את ההטבה למימוש",
      qtyLabel: "כמות",
      redeemCta: "מימוש השובר",
      noItems: "לא נמצאו הטבות זמינות בכרטיס זה",
    },
    voucherVpay: {
      cardNumberLabel: "מספר כרטיס",
      cvvLabel: "CVV",
      lookupCta: "בדיקת יתרה",
      balanceLabel: "יתרה בכרטיס",
      payAmountLabel: "סכום לחיוב מהשובר",
      remainingNote: (amount: string) =>
        `סכום זה נמוך ממחיר הטיפול. יתרה של ${amount} תגבה באמצעי תשלום אחר.`,
      redeemCta: "ביצוע תשלום",
    },
    success: {
      heading: "תודה! ההזמנה אושרה",
      body: "שלחנו אישור ב-SMS. נתראה בטיפול!",
      backToWhatsapp: "חזרה לוואטסאפ",
    },
    errors: {
      tokenExpired: "חלון התשלום פג. אנא התחילו מחדש.",
      tokenInvalid: "חלון התשלום אינו תקין.",
      bookingNotFound: "ההזמנה לא נמצאה.",
      paymentFailed: "התשלום נכשל. נסו שוב או פנו לקבלה.",
    },
  },
} as const;

// ────────────────────────────────────────────────────────────
// Formatters — Hebrew locale, Asia/Jerusalem timezone.
// Keep these in one file with the strings so customer-facing pages
// have a single "i18n import" per file.
// ────────────────────────────────────────────────────────────

import { format as dfFormat } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";

const currencyFmt = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function formatIlsFromAgorot(agorot: number): string {
  return currencyFmt.format(agorot / 100);
}

/**
 * "25/05/2026" in Israel TZ, zero-padded.
 */
export function formatDateIL(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return dfFormat(toZonedTime(d, TZ), "dd/MM/yyyy");
}

/**
 * "14:00" in Israel TZ.
 */
export function formatTimeIL(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return dfFormat(toZonedTime(d, TZ), "HH:mm");
}

/**
 * "יום ראשון, 25/05/2026 14:00" in Israel TZ.
 * Uses Intl.DateTimeFormat for the Hebrew weekday.
 */
const weekdayFmt = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  timeZone: TZ,
});

export function formatDateTimeILFull(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const weekday = weekdayFmt.format(d);
  return `${weekday}, ${formatDateIL(d)} ${formatTimeIL(d)}`;
}
