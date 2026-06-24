import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFocusPreferences,
  useGetActiveFocusSession,
  useGetFocusStats,
  useListFocusSessions,
  getGetActiveFocusSessionQueryKey,
  getGetFocusStatsQueryKey,
  getListFocusSessionsQueryKey,
  type FocusSession,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Settings2, Target, History } from "lucide-react";
import { StartPanel } from "@/components/focus/start-panel";
import { ActivePanel } from "@/components/focus/active-panel";
import { StatsPanel } from "@/components/focus/stats-panel";
import { PreferencesDialog } from "@/components/focus/preferences-dialog";
import { formatMinutes, getTechnique } from "@/lib/focus-config";

const STATUS_STYLES: Record<FocusSession["status"], string> = {
  completed: "text-emerald-600 border-emerald-600/30",
  active: "text-primary border-primary/30",
  abandoned: "text-muted-foreground",
  expired: "text-muted-foreground",
};

function RecentSessions({ sessions }: { sessions: FocusSession[] }) {
  const finished = sessions.filter((s) => s.status !== "active");
  if (finished.length === 0) return null;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4 text-muted-foreground" />
          Recent sessions
        </div>
        <ul className="divide-y">
          {finished.slice(0, 8).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm">{s.intention}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(s.startedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {getTechnique(s.technique).label} ·{" "}
                  {formatMinutes(Math.round(s.focusSeconds / 60))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.focusRating != null && (
                  <span className="text-xs text-muted-foreground">
                    flow {s.focusRating}/5
                  </span>
                )}
                <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_STYLES[s.status]}`}>
                  {s.status}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function Focus() {
  const { isSignedIn, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/");
  }, [isLoaded, isSignedIn, setLocation]);

  const enabled = !!isSignedIn;
  const prefsQuery = useGetFocusPreferences({ query: { enabled } });
  const activeQuery = useGetActiveFocusSession({ query: { enabled } });
  const statsQuery = useGetFocusStats({ query: { enabled } });
  const recentQuery = useListFocusSessions(
    { status: "all", limit: 8 },
    { query: { enabled } },
  );

  if (!isLoaded || !isSignedIn) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetActiveFocusSessionQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFocusStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
  };

  const prefs = prefsQuery.data;
  const active = activeQuery.data?.session ?? null;
  const loading = prefsQuery.isLoading || activeQuery.isLoading;

  return (
    <Layout>
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 font-serif text-3xl font-bold text-foreground">
              <Target className="h-7 w-7 text-primary" />
              Focus Guard
            </h1>
            <p className="text-muted-foreground">
              Protect your attention for the deep work science actually requires.
            </p>
          </div>
          {prefs && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setPrefsOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Preferences</span>
            </Button>
          )}
        </div>

        {loading || !prefs ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-[420px] rounded-xl" />
            <Skeleton className="h-[420px] rounded-xl" />
          </div>
        ) : active ? (
          <ActivePanel session={active} prefs={prefs} onEnded={refresh} />
        ) : (
          <StartPanel prefs={prefs} onStarted={refresh} />
        )}

        <Separator className="my-10" />

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            {statsQuery.data ? (
              <StatsPanel stats={statsQuery.data} />
            ) : (
              <Skeleton className="h-64 rounded-xl" />
            )}
          </div>
          <div>
            {recentQuery.data && <RecentSessions sessions={recentQuery.data} />}
          </div>
        </div>
      </div>

      {prefs && (
        <PreferencesDialog
          prefs={prefs}
          open={prefsOpen}
          onOpenChange={setPrefsOpen}
        />
      )}
    </Layout>
  );
}
