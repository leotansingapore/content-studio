// Brand > Profile's lists (/playbook), as Fastlane's Profile has them: a label with "0 of 10", the rows, and Add opening
// one field in place. Each list saves to the store its writers already read (voiceMemory.ts), so nothing here is sent
// anywhere new. Remove turns a row off with Undo, as /voice does.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { LEARNING_CHARS, RULES, addRule, onMemoryChanged, rulesOf, setLearningOff, type RuleKind } from "@/lib/voiceMemory";

/** A Profile group's heading and its one card, the way ProfileRows draws them. */
export const GROUP_H2 = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
export const GROUP_CARD = "divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card";
const TOUCH = "[@media(pointer:coarse)]:h-11";

/** Re-reads on a save here, in another tab or from sync. */
export function useMemoryRead<T>(read: () => T, deps: unknown[]): T {
  const [v, setV] = useState(read);
  useEffect(() => {
    setV(read());
    return onMemoryChanged(() => setV(read()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

/** A Remove that says Removed with Undo, as /voice's rows do. */
export function useRemove() {
  const { toast } = useToast();
  return (off: (on: boolean) => { ok: true } | { ok: false; error: string }) => {
    const r = off(true);
    if ("error" in r) return toast({ title: r.error, variant: "destructive" });
    toast({
      title: "Removed.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo" onClick={() => { const u = off(false); if ("error" in u) toast({ title: u.error, variant: "destructive" }); }}>
          Undo
        </ToastAction>
      ),
    });
  };
}

export function CountedList({ id, label, hint, rows, max, chars, placeholder, add, remove }: {
  id: string;
  label: string;
  hint?: ReactNode;
  rows: { id: string; text: string }[];
  max: number;
  chars: number;
  placeholder: string;
  /** Saves one; the line to show when it couldn't. */
  add: (text: string) => string | null;
  remove: (rowId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const full = rows.length >= max;
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const error = add(text);
    if (error) return setLine(error);
    setText("");
    setLine(null);
  };
  return (
    <div id={id} className="scroll-mt-20 space-y-2 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{rows.length} of {max}</span>
        {!open && (
          <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => setOpen(true)} className={`ml-auto h-9 gap-1 px-2 text-primary ${TOUCH}`}>
            <PlusIcon className="h-3.5 w-3.5" aria-hidden /> Add
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-1 rounded-md bg-muted/40 pl-3 text-sm">
              <span className="min-w-0 flex-1 py-2 [overflow-wrap:anywhere]">{r.text}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${r.text}`} title="Remove" onClick={() => remove(r.id)}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <XIcon className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} className="flex flex-wrap gap-2">
          <Input ref={field} aria-label={`Add to ${label}`} value={text} maxLength={chars} placeholder={placeholder} disabled={full}
            onChange={(e) => (setText(e.target.value), setLine(null))} className={`min-w-0 flex-1 basis-48 ${TOUCH}`} />
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={full || !text.trim()} className={TOUCH}>Add</Button>
            <Button type="button" variant="ghost" onClick={() => (setOpen(false), setText(""), setLine(null))} className={`text-muted-foreground ${TOUCH}`}>Done</Button>
          </div>
        </form>
      )}
      {(line || (open && full)) && (
        <p className={`text-xs ${line ? "text-destructive" : "text-muted-foreground"}`} role={line ? "alert" : undefined}>
          {line ?? `${max} is the most. Remove one to add another.`}
        </p>
      )}
    </div>
  );
}

/** One of the Profile's learning lists (Do, Don't): its rows, Add and Remove. */
export function RuleList({ uid, kind, label, hint, placeholder }: { uid: string; kind: RuleKind; label: string; hint?: ReactNode; placeholder: string }) {
  const rows = useMemoryRead(() => rulesOf(uid, kind), [uid, kind]);
  const removed = useRemove();
  return (
    <CountedList id={kind} label={label} hint={hint} rows={rows} max={RULES[kind].max} chars={LEARNING_CHARS - RULES[kind].lead.length} placeholder={placeholder}
      add={(t) => { const r = addRule(uid, kind, t); return "error" in r ? r.error : null; }}
      remove={(id) => removed((on) => setLearningOff(uid, id, on))} />
  );
}

/** Tone and voice's Do and Don't, under its rows. */
export function ToneLists({ uid }: { uid: string }) {
  return (
    <div className={GROUP_CARD}>
      <p className="px-4 py-3 text-xs text-muted-foreground">Every caption and script the AI writes follows these.</p>
      <RuleList uid={uid} kind="do" label="Do" placeholder="Write like you talk to a friend" />
      <RuleList uid={uid} kind="dont" label="Don't" placeholder="Open with a question" />
    </div>
  );
}
