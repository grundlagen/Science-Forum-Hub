import type { FocusStats } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { FocusRing } from "@/components/focus/focus-ring";
import { formatMinutes } from "@/lib/focus-config";
import { Flame, Trophy, Lightbulb, Inbox, CheckCircle2 } from "lucide-react";

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-lg font-semibold leading-none tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function StatsPanel({ stats }: { stats: FocusStats }) {
  const goalProgress =
    stats.dailyGoalMinutes > 0 ? stats.todayMinutes / stats.dailyGoalMinutes : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-6 sm:flex-row sm:items-center sm:gap-6">
          <FocusRing
            size={150}
            progress={goalProgress}
            label={formatMinutes(stats.todayMinutes)}
            caption="today"
            variant={stats.goalMetToday ? "break" : "focus"}
          />
          <div className="flex-1 space-y-1 text-center sm:text-left">
            <p className="text-sm text-muted-foreground">
              Daily goal: {formatMinutes(stats.dailyGoalMinutes)}
            </p>
            <p className="text-2xl font-serif font-bold">
              {stats.goalMetToday
                ? "Goal met — nicely done."
                : `${formatMinutes(Math.max(0, stats.dailyGoalMinutes - stats.todayMinutes))} to go`}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatMinutes(stats.weekMinutes)} focused this week
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<Flame className="h-5 w-5" />}
          value={`${stats.streakDays}d`}
          label="current streak"
        />
        <Stat
          icon={<Trophy className="h-5 w-5" />}
          value={`${stats.bestStreakDays}d`}
          label="best streak"
        />
        <Stat
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={`${Math.round(stats.completionRate * 100)}%`}
          label="sessions finished"
        />
        <Stat
          icon={<Inbox className="h-5 w-5" />}
          value={stats.distractionsParked}
          label="distractions parked"
        />
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex gap-3 pt-6">
          <Lightbulb className="h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-sm leading-relaxed">{stats.insight}</p>
            <p className="text-xs italic text-muted-foreground">
              {stats.insightCitation}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
