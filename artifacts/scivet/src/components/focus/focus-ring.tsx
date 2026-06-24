import { cn } from "@/lib/utils";

interface FocusRingProps {
  /** Progress 0..1. Values outside the range are clamped. */
  progress: number;
  /** Big centered label (usually the clock). */
  label: string;
  /** Small caption under the label. */
  caption?: string;
  /** Visual treatment — focus is primary, break is muted/green-ish. */
  variant?: "focus" | "break";
  size?: number;
  className?: string;
}

/**
 * A dependency-free circular progress ring. Immediate visual feedback on
 * progress is one of the conditions that supports flow (Csikszentmihalyi).
 */
export function FocusRing({
  progress,
  label,
  caption,
  variant = "focus",
  size = 240,
  className,
}: FocusRingProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-1000 ease-linear",
            variant === "focus" ? "stroke-primary" : "stroke-emerald-500",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
          {label}
        </span>
        {caption && (
          <span className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
