"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, Clock, CalendarOff, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/therapist", label: "My Bookings", icon: Calendar, exact: true },
  { href: "/therapist/availability", label: "Availability", icon: Clock },
  { href: "/therapist/time-off", label: "Time Off", icon: CalendarOff },
];

export default function TherapistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar-background">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Link
            href="/therapist"
            className="text-lg font-semibold text-foreground"
          >
            SpaMe
          </Link>
          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
            Therapist
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href);
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
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
