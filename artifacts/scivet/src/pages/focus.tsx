import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { FocusConsole } from "@/components/focus-console";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Flame, Target, Brain, Timer } from "lucide-react";
import {
  useGetFocusStats,
  useGetFocusRecommendation,
  useListFocusSessions,
  useStartFocusSession,
  useGetPaper,
  FocusGoalType,
  FocusTechnique,
  type FocusSession,
} from "@workspace/api-client-react";

const GOAL_LABELS: Record<string, string> = {
  read: "Read",
  review: "Review",
  revise: "Revise",
  explore: "Explore",
};

const TECHNIQUE_LABELS: Record<string, string> = {
  pomodoro: "Pomodoro · 25/5",
  deep_work: "Deep Work · 50/10",
  flowtime: "Flowtime",
  timeboxed: "Timeboxed",
};

export default function Focus() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const queryClient = useQueryClient();

  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const paperIdParam = params.get("paperId");
  const paperId = paperIdParam ? Number(paperIdParam) : null;
  const goalParam = (params.get("goal") as keyof typeof FocusGoalType) || null;

  // Form state
  const [goalType, setGoalType] = useState<FocusGoalType>(
    goalParam && FocusGoalType[goalParam] ? FocusGoalType[goalParam] : paperId ? FocusGoalType.review : FocusGoalType.read,
  );
  const [technique, setTechnique] = useState<FocusTechnique>(FocusTechnique.pomodoro);
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [intent, setIntent] = useState("");
  const [customized, setCustomized] = useState(false);
  const [activeOverride, setActiveOverride] = useState<FocusSession | null>(null);

  const statsQ = useGetFocusStats({ query: { enabled: !!isSignedIn } });
  const recQ = useGetFocusRecommendation({ goalType }, { query: { enabled: !!isSignedIn } });
  const sessionsQ = useListFocusSessions({ limit: 20 }, { query: { enabled: !!isSignedIn } });
  const paperQ = useGetPaper(paperId ?? 0, { query: { enabled: !!isSignedIn && !!paperId } });
  const startMut = useStartFocusSession();

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/");
  }, [isLoaded, isSignedIn, setLocation]);

  // Apply the recommendation as the starting point whenever the goal changes,
  // unless the researcher has hand-tuned the plan.
  const rec = recQ.data;
  useEffect(() => {
    if (!rec) return;
    if (!customized) {
      setTechnique(rec.technique);
      setPlannedMinutes(rec.focusMinutes);
      setBreakMinutes(rec.breakMinutes);
    }
    setIntent((prev) => (prev.trim() === "" ? rec.intentTemplate : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.technique, rec?.focusMinutes, rec?.breakMinutes, rec?.intentTemplate, customized]);

  const derivedActive = useMemo(
    () => sessionsQ.data?.find((s) => s.status === "active" || s.status === "paused") ?? null,
    [sessionsQ.data],
  );
  const activeSession = activeOverride ?? derivedActive;

  const invalidateFocus = () => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/focus") });
  };

  const handleStart = () => {
    if (!intent.trim()) {
      toast.error("State an intention first — it's the commitment that makes this work.");
      return;
    }
    startMut.mutate(
      {
        data: {
          paperId: paperId ?? null,
          goalType,
          technique,
          intent: intent.trim(),
          plannedMinutes,
          breakMinutes,
        },
      },
      {
        onSuccess: (session) => {
          setActiveOverride(session);
          invalidateFocus();
        },
        onError: () => toast.error("Could not start the session. Try again."),
      },
    );
  };

  if (!isLoaded || !isSignedIn) return null;

  const stats = statsQ.data;
  const goalPct = stats && stats.dailyGoalMinutes > 0
    ? Math.min(100, Math.round((stats.todayFocusMinutes / stats.dailyGoalMinutes) * 100))
    : 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold flex items-center gap-3">
            <Brain className="h-7 w-7 text-primary" /> FocusGuard
          </h1>
          <p className="text-muted-foreground mt-1">
            Deep reading is a skill. Commit to an intention, guard your attention, and let your
            reviews carry the weight of real focus.
          </p>
        </div>

        {/* Stats strip */}
        {statsQ.isLoading ? (
          <Skeleton className="h-24 w-full mb-8 rounded-xl" />
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={<Flame className="h-4 w-4" />} label="Current streak" value={`${stats.streakCount}d`} sub={`best ${stats.longestStreak}d`} />
            <StatCard icon={<Timer className="h-4 w-4" />} label="Today" value={`${stats.todayFocusMinutes}m`} sub={`goal ${stats.dailyGoalMinutes}m`}>
              <Progress value={goalPct} className="h-1.5 mt-2" />
            </StatCard>
            <StatCard icon={<Brain className="h-4 w-4" />} label="Deep reviews" value={`${stats.deepReviews}`} sub={`${stats.completedSessions} sessions`} />
            <StatCard icon={<Target className="h-4 w-4" />} label="Total focus" value={`${Math.round(stats.totalFocusMinutes / 60)}h`} sub={stats.avgFlowRating != null ? `flow ${stats.avgFlowRating}/5` : "—"} />
          </div>
        ) : null}

        {activeSession ? (
          <FocusConsole
            session={activeSession}
            onCompleted={(result) => {
              setActiveOverride(null);
              invalidateFocus();
              toast.success(result.encouragement);
            }}
            onAbandoned={() => {
              setActiveOverride(null);
              invalidateFocus();
            }}
          />
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Start form */}
            <div className="md:col-span-2 bg-card border rounded-2xl p-6 shadow-sm space-y-5">
              <h2 className="font-bold text-lg">Start a focus session</h2>

              {paperId ? (
                <div className="text-sm rounded-lg bg-muted/40 border px-3 py-2">
                  Focusing on{" "}
                  <span className="font-medium">{paperQ.data?.paper.title ?? `paper #${paperId}`}</span>
                </div>
              ) : null}

              <Field label="I intend to…">
                <div className="flex flex-wrap gap-2">
                  {Object.values(FocusGoalType).map((g) => (
                    <Chip key={g} active={goalType === g} onClick={() => setGoalType(g)}>
                      {GOAL_LABELS[g]}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label="My intention (if-then plan)">
                <Textarea
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="When I start, I will…"
                  className="h-20 text-sm"
                />
              </Field>

              <Field label="Technique">
                <div className="flex flex-wrap gap-2">
                  {Object.values(FocusTechnique).map((t) => (
                    <Chip
                      key={t}
                      active={technique === t}
                      onClick={() => {
                        setTechnique(t);
                        setCustomized(true);
                      }}
                    >
                      {TECHNIQUE_LABELS[t]}
                    </Chip>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label={`Focus block · ${plannedMinutes} min`}>
                  <input
                    type="range"
                    min={5}
                    max={90}
                    step={5}
                    value={plannedMinutes}
                    onChange={(e) => {
                      setPlannedMinutes(Number(e.target.value));
                      setCustomized(true);
                    }}
                    className="w-full accent-primary"
                  />
                </Field>
                <Field label={`Break · ${breakMinutes} min`}>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={breakMinutes}
                    onChange={(e) => {
                      setBreakMinutes(Number(e.target.value));
                      setCustomized(true);
                    }}
                    className="w-full accent-primary"
                  />
                </Field>
              </div>

              <Button className="w-full" size="lg" disabled={startMut.isPending} onClick={handleStart}>
                Begin {plannedMinutes}-minute session
              </Button>
            </div>

            {/* Recommendation + recent */}
            <div className="space-y-6">
              {rec && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                    Why this plan
                  </p>
                  <p className="text-sm text-foreground/80 mb-3">{rec.rationale}</p>
                  <p className="text-xs text-muted-foreground">
                    Best window: {rec.suggestedWindow}
                  </p>
                </div>
              )}

              <div className="bg-card border rounded-2xl p-5">
                <p className="text-sm font-semibold mb-3">Recent sessions</p>
                {sessionsQ.data && sessionsQ.data.length > 0 ? (
                  <ul className="space-y-2">
                    {sessionsQ.data.slice(0, 6).map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="capitalize text-[10px]">
                            {GOAL_LABELS[s.goalType] ?? s.goalType}
                          </Badge>
                          <span className="truncate text-muted-foreground">{s.intent}</span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {Math.round(s.focusedSeconds / 60)}m
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No sessions yet. Your first one is the hardest to start — and the most worth it.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
