"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  pickActiveHref,
  receptionNavSections,
  visibleSections,
} from "@/lib/nav";
import { LocaleSwitcher } from "@/components/locale-switcher";

export function ReceptionSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sections = visibleSections(receptionNavSections);
  const activeHref = pickActiveHref(
    pathname,
    sections.flatMap((s) => s.items)
  );

  return (
    <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar-background">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link
          href="/reception"
          className="text-lg font-semibold text-foreground"
        >
          {t("reception.brand")}
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((section, idx) => {
          const groupText = section.groupLabelKey
            ? t(section.groupLabelKey)
            : section.groupLabel;
          return (
            <div
              key={section.groupLabelKey ?? section.groupLabel ?? `ungrouped-${idx}`}
              className={cn("px-2", idx > 0 && "mt-4")}
            >
              {groupText && (
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {groupText}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map(({ href, label, labelKey, icon: Icon }) => {
                  const isActive = href === activeHref;
                  const itemText = labelKey ? t(labelKey) : label;
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
                      {itemText}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-2 space-y-2">
        <LocaleSwitcher size="compact" className="w-full" />
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          {t("common.signOut")}
        </button>
      </div>
    </aside>
  );
}
