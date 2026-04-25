import { describe, it, expect } from "vitest";
import { detectLanguage } from "../detect";

describe("detectLanguage", () => {
  describe("pure-language inputs", () => {
    it("detects Hebrew", () => {
      expect(detectLanguage("שלום, אני רוצה להזמין טיפול")).toBe("he");
      expect(detectLanguage("תודה")).toBe("he");
    });

    it("detects Russian", () => {
      expect(detectLanguage("Здравствуйте, хочу записаться на массаж")).toBe(
        "ru"
      );
      expect(detectLanguage("спасибо")).toBe("ru");
    });

    it("detects English", () => {
      expect(detectLanguage("hi I want to book a massage tomorrow")).toBe("en");
      expect(detectLanguage("thanks")).toBe("en");
    });
  });

  describe("empty / degenerate inputs", () => {
    it("returns default locale for empty string", () => {
      expect(detectLanguage("")).toBe("he");
    });

    it("returns default for whitespace only", () => {
      expect(detectLanguage("    ")).toBe("he");
    });

    it("returns default for digits + punctuation only", () => {
      expect(detectLanguage("050-1234567 !?")).toBe("he");
    });

    it("handles non-string input gracefully", () => {
      // @ts-expect-error — runtime guard
      expect(detectLanguage(null)).toBe("he");
      // @ts-expect-error — runtime guard
      expect(detectLanguage(undefined)).toBe("he");
    });
  });

  describe("mixed-script inputs", () => {
    it("picks Hebrew when it dominates", () => {
      // 14 Hebrew chars (תודה רבה לכם) + 2 Latin (ok) → HE wins.
      expect(detectLanguage("תודה רבה לכם ok")).toBe("he");
    });

    it("picks Russian when Cyrillic dominates", () => {
      // 12 Cyrillic (Спасибо большое) + 2 Latin (ok) → RU wins.
      expect(detectLanguage("Спасибо большое ok")).toBe("ru");
    });

    it("picks English when Latin dominates", () => {
      expect(detectLanguage("hi there can you book שלום")).toBe("en");
    });

    it("breaks ties toward Hebrew", () => {
      // Exactly 4 Hebrew vs 4 Latin chars → HE wins per the documented
      // tie-break (reflects the spa's primary audience).
      expect(detectLanguage("שלוםhelo")).toBe("he");
    });
  });

  describe("realistic inbound messages", () => {
    it("Hebrew booking request", () => {
      expect(
        detectLanguage("היי, אני רוצה להזמין עיסוי שוודי ביום חמישי אחר הצהריים")
      ).toBe("he");
    });

    it("Russian booking request", () => {
      expect(
        detectLanguage(
          "Добрый день, можно записаться на массаж в субботу после обеда?"
        )
      ).toBe("ru");
    });

    it("English booking request", () => {
      expect(
        detectLanguage("Hi, can I book a 60min deep tissue massage on Saturday?")
      ).toBe("en");
    });

    it("voice-note transcript with punctuation", () => {
      expect(
        detectLanguage("בדיקה, רק לראות אם זה עובד.")
      ).toBe("he");
    });
  });
});
