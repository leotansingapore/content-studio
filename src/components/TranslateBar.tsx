// Posts in Chinese, Malay or Tamil in Write (edit-translate), Leo only: the Language row on the Format step, the
// versions row above the editor, and "Make it in" (or a version's checks) under the post. English stays the source:
// every version is its own draft, linked back, and its English meaning is one tap away. The calls run in
// translateJob.ts, outside React, so leaving the page keeps them going.

import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, Languages, RefreshCw } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import PriceChip from "@/components/PriceChip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { scanCompliance } from "@/lib/compliance";
import { getDraftById, loadDrafts, MAX_DRAFTS, onDraftsChanged, type DraftEntry } from "@/lib/draftHistory";
import type { PostLang } from "@/lib/links";
import { reasonText } from "@/lib/prices";
import { isStale, LANG_NAMES, langOf, sameWarns, sourceOf } from "@/lib/translate";
import {
  ackJob, draftsFull, LANGS, onTranslateJobs, translateAgain, translateDraft, translateJob, undoAgain, versionsOf, type TranslateJob,
} from "@/lib/translateJob";
import { useUrlItem } from "@/lib/urlState";

type Toast = Parameters<ReturnType<typeof useToast>["toast"]>[0];
/** Opens another post in Write with this toast (null: none), after saving what was typed. */
export type OpenDraft = (id: string, note: Toast | null) => void;

/** The job running or last finished for an English source, kept fresh. */
export const useTranslateJob = (sourceId: string | null | undefined): TranslateJob | null =>
  useSyncExternalStore(onTranslateJobs, () => translateJob(sourceId), () => null);

/** Re-reads My posts when a version is saved anywhere. */
function useDraftsTick(): void {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onDraftsChanged(tick), []);
}

const chip = (on: boolean) =>
  `flex h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50 sm:h-9 ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
  }`;
const linkButton = "-my-2 py-2 font-semibold text-primary hover:underline";

/** Write's Format step: this make's language. English writes as today; another language adds a version after it. */
export function LanguageRow({ value, onChange }: { value: PostLang | null; onChange: (lang: PostLang | null) => void }) {
  return (
    <div className="space-y-1.5 sm:col-span-3">
      <Label id="write-language">Language</Label>
      <div role="group" aria-labelledby="write-language" className="flex flex-wrap items-center gap-2">
        {[null, ...LANGS].map((l) => (
          <button key={l ?? "en"} type="button" aria-pressed={value === l} onClick={() => onChange(l)} className={chip(value === l)}>
            {l ? LANG_NAMES[l] : "English"}
          </button>
        ))}
        {value && <PriceChip feature="post-translate" left={null} />}
      </div>
    </div>
  );
}

/** The English post open in Write, or the English a version was made from (null when it was deleted). */
function englishOf(userId: string, entry: DraftEntry): DraftEntry | null {
  if (!langOf(entry)) return entry;
  const link = sourceOf(entry);
  return link ? getDraftById(userId, link.id) : null;
}

/** Above the editor: "Versions:" with a tab per language, and on a version its link back, the stale line and the checks. */
export function VersionTabs({ userId, entry, onOpen }: { userId: string; entry: DraftEntry; onOpen: OpenDraft }) {
  useDraftsTick();
  const [, openMeaning] = useUrlItem("meaning");
  const lang = langOf(entry);
  const english = englishOf(userId, entry);
  const englishId = lang ? sourceOf(entry)?.id : entry.id;
  const versions = englishId ? versionsOf(loadDrafts(userId), englishId) : [];
  const job = useTranslateJob(englishId);
  if (!lang && !versions.length) return null;
  const again = job?.kind === "again" && job.versionId === entry.id ? job : null;
  const flags = lang ? scanCompliance((entry.back ?? []).join("\n")) : [];
  const tab = (d: DraftEntry, label: string) => (
    <button
      key={d.id}
      type="button"
      aria-current={d.id === entry.id ? "page" : undefined}
      onClick={() => d.id !== entry.id && onOpen(d.id, null)}
      className={chip(d.id === entry.id)}
    >
      {label}
    </button>
  );
  return (
    <div className="mb-3 space-y-1.5 text-xs" data-testid="version-tabs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-muted-foreground">Versions:</span>
        {english && tab(english, "English")}
        {versions.map((v) => tab(v, LANG_NAMES[langOf(v)!]))}
      </div>
      {lang && english && (
        <p className="text-muted-foreground">
          {LANG_NAMES[lang]} version of:{" "}
          <button type="button" onClick={() => onOpen(english.id, null)} className={`${linkButton} text-left`}>
            "{english.hook || english.draft.split("\n")[0]}"
          </button>
        </p>
      )}
      {lang && isStale(entry, english) && (
        <p role="status" className="flex flex-wrap items-center gap-x-1.5 font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> The English changed after this was made.
          <button type="button" disabled={again?.state === "running"} onClick={() => void translateAgain(userId, entry.id)} className={`${linkButton} inline-flex items-center gap-1 disabled:opacity-100`}>
            {again?.state === "running" ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" />}
            {again?.state === "running" ? "Translating..." : "Translate again"}
          </button>
        </p>
      )}
      {again?.state === "failed" && (
        <p role="alert" className="font-medium text-destructive">
          {again.error}
        </p>
      )}
      {lang && sameWarns(entry.sameP) && (
        <p role="status" className="flex flex-wrap items-center gap-x-1.5 font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Check this version: it may say something the English doesn't.
          <button type="button" onClick={() => openMeaning("1")} className={linkButton}>
            Show the English meaning
          </button>
        </p>
      )}
      {flags.map((f) => (
        <p key={f.id} role="status" className="flex items-start gap-1.5 font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            In English this says "{f.match}". {f.message}
          </span>
        </p>
      ))}
    </div>
  );
}

/** A version's lines beside their English meaning, one row per line of the translation. */
export function MeaningRows({ lines, back }: { lines: string[]; back: string[] }) {
  const rows = back.map((b, i) => [lines[i] ?? "", b] as const).filter(([l, b]) => l.trim() || b.trim());
  return (
    <ul aria-label="The English meaning" className="divide-y divide-border/50 rounded-xl border border-border/60 bg-muted/20 text-xs">
      {rows.map(([l, b], i) => (
        <li key={i} className="grid gap-1 p-2.5 sm:grid-cols-2 sm:gap-4">
          <span className="whitespace-pre-wrap break-words text-foreground">{l}</span>
          <span className="whitespace-pre-wrap break-words text-muted-foreground">{b}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Under the post. On an English post: "Make it in" with each language that has no version yet (a price first; when
 * My posts is full it asks before spending). On a version: "Checks run on the English version.", a link to the English
 * post and its English meaning.
 * `auto` asks for a version of a post just written in another language, or one My posts asked for.
 */
export default function TranslateBar(p: {
  userId: string;
  entry: DraftEntry;
  /** The text in the editor now. */
  text: string;
  auto: { id: string; lang: PostLang } | null;
  onOpen: OpenDraft;
  /** The open version's words were made again. */
  onReplaced: (text: string) => void;
}) {
  const { userId, entry, text, auto, onOpen, onReplaced } = p;
  const { toast } = useToast();
  useDraftsTick();
  const [meaning, openMeaning, closeMeaning] = useUrlItem("meaning");
  const [ask, setAsk] = useState<PostLang | null>(null);
  const lang = langOf(entry);
  const englishId = lang ? sourceOf(entry)?.id : entry.id;
  const job = useTranslateJob(englishId);
  const running = job?.state === "running";
  const usesLeft = useUsesLeft(running);
  const left = usesLeft("post-translate");
  const versions = lang || !englishId ? [] : versionsOf(loadDrafts(userId), englishId);
  const missing = LANGS.filter((l) => !versions.some((v) => langOf(v) === l));

  const start = (l: PostLang) => {
    setAsk(null);
    void translateDraft(userId, entry.id, l);
  };
  const request = (l: PostLang) => {
    if (lang || running || !missing.includes(l)) return;
    if (draftsFull(userId)) setAsk(l);
    else start(l);
  };

  // a post just written in another language, or My posts' "Make it in": once, for this English post
  const asked = useRef<object | null>(null);
  useEffect(() => {
    if (!auto || auto.id !== entry.id || asked.current === auto) return;
    asked.current = auto;
    request(auto.lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, entry.id]);

  // a job that finished while Write was closed is in My posts already; one that finishes here is shown once
  const mountedAt = useRef(Date.now());
  const textRef = useRef(text);
  textRef.current = text;
  // the post open when a toast's Undo is pressed, which can be after a tab switch
  const openId = useRef(entry.id);
  openId.current = entry.id;
  useEffect(() => {
    if (!job || job.state === "running") return;
    if (job.at < mountedAt.current) return ackJob(job);
    if (job.state === "failed") return; // its line shows until the next try
    ackJob(job);
    const name = LANG_NAMES[job.lang];
    if (job.kind === "post" && job.versionId) {
      const english = job.sourceId;
      const open: Toast = {
        title: `${name} version saved.`,
        action: (
          <ToastAction altText="Open the English" onClick={() => onOpen(english, null)}>
            Open the English
          </ToastAction>
        ),
      };
      // opens it while the English is open and unchanged since it was sent, so typing is never pulled away
      if (entry.id === english && textRef.current.trim() === job.text.trim()) onOpen(job.versionId, open);
      else toast({ title: `${name} version saved.` });
    } else if (job.kind === "again" && job.before) {
      const fresh = getDraftById(userId, job.versionId!);
      if (fresh && entry.id === fresh.id) onReplaced(fresh.draft);
      const done = job;
      toast({
        title: `${name} version saved.`,
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => {
              undoAgain(userId, done);
              if (openId.current === done.versionId && done.before) onReplaced(done.before.draft);
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  if (lang) {
    return (
      <div className="mt-3 space-y-2" data-testid="version-checks">
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          Checks run on the English version.
          {englishId && getDraftById(userId, englishId) ? (
            <button type="button" onClick={() => onOpen(englishId, null)} className={linkButton}>
              Open the English
            </button>
          ) : null}
          {entry.back?.length ? (
            <button type="button" aria-expanded={meaning === "1"} onClick={() => (meaning === "1" ? closeMeaning() : openMeaning("1"))} className={linkButton}>
              {meaning === "1" ? "Hide the English meaning" : "Show the English meaning"}
            </button>
          ) : null}
        </p>
        {meaning === "1" && entry.back?.length ? <MeaningRows lines={text.split("\n")} back={entry.back} /> : null}
      </div>
    );
  }
  if (!missing.length && !(job?.state === "failed" && job.kind === "post")) return null;
  const busy = running && job?.kind === "post" ? job.lang : null;
  const why = reasonText({ left, leo: true });
  return (
    <div className="mt-3 space-y-2" data-testid="make-it-in">
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Languages className="h-3.5 w-3.5" /> Make it in
          </span>
          {missing.map((l) => (
            <Button
              key={l}
              variant="outline"
              size="sm"
              disabled={running || left === 0}
              onClick={() => request(l)}
              className={`h-11 gap-1.5 sm:h-9 ${busy === l ? "disabled:opacity-100" : ""}`}
            >
              {busy === l && <ThinkingOrb state="working" size={20} theme="light" aria-hidden />}
              {busy === l ? "Translating..." : LANG_NAMES[l]}
            </Button>
          ))}
          {!running && <PriceChip feature="post-translate" left={left} />}
          {why && <p className="basis-full text-xs text-destructive">{why}</p>}
        </div>
      )}
      {ask && (
        <Ask onYes={() => start(ask)} onNo={() => setAsk(null)}>
          My posts holds {MAX_DRAFTS} posts. Saving this drops your oldest one.
        </Ask>
      )}
      {job?.state === "failed" && job.kind === "post" && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {job.error}
        </p>
      )}
    </div>
  );
}

/** The question before a save that drops the oldest one. */
export function Ask({ children, onYes, onNo }: { children: ReactNode; onYes: () => void; onNo: () => void }) {
  return (
    <div role="alertdialog" aria-label="Before saving" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <span className="basis-full font-medium text-amber-800 dark:text-amber-300 sm:basis-auto">{children}</span>
      <Button size="sm" onClick={onYes} className="h-11 sm:h-9">
        Save anyway
      </Button>
      <Button size="sm" variant="ghost" onClick={onNo} className="h-11 sm:h-9">
        Cancel
      </Button>
    </div>
  );
}
