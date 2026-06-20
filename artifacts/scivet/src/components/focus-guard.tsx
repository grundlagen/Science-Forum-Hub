import { Brain, Coffee, Eye, Sparkles, Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { GuardState, Nudge, FatigueState } from "@/lib/focus-guard-client";

const FATIGUE_LABEL: Record<FatigueState, string> = {
  fresh: "Fresh",
  warming: "Warming up",
  optimal: "Optimal",
  tiring: "Tiring",
  depleted: "Depleted",
};

const FATIGUE_COLOR: Record<FatigueState, string> = {
  fresh: "text-green-500",
  warming: "text-green-500",
  optimal: "text-emerald-400",
  tiring: "text-amber-500",
  depleted: "text-red-500",
};

function nudgeIcon(kind: Nudge["kind"]) {
  switch (kind) {
    case "flow":
      return <Sparkles className="h-4 w-4" />;
    case "ultradian_break":
    case "fatigue_break":
      return <Coffee className="h-4 w-4" />;
    case "coverage":
      return <Eye className="h-4 w-4" />;
    case "dwell":
      return <Timer className="h-4 w-4" />;
    default:
      return <Zap className="h-4 w-4" />;
  }
}

function severityClass(severity: 1 | 2 | 3): string {
  switch (severity) {
    case 3:
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case 2:
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    default:
      return "border-primary/20 bg-primary/5 text-foreground/80";
  }
}

/** Small circular meter showing focus quality 0..100 (server-computed). */
function FocusDial({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const hue = Math.round((pct / 100) * 130); // red(0) → green(130)
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/40" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={`hsl(${hue}, 70%, 45%)`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold leading-none">{score == null ? "—" : Math.round(pct)}</span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">focus</span>
      </div>
    </div>
  );
}

export interface FocusGuardPanelProps {
  guard: GuardState | null;
  engagedSec: number;
  scrollDepth: number;
  onTakeBreak: () => void;
  className?: string;
}

/**
 * The Focus Guard panel: a live, psychology-grounded readout of how well the
 * reader is engaging with the paper, plus a single, non-stacking nudge.
 */
export function FocusGuardPanel({
  guard,
  engagedSec,
  scrollDepth,
  onTakeBreak,
  className,
}: FocusGuardPanelProps) {
  const fatigue = guard?.fatigue;
  const nudge = guard?.nudge ?? null;
  const required = guard?.eligibility.requiredSec ?? 90;
  const timePct = Math.min(100, Math.round((engagedSec / Math.max(1, required)) * 100));
  const coveragePct = Math.round(scrollDepth * 100);

  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/60 p-4", className)}>
      <div className="mb-3 flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-bold">Focus Guard</h4>
        {fatigue && (
          <span className={cn("ml-auto text-xs font-medium", FATIGUE_COLOR[fatigue.state])}>
            {FATIGUE_LABEL[fatigue.state]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <FocusDial score={guard?.focusScore ?? null} />
        <div className="min-w-0 flex-1 space-y-2">
          <Meter label="Engaged" value={`${engagedSec}s / ${required}s`} pct={timePct} />
          <Meter label="Coverage" value={`${coveragePct}%`} pct={coveragePct} />
        </div>
      </div>

      {nudge && (
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs",
            severityClass(nudge.severity),
          )}
          role={nudge.severity === 3 ? "alert" : "status"}
        >
          <span className="mt-0.5">{nudgeIcon(nudge.kind)}</span>
          <div className="min-w-0">
            <p className="font-semibold">{nudge.title}</p>
            <p className="opacity-90">{nudge.body}</p>
            {fatigue?.shouldBreak && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-xs"
                onClick={onTakeBreak}
              >
                <Coffee className="mr-1 h-3 w-3" /> Take a 5-minute break
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
        Focus Guard weighs reviews by the attention behind them — guarding against drive-by
        verdicts and decision fatigue. Grounded in attention-restoration and judgement research.
      </p>
    </div>
  );
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}
