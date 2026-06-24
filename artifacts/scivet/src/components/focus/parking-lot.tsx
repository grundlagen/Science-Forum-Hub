import { useState } from "react";
import type { FocusDistraction, DistractionKind } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Inbox, Send } from "lucide-react";
import { DISTRACTION_KINDS } from "@/lib/focus-config";

interface ParkingLotProps {
  distractions: FocusDistraction[];
  onPark: (text: string, kind: DistractionKind) => void;
  isParking?: boolean;
}

/**
 * The distraction parking lot — capture an intrusive thought, then let it go.
 * Offloading an open loop (the Zeigarnik effect) is what stops it from stealing
 * working memory for the rest of the session.
 */
export function ParkingLot({ distractions, onPark, isParking }: ParkingLotProps) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<DistractionKind>("thought");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onPark(trimmed, kind);
    setText("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        Parking lot
        {distractions.length > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {distractions.length} parked
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Something pulling your attention? Park it here and stay on task — you can
        deal with it after the session.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. reply to that email later"
          className="flex-1"
        />
        <div className="flex gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as DistractionKind)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTRACTION_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            onClick={submit}
            disabled={isParking || !text.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {distractions.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto pt-1">
          {[...distractions].reverse().map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
            >
              <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                {d.kind}
              </Badge>
              <span className="text-muted-foreground">{d.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
