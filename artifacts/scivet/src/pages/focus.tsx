import { Layout } from "@/components/layout";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Brain,
  Pause,
  Play,
  Flag,
  CheckCircle2,
  Anchor,
  Sparkles,
  Flame,
  Target,
  Timer as TimerIcon,
  ShieldCheck,
  NotebookPen,
} from "lucide-react";
import {
  useGetFocusStats,
  useGetFocusPreferences,
  useListFocusSessions,
  useGetFocusSession,
  useStartFocusSession,
  useUpdateFocusSession,
  useLogFocusDistraction,
  useResolveFocusDistraction,
  getGetFocusStatsQueryKey,
  getListFocusSessionsQueryKey,
  getGetFocusSessionQueryKey,
  FocusActivity,
  FocusCadence,
  DistractionKind,
  type FocusSession,
  type DistractionKind as DistractionKindT,
  type FocusActivity as FocusActivityT,
  type FocusCadence as FocusCadenceT,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFocusTimer } from "@/hooks/use-focus-timer";

// ── Human-readable labels (kept here so copy can stay warm & non-clinical) ─────

const ACTIVITY_LABELS: Record<FocusActivityT, string> = {
  reading: "Reading a paper",
  writing: "Writing",
  reviewing: "Reviewing",
  deep_work: "Deep work",
};

const CADENCE_LABELS: Record<FocusCadenceT, { label: string; blurb: string; work: number; brk: number }> = {
  pomodoro: { label: "Pomodoro · 25 / 5", blurb: "Short timeboxes. Best for beating the dread of starting.", work: 25, brk: 5 },
  ultradian: { label: "Ultradian · 90 / 20", blurb: "Long sprints on your natural ~90-min rhythm. Best for flow.", work: 90, brk: 20 },
  flow_state: { label: "Flow · ride it out", blurb: "No fixed breaks — stop when absorption breaks, not before.", work: 50, brk: 10 },
  custom: { label: "Custom", blurb: "Your own work / break split.", work: 25, brk: 5 },
};

const DISTRACTION_LABELS: Record<DistractionKindT, string> = {
  internal_thought: "A stray thought / to-do",
  external_interruption: "Someone or something interrupted me",
  task_switch_urge: "Urge to switch tabs / check something",
  anxiety: "Worry pulling at me",
};

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Focus() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { data: stats, isLoading: statsLoading } = useGetFocusStats({
    query: { enabled: isLoaded && !!isSignedIn },
  });

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/");
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-serif font-bold leading-tight">Focus Guard</h1>
              <p className="text-muted-foreground">
                Protect one block of real attention. Set an intention, guard it, reflect.
              </p>
            </div>
          </div>
        </header>

        {statsLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : stats?.activeSessionId ? (
          <ActiveSession sessionId={stats.activeSessionId} />
        ) : (
          <IdleDashboard />
        )}
      </div>
    </Layout>
  );
}

// ── Idle: stats, start a session, and recent history ─────────────────────────────

function IdleDashboard() {
  const { data: stats } = useGetFocusStats();
  const { data: prefs } = useGetFocusPreferences();
  const { data: sessions } = useListFocusSessions({ status: "all", limit: 6 });

  const goalPct =
    stats && stats.dailyGoalMinutes > 0
      ? Math.min(100, Math.round((stats.focusedMinutesToday / stats.dailyGoalMinutes) * 100))
      : 0;

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <div className="md:col-span-3 space-y-6">
        <StartPanel
          defaultCadence={(prefs?.defaultCadence ?? "pomodoro") as FocusCadenceT}
          defaultMinutes={prefs?.defaultPlannedMinutes ?? 25}
          defaultBreak={prefs?.defaultBreakMinutes ?? 5}
        />
        <HistoryPanel sessions={sessions ?? []} />
      </div>

      <div className="md:col-span-2 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" /> Today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold tabular-nums">
                  {stats?.focusedMinutesToday ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">
                  / {stats?.dailyGoalMinutes ?? 90} min goal
                </span>
              </div>
              <Progress value={goalPct} className="mt-2 h-2" />
              {stats?.goalMetToday && (
                <p className="mt-2 text-sm text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Goal met — anything more is a bonus.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Flame className="h-4 w-4 text-orange-500" />} label="Day streak" value={stats?.currentStreakDays ?? 0} />
              <Stat icon={<Sparkles className="h-4 w-4 text-violet-500" />} label="Avg flow" value={stats?.averageFlowScore ?? "—"} />
              <Stat icon={<TimerIcon className="h-4 w-4 text-sky-500" />} label="Sessions" value={stats?.sessionsCompleted ?? 0} />
              <Stat icon={<Brain className="h-4 w-4 text-rose-500" />} label="Total hrs" value={Math.round(((stats?.totalFocusedMinutes ?? 0) / 60) * 10) / 10} />
            </div>
          </CardContent>
        </Card>

        {prefs?.gentleMode && (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Gentle mode is on.</span> A broken
              streak isn't a verdict on you — it's just data. Start the next block and the streak
              starts again.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ── Start panel ──────────────────────────────────────────────────────────────────

function StartPanel({
  defaultCadence,
  defaultMinutes,
  defaultBreak,
}: {
  defaultCadence: FocusCadenceT;
  defaultMinutes: number;
  defaultBreak: number;
}) {
  const queryClient = useQueryClient();
  const start = useStartFocusSession();

  const [intention, setIntention] = useState("");
  const [activity, setActivity] = useState<FocusActivityT>("deep_work");
  const [cadence, setCadence] = useState<FocusCadenceT>(defaultCadence);
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [energyBefore, setEnergyBefore] = useState<number | null>(null);

  // Picking a cadence suggests its canonical timebox, but the user stays in control.
  function pickCadence(next: FocusCadenceT) {
    setCadence(next);
    if (next !== "custom") setMinutes(CADENCE_LABELS[next].work);
  }

  const canStart = intention.trim().length >= 3 && minutes > 0;

  function handleStart() {
    if (!canStart) {
      toast.error("Name the one thing this block is for — specificity is the whole point.");
      return;
    }
    const brk = cadence === "custom" ? defaultBreak : CADENCE_LABELS[cadence].brk;
    start.mutate(
      {
        data: {
          intention: intention.trim(),
          activity,
          cadence,
          plannedMinutes: minutes,
          breakMinutes: brk,
          energyBefore,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFocusStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
          toast.success("Block started. Everything else can wait 25 minutes.");
        },
        onError: () => toast.error("Couldn't start the session."),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" /> Start a focus block
        </CardTitle>
        <CardDescription>
          One concrete intention beats a vague "do work". Implementation intentions are the
          single most reliable nudge in the behavior-change literature — so we ask for one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="intention">My intention for this block</Label>
          <Textarea
            id="intention"
            placeholder="e.g. Read the Methods section and write down 3 things I'd challenge in review."
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            className="min-h-[72px]"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>What kind of work?</Label>
            <Select value={activity} onValueChange={(v) => setActivity(v as FocusActivityT)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FocusActivity).map((a) => (
                  <SelectItem key={a} value={a}>
                    {ACTIVITY_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <Select value={cadence} onValueChange={(v) => pickCadence(v as FocusCadenceT)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FocusCadence).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CADENCE_LABELS[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground -mt-1">{CADENCE_LABELS[cadence].blurb}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="minutes">Timebox (minutes)</Label>
            <Input
              id="minutes"
              type="number"
              min={5}
              max={180}
              value={minutes}
              onChange={(e) => {
                setMinutes(Number(e.target.value));
                setCadence("custom");
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Energy right now</Label>
            <EnergyPicker value={energyBefore} onChange={setEnergyBefore} />
          </div>
        </div>

        <Button onClick={handleStart} disabled={start.isPending} className="w-full" size="lg">
          <Play className="mr-2 h-4 w-4" />
          {start.isPending ? "Starting…" : "Begin the block"}
        </Button>
      </CardContent>
    </Card>
  );
}

function EnergyPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-9 flex-1 rounded-md border text-sm font-medium transition-colors ${
            value === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ── Active session ────────────────────────────────────────────────────────────────

function ActiveSession({ sessionId }: { sessionId: number }) {
  const queryClient = useQueryClient();
  const { data: detail, isLoading } = useGetFocusSession(sessionId);
  const update = useUpdateFocusSession();
  const logDistraction = useLogFocusDistraction();
  const resolveDistraction = useResolveFocusDistraction();

  const [phase, setPhase] = useState<"running" | "reflect">("running");
  const [flowScore, setFlowScore] = useState<number | null>(null);
  const [energyAfter, setEnergyAfter] = useState<number | null>(null);
  const [reflection, setReflection] = useState("");
  const [parkNote, setParkNote] = useState("");
  const [parkKind, setParkKind] = useState<DistractionKindT>("internal_thought");

  const session = detail?.session;
  const timer = useFocusTimer(sessionId, session?.focusedSeconds ?? 0);

  if (isLoading || !session) {
    return <Skeleton className="h-72 w-full" />;
  }

  const plannedSeconds = session.plannedMinutes * 60;
  const pct = Math.min(100, Math.round((timer.seconds / plannedSeconds) * 100));
  const overrun = timer.seconds > plannedSeconds;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetFocusStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFocusSessionQueryKey(sessionId) });
  }

  function syncTime(status?: "active" | "paused") {
    update.mutate({
      id: sessionId,
      data: { focusedSeconds: timer.seconds, ...(status ? { status } : {}) },
    });
  }

  function handlePause() {
    timer.pause();
    update.mutate(
      { id: sessionId, data: { status: "paused", focusedSeconds: timer.seconds } },
      { onSuccess: invalidateAll },
    );
  }

  function handleResume() {
    timer.start();
    update.mutate({ id: sessionId, data: { status: "active" } }, { onSuccess: invalidateAll });
  }

  function handleComplete() {
    const total = timer.finalize();
    update.mutate(
      { id: sessionId, data: { status: "completed", focusedSeconds: total } },
      {
        onSuccess: () => {
          invalidateAll();
          setPhase("reflect");
        },
      },
    );
  }

  function handleAbandon() {
    const total = timer.finalize();
    update.mutate(
      { id: sessionId, data: { status: "abandoned", focusedSeconds: total } },
      {
        onSuccess: () => {
          timer.clear();
          invalidateAll();
          toast("Block closed. No penalty — you showed up, and that counts.");
        },
      },
    );
  }

  function handlePark() {
    if (!parkNote.trim()) return;
    logDistraction.mutate(
      { id: sessionId, data: { kind: parkKind, note: parkNote.trim(), breached: false } },
      {
        onSuccess: () => {
          setParkNote("");
          queryClient.invalidateQueries({ queryKey: getGetFocusSessionQueryKey(sessionId) });
          toast("Parked. It's safe here — back to the work.");
        },
      },
    );
  }

  function saveReflection() {
    update.mutate(
      {
        id: sessionId,
        data: {
          ...(flowScore != null ? { flowScore } : {}),
          ...(energyAfter != null ? { energyAfter } : {}),
          ...(reflection.trim() ? { reflection: reflection.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          timer.clear();
          invalidateAll();
          toast.success("Logged. That reflection is how the next block gets better.");
        },
      },
    );
  }

  if (phase === "reflect") {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-primary" /> Close the loop
          </CardTitle>
          <CardDescription>
            You focused for {fmtClock(timer.seconds)}. A 20-second reflection turns a one-off
            sprint into a skill you can actually train.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>How absorbed did you feel? (flow)</Label>
            <RatingRow value={flowScore} onChange={setFlowScore} />
          </div>
          <div className="space-y-1.5">
            <Label>Energy now vs. before</Label>
            <RatingRow value={energyAfter} onChange={setEnergyAfter} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reflection">What helped or got in the way? (optional)</Label>
            <Textarea
              id="reflection"
              placeholder="e.g. The first 5 minutes were brutal, then it clicked. Phone in the other room next time."
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
            />
          </div>
          <Button onClick={saveReflection} disabled={update.isPending} className="w-full">
            Save & finish
          </Button>
        </CardContent>
      </Card>
    );
  }

  const guards = session.guards;
  const activeGuards = [
    guards.hideFeed && "Feed hidden",
    guards.muteNotifications && "Notifications muted",
    guards.grayscale && "Grayscale",
    guards.blockExternal && "Exit friction",
    guards.oneTabPledge && "One-tab pledge",
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <div className="md:col-span-3">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {timer.running ? "Focusing" : "Paused"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {ACTIVITY_LABELS[session.activity]} · {CADENCE_LABELS[session.cadence].label}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <blockquote className="border-l-2 border-primary/40 pl-3 text-lg font-serif italic">
              {session.intention}
            </blockquote>

            <div className="text-center">
              <div
                className={`font-mono text-6xl font-bold tabular-nums ${overrun ? "text-amber-500" : ""}`}
              >
                {fmtClock(timer.seconds)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                of {session.plannedMinutes}:00 planned{overrun ? " · in overtime" : ""}
              </div>
              <Progress value={pct} className="mt-4 h-2" />
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {timer.running ? (
                <Button variant="outline" onClick={handlePause}>
                  <Pause className="mr-2 h-4 w-4" /> Pause
                </Button>
              ) : (
                <Button variant="outline" onClick={handleResume}>
                  <Play className="mr-2 h-4 w-4" /> Resume
                </Button>
              )}
              <Button onClick={handleComplete} disabled={update.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Complete
              </Button>
              <Button variant="ghost" onClick={handleAbandon} disabled={update.isPending} className="text-muted-foreground">
                <Flag className="mr-2 h-4 w-4" /> End early
              </Button>
            </div>

            {activeGuards.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 border-t pt-4">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                {activeGuards.map((g) => (
                  <Badge key={g} variant="outline" className="text-xs font-normal">
                    {g}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Parking lot */}
      <div className="md:col-span-2">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Anchor className="h-5 w-5 text-primary" /> Parking lot
            </CardTitle>
            <CardDescription>
              A thought tugging at you? Don't chase it — park it. Offloading it quiets the loop
              so attention can come back.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={parkKind} onValueChange={(v) => setParkKind(v as DistractionKindT)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(DistractionKind).map((k) => (
                  <SelectItem key={k} value={k}>
                    {DISTRACTION_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                placeholder="Park it in a few words…"
                value={parkNote}
                onChange={(e) => setParkNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePark();
                }}
              />
              <Button onClick={handlePark} disabled={logDistraction.isPending || !parkNote.trim()}>
                Park
              </Button>
            </div>

            <div className="space-y-2 pt-1">
              {detail?.distractions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing parked yet. A clear lot is a clear mind.
                </p>
              )}
              {detail?.distractions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    resolveDistraction.mutate(
                      { id: sessionId, distractionId: d.id, data: { resolved: !d.resolved } },
                      {
                        onSuccess: () =>
                          queryClient.invalidateQueries({
                            queryKey: getGetFocusSessionQueryKey(sessionId),
                          }),
                      },
                    )
                  }
                  className={`flex w-full items-start gap-2 rounded-md border p-2 text-left text-sm transition-colors hover:bg-muted ${
                    d.resolved ? "opacity-50 line-through" : ""
                  }`}
                >
                  <CheckCircle2
                    className={`mt-0.5 h-4 w-4 shrink-0 ${d.resolved ? "text-emerald-500" : "text-muted-foreground"}`}
                  />
                  <span>{d.note}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RatingRow({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-10 flex-1 rounded-md border text-sm font-medium transition-colors ${
            value === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────────

function HistoryPanel({ sessions }: { sessions: FocusSession[] }) {
  const recent = sessions.filter((s) => s.status === "completed" || s.status === "abandoned");
  if (recent.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Recent blocks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recent.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.intention}</p>
              <p className="text-xs text-muted-foreground">
                {Math.round(s.focusedSeconds / 60)} min · {ACTIVITY_LABELS[s.activity]}
                {s.startedAt ? ` · ${formatDistanceToNow(new Date(s.startedAt), { addSuffix: true })}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {s.flowScore != null && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Sparkles className="h-3 w-3" /> {s.flowScore}/5
                </Badge>
              )}
              {s.status === "abandoned" && (
                <Badge variant="secondary" className="text-xs font-normal">
                  ended early
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
