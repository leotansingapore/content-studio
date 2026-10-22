// GOAL under a page's H1 (plan-goal), Leo only: what posting is for on the open brand, set from five chips or typed
// and read by Jev (writing-judge goal). Home mounts it; /campaigns mounts it from wave 3. ?goal=change opens the
// editor (replace); typed work waits in cs-goal-work-<scope> for this tab until Save or Cancel, and reopens it.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { chipKind, keepGoal, keepGoalWork, loadGoalWork, readGoal, type GoalWork } from "@/lib/goalRead";
import { GOAL_KINDS, goalChips, loadPositioning, type GoalKind } from "@/lib/positioning";
import { speakerFor } from "@/lib/remixBrand";
import { useUrlFlag } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";

const OPTION = "flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors [@media(pointer:coarse)]:min-h-11";
const CHIP = "min-h-8 rounded-full border px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11";
const picked = (on: boolean) => (on ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground");

export default function GoalLine() {
  const leo = useLeoUser();
  const uid = leo?.id ?? null;
  const { toast } = useToast();
  const [editing, setEditing] = useUrlFlag("goal", "change");
  const [tick, setTick] = useState(0);
  const [work, setWork] = useState<GoalWork | null>(null);
  const [busy, setBusy] = useState(false);
  const [short, setShort] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const again = () => setTick((t) => t + 1);
    window.addEventListener("content-studio-positioning-changed", again);
    return () => {
      live.current = false;
      window.removeEventListener("content-studio-positioning-changed", again);
    };
  }, []);
  // a brand switch reloads the app, so the open brand is read once per account
  const saved = useMemo(() => (uid ? loadPositioning(uid) : null), [uid, tick]);
  const chips = useMemo(() => (uid ? goalChips(speakerFor(uid)) : null), [uid]);
  // typed work left in this tab opens the editor again
  useEffect(() => {
    const kept = uid ? loadGoalWork(uid) : null;
    if (!kept) return;
    setWork(kept);
    setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!uid || !chips) return null;
  const goal = saved?.goal?.trim() ?? "";
  const w = work ?? { text: goal, unsure: false, closest: null };
  const asChip = chipKind(w.text, chips);

  const change = (next: GoalWork) => {
    setWork(next);
    setShort(false);
    keepGoalWork(uid, next);
  };
  const close = () => {
    setWork(null);
    setShort(false);
    keepGoalWork(uid, null);
    setEditing(false);
  };
  const done = (text: string, kind: GoalKind) => {
    if (!keepGoal(uid, text, kind)) {
      toast({ title: "Couldn't save the goal. This browser's storage is full." });
      return;
    }
    close();
    toast({ title: "Goal saved. New plans and campaigns follow it." });
  };
  const save = async () => {
    const text = w.text.trim();
    if (text.length < 4) return setShort(true);
    const known = asChip ?? (w.unsure ? w.closest : null) ?? (text === goal ? saved?.goalKind ?? null : null);
    if (known) return done(text, known);
    setBusy(true);
    const kind = await readGoal(text);
    if (!live.current) return; // the typed work is still kept for this tab
    setBusy(false);
    if (kind) done(text, kind);
    else change({ ...w, unsure: true, closest: null });
  };

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-primary" />
          Goal
        </span>
        <InfoTip label="About the goal">Plans, angles and campaigns are written toward this.</InfoTip>
        <span className={`min-w-0 break-words text-sm ${goal ? "text-foreground" : "text-muted-foreground"}`}>
          {goal || "Set a goal for this brand"}
        </span>
        {!editing && (
          <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setEditing(true)}>
            {goal ? "Change" : "Set goal"}
          </Button>
        )}
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="max-w-xl space-y-3 rounded-xl border border-border/70 bg-card p-4 shadow-card"
        >
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-foreground">What should posting do for you?</legend>
            <div role="radiogroup" aria-label="What should posting do for you?" className="grid gap-1.5">
              {GOAL_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={asChip === k} className={`${OPTION} ${picked(asChip === k)}`}
                  onClick={() => change({ text: chips[k], unsure: false, closest: null })}>
                  <span aria-hidden className={`h-3.5 w-3.5 shrink-0 rounded-full border ${asChip === k ? "border-[4px] border-primary" : "border-muted-foreground/60"}`} />
                  {chips[k]}
                </button>
              ))}
            </div>
            <Input value={w.text} maxLength={120} placeholder="Or write your own" aria-label="Or write your own" aria-invalid={short}
              onChange={(e) => change({ ...w, text: e.target.value })} />
            {short && <p role="alert" className="text-xs font-medium text-destructive">Write a few more words.</p>}
            {w.unsure && !asChip && (
              <div className="space-y-1.5">
                <p id="goal-closest" className="text-sm font-medium text-foreground">Which of these is closest?</p>
                <div role="radiogroup" aria-labelledby="goal-closest" className="flex flex-wrap gap-1.5">
                  {GOAL_KINDS.map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={w.closest === k} className={`${CHIP} ${picked(w.closest === k)}`}
                      onClick={() => change({ ...w, closest: k })}>
                      {chips[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (w.unsure && !asChip && !w.closest)}>
              {busy ? "Reading your goal..." : "Save goal"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
