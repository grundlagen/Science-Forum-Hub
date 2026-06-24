import { useState } from "react";
import {
  useStartFocusSession,
  type FocusPreferences,
  type FocusSessionStartInput,
  type FocusTechnique,
  type FocusIntent,
  type FocusGoalType,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Play, Sparkles } from "lucide-react";
import {
  TECHNIQUES,
  INTENTS,
  GOAL_UNIT,
  INTENTION_TEMPLATES,
  FOCUS_PRINCIPLES,
  ENERGY_LABELS,
  getTechnique,
  getIntent,
} from "@/lib/focus-config";

interface StartPanelProps {
  prefs: FocusPreferences;
  onStarted: () => void;
}

export function StartPanel({ prefs, onStarted }: StartPanelProps) {
  const start = useStartFocusSession();

  const [intention, setIntention] = useState("");
  const [technique, setTechnique] = useState<FocusTechnique>(prefs.technique);
  const [intent, setIntent] = useState<FocusIntent>("read");
  const [plannedMinutes, setPlannedMinutes] = useState(
    getTechnique(prefs.technique).focusMinutes,
  );
  const [goalType, setGoalType] = useState<FocusGoalType>(getIntent("read").goalType);
  const [goalTarget, setGoalTarget] = useState(1);
  const [field, setField] = useState("");
  const [energyBefore, setEnergyBefore] = useState<number | null>(null);

  const onTechniqueChange = (value: string) => {
    const t = value as FocusTechnique;
    setTechnique(t);
    setPlannedMinutes(getTechnique(t).focusMinutes);
  };

  const onIntentChange = (value: string) => {
    const i = value as FocusIntent;
    setIntent(i);
    setGoalType(getIntent(i).goalType);
  };

  const submit = () => {
    const trimmed = intention.trim();
    if (!trimmed) {
      toast.error("Set an intention first — a concrete if-then plan is the point.");
      return;
    }
    const payload: FocusSessionStartInput = {
      intention: trimmed,
      technique,
      intent,
      plannedMinutes,
      goalType,
      goalTarget,
      field: field.trim() || null,
      energyBefore,
    };
    start.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast.success("Focus session started. Guard up.");
          onStarted();
        },
        onError: (err) =>
          toast.error(err?.data?.error || "Could not start the session."),
      },
    );
  };

  const preset = getTechnique(technique);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Set your guard</CardTitle>
          <CardDescription>
            Pre-commit before you start. Deciding the rules in advance is what
            makes them hold when attention wobbles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="intention">Intention (if-then)</Label>
            <Textarea
              id="intention"
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              placeholder="When ___, I will ___."
              rows={2}
            />
            <div className="flex flex-wrap gap-1.5">
              {INTENTION_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setIntention(t)}
                  className="rounded-full border px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  {t.length > 48 ? `${t.slice(0, 47)}…` : t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Technique</Label>
              <Select value={technique} onValueChange={onTechniqueChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TECHNIQUES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{preset.blurb}</p>
            </div>

            <div className="space-y-2">
              <Label>Focus on</Label>
              <Select value={intent} onValueChange={onIntentChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTENTS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Planned focus</Label>
              <span className="text-sm font-medium tabular-nums">
                {plannedMinutes} min
              </span>
            </div>
            <Slider
              value={[plannedMinutes]}
              min={5}
              max={240}
              step={5}
              onValueChange={([v]) => setPlannedMinutes(v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="goalTarget">
                Goal ({GOAL_UNIT[goalType]})
              </Label>
              <Input
                id="goalTarget"
                type="number"
                min={1}
                value={goalTarget}
                onChange={(e) =>
                  setGoalTarget(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field">Field (optional)</Label>
              <Input
                id="field"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="e.g. neuroscience"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Energy right now</Label>
            <div className="flex gap-2">
              {ENERGY_LABELS.map((lbl, idx) => {
                const value = idx + 1;
                const active = energyBefore === value;
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => setEnergyBefore(active ? null : value)}
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

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={submit}
            disabled={start.isPending}
          >
            <Play className="h-4 w-4" />
            {start.isPending ? "Starting…" : "Start focus session"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Why this works
        </div>
        {FOCUS_PRINCIPLES.map((p) => (
          <Card key={p.title}>
            <CardContent className="space-y-1 pt-6">
              <p className="font-medium">{p.title}</p>
              <p className="text-sm text-muted-foreground">{p.body}</p>
              <Badge variant="outline" className="mt-1 text-[10px] font-normal">
                {p.citation}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
