import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateFocusSessionProgress,
  useParkFocusDistraction,
  useCompleteFocusSession,
  useAbandonFocusSession,
  getGetActiveFocusSessionQueryKey,
  getGetFocusStatsQueryKey,
  getListFocusSessionsQueryKey,
  type FocusSession,
  type FocusPreferences,
  type FocusDistraction,
  type DistractionKind,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pause,
  Play,
  Coffee,
  Flag,
  X,
  Minus,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { FocusRing } from "@/components/focus/focus-ring";
import { ParkingLot } from "@/components/focus/parking-lot";
import { useFocusSession } from "@/hooks/use-focus-session";
import {
  formatClock,
  formatMinutes,
  getTechnique,
  getIntent,
  GOAL_UNIT,
  FLOW_LABELS,
  MOODS,
} from "@/lib/focus-config";

interface ActivePanelProps {
  session: FocusSession;
  prefs: FocusPreferences;
  onEnded: () => void;
}

const GUARD_RAIL_LABELS: { key: keyof FocusPreferences["guardRails"]; label: string }[] = [
  { key: "dimFeed", label: "Feed dimmed" },
  { key: "hideMetrics", label: "Metrics hidden" },
  { key: "singleTaskLock", label: "Single-task lock" },
  { key: "breakReminders", label: "Break reminders" },
];

export function ActivePanel({ session, prefs, onEnded }: ActivePanelProps) {
  const qc = useQueryClient();
  const updateProgress = useUpdateFocusSessionProgress();
  const park = useParkFocusDistraction();
  const complete = useCompleteFocusSession();
  const abandon = useAbandonFocusSession();

  const [goalProgress, setGoalProgress] = useState(session.goalProgress);
  const [distractions, setDistractions] = useState<FocusDistraction[]>(
    session.distractions,
  );
  const [completeOpen, setCompleteOpen] = useState(false);
  const [focusRating, setFocusRating] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<string>("");
  const [reflection, setReflection] = useState("");

  const onHeartbeat = useCallback(
    (addSeconds: number) => {
      updateProgress.mutate({ id: session.id, data: { addSeconds } });
    },
    [session.id, updateProgress],
  );
  const onBreaksChange = useCallback(
    (totalBreaks: number) => {
      updateProgress.mutate({ id: session.id, data: { breaksTaken: totalBreaks } });
    },
    [session.id, updateProgress],
  );

  const timer = useFocusSession(session, prefs, { onHeartbeat, onBreaksChange });

  const preset = getTechnique(session.technique);
  const intent = getIntent(session.intent);
  const onBreak = timer.phase === "break";

  const bumpGoal = (delta: number) => {
    const next = Math.max(0, goalProgress + delta);
    setGoalProgress(next);
    updateProgress.mutate({ id: session.id, data: { goalProgress: next } });
  };

  const onPark = (text: string, kind: DistractionKind) => {
    park.mutate(
      { id: session.id, data: { text, kind } },
      {
        onSuccess: (updated) => setDistractions(updated.distractions),
        onError: () => toast.error("Could not park that — try again."),
      },
    );
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetActiveFocusSessionQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFocusStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
  };

  const onComplete = () => {
    complete.mutate(
      {
        id: session.id,
        data: {
          focusRating,
          moodAfter: moodAfter || null,
          reflection: reflection.trim() || null,
          goalProgress,
        },
      },
      {
        onSuccess: () => {
          toast.success("Session logged. Rest is part of the work.");
          setCompleteOpen(false);
          invalidateAll();
          onEnded();
        },
        onError: () => toast.error("Could not complete the session."),
      },
    );
  };

  const onAbandon = () => {
    abandon.mutate(
      { id: session.id },
      {
        onSuccess: () => {
          toast("Session ended early. No shame — recalibrate and go again.");
          invalidateAll();
          onEnded();
        },
        onError: () => toast.error("Could not end the session."),
      },
    );
  };

  const activeGuards = GUARD_RAIL_LABELS.filter((g) => prefs.guardRails[g.key]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className={onBreak ? "border-emerald-500/40" : "border-primary/40"}>
        <CardContent className="flex flex-col items-center gap-5 pt-6">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge variant="secondary">{preset.label}</Badge>
            <Badge variant="outline">{intent.label}</Badge>
            {session.field && <Badge variant="outline">{session.field}</Badge>}
          </div>

          <FocusRing
            progress={timer.phaseProgress}
            label={formatClock(timer.phaseClock)}
            caption={onBreak ? "break" : timer.goalReached ? "overtime" : "focus"}
            variant={onBreak ? "break" : "focus"}
          />

          <p className="text-center text-sm text-muted-foreground">
            {formatMinutes(Math.round(timer.elapsedFocus / 60))} focused
            {timer.cycle > 0 && ` · ${timer.cycle} block${timer.cycle > 1 ? "s" : ""} done`}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" onClick={timer.togglePause} className="gap-2">
              {timer.paused ? (
                <>
                  <Play className="h-4 w-4" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4" /> Pause
                </>
              )}
            </Button>
            {onBreak ? (
              <Button variant="outline" onClick={timer.endBreak} className="gap-2">
                <Play className="h-4 w-4" /> Back to focus
              </Button>
            ) : (
              <Button variant="outline" onClick={timer.takeBreak} className="gap-2">
                <Coffee className="h-4 w-4" /> Take a break
              </Button>
            )}
            <Button onClick={() => setCompleteOpen(true)} className="gap-2">
              <Flag className="h-4 w-4" /> Complete
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onAbandon}
              disabled={abandon.isPending}
              aria-label="Abandon session"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {activeGuards.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
              {activeGuards.map((g) => (
                <Badge key={g.key} variant="outline" className="text-[10px] font-normal">
                  {g.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Your intention
              </p>
              <p className="mt-1 font-serif text-lg leading-snug">
                “{session.intention}”
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Goal</p>
                <p className="text-xs text-muted-foreground">
                  {goalProgress} / {session.goalTarget} {GOAL_UNIT[session.goalType]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => bumpGoal(-1)}
                  disabled={goalProgress === 0}
                  aria-label="Decrease goal progress"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-lg font-semibold tabular-nums">
                  {goalProgress}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => bumpGoal(1)}
                  aria-label="Increase goal progress"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {prefs.guardRails.parkingLot && (
          <Card>
            <CardContent className="pt-6">
              <ParkingLot
                distractions={distractions}
                onPark={onPark}
                isParking={park.isPending}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close the loop</DialogTitle>
            <DialogDescription>
              A short reflection turns a session into learning. Optional, but it
              compounds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>How was your focus?</Label>
              <div className="flex gap-2">
                {FLOW_LABELS.map((lbl, idx) => {
                  const value = idx + 1;
                  const active = focusRating === value;
                  return (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setFocusRating(active ? null : value)}
                      className={`flex-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mood after</Label>
              <Select value={moodAfter} onValueChange={setMoodAfter}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {MOODS.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reflection">One thing you learned</Label>
              <Textarea
                id="reflection"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="A finding, a question, a next step…"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteOpen(false)}>
              Keep going
            </Button>
            <Button onClick={onComplete} disabled={complete.isPending}>
              {complete.isPending ? "Saving…" : "Log session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
