import { describe, it, expect } from "vitest";
import {
  locales,
  defaultLocale,
  rtlLocales,
  isLocale,
  isRtl,
  localeLabels,
} from "../config";

describe("i18n config", () => {
  it("exports exactly the three V1 locales", () => {
    expect([...locales].sort()).toEqual(["en", "he", "ru"]);
  });

  it("defaults to Hebrew", () => {
    expect(defaultLocale).toBe("he");
  });

  it("marks only Hebrew as RTL", () => {
    expect([...rtlLocales]).toEqual(["he"]);
  });

  describe("isLocale", () => {
    it("accepts known locales", () => {
      expect(isLocale("he")).toBe(true);
      expect(isLocale("en")).toBe(true);
      expect(isLocale("ru")).toBe(true);
    });

    it("rejects anything else", () => {
      expect(isLocale("HE")).toBe(false);
      expect(isLocale("fr")).toBe(false);
      expect(isLocale("")).toBe(false);
      expect(isLocale(null)).toBe(false);
      expect(isLocale(undefined)).toBe(false);
      expect(isLocale(42)).toBe(false);
    });
  });

  describe("isRtl", () => {
    it("returns true for Hebrew only", () => {
      expect(isRtl("he")).toBe(true);
      expect(isRtl("en")).toBe(false);
      expect(isRtl("ru")).toBe(false);
    });
  });

  it("exposes a native-script label for every locale", () => {
    for (const locale of locales) {
      expect(localeLabels[locale]).toBeDefined();
      expect(localeLabels[locale].length).toBeGreaterThan(0);
    }
  });
});
