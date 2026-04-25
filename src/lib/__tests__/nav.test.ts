import { describe, it, expect } from "vitest";
import { LayoutDashboard } from "lucide-react";
import {
  pickActiveHref,
  visibleSections,
  type NavItem,
  type NavSection,
} from "../nav";

const ICON = LayoutDashboard;

function item(href: string, exact?: boolean): NavItem {
  return { href, label: href, icon: ICON, exact };
}

describe("pickActiveHref", () => {
  it("matches an exact-flagged item only on exact pathname", () => {
    const items = [
      item("/admin", true),
      item("/admin/bookings"),
      item("/admin/calendar"),
    ];
    expect(pickActiveHref("/admin", items)).toBe("/admin");
    // /admin/bookings should NOT also match /admin (exact guard)
    expect(pickActiveHref("/admin/bookings", items)).toBe("/admin/bookings");
  });

  it("prefers the longest matching prefix", () => {
    // Both /reception/bookings and /reception/bookings/new are prefixes
    // of /reception/bookings/new/foo. The longer one wins.
    const items = [
      item("/reception/bookings"),
      item("/reception/bookings/new"),
    ];
    expect(pickActiveHref("/reception/bookings", items)).toBe(
      "/reception/bookings"
    );
    expect(pickActiveHref("/reception/bookings/new", items)).toBe(
      "/reception/bookings/new"
    );
  });

  it("does not treat a sibling path as a prefix match", () => {
    // /admin/bookings should NOT match /admin/booking (no trailing slash).
    const items = [item("/admin/booking"), item("/admin/bookings")];
    expect(pickActiveHref("/admin/bookings", items)).toBe("/admin/bookings");
    expect(pickActiveHref("/admin/booking", items)).toBe("/admin/booking");
  });

  it("returns null when nothing matches", () => {
    const items = [item("/admin", true), item("/admin/bookings")];
    expect(pickActiveHref("/reception", items)).toBeNull();
  });

  it("handles deep paths under a group item", () => {
    const items = [item("/admin/receptionists")];
    expect(
      pickActiveHref("/admin/receptionists/123/edit", items)
    ).toBe("/admin/receptionists");
  });
});

describe("visibleSections", () => {
  it("drops hidden items and empty groups", () => {
    const sections: NavSection[] = [
      {
        groupLabel: "Ops",
        items: [
          { href: "/a", label: "A", icon: ICON },
          { href: "/b", label: "B", icon: ICON, hidden: true },
        ],
      },
      {
        groupLabel: "All Hidden",
        items: [{ href: "/c", label: "C", icon: ICON, hidden: true }],
      },
      {
        groupLabel: null,
        items: [{ href: "/d", label: "D", icon: ICON }],
      },
    ];
    const out = visibleSections(sections);
    expect(out).toHaveLength(2);
    expect(out[0].groupLabel).toBe("Ops");
    expect(out[0].items).toHaveLength(1);
    expect(out[0].items[0].href).toBe("/a");
    expect(out[1].groupLabel).toBeNull();
    expect(out[1].items[0].href).toBe("/d");
  });

  it("drops a whole section marked hidden: true", () => {
    const sections: NavSection[] = [
      {
        groupLabel: "Phase 8",
        items: [{ href: "/x", label: "X", icon: ICON }],
        hidden: true,
      },
      {
        groupLabel: "Live",
        items: [{ href: "/y", label: "Y", icon: ICON }],
      },
    ];
    const out = visibleSections(sections);
    expect(out).toHaveLength(1);
    expect(out[0].groupLabel).toBe("Live");
  });
});
