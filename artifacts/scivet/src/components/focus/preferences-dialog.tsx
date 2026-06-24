import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateFocusPreferences,
  getGetFocusPreferencesQueryKey,
  getGetFocusStatsQueryKey,
  type FocusPreferences,
  type FocusPreferencesInput,
  type FocusGuardRails,
  type FocusTechnique,
  type FocusSoundscape,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { TECHNIQUES, SOUNDSCAPES } from "@/lib/focus-config";

const GUARD_RAILS: { key: keyof FocusGuardRails; label: string; hint: string }[] = [
  { key: "dimFeed", label: "Dim the feed", hint: "Gray the firehose while you focus" },
  { key: "hideMetrics", label: "Hide metrics", hint: "Quiet vote counts and scores" },
  {
    key: "singleTaskLock",
    label: "Single-task lock",
    hint: "Warn when navigating off the focus subject",
  },
  { key: "parkingLot", label: "Parking lot", hint: "Capture distractions to revisit later" },
  {
    key: "breakReminders",
    label: "Break reminders",
    hint: "Prompt restorative breaks between blocks",
  },
];

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))
        }
      />
    </div>
  );
}

interface PreferencesDialogProps {
  prefs: FocusPreferences;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreferencesDialog({ prefs, open, onOpenChange }: PreferencesDialogProps) {
  const qc = useQueryClient();
  const update = useUpdateFocusPreferences();

  const [technique, setTechnique] = useState<FocusTechnique>(prefs.technique);
  const [focusMinutes, setFocusMinutes] = useState(prefs.focusMinutes);
  const [breakMinutes, setBreakMinutes] = useState(prefs.breakMinutes);
  const [longBreakMinutes, setLongBreakMinutes] = useState(prefs.longBreakMinutes);
  const [cyclesBeforeLongBreak, setCyclesBeforeLongBreak] = useState(
    prefs.cyclesBeforeLongBreak,
  );
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(prefs.dailyGoalMinutes);
  const [soundscape, setSoundscape] = useState<FocusSoundscape>(prefs.soundscape);
  const [guardRails, setGuardRails] = useState<FocusGuardRails>(prefs.guardRails);

  const save = () => {
    const payload: FocusPreferencesInput = {
      technique,
      focusMinutes,
      breakMinutes,
      longBreakMinutes,
      cyclesBeforeLongBreak,
      dailyGoalMinutes,
      soundscape,
      guardRails,
    };
    update.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast.success("Preferences saved.");
          qc.invalidateQueries({ queryKey: getGetFocusPreferencesQueryKey() });
          qc.invalidateQueries({ queryKey: getGetFocusStatsQueryKey() });
          onOpenChange(false);
        },
        onError: () => toast.error("Could not save preferences."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Focus preferences</DialogTitle>
          <DialogDescription>
            Tune the ritual to fit you. Autonomy matters — every guard is opt-in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Default technique</Label>
            <Select value={technique} onValueChange={(v) => setTechnique(v as FocusTechnique)}>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Focus (min)" value={focusMinutes} onChange={setFocusMinutes} min={5} max={180} />
            <NumberField label="Break (min)" value={breakMinutes} onChange={setBreakMinutes} min={1} max={60} />
            <NumberField label="Long break (min)" value={longBreakMinutes} onChange={setLongBreakMinutes} min={1} max={120} />
            <NumberField label="Blocks → long break" value={cyclesBeforeLongBreak} onChange={setCyclesBeforeLongBreak} min={1} max={12} />
          </div>

          <NumberField
            label="Daily focus goal (min)"
            value={dailyGoalMinutes}
            onChange={setDailyGoalMinutes}
            min={5}
            max={960}
          />

          <div className="space-y-1.5">
            <Label className="text-xs">Soundscape</Label>
            <Select value={soundscape} onValueChange={(v) => setSoundscape(v as FocusSoundscape)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOUNDSCAPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-xs">Guard rails</Label>
            {GUARD_RAILS.map((g) => (
              <div key={g.key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{g.label}</p>
                  <p className="text-xs text-muted-foreground">{g.hint}</p>
                </div>
                <Switch
                  checked={guardRails[g.key]}
                  onCheckedChange={(checked) =>
                    setGuardRails((prev) => ({ ...prev, [g.key]: checked }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
