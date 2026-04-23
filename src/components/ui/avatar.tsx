import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Small circular initials avatar. Photo uploads are deferred — a
 * therapist's assigned color (which already exists in the DB) doubles
 * as their avatar background so twenty staff remain visually
 * distinguishable at a glance.
 */
export function Avatar({ name, color, size = "md", className }: AvatarProps) {
  const initials = getInitials(name);
  const sizeClass =
    size === "sm"
      ? "h-6 w-6 text-[10px]"
      : size === "lg"
        ? "h-10 w-10 text-sm"
        : "h-8 w-8 text-xs";
  const bg = color ?? "#94a3b8";
  const textColor = readableTextColor(bg);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase tracking-wide",
        sizeClass,
        className
      )}
      style={{ backgroundColor: bg, color: textColor }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Pick a readable foreground color for a given background. Uses the
 * relative-luminance approximation from WCAG: if the background is
 * bright, return near-black, otherwise white.
 */
function readableTextColor(hex: string): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return "#ffffff";
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#18181b" : "#ffffff";
}
