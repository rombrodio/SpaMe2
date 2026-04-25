import { defaultLocale, type Locale } from "@/i18n/config";

/**
 * Lightweight language detector for inbound free-text messages.
 *
 * Used to auto-set `customers.language` in Phase 8 when a customer
 * sends their first WhatsApp / web-chat message — so subsequent
 * replies (both AI-drafted and human-sent) default to the customer's
 * own language without them having to pick one.
 *
 * Heuristic: count characters by script and pick the script with the
 * most characters. Hebrew + Cyrillic are distinctive enough that even
 * a short message (e.g. "תודה", "спасибо", "thanks") classifies
 * reliably. Latin is the default when no non-Latin script dominates
 * (covers English + transliterated Hebrew / Russian).
 *
 * Deliberately NOT:
 *   - machine-learning based (overkill for 3 locales with distinct scripts)
 *   - dependent on Accept-Language (that's a browser hint, not a customer signal)
 *   - language-probability-scored (we just need a locale tag)
 */
export function detectLanguage(text: string): Locale {
  if (!text || typeof text !== "string") return defaultLocale;

  let hebrew = 0;
  let cyrillic = 0;
  let latin = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    // Hebrew block: U+0590–U+05FF
    if (cp >= 0x0590 && cp <= 0x05ff) {
      hebrew++;
      continue;
    }
    // Cyrillic + Cyrillic Supplement: U+0400–U+04FF and U+0500–U+052F
    if (cp >= 0x0400 && cp <= 0x052f) {
      cyrillic++;
      continue;
    }
    // Basic Latin letters A-Z / a-z (excludes digits, punctuation, whitespace
    // so a phone number "050-1234567" doesn't falsely count as English).
    if (
      (cp >= 0x0041 && cp <= 0x005a) ||
      (cp >= 0x0061 && cp <= 0x007a)
    ) {
      latin++;
    }
  }

  if (hebrew === 0 && cyrillic === 0 && latin === 0) {
    return defaultLocale;
  }

  // Majority wins. Ties break in this order: HE > RU > EN — reflects
  // the spa's primary audience, so an ambiguous message biases toward
  // the language the spa can respond in most fluently.
  if (hebrew >= cyrillic && hebrew >= latin) return "he";
  if (cyrillic >= latin) return "ru";
  return "en";
}
