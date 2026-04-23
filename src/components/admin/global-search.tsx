"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Users, Calendar } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { globalSearch, type GlobalSearchHit } from "@/lib/actions/search";

/**
 * SPA-003 (lite): global search trigger in the admin sidebar.
 *
 * A single popover opened with the keyboard shortcut ⌘K / Ctrl+K or
 * by clicking the button. Queries are debounced via `useTransition`;
 * results are grouped by entity kind and navigate on select.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [isSearching, startSearch] = useTransition();
  const lastRequest = useRef(0);

  // Keyboard shortcut: ⌘K / Ctrl+K toggles the popover. Skipped when the
  // user is already typing in an input so "K" keys never trigger it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const seq = ++lastRequest.current;
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    startSearch(async () => {
      const result = await globalSearch(query);
      // Skip stale results if the user typed more characters in the meantime.
      if (seq === lastRequest.current) setHits(result);
    });
  }, [open, query]);

  function handleSelect(hit: GlobalSearchHit) {
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  }

  const customerHits = hits.filter((h) => h.kind === "customer");
  const therapistHits = hits.filter((h) => h.kind === "therapist");
  const bookingHits = hits.filter((h) => h.kind === "booking");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          aria-label="Open global search"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left text-xs">Search…</span>
          <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline-block">
            ⌘K
          </kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[340px] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Customers, therapists, bookings…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim().length < 2 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search.
              </div>
            ) : hits.length === 0 && !isSearching ? (
              <CommandEmpty>No matches.</CommandEmpty>
            ) : (
              <>
                {customerHits.length > 0 && (
                  <CommandGroup heading="Customers">
                    {customerHits.map((hit) => (
                      <SearchHit
                        key={`c-${hit.id}`}
                        hit={hit}
                        icon={<User className="h-3.5 w-3.5" />}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
                {therapistHits.length > 0 && (
                  <CommandGroup heading="Therapists">
                    {therapistHits.map((hit) => (
                      <SearchHit
                        key={`t-${hit.id}`}
                        hit={hit}
                        icon={<Users className="h-3.5 w-3.5" />}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
                {bookingHits.length > 0 && (
                  <CommandGroup heading="Bookings">
                    {bookingHits.map((hit) => (
                      <SearchHit
                        key={`b-${hit.id}`}
                        hit={hit}
                        icon={<Calendar className="h-3.5 w-3.5" />}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SearchHit({
  hit,
  icon,
  onSelect,
}: {
  hit: GlobalSearchHit;
  icon: React.ReactNode;
  onSelect: (hit: GlobalSearchHit) => void;
}) {
  return (
    <CommandItem
      value={`${hit.kind}:${hit.id}:${hit.title}`}
      onSelect={() => onSelect(hit)}
    >
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{hit.title}</span>
        {hit.subtitle && (
          <span className="truncate text-xs text-muted-foreground">
            {hit.subtitle}
          </span>
        )}
      </div>
    </CommandItem>
  );
}
