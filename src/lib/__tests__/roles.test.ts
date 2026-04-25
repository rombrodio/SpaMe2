import { describe, it, expect } from "vitest";
import { portalForRole, allowedOrRedirect } from "../roles";

describe("portalForRole", () => {
  it("maps each role to its landing path", () => {
    expect(portalForRole("super_admin")).toBe("/admin");
    expect(portalForRole("receptionist")).toBe("/reception");
    expect(portalForRole("therapist")).toBe("/therapist");
  });

  it("falls back to /login for unknown or missing role", () => {
    expect(portalForRole(null)).toBe("/login");
    expect(portalForRole(undefined)).toBe("/login");
    expect(portalForRole("")).toBe("/login");
    expect(portalForRole("other")).toBe("/login");
  });
});

describe("allowedOrRedirect", () => {
  describe("/admin/*", () => {
    it("allows super_admin", () => {
      expect(allowedOrRedirect("/admin/bookings", "super_admin")).toEqual({
        allowed: true,
      });
    });
    it("redirects receptionist to /reception", () => {
      expect(allowedOrRedirect("/admin/bookings", "receptionist")).toEqual({
        allowed: false,
        redirectTo: "/reception",
      });
    });
    it("redirects therapist to /therapist", () => {
      expect(allowedOrRedirect("/admin/bookings", "therapist")).toEqual({
        allowed: false,
        redirectTo: "/therapist",
      });
    });
    it("redirects unknown role to /login", () => {
      expect(allowedOrRedirect("/admin", null)).toEqual({
        allowed: false,
        redirectTo: "/login",
      });
    });
  });

  describe("/reception/*", () => {
    it("allows receptionist", () => {
      expect(allowedOrRedirect("/reception/inbox", "receptionist")).toEqual({
        allowed: true,
      });
    });
    it("allows super_admin (full visibility per vision)", () => {
      expect(allowedOrRedirect("/reception/inbox", "super_admin")).toEqual({
        allowed: true,
      });
    });
    it("redirects therapist to /therapist", () => {
      expect(allowedOrRedirect("/reception/inbox", "therapist")).toEqual({
        allowed: false,
        redirectTo: "/therapist",
      });
    });
  });

  describe("/therapist/*", () => {
    it("allows therapist", () => {
      expect(allowedOrRedirect("/therapist", "therapist")).toEqual({
        allowed: true,
      });
    });
    it("redirects super_admin back to /admin", () => {
      expect(allowedOrRedirect("/therapist", "super_admin")).toEqual({
        allowed: false,
        redirectTo: "/admin",
      });
    });
    it("redirects receptionist back to /reception", () => {
      expect(allowedOrRedirect("/therapist", "receptionist")).toEqual({
        allowed: false,
        redirectTo: "/reception",
      });
    });
  });

  describe("unguarded paths", () => {
    it("allows any role (or none) on non-portal routes", () => {
      expect(allowedOrRedirect("/book", null)).toEqual({ allowed: true });
      expect(allowedOrRedirect("/login", "receptionist")).toEqual({
        allowed: true,
      });
      expect(allowedOrRedirect("/order/abc", null)).toEqual({ allowed: true });
    });
  });

  describe("redirect-loop safety", () => {
    it("never returns a redirectTo equal to the input pathname", () => {
      // Middleware uses verdict.redirectTo to 302 the user; if that's
      // ever the same path, the browser hits ERR_TOO_MANY_REDIRECTS.
      const paths = [
        "/admin",
        "/admin/bookings",
        "/reception",
        "/reception/inbox",
        "/therapist",
        "/therapist/availability",
      ];
      const roles = [
        null,
        undefined,
        "",
        "super_admin",
        "receptionist",
        "therapist",
        "unknown",
      ];
      for (const path of paths) {
        for (const role of roles) {
          const v = allowedOrRedirect(path, role as string | null);
          if (!v.allowed) {
            expect(v.redirectTo).not.toBe(path);
          }
        }
      }
    });
  });
});
