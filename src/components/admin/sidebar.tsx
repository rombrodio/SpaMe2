"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { GlobalSearch } from "@/components/admin/global-search";
import {
  adminNavSections,
  pickActiveHref,
  visibleSections,
} from "@/lib/nav";

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sections = visibleSections(adminNavSections);

  // Most-specific-prefix wins. Without this, e.g. `/admin/bookings/new`
  // would activate both "Bookings" and a hypothetical "New booking"
  // entry because both hrefs are prefixes of the pathname. We pick
  // the longest href whose prefix matches (or an exact-only entry
  // that matches exactly).
  const activeHref = pickActiveHref(
    pathname,
    sections.flatMap((s) => s.items)
  );

  return (
    <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar-background">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/admin" className="text-lg font-semibold text-foreground">
          SpaMe
        </Link>
      </div>
      <div className="border-b border-sidebar-border px-2 py-2">
        <GlobalSearch />
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((section, idx) => (
          <div
            key={section.groupLabel ?? `ungrouped-${idx}`}
            className={cn("px-2", idx > 0 && "mt-4")}
          >
            {section.groupLabel && (
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.groupLabel}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const isActive = href === activeHref;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
