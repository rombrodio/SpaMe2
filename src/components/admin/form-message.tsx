"use client";

export function FormErrors({ errors }: { errors?: Record<string, string[]> }) {
  if (!errors) return null;

  const allErrors = Object.entries(errors).flatMap(([field, msgs]) =>
    msgs.map((msg) => (field === "_form" ? msg : `${field}: ${msg}`))
  );

  if (allErrors.length === 0) return null;

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      {allErrors.map((msg, i) => (
        <p key={i}>{msg}</p>
      ))}
    </div>
  );
}
