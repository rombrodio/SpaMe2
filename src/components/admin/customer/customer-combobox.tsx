"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import {
  searchCustomersForCombobox,
  createCustomer,
} from "@/lib/actions/customers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Customer {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
}

interface CustomerComboboxProps {
  value: string;
  onChange: (id: string, customer?: Customer) => void;
  /**
   * Name of the hidden input so this component can drop into server-action
   * forms without a separate setState wiring.
   */
  name?: string;
  placeholder?: string;
  /**
   * Initial customer list to seed the popover so opening it once feels
   * instant. If omitted, the component fetches lazily on first open.
   */
  initialCustomers?: Customer[];
}

/**
 * SPA-006: typeahead customer picker for the New Booking form.
 *
 * Replaces the plain `<select>` so receptionists can find a customer by
 * name, phone, or email with keystroke feedback, and create a new customer
 * inline when someone walks in for the first time. The `CreateCustomerPanel`
 * dialog runs the same `createCustomer` server action the "New Customer"
 * page does, plus an SPA-101 duplicate-phone warning.
 */
export function CustomerCombobox({
  value,
  onChange,
  name,
  placeholder,
  initialCustomers = [],
}: CustomerComboboxProps) {
  const t = useTranslations();
  const resolvedPlaceholder =
    placeholder ?? t("admin.customers.combobox.placeholder");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Customer[]>(initialCustomers);
  const [query, setQuery] = useState("");
  const [isSearching, startSearch] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{
    name?: string;
    phone?: string;
  }>({});

  // Fire a search whenever the popover is open and the query changes.
  // Using useTransition's pending flag instead of a local `loading` state
  // keeps us clear of React 19's `set-state-in-effect` rule.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    startSearch(async () => {
      const rows = await searchCustomersForCombobox(query);
      if (!cancelled) setResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  // Derived label for the trigger button. Pure selector — no effect needed.
  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const match = results.find((c) => c.id === value);
    if (!match) return "";
    return `${match.full_name || t("admin.customers.combobox.unnamed")} · ${match.phone}`;
  }, [value, results, t]);

  function handleSelect(customer: Customer) {
    onChange(customer.id, customer);
    // Stash the selection into the results cache so the derived label
    // resolves immediately even before the next search refresh.
    setResults((prev) =>
      prev.some((c) => c.id === customer.id) ? prev : [customer, ...prev]
    );
    setOpen(false);
  }

  function openCreateFromQuery() {
    // Route the user's typed query into the prefill: treat digits as phone,
    // otherwise as name. Works because Israeli phones are digits-only input.
    const prefill: { name?: string; phone?: string } = {};
    if (/^[\d+\-\s]+$/.test(query.trim())) {
      prefill.phone = query.trim();
    } else if (query.trim().length > 0) {
      prefill.name = query.trim();
    }
    setCreatePrefill(prefill);
    setOpen(false);
    setCreateOpen(true);
  }

  function handleCreated(customer: Customer) {
    setResults((prev) => {
      if (prev.some((c) => c.id === customer.id)) return prev;
      return [customer, ...prev];
    });
    onChange(customer.id, customer);
    setCreateOpen(false);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span
              className={cn(
                "truncate",
                !selectedLabel && "text-muted-foreground"
              )}
            >
              {selectedLabel || resolvedPlaceholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("admin.customers.combobox.searchPlaceholder")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {isSearching && results.length === 0 ? (
                <div className="p-3 text-center text-sm text-muted-foreground">
                  {t("admin.customers.combobox.searching")}
                </div>
              ) : results.length === 0 ? (
                <CommandEmpty>
                  {t("admin.customers.combobox.noMatches")}
                </CommandEmpty>
              ) : (
                <CommandGroup heading={t("admin.customers.combobox.heading")}>
                  {results.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => handleSelect(c)}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {c.full_name || t("admin.customers.combobox.noName")}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {c.phone}
                          {c.email ? ` · ${c.email}` : ""}
                        </span>
                      </div>
                      {value === c.id && (
                        <Check className="ml-auto h-4 w-4" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  onSelect={openCreateFromQuery}
                  className="text-primary"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>
                    {t("admin.customers.combobox.createNew")}
                    {query.trim() ? (
                      <span className="text-muted-foreground">
                        {" "}— {query.trim()}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <CreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        prefill={createPrefill}
        onCreated={handleCreated}
      />
    </>
  );
}

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: { name?: string; phone?: string };
  onCreated: (customer: Customer) => void;
}

function CreateCustomerDialog({
  open,
  onOpenChange,
  prefill,
  onCreated,
}: CreateCustomerDialogProps) {
  const t = useTranslations();
  const [fullName, setFullName] = useState(prefill.name ?? "");
  const [phone, setPhone] = useState(prefill.phone ?? "");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const [duplicate, setDuplicate] = useState<Customer | null>(null);
  const [pending, startTransition] = useTransition();

  // Reseed fields when the dialog transitions closed → open. React's
  // "adjust state on prop change" idiom: setState during render is cheap
  // because React bails on unchanged values and continues with the new
  // state in the same pass. See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFullName(prefill.name ?? "");
      setPhone(prefill.phone ?? "");
      setEmail("");
      setErrors(null);
      setDuplicate(null);
    }
  }

  function submit(force: boolean) {
    const fd = new FormData();
    fd.set("full_name", fullName);
    fd.set("phone", phone);
    if (email) fd.set("email", email);
    setErrors(null);

    startTransition(async () => {
      const result = await createCustomer(fd, { force });
      if ("error" in result) {
        setErrors(result.error as Record<string, string[]>);
        toast.error(t("admin.customers.combobox.toastCreateError"));
        return;
      }
      if ("duplicate" in result) {
        setDuplicate(result.duplicate);
        return;
      }
      toast.success(t("admin.customers.combobox.toastCreated"));
      onCreated(result.customer);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {duplicate
              ? t("admin.customers.combobox.duplicateTitle")
              : t("admin.customers.combobox.createTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {duplicate
              ? t("admin.customers.combobox.duplicateDescription")
              : t("admin.customers.combobox.createDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {duplicate ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">
              {duplicate.full_name || t("admin.customers.combobox.noName")}
            </div>
            <div className="text-muted-foreground">
              {duplicate.phone}
              {duplicate.email ? ` · ${duplicate.email}` : ""}
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="cc_full_name">
                {t("admin.customers.combobox.fullName")}
              </Label>
              <Input
                id="cc_full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
              />
              {errors?.full_name?.[0] && (
                <p className="text-xs text-destructive">{errors.full_name[0]}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc_phone">
                {t("admin.customers.combobox.phone")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cc_phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("admin.customers.combobox.phonePlaceholder")}
              />
              {errors?.phone?.[0] && (
                <p className="text-xs text-destructive">{errors.phone[0]}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc_email">
                {t("admin.customers.combobox.emailOptional")}
              </Label>
              <Input
                id="cc_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors?.email?.[0] && (
                <p className="text-xs text-destructive">{errors.email[0]}</p>
              )}
            </div>
            {errors?._form?.[0] && (
              <p className="text-xs text-destructive">{errors._form[0]}</p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          {duplicate ? (
            <>
              <AlertDialogCancel
                onClick={() => setDuplicate(null)}
                disabled={pending}
              >
                {t("admin.customers.combobox.editDetails")}
              </AlertDialogCancel>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  onCreated(duplicate);
                }}
              >
                {t("admin.customers.combobox.useExisting")}
              </Button>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  submit(true);
                }}
                disabled={pending}
              >
                {pending
                  ? t("admin.customers.combobox.creating")
                  : t("admin.customers.combobox.createAnyway")}
              </AlertDialogAction>
            </>
          ) : (
            <>
              <AlertDialogCancel disabled={pending}>
                {t("admin.customers.combobox.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  submit(false);
                }}
                disabled={pending || !phone.trim() || !fullName.trim()}
              >
                {pending
                  ? t("admin.customers.combobox.creating")
                  : t("admin.customers.combobox.create")}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
