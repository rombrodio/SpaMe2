"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ConfirmButtonProps = {
  /** Button label (content of the trigger). */
  children: React.ReactNode;
  /** Dialog title. */
  title: string;
  /** Dialog body / warning text. */
  description: React.ReactNode;
  /** Label for the confirm action button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * If provided, the user must type this exact string for the action button to
   * enable. Use for high-risk destructive actions (customer/therapist/service delete).
   */
  confirmText?: string;
  /**
   * If provided, renders a textarea capturing a freeform reason; the value is
   * passed to onConfirm. Useful for Cancel Booking.
   */
  reasonPrompt?: string;
  /**
   * Callback fired when the user confirms. Receives the reason textarea value
   * (or empty string). May be async; we surface thrown errors as toast.
   */
  onConfirm: (reason: string) => Promise<void> | void;
  /** Variant/size forwarded to trigger button. Defaults to destructive. */
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
};

export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmText,
  reasonPrompt,
  onConfirm,
  variant = "destructive",
  size,
  className,
  disabled,
}: ConfirmButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const typedOk = !confirmText || typed.trim() === confirmText.trim();

  React.useEffect(() => {
    if (!open) {
      setTyped("");
      setReason("");
      setPending(false);
    }
  }, [open]);

  const handleConfirm = async (e: React.MouseEvent) => {
    if (!typedOk) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setPending(true);
    try {
      await onConfirm(reason.trim());
      setOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          disabled={disabled}
        >
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmText ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-typed">
              Type <span className="font-mono font-semibold text-foreground">{confirmText}</span> to confirm
            </Label>
            <Input
              id="confirm-typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
        ) : null}

        {reasonPrompt ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{reasonPrompt}</Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!typedOk || pending}
            className={
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
