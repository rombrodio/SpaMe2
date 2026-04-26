import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Users,
  Scissors,
  DoorOpen,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Settings,
  UserCheck,
  Headphones,
  MessageSquare,
  CalendarPlus,
  Clock,
} from "lucide-react";

/**
 * Sidebar nav config — single source of truth for both the admin and
 * reception portals. Config-driven so phase additions (Inbox in Phase 8,
 * Reports in Phase 9, etc.) are one-line entries, not JSX edits.
 *
 * Grouping follows the Fresha pattern (CALENDAR / CLIENTS / TEAM /
 * CATALOG / REPORTS) which operators coming from competing spa
 * platforms already recognise. Groups with `hidden: true` don't render;
 * flip when the backing route ships.
 */

export interface NavItem {
  href: string;
  /**
   * Either a static label (admin portal — not yet translated) OR a
   * translation key. When both are provided, the key wins at render
   * time. Reception portal uses `labelKey` exclusively; admin portal
   * keeps `label` until its own Phase 7b PR ships.
   */
  label?: string;
  labelKey?: string;
  icon: LucideIcon;
  /** Exact-match the current pathname (used for the Dashboard route). */
  exact?: boolean;
  /** Hide when the underlying route isn't built yet. */
  hidden?: boolean;
}

export interface NavSection {
  /** `null` for ungrouped items (Dashboard, Settings). */
  groupLabel?: string | null;
  groupLabelKey?: string;
  items: NavItem[];
  hidden?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Admin portal nav
// ─────────────────────────────────────────────────────────────

export const adminNavSections: NavSection[] = [
  {
    groupLabel: null,
    items: [
      {
        href: "/admin",
        labelKey: "admin.nav.dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    groupLabelKey: "admin.nav.groups.calendar",
    items: [
      {
        href: "/admin/calendar",
        labelKey: "admin.nav.calendar",
        icon: Calendar,
      },
      {
        href: "/admin/bookings",
        labelKey: "admin.nav.bookings",
        icon: BookOpen,
      },
      {
        href: "/admin/assignments",
        labelKey: "admin.nav.assignments",
        icon: UserCheck,
      },
      // Phase 8 — flip `hidden: false` when the inbox route lands.
      {
        href: "/admin/inbox",
        labelKey: "admin.nav.inbox",
        icon: MessageSquare,
        hidden: true,
      },
    ],
  },
  {
    groupLabelKey: "admin.nav.groups.clients",
    items: [
      {
        href: "/admin/customers",
        labelKey: "admin.nav.customers",
        icon: Users,
      },
    ],
  },
  {
    groupLabelKey: "admin.nav.groups.team",
    items: [
      {
        href: "/admin/therapists",
        labelKey: "admin.nav.therapists",
        icon: Users,
      },
      {
        href: "/admin/receptionists",
        labelKey: "admin.nav.receptionists",
        icon: Headphones,
      },
    ],
  },
  {
    groupLabelKey: "admin.nav.groups.catalog",
    items: [
      {
        href: "/admin/services",
        labelKey: "admin.nav.services",
        icon: Scissors,
      },
      { href: "/admin/rooms", labelKey: "admin.nav.rooms", icon: DoorOpen },
    ],
  },
  {
    groupLabelKey: "admin.nav.groups.reports",
    items: [
      // Phase 9 — flip `hidden: false` when the reports route lands.
      {
        href: "/admin/reports",
        labelKey: "admin.nav.reports",
        icon: ClipboardList,
        hidden: true,
      },
      {
        href: "/admin/audit-log",
        labelKey: "admin.nav.auditLog",
        icon: ClipboardList,
      },
    ],
  },
  {
    groupLabel: null,
    items: [
      {
        href: "/admin/settings",
        labelKey: "admin.nav.settings",
        icon: Settings,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Reception portal nav
// ─────────────────────────────────────────────────────────────

export const receptionNavSections: NavSection[] = [
  {
    groupLabel: null,
    items: [
      {
        href: "/reception",
        labelKey: "reception.nav.dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    groupLabelKey: "reception.nav.groups.calendar",
    items: [
      {
        href: "/reception/bookings/new",
        labelKey: "reception.nav.newBooking",
        icon: CalendarPlus,
      },
      {
        href: "/reception/bookings",
        labelKey: "reception.nav.bookings",
        icon: BookOpen,
      },
      // Phase 8 — primary surface for receptionists.
      {
        href: "/reception/inbox",
        labelKey: "reception.nav.inbox",
        icon: MessageSquare,
        hidden: true,
      },
    ],
  },
  {
    groupLabelKey: "reception.nav.groups.me",
    items: [
      {
        href: "/reception/availability",
        labelKey: "reception.nav.myOnDutyHours",
        icon: Clock,
      },
    ],
  },
];

/**
 * Strip hidden items so the renderer doesn't need to know about
 * phase-gating. Also drops any group whose items are all hidden.
 */
export function visibleSections(sections: NavSection[]): NavSection[] {
  return sections
    .filter((s) => !s.hidden)
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !i.hidden),
    }))
    .filter((s) => s.items.length > 0);
}

/**
 * Pick the single nav item whose href best matches the current
 * pathname. Longest matching prefix wins; ties are impossible since
 * hrefs are unique. Items flagged `exact: true` only match an exact
 * pathname equality (used for `/admin` dashboard — otherwise every
 * /admin/* path would light up the Dashboard entry).
 */
export function pickActiveHref(
  pathname: string,
  items: NavItem[]
): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    if (item.exact) {
      if (pathname === item.href) return item.href;
      continue;
    }
    const matches =
      pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  }
  return best?.href ?? null;
}
