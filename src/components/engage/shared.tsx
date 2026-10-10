import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookmarkPlus, ChevronDown, Clock, Copy, RotateCcw, X, Zap } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopy } from "@/components/recruit/shared";
import { useToast } from "@/hooks/use-toast";
import { scanCompliance } from "@/lib/compliance";
import { MAX_SNIPPETS, insertSnippet, loadSnippets, saveSnippet, type Snippet } from "@/lib/replySnippets";
import {
  MAX_TOPICS,
  MAX_TOPIC_CHARS,
  addTopic,
  loadEdit,
  loadRun,
  loadTopics,
  removeTopic,
  runningJob,
  saveEdit,
  saveRun,
  startRun,
  type EngageOutcome,
  type EngageTool,
  type Run,
} from "@/lib/engageDrafts";

/**
 * A tool's pasted text, its last drafts and whether a run is going. A run
 * started before leaving the page is picked up again on return; typed text is
 * saved as it is typed.
 */
export function useEngageRun<T>(tool: EngageTool, userId: string) {
  const [run, setRun] = useState<Run<T>>(() => loadRun<T>(tool, userId));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EngageOutcome | null>(null);

  const follow = (job: Promise<EngageOutcome>) => {
    setBusy(true);
    setOutcome(null);
    let live = true;
    job.then((o) => {
      if (!live) return;
      setBusy(false);
      setOutcome(o);
      setRun(loadRun<T>(tool, userId));
    });
    return () => {
      live = false;
    };
  };

  useEffect(() => {
    setRun(loadRun<T>(tool, userId));
    const job = runningJob(tool, userId);
    return job ? follow(job) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, userId]);

  return {
    run,
    busy,
    outcome,
    edit: (patch: Partial<Run<T>>) => setRun((r) => saveRun(tool, userId, { ...r, ...patch })),
    start: () => void follow(startRun(tool, userId, run)),
  };
}

export type Group<T> = { key: string; label: string; tip?: string; items: T[] };

/** The sorted drafts: a count per group, then each group under its heading. */
export function Groups<T>({ groups, testId, render }: { groups: Group<T>[]; testId: string; render: (item: T) => ReactNode }) {
  const shown = groups.filter((g) => g.items.length);
  if (!shown.length) return null;
  return (
    <div className="space-y-4" data-testid={testId}>
      <p className="flex flex-wrap gap-1.5" aria-label="How they sorted">
        {shown.map((g) => (
          <span key={g.key} className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {g.label} <span className="tabular-nums text-foreground">{g.items.length}</span>
          </span>
        ))}
      </p>
      {shown.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-foreground">
            {g.label}
            {g.tip && <InfoTip label={`About ${g.label}`}>{g.tip}</InfoTip>}
          </h3>
          <ul className="space-y-2">{g.items.map(render)}</ul>
        </div>
      ))}
    </div>
  );
}

/** What was pasted, shown above its draft. */
export function Quote({ name, text, tag }: { name: string; text: string; tag?: string }) {
  return (
    <p className="line-clamp-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
      {tag && <span className="mr-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-foreground">{tag}</span>}
      {name && <span className="font-semibold text-foreground">{name}: </span>}
      {text}
    </p>
  );
}

const chip = "inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors sm:h-8 [@media(pointer:coarse)]:h-11";

/**
 * A draft to edit and paste: Insert puts one of your saved replies where the
 * cursor is (the end when it was never placed), Save keeps the draft as a
 * saved reply, Copy takes it as edited. Edits stay on this device. Empty: the
 * one line that says so.
 */
export function Draft({ userId, label, text, onCopy }: { userId: string; label: string; text: string; onCopy?: () => void }) {
  const copy = useCopy();
  const { toast } = useToast();
  const [value, setValue] = useState(() => loadEdit(userId, text) ?? text);
  const [menu, setMenu] = useState<Snippet[] | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // the cursor counts once the draft was tapped into; a textarea keeps its selection after it loses focus
  const placed = useRef(false);
  useEffect(() => {
    setValue(loadEdit(userId, text) ?? text);
    placed.current = false;
  }, [userId, text]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  if (!text)
    return <p className="text-xs italic text-muted-foreground">No safe draft came back for this one. Run it again or write your own.</p>;

  const change = (next: string) => {
    setValue(next);
    saveEdit(userId, text, next);
  };
  const insert = (s: Snippet) => {
    const el = box.current;
    const r = el && placed.current ? insertSnippet(value, s.text, el.selectionStart, el.selectionEnd) : insertSnippet(value, s.text);
    change(r.text);
    setMenu(null);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(r.caret, r.caret);
    });
  };
  const keep = () => {
    const r = saveSnippet(userId, { name: "", text: value });
    if (r.problem === "full") return toast({ title: `You have ${MAX_SNIPPETS} saved replies. Delete one to save this.`, variant: "destructive" });
    if (r.problem === "duplicate") return toast({ title: `Already saved as "${r.saved?.name}"` });
    const flag = scanCompliance(value)[0];
    toast({ title: `Saved as "${r.saved?.name}"`, description: flag ? `"${flag.match}" ${flag.message}` : undefined });
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
      <textarea
        ref={box}
        value={value}
        rows={1}
        aria-label={`${label}, edit before copying`}
        onChange={(e) => change(e.target.value)}
        onFocus={() => (placed.current = true)}
        className="block w-full resize-none overflow-y-auto rounded bg-transparent [@media(pointer:coarse)]:min-h-11 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      />
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          aria-expanded={menu !== null}
          onClick={() => setMenu(menu ? null : loadSnippets(userId))}
          aria-label="Insert a saved reply"
          className={`${chip} ${menu ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
        >
          <Zap className="h-3.5 w-3.5" /> Insert
        </button>
        <button type="button" onClick={keep} aria-label={`Save this ${label.toLowerCase()} to your saved replies`} className={`${chip} text-muted-foreground hover:bg-primary/10 hover:text-primary`}>
          <BookmarkPlus className="h-3.5 w-3.5" /> Save
        </button>
        <button
          type="button"
          onClick={() => {
            void copy(value, `${label} copied`);
            onCopy?.();
          }}
          aria-label={`Copy ${label.toLowerCase()}`}
          className={`${chip} ml-auto text-primary hover:bg-primary/10`}
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
      </div>
      {menu && (
        <div className="mt-1.5 border-t border-primary/20 pt-2" data-testid="snippet-menu">
          {menu.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Your saved replies">
              {menu.map((s) => (
                <li key={s.id} className="min-w-0 max-w-full">
                  <button
                    type="button"
                    onClick={() => insert(s)}
                    title={s.text}
                    className="h-11 max-w-full truncate rounded-full border border-border/60 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 sm:h-8 [@media(pointer:coarse)]:h-11"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No saved replies yet.{" "}
              <Link to="?tool=snippets" className="font-semibold text-primary hover:underline">
                Add one
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** What a run is doing: working, failed (with Try again), or out of today's uses. */
export function RunStatus({
  busy,
  busyText,
  outcome,
  retry,
}: {
  busy: boolean;
  busyText: string;
  outcome: EngageOutcome | null;
  retry: () => void;
}) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {busy && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" role="status">
          <ThinkingOrb state="composing" size={20} theme="light" aria-hidden />
          <p className="text-sm font-medium text-foreground">{busyText}</p>
        </div>
      )}
      {!busy && outcome?.kind === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {outcome.message}
          </p>
          <Button size="sm" variant="outline" onClick={retry} className="h-11 gap-1.5 sm:h-9 [@media(pointer:coarse)]:h-11">
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        </div>
      )}
      {!busy && outcome?.kind === "limit" && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground" role="status">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{outcome.message} What you pasted stays here.</p>
        </div>
      )}
    </div>
  );
}

/** The heading and tip of the pile shown first: escalated by Jev, never drafted. */
export const HANDLE_YOURSELF = { key: "escalate", label: "Handle yourself", tip: "No draft. These need your own words." };

/**
 * What always goes to Handle yourself: the built-in topics (engage-assist
 * ESCALATE_TOPICS) and the consultant's own, added and removed here, per
 * profile. Collapsed until opened.
 */
export function HandleYourselfTopics({ userId }: { userId: string }) {
  const [topics, setTopics] = useState(() => loadTopics(userId));
  const [draft, setDraft] = useState("");
  const id = useId();
  const full = topics.length >= MAX_TOPICS;
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setTopics(addTopic(userId, draft));
    setDraft("");
  };
  return (
    <details className="group rounded-xl border border-border/60" data-testid="handle-topics">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-medium text-foreground sm:h-9 [@media(pointer:coarse)]:h-11 [&::-webkit-details-marker]:hidden">
        <span>
          Topics you handle yourself{topics.length > 0 && <span className="tabular-nums text-muted-foreground"> +{topics.length}</span>}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-border/60 p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Complaints, refunds or billing, claims or policy disputes, legal or medical questions, press, minors, harassment or threats, and yours. Never drafted.
        </p>
        {topics.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <li key={t} className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-muted/40 pl-3 text-xs text-foreground">
                <span className="truncate">{t}</span>
                <button
                  type="button"
                  onClick={() => setTopics(removeTopic(userId, t))}
                  aria-label={`Remove ${t}`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground sm:h-7 sm:w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="flex gap-2">
          <Label htmlFor={id} className="sr-only">
            Add a topic
          </Label>
          <Input
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_TOPIC_CHARS}
            disabled={full}
            placeholder={full ? `Up to ${MAX_TOPICS} topics` : "Such as divorce"}
            className="h-11 min-w-0 flex-1 sm:h-9 [@media(pointer:coarse)]:h-11"
          />
          <Button type="submit" variant="outline" disabled={full || !draft.trim()} className="h-11 shrink-0 sm:h-9 [@media(pointer:coarse)]:h-11">
            Add
          </Button>
        </form>
      </div>
    </details>
  );
}
