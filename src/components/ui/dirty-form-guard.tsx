"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

interface DirtyFormGuardProps {
  dirty: boolean;
  children: React.ReactNode;
  /** Copy shown in the confirmation dialog. */
  message?: string;
  /**
   * When true, the beforeunload warning still fires on tab close / reload
   * but intra-app navigation no longer prompts. Used immediately after a
   * successful save to let `router.push` run without a dialog.
   */
  ignoreSoftNav?: boolean;
}

/**
 * SPA-133 — Unsaved-changes warning.
 *
 * Guards a form against silent data loss:
 *   1. `beforeunload` listener blocks tab close / reload / external links
 *      with the browser's native confirmation dialog.
 *   2. Click-capturing wrapper intercepts clicks on any descendant `<a>`
 *      (including Next `<Link>`) and — if `dirty === true` — shows our
 *      AlertDialog before letting the navigation proceed.
 *
 * Next.js App Router doesn't expose a router-block API, so we capture
 * same-origin clicks and replay the intended navigation after confirmation.
 * External clicks (different origin) are covered by beforeunload.
 *
 * Scope: wrap around the form card. The `dirty` prop should reflect the
 * form's current dirty-state — usually via a simple `useDirty()` hook.
 */
export function DirtyFormGuard({
  dirty,
  children,
  message = "You have unsaved changes. Leave this page?",
  ignoreSoftNav = false,
}: DirtyFormGuardProps) {
  const router = useRouter();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Hard navigations (tab close, reload, external link).
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Deprecated but still required by Safari/older Chrome.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Soft navigations (clicks on Next `<Link>` / `<a>` inside the wrapped
  // region). We attach a capturing click listener so we see the event
  // before React/Next handles it.
  useEffect(() => {
    if (!dirty || ignoreSoftNav) return;
    const node = wrapperRef.current;
    if (!node) return;

    function onClick(e: MouseEvent) {
      // Allow modifier clicks (open in new tab) and right-clicks through.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      // Let in-page anchors (#foo) and explicit target=_blank links through.
      if (anchor.target && anchor.target !== "_self") return;
      if (!anchor.href) return;
      const dest = new URL(anchor.href, window.location.href);
      if (dest.origin !== window.location.origin) return;

      // Intercept. Stash destination and open dialog.
      e.preventDefault();
      e.stopPropagation();
      setPendingUrl(dest.pathname + dest.search + dest.hash);
    }

    node.addEventListener("click", onClick, true);
    return () => node.removeEventListener("click", onClick, true);
  }, [dirty, ignoreSoftNav]);

  return (
    <div ref={wrapperRef}>
      {children}
      <AlertDialog
        open={pendingUrl !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUrl(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on page</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const url = pendingUrl;
                setPendingUrl(null);
                if (url) router.push(url);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard &amp; leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Derive a dirty-flag from two values. Uses stringify for objects; cheap
 * for the small shapes our admin forms use (≤10 fields).
 */
export function useFormDirty<T>(current: T, initial: T): boolean {
  try {
    return JSON.stringify(current) !== JSON.stringify(initial);
  } catch {
    return current !== initial;
  }
}

/**
 * Lightweight dirty detection for uncontrolled forms. Attaches one
 * `input`/`change` listener on the supplied element (typically the <form>)
 * and flips to dirty on the first user interaction. Callers invoke `reset`
 * right before navigating away on a successful save.
 */
export function useFormDirtyOnRef<T extends HTMLElement>(
  ref: React.RefObject<T | null>
): [dirty: boolean, reset: () => void] {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function markDirty() {
      setDirty(true);
    }
    el.addEventListener("input", markDirty);
    el.addEventListener("change", markDirty);
    return () => {
      el.removeEventListener("input", markDirty);
      el.removeEventListener("change", markDirty);
    };
  }, [ref]);
  return [dirty, () => setDirty(false)];
}
