// The campaign wizard's step 2 (plan-angles, Leo only): which angles the campaign pushes. Saved angles for the
// audience come first as "used before"; Suggest asks idea-dump mode "angles" for 5 more (angleSuggest.ts runs it
// outside React and keeps the rows in this tab until Confirm). Confirm keeps the 3 to 8 ticked ones for this
// audience and hands the wizard their copies; with `collapsed` the step is one row with Change.

import { useEffect, useReducer, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import ComplianceChips from "@/components/ComplianceChips";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  CAPPED_LINE, EDITED_LINE, confirmStep, jobKey, loadWork, onSuggest, pickLine, pickedRows, saveWork, startSuggest, stepRows, suggestJob,
  suggestVersion, usedInPosts, type ShownRow, type StepRow,
} from "@/lib/angleSuggest";
import { ANGLE_LIMITS, anglesFor, newAngleId, onAnglesChanged, removeAngle, restoreAngle } from "@/lib/angles";
import type { Audience } from "@/lib/audiences";
import type { Campaign } from "@/lib/campaigns";
import { scanCompliance } from "@/lib/compliance";
import { LABEL_CHIP } from "@/lib/labels";
import { useLeoUser } from "@/lib/useLeoOnly";

const TAG_CHIP: Record<ShownRow["tag"], string> = { suggested: LABEL_CHIP.warning, yours: LABEL_CHIP.primary, "used before": LABEL_CHIP.muted };

export default function AnglesStep({
  audience,
  value,
  collapsed = false,
  onConfirm,
  onChange,
}: {
  audience: Pick<Audience, "id" | "name" | "who" | "cares" | "says">;
  /** The confirmed angles ([] before the first Confirm): ticked again when Change reopens the step. */
  value: Campaign["angles"];
  collapsed?: boolean;
  onConfirm: (angles: Campaign["angles"]) => void;
  onChange: () => void;
}) {
  const leo = useLeoUser();
  const userId = leo?.id ?? "";
  const { toast } = useToast();
  useSyncExternalStore(onSuggest, suggestVersion);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAnglesChanged(bump), []);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  // after Save or Cancel, the row's Edit button takes focus back, so the keyboard keeps its place
  const [focusEdit, setFocusEdit] = useState<string | null>(null);
  useEffect(() => {
    if (!focusEdit) return;
    document.querySelector<HTMLElement>(`[data-edit="${focusEdit}"]`)?.focus();
    setFocusEdit(null);
  }, [focusEdit]);
  const job = suggestJob();
  const suggesting = job.state === "suggesting";
  const usesLeft = useUsesLeft(suggesting);

  if (leo === undefined) return <div className="h-48 animate-pulse rounded-xl bg-muted" aria-hidden />;
  if (!leo) return null;

  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-card px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Angles</span>
        <span className="min-w-0 flex-1 break-words text-sm">{value.map((a) => a.title).join(" | ")}</span>
        <Button variant="ghost" size="sm" onClick={onChange}>
          Change
        </Button>
      </div>
    );
  }

  const picks = value.map((a) => a.id);
  const current = () => stepRows(anglesFor(userId, audience.id), loadWork(userId, audience.id), picks);
  const rows = current();
  const write = (next: StepRow[]) => saveWork(userId, audience.id, next);
  const patch = (id: string, p: Partial<StepRow>) => write(current().map((r) => (r.id === id ? { ...r, ...p } : r)));

  const mine = job.state !== "idle" && job.key === jobKey(userId, audience.id);
  const failed = mine && job.state === "failed" ? job : null;
  const left = usesLeft("campaign-angles");
  const capped = left === 0 || failed?.error === CAPPED_LINE;
  const errorLine = failed ? failed.error : capped ? CAPPED_LINE : null;
  const picked = pickedRows(rows);
  const editing = rows.some((r) => r.draft);
  const reason = editing ? "Save or cancel your edit first." : pickLine(picked.length);
  const empty = rows.length === 0 && !(mine && suggesting);
  const another = rows.some((r) => r.tag === "suggested");

  const suggest = () => void startSuggest(userId, audience, picks);
  const writeOwn = () => write([{ id: newAngleId(), title: "", line: "", origin: "mine", used: false, picked: true, draft: { title: "", line: "" } }, ...current()]);
  const save = (r: ShownRow) => {
    if (!r.draft?.title.trim()) return;
    patch(r.id, { title: r.draft.title.trim(), line: r.draft.line.trim(), draft: undefined });
    setFocusEdit(r.id);
  };
  const cancel = (r: ShownRow) => {
    if (r.title) {
      patch(r.id, { draft: undefined });
      setFocusEdit(r.id);
    } else write(current().filter((x) => x.id !== r.id));
  };
  const keys = (r: ShownRow) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save(r);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel(r);
    }
  };
  const undo = (fix: () => string | null | void) => (
    <ToastAction
      altText="Undo"
      onClick={() => {
        const error = fix();
        if (error) toast({ title: error });
      }}
    >
      Undo
    </ToastAction>
  );
  const remove = (r: ShownRow) => {
    if (r.used) {
      const gone = removeAngle(userId, audience.id, r.id);
      if (gone) toast({ title: "Angle removed.", duration: 5000, action: undo(() => restoreAngle(userId, audience.id, gone)) });
      return;
    }
    const at = rows.filter((x) => !x.used).findIndex((x) => x.id === r.id);
    write(current().filter((x) => x.id !== r.id));
    toast({
      title: "Angle removed.",
      duration: 5000,
      action: undo(() => {
        const now = current();
        const fresh = now.filter((x) => !x.used);
        fresh.splice(at, 0, r);
        write([...now.filter((x) => x.used), ...fresh]);
      }),
    });
  };
  const confirm = () => {
    const { angles, error } = confirmStep(userId, audience.id, rows);
    if (error) toast({ title: error });
    onConfirm(angles);
  };

  const row = (r: ShownRow) => {
    if (r.draft) {
      const draft = r.draft;
      return (
        <li key={r.id} className="space-y-2 rounded-lg border border-primary/40 bg-card p-3">
          <Input
            autoFocus
            value={draft.title}
            maxLength={ANGLE_LIMITS.title}
            placeholder="Title, 2 to 5 words"
            aria-label="Angle title"
            onChange={(e) => patch(r.id, { draft: { ...draft, title: e.target.value } })}
            onKeyDown={keys(r)}
          />
          <Input
            value={draft.line}
            maxLength={ANGLE_LIMITS.line}
            placeholder="One line on the take, in their words"
            aria-label="Angle line"
            onChange={(e) => patch(r.id, { draft: { ...draft, line: e.target.value } })}
            onKeyDown={keys(r)}
          />
          {r.used && usedInPosts(userId, r.id) && <p className="text-xs text-muted-foreground">{EDITED_LINE}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save(r)} disabled={!draft.title.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => cancel(r)}>
              Cancel
            </Button>
          </div>
        </li>
      );
    }
    const flags = scanCompliance(`${r.title}. ${r.line}`).filter((f) => !dismissed.has(`${r.id}:${f.id}`));
    return (
      <li key={r.id} className="flex gap-2 rounded-lg border border-border/60 bg-card p-3">
        <label className="-m-1.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={r.picked}
            onChange={() => patch(r.id, { picked: !r.picked })}
            aria-label={`Use ${r.title}`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-words font-semibold">{r.title}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TAG_CHIP[r.tag]}`}>{r.tag}</span>
          </div>
          {r.line && <p className="mt-0.5 break-words text-sm text-muted-foreground">{r.line}</p>}
          {flags.length > 0 && (
            <div className="mt-2">
              <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(`${r.id}:${id}`))} />
            </div>
          )}
          <div className="-ml-2 mt-1 flex gap-1">
            <Button size="sm" variant="ghost" data-edit={r.id} aria-label={`Edit ${r.title}`} onClick={() => patch(r.id, { draft: { title: r.title, line: r.line } })}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Remove ${r.title}`} onClick={() => remove(r)}>
              Remove
            </Button>
          </div>
        </div>
      </li>
    );
  };

  const actions = (primary: boolean) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={primary ? "default" : "outline"} onClick={suggest} disabled={suggesting || capped}>
        {mine && suggesting ? "Suggesting..." : another ? "Suggest different ones" : "Suggest 5 angles"}
      </Button>
      <Button variant={primary ? "outline" : "ghost"} onClick={writeOwn}>
        Write my own
      </Button>
      <PriceChip feature="campaign-angles" left={left} />
    </div>
  );

  return (
    <section aria-labelledby="angles-step-q" className="space-y-4">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Angles | 2 of 5</p>
        <h2 id="angles-step-q" className="font-serif text-xl sm:text-2xl">
          Which angles does this campaign push?
        </h2>
      </header>

      {empty ? (
        <div className="space-y-4 rounded-xl border border-dashed border-border p-5">
          <div>
            <p className="font-medium">No angles for {audience.name} yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Suggest 5 from your positioning and what {audience.name} care about. Edit or remove any before you go on.
            </p>
          </div>
          {actions(true)}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.filter((r) => r.used).map(row)}
            {mine && suggesting && Array.from({ length: 5 }, (_, i) => <li key={`skeleton-${i}`} className="h-[76px] animate-pulse rounded-lg border border-dashed border-border bg-muted/40" aria-hidden />)}
            {rows.filter((r) => !r.used).map(row)}
          </ul>
          {actions(false)}
          <p className="text-sm text-muted-foreground">{picked.length} picked. 3 to 8 work best.</p>
        </>
      )}

      <div aria-live="polite" className="space-y-1">
        {mine && suggesting && <p className="text-sm text-muted-foreground">Writing 5 angles for {audience.name}. This takes a few seconds.</p>}
        {errorLine && (
          <p className="text-sm text-destructive">
            {errorLine}
            {failed?.retry && (
              <Button variant="link" size="sm" className="h-auto px-1.5 py-0" onClick={suggest}>
                Try again
              </Button>
            )}
          </p>
        )}
      </div>

      <div className="space-y-1 border-t border-border/60 pt-4">
        <Button variant={empty ? "outline" : "default"} onClick={confirm} disabled={!!reason}>
          Confirm
        </Button>
        {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
      </div>
    </section>
  );
}
