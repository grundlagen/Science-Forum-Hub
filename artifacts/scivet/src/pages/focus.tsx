import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  useGetActiveFocusSession,
  useGetFocusStats,
  useListFocusSessions,
  useStartFocusSession,
  useEndFocusSession,
  useCreateFocusCapture,
  useResolveFocusCapture,
  useGetFocusSettings,
  useUpdateFocusSettings,
  useGetPaper,
  getGetActiveFocusSessionQueryKey,
  getGetFocusStatsQueryKey,
  getGetFocusSettingsQueryKey,
  getListFocusSessionsQueryKey,
  type FocusSettings,
  type FocusSession,
  type FocusSessionEndResult,
  type FocusCapture,
  type FocusFelt,
  type FocusLockMode,
  type FocusCaptureKind,
  type FocusCaptureResolution,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Anchor, BookOpen, Brain, Check, Feather, NotebookPen, Search, Settings2, Timer, Wind, X } from "lucide-react";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useFocusInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: getGetActiveFocusSessionQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFocusStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
  };
}

const OUTCOME_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  completed: { label: "Completed", variant: "default" },
  overran: { label: "Overran", variant: "secondary" },
  abandoned: { label: "Stopped early", variant: "outline" },
  expired: { label: "Auto-closed", variant: "outline" },
};

// ---------------------------------------------------------------------------
// Start view: the implementation-intention form (Gollwitzer 1999)
// ---------------------------------------------------------------------------

function StartView({ onStarted }: { onStarted: () => void }) {
  const { toast } = useToast();
  const search = useSearch();
  const { data: settings } = useGetFocusSettings();
  const { data: stats } = useGetFocusStats();
  const { data: history } = useListFocusSessions({ limit: 8 });
  const startSession = useStartFocusSession();

  const [intention, setIntention] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [lockMode, setLockMode] = useState<FocusLockMode | null>(null);
  const [paperUnlinked, setPaperUnlinked] = useState(false);

  const paperParam = new URLSearchParams(search).get("paper");
  const requestedPaperId = paperParam && /^\d+$/.test(paperParam) ? Number(paperParam) : null;
  const { data: linkedPaper } = useGetPaper(requestedPaperId ?? 0, {
    query: { enabled: requestedPaperId != null },
  });
  const paperId = paperUnlinked ? null : requestedPaperId;

  const suggested = stats?.suggestedMinutes;
  const effectiveMinutes = minutes ?? suggested ?? settings?.defaultMinutes ?? 25;
  const effectiveLock = lockMode ?? settings?.defaultLockMode ?? "gentle";
  const suggestionDiffers =
    suggested != null && settings != null && suggested !== settings.defaultMinutes;

  const weeklyProgress = stats
    ? Math.min(100, Math.round((stats.minutesThisWeek / Math.max(1, stats.weeklyTargetMinutes)) * 100))
    : 0;

  const handleStart = () => {
    startSession.mutate(
      {
        data: {
          intention: intention.trim(),
          plannedMinutes: effectiveMinutes,
          lockMode: effectiveLock,
          paperId,
        },
      },
      {
        onSuccess: () => onStarted(),
        onError: (err) =>
          toast({
            title: "Couldn't start the session",
            description: err instanceof Error ? err.message : "Try again in a moment.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 font-serif">
                <Brain className="h-5 w-5" /> Begin a focus session
              </CardTitle>
              <CardDescription>
                One concrete sentence about what you will do. A specific plan is the single most
                reliable lever for following through.
              </CardDescription>
            </div>
            {settings && <SettingsDialog settings={settings} />}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {paperId != null && linkedPaper && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <Link
                href={`/papers/${paperId}`}
                className="flex items-center gap-2 text-sm min-w-0 hover:underline"
              >
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{linkedPaper.paper.title}</span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-7 px-2"
                onClick={() => setPaperUnlinked(true)}
                title="Unlink this paper"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="intention">Your intention</Label>
            <Textarea
              id="intention"
              placeholder='I will read the methods section and decide whether the sample supports the claim…'
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              maxLength={280}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{intention.length}/280</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Duration</Label>
              <span className="text-sm font-medium tabular-nums">{effectiveMinutes} min</span>
            </div>
            <Slider
              min={10}
              max={90}
              step={5}
              value={[effectiveMinutes]}
              onValueChange={([v]) => setMinutes(v)}
            />
            <p className="text-xs text-muted-foreground">
              10–90 minutes. Attention runs in ~90-minute cycles; past that you're borrowing from
              the next session.
            </p>
            {suggestionDiffers && minutes == null && (
              <p className="text-xs text-primary">
                Suggested {suggested} min based on how your recent sessions felt — slide to override.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>If you try to leave early…</Label>
            <RadioGroup
              value={effectiveLock}
              onValueChange={(v) => setLockMode(v as FocusLockMode)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${effectiveLock === "gentle" ? "border-primary bg-primary/5" : ""}`}
              >
                <RadioGroupItem value="gentle" className="mt-1" />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-sm">
                    <Feather className="h-3.5 w-3.5" /> Gentle
                  </span>
                  <span className="text-xs text-muted-foreground">
                    A reminder of your intention, then you're free to go.
                  </span>
                </span>
              </label>
              <label
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${effectiveLock === "ulysses" ? "border-primary bg-primary/5" : ""}`}
              >
                <RadioGroupItem value="ulysses" className="mt-1" />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-sm">
                    <Anchor className="h-3.5 w-3.5" /> Ulysses
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Leaving early asks for one honest line about why. Tie yourself to the mast.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={intention.trim().length < 3 || startSession.isPending}
            onClick={handleStart}
          >
            <Timer className="h-4 w-4 mr-2" />
            {startSession.isPending ? "Starting…" : `Focus for ${effectiveMinutes} minutes`}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-serif">This week</CardTitle>
            <CardDescription>Monday to Monday. No daily streaks — rest is part of the method.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats ? (
              <>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Focused minutes</span>
                    <span className="font-medium tabular-nums">
                      {stats.minutesThisWeek} / {stats.weeklyTargetMinutes}
                    </span>
                  </div>
                  <Progress value={weeklyProgress} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">Sessions</dt>
                    <dd className="font-medium">{stats.sessionsThisWeek}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Weekly cadence</dt>
                    <dd className="font-medium">
                      {stats.weeksActive} {stats.weeksActive === 1 ? "week" : "weeks"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Finish rate (28d)</dt>
                    <dd className="font-medium">
                      {stats.completionRate == null ? "—" : `${Math.round(stats.completionRate * 100)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Thoughts parked</dt>
                    <dd className="font-medium">{stats.capturesParked}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <Skeleton className="h-28 w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-serif">Recent sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history?.length === 0 && (
              <p className="text-sm text-muted-foreground">Your first session starts above.</p>
            )}
            {history?.map((s) => (
              <SessionHistoryRow key={s.id} session={s} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsDialog({ settings }: { settings: FocusSettings }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSettings = useUpdateFocusSettings();
  const [open, setOpen] = useState(false);
  const [defaultMinutes, setDefaultMinutes] = useState(settings.defaultMinutes);
  const [weeklyTarget, setWeeklyTarget] = useState(settings.weeklyTargetMinutes);
  const [defaultLockMode, setDefaultLockMode] = useState<FocusLockMode>(settings.defaultLockMode);
  const [quietFeed, setQuietFeed] = useState(settings.quietFeed);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDefaultMinutes(settings.defaultMinutes);
      setWeeklyTarget(settings.weeklyTargetMinutes);
      setDefaultLockMode(settings.defaultLockMode);
      setQuietFeed(settings.quietFeed);
    }
    setOpen(next);
  };

  const handleSave = () => {
    updateSettings.mutate(
      {
        data: {
          defaultMinutes,
          weeklyTargetMinutes: Math.min(2400, Math.max(10, weeklyTarget)),
          defaultLockMode,
          quietFeed,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFocusSettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetFocusStatsQueryKey() });
          setOpen(false);
        },
        onError: () => toast({ title: "Couldn't save settings", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="ghost" size="sm" onClick={() => handleOpenChange(true)} title="Focus Guard settings">
        <Settings2 className="h-4 w-4" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Focus Guard settings</DialogTitle>
          <DialogDescription>
            Your goals, your numbers. Nothing here ever auto-escalates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Default session length</Label>
              <span className="text-sm font-medium tabular-nums">{defaultMinutes} min</span>
            </div>
            <Slider
              min={10}
              max={90}
              step={5}
              value={[defaultMinutes]}
              onValueChange={([v]) => setDefaultMinutes(v)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="weekly-target">Weekly target (minutes)</Label>
            <Input
              id="weekly-target"
              type="number"
              min={10}
              max={2400}
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Measured Monday to Monday. A modest target you hit beats an ambitious one you dread.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default leaving mode</Label>
            <div className="flex gap-2">
              {(
                [
                  ["gentle", Feather, "Gentle"],
                  ["ulysses", Anchor, "Ulysses"],
                ] as const
              ).map(([mode, Icon, label]) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={defaultLockMode === mode ? "default" : "outline"}
                  onClick={() => setDefaultLockMode(mode)}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="quiet-feed">Quiet the feed while focusing</Label>
              <p className="text-xs text-muted-foreground">
                Dims and disables the feed during sessions. The slot machine can wait.
              </p>
            </div>
            <Switch id="quiet-feed" checked={quietFeed} onCheckedChange={setQuietFeed} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionHistoryRow({ session }: { session: FocusSession }) {
  const outcome = session.outcome ? OUTCOME_LABELS[session.outcome] : null;
  const minutes = session.actualSeconds != null ? Math.round(session.actualSeconds / 60) : null;
  return (
    <div className="flex items-start justify-between gap-3 border-b last:border-b-0 pb-3 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm truncate" title={session.intention}>
          {session.intention}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(session.startedAt).toLocaleDateString()}
          {minutes != null && ` · ${minutes} min`}
          {session.captureCount > 0 && ` · ${session.captureCount} parked`}
        </p>
      </div>
      {outcome && (
        <Badge variant={outcome.variant} className="shrink-0">
          {outcome.label}
        </Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live view: the timer, the echoed intention, and the capture pad (Zeigarnik
// parking lot — write the thought down and the mind lets it go)
// ---------------------------------------------------------------------------

function LiveView({
  session,
  initialRemaining,
  onEnded,
}: {
  session: FocusSession;
  initialRemaining: number;
  onEnded: (result: FocusSessionEndResult) => void;
}) {
  const { toast } = useToast();
  const [remaining, setRemaining] = useState(initialRemaining);
  const [captureBody, setCaptureBody] = useState("");
  const [captureKind, setCaptureKind] = useState<FocusCaptureKind>("thought");
  const [parkedCount, setParkedCount] = useState(session.captureCount);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const createCapture = useCreateFocusCapture();

  useEffect(() => {
    setRemaining(initialRemaining);
    const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(tick);
  }, [initialRemaining, session.id]);

  const plannedSeconds = session.plannedMinutes * 60;
  const elapsedPct = Math.min(100, Math.round(((plannedSeconds - remaining) / plannedSeconds) * 100));
  const timeUp = remaining === 0;

  const handlePark = () => {
    const body = captureBody.trim();
    if (!body) return;
    createCapture.mutate(
      { id: session.id, data: { body, kind: captureKind } },
      {
        onSuccess: () => {
          setCaptureBody("");
          setParkedCount((n) => n + 1);
          toast({ title: "Parked.", description: "It'll be waiting after the session. Back to it." });
        },
        onError: () => toast({ title: "Couldn't park that thought", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="text-center">
        <CardContent className="pt-10 pb-8 space-y-6">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">You said you would</p>
          <p className="text-lg font-serif italic">“{session.intention}”</p>
          {session.paperTitle && (
            <p className="text-sm text-muted-foreground">
              on <span className="font-medium">{session.paperTitle}</span>
            </p>
          )}
          <div className="text-7xl font-bold tabular-nums tracking-tight">
            {timeUp ? "0:00" : formatClock(remaining)}
          </div>
          <Progress value={elapsedPct} className="max-w-sm mx-auto" />
          <p className="text-sm text-muted-foreground">
            {timeUp
              ? "Time's up — close it out whenever you're ready."
              : `${session.plannedMinutes}-minute session · ${parkedCount} ${parkedCount === 1 ? "thought" : "thoughts"} parked`}
          </p>
          <Button
            variant={timeUp ? "default" : "outline"}
            size="lg"
            onClick={() => setShowEndDialog(true)}
          >
            {timeUp ? (
              <>
                <Check className="h-4 w-4 mr-2" /> Close the session
              </>
            ) : (
              "End session…"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-serif flex items-center gap-2">
            <NotebookPen className="h-4 w-4" /> Parking lot
          </CardTitle>
          <CardDescription>
            Intruding thought? Write it down and it stops knocking. It'll be here after.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="reply to Dana / look up Bonferroni correction…"
              value={captureBody}
              maxLength={500}
              onChange={(e) => setCaptureBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePark();
              }}
            />
            <Button
              variant="secondary"
              onClick={handlePark}
              disabled={!captureBody.trim() || createCapture.isPending}
            >
              Park it
            </Button>
          </div>
          <div className="flex gap-2 mt-3">
            {(
              [
                ["thought", Brain, "Thought"],
                ["todo", Check, "To-do"],
                ["lookup", Search, "Look up"],
              ] as const
            ).map(([kind, Icon, label]) => (
              <Button
                key={kind}
                size="sm"
                variant={captureKind === kind ? "default" : "outline"}
                onClick={() => setCaptureKind(kind)}
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <EndSessionDialog
        session={session}
        remaining={remaining}
        open={showEndDialog}
        onOpenChange={setShowEndDialog}
        onEnded={onEnded}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Closure ceremony (attentional residue: end with a declared outcome and a
// ready-to-resume note, not a closed tab)
// ---------------------------------------------------------------------------

function EndSessionDialog({
  session,
  remaining,
  open,
  onOpenChange,
  onEnded,
}: {
  session: FocusSession;
  remaining: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnded: (result: FocusSessionEndResult) => void;
}) {
  const { toast } = useToast();
  const endSession = useEndFocusSession();
  const [felt, setFelt] = useState<FocusFelt | null>(null);
  const [closingNote, setClosingNote] = useState("");
  const [abandonReason, setAbandonReason] = useState("");

  const endingEarly = remaining > 0;
  const action = endingEarly ? "abandon" : "complete";
  const needsReason = endingEarly && session.lockMode === "ulysses";

  const handleEnd = (finalAction: "complete" | "abandon") => {
    endSession.mutate(
      {
        id: session.id,
        data: {
          action: finalAction,
          felt,
          closingNote: closingNote.trim() || null,
          abandonReason: abandonReason.trim() || null,
        },
      },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          onEnded(result);
        },
        onError: (err) =>
          toast({
            title: "Couldn't end the session",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">
            {endingEarly ? "Stopping early" : "Close the session"}
          </DialogTitle>
          <DialogDescription>
            {endingEarly
              ? `You said: “${session.intention}” — there are ${formatClock(remaining)} left. Stopping is allowed; it just shouldn't be an accident.`
              : "Well held. Two quick questions and you're on your break."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsReason && (
            <div className="space-y-2">
              <Label htmlFor="abandon-reason">Why are you stopping? (you asked to be asked)</Label>
              <Input
                id="abandon-reason"
                placeholder="One honest line…"
                value={abandonReason}
                onChange={(e) => setAbandonReason(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>How did it feel?</Label>
            <div className="flex gap-2">
              {(
                [
                  ["too_easy", "Too easy"],
                  ["engaged", "Engaged"],
                  ["overwhelmed", "Overwhelmed"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={felt === value ? "default" : "outline"}
                  onClick={() => setFelt(felt === value ? null : value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closing-note">Where did you leave off? (optional)</Label>
            <Textarea
              id="closing-note"
              placeholder="Finished §3; next time start with the regression table…"
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              A one-line resume note keeps this session from haunting the next thing you do.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep focusing
          </Button>
          <Button
            onClick={() => handleEnd(action)}
            disabled={endSession.isPending || (needsReason && !abandonReason.trim())}
          >
            {endingEarly ? "Stop the session" : "Complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Summary: factual closure copy, break suggestion (ART: away from the feed),
// and capture triage — where "let it go" is a first-class resolution
// ---------------------------------------------------------------------------

function SummaryView({ result, onDone }: { result: FocusSessionEndResult; onDone: () => void }) {
  const [captures, setCaptures] = useState<FocusCapture[]>(result.captures);
  const resolveCapture = useResolveFocusCapture();

  const handleResolve = (capture: FocusCapture, resolution: FocusCaptureResolution) => {
    resolveCapture.mutate(
      { id: capture.id, data: { resolution } },
      {
        onSuccess: (updated) =>
          setCaptures((rows) => rows.map((c) => (c.id === updated.id ? updated : c))),
      },
    );
  };

  const unresolved = captures.filter((c) => !c.resolution);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="text-center">
        <CardContent className="pt-10 pb-8 space-y-4">
          <Wind className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-lg font-serif">{result.message}</p>
          <p className="text-sm text-muted-foreground">
            Suggested break: <span className="font-medium">{result.suggestBreakMinutes} minutes</span> —
            window, walk, water. The feed will keep.
          </p>
        </CardContent>
      </Card>

      {captures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-serif">Triage your parked thoughts</CardTitle>
            <CardDescription>
              Most parked thoughts deserve to be let go. Letting go counts as resolving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {captures.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 border-b last:border-b-0 pb-3 last:pb-0"
              >
                <div className="min-w-0">
                  <p className={`text-sm ${c.resolution ? "line-through text-muted-foreground" : ""}`}>
                    {c.body}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{c.kind.replace("_", " ")}</p>
                </div>
                {c.resolution ? (
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {c.resolution.replace("_", " ")}
                  </Badge>
                ) : (
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleResolve(c, "done")}>
                      Done
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleResolve(c, "kept")}>
                      Keep
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleResolve(c, "let_go")}>
                      Let go
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="text-center">
        <Button variant="outline" onClick={onDone}>
          {unresolved.length > 0 ? "Leave the rest and move on" : "Back to Focus Guard"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Focus() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const invalidate = useFocusInvalidation();
  const [summary, setSummary] = useState<FocusSessionEndResult | null>(null);

  const { data: active, isLoading } = useGetActiveFocusSession({
    query: { enabled: isLoaded && !!isSignedIn, refetchInterval: 60_000 },
  });

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/");
  }, [isLoaded, isSignedIn, setLocation]);

  const view = useMemo(() => {
    if (summary) {
      return (
        <SummaryView
          result={summary}
          onDone={() => {
            setSummary(null);
            invalidate();
          }}
        />
      );
    }
    if (isLoading || !active) {
      return (
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      );
    }
    if (active.session) {
      return (
        <LiveView
          session={active.session}
          initialRemaining={active.remainingSeconds ?? 0}
          onEnded={(result) => {
            setSummary(result);
            invalidate();
          }}
        />
      );
    }
    return <StartView onStarted={invalidate} />;
  }, [summary, isLoading, active, invalidate]);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-serif font-bold flex items-center gap-3">
            <Timer className="h-7 w-7" /> Focus Guard
          </h1>
          <p className="text-muted-foreground mt-1">
            {new Date().getDay() === 1
              ? "A fresh week, a clean slate. Bounded, intentional reading sessions — the feed is calibrated to win; this page takes your side."
              : "Bounded, intentional reading sessions. The feed is calibrated to win; this page takes your side."}
          </p>
        </div>
        {view}
      </div>
    </Layout>
  );
}
