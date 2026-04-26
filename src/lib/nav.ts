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
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    groupLabel: "Calendar",
    items: [
      { href: "/admin/calendar", label: "Calendar", icon: Calendar },
      { href: "/admin/bookings", label: "Bookings", icon: BookOpen },
      { href: "/admin/assignments", label: "Assignments", icon: UserCheck },
      // Phase 8 — flip `hidden: false` when the inbox route lands.
      {
        href: "/admin/inbox",
        label: "Inbox",
        icon: MessageSquare,
        hidden: true,
      },
    ],
  },
  {
    groupLabel: "Clients",
    items: [{ href: "/admin/customers", label: "Customers", icon: Users }],
  },
  {
    groupLabel: "Team",
    items: [
      { href: "/admin/therapists", label: "Therapists", icon: Users },
      {
        href: "/admin/receptionists",
        label: "Receptionists",
        icon: Headphones,
      },
    ],
  },
  {
    groupLabel: "Catalog",
    items: [
      { href: "/admin/services", label: "Services", icon: Scissors },
      { href: "/admin/rooms", label: "Rooms", icon: DoorOpen },
    ],
  },
  {
    groupLabel: "Reports",
    items: [
      // Phase 9 — flip `hidden: false` when the reports route lands.
      {
        href: "/admin/reports",
        label: "Reports",
        icon: ClipboardList,
        hidden: true,
      },
      { href: "/admin/audit-log", label: "Audit Log", icon: ClipboardList },
    ],
  },
  {
    groupLabel: null,
    items: [{ href: "/admin/settings", label: "Settings", icon: Settings }],
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
