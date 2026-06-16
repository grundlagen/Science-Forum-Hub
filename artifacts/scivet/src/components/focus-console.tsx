import { useState } from "react";
import { useFocusSession } from "@/hooks/use-focus-session";
import {
  type FocusSession,
  type FocusCompleteResult,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Pause, Play, Coffee, Zap, Flag, X } from "lucide-react";

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-8 w-8 rounded-md border text-sm transition-colors ${
              value === n
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FocusConsole({
  session,
  onCompleted,
  onAbandoned,
}: {
  session: FocusSession;
  onCompleted: (result: FocusCompleteResult) => void;
  onAbandoned: () => void;
}) {
  const fs = useFocusSession(session, { onCompleted });
  const [reflecting, setReflecting] = useState(false);
  const [focusRating, setFocusRating] = useState<number | null>(null);
  const [flowRating, setFlowRating] = useState<number | null>(null);
  const [reflection, setReflection] = useState("");

  const remaining = Math.max(0, fs.plannedSeconds - fs.focusedSeconds);
  const progress = Math.min(1, fs.focusedSeconds / fs.plannedSeconds);
  const ringSize = 220;
  const stroke = 12;
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const inBreak = fs.phase === "break";

  return (
    <div className="bg-card border rounded-2xl p-8 shadow-sm">
      {/* Intent — the implementation intention stays visible the whole session. */}
      <div className="text-center mb-6">
        <Badge variant="outline" className="mb-3 capitalize">
          {session.technique.replace("_", " ")} · {session.goalType}
        </Badge>
        <p className="font-serif text-lg italic text-foreground/90 max-w-md mx-auto">
          “{session.intent}”
        </p>
      </div>

      {/* Timer ring */}
      <div className="relative mx-auto mb-6" style={{ width: ringSize, height: ringSize }}>
        <svg width={ringSize} height={ringSize} className="-rotate-90">
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted/30"
          />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (inBreak ? 1 - fs.breakRemaining / (session.breakMinutes * 60 || 1) : progress))}
            className={inBreak ? "text-emerald-500 transition-all" : "text-primary transition-all"}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-mono font-semibold tabular-nums">
            {inBreak ? mmss(fs.breakRemaining) : mmss(remaining)}
          </span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
            {inBreak ? "Break — let attention restore" : fs.isRunning ? "Deep focus" : "Paused"}
          </span>
          {fs.reachedGoal && !inBreak && (
            <span className="text-xs text-primary mt-1">Goal reached — bank it or push on</span>
          )}
        </div>
      </div>

      {/* Live counters */}
      <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mb-6">
        <span>{Math.round(fs.focusedSeconds / 60)} min focused</span>
        <span>·</span>
        <span>{fs.distractionCount} distractions named</span>
      </div>

      {!reflecting ? (
        <div className="space-y-3">
          {inBreak ? (
            <Button className="w-full" onClick={fs.endBreak}>
              <Zap className="h-4 w-4 mr-2" /> Back to focus
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {fs.isRunning ? (
                <Button variant="outline" onClick={fs.pause}>
                  <Pause className="h-4 w-4 mr-2" /> Pause
                </Button>
              ) : (
                <Button variant="outline" onClick={fs.resume}>
                  <Play className="h-4 w-4 mr-2" /> Resume
                </Button>
              )}
              <Button variant="outline" onClick={fs.startBreak} disabled={session.breakMinutes === 0}>
                <Coffee className="h-4 w-4 mr-2" /> Take break
              </Button>
            </div>
          )}

          {/* The single most useful button: name the urge instead of acting on it. */}
          {!inBreak && (
            <Button
              variant="ghost"
              className="w-full text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              onClick={() => fs.logDistraction()}
            >
              I felt pulled away — log it &amp; stay
            </Button>
          )}

          <div className="flex gap-3 pt-2 border-t mt-2">
            <Button className="flex-1" onClick={() => setReflecting(true)}>
              <Flag className="h-4 w-4 mr-2" /> Finish session
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground"
              disabled={fs.isAbandoning}
              onClick={() => fs.abandon(onAbandoned)}
            >
              <X className="h-4 w-4 mr-2" /> Abandon
            </Button>
          </div>
        </div>
      ) : (
        // Post-session reflection — brief, self-report; powers flow/focus stats.
        <div className="space-y-4">
          <p className="text-sm font-medium text-center">How did that go?</p>
          <RatingRow label="Focus quality" value={focusRating} onChange={setFocusRating} />
          <RatingRow label="Flow / absorption" value={flowRating} onChange={setFlowRating} />
          <Textarea
            placeholder="One line of reflection (optional) — what worked, what pulled you away?"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            className="h-20 text-sm"
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setReflecting(false)}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={fs.isCompleting}
              onClick={() =>
                fs.complete({
                  focusRating,
                  flowRating,
                  reflection: reflection.trim() || null,
                })
              }
            >
              Save &amp; finish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
