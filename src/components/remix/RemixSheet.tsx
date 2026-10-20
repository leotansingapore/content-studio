import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, Shuffle, X } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import ForRow from "@/components/remix/ForRow";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { Textarea } from "@/components/ui/textarea";
import { useUsesLeft } from "@/lib/aiUsage";
import { loadBrand } from "@/lib/carousel";
import { getDraftById } from "@/lib/draftHistory";
import { links, slug } from "@/lib/links";
import { loadPositioning } from "@/lib/positioning";
import {
  AS_NOUN,
  CLOSE_HINTS,
  CLOSE_LABELS,
  KEEP_DONE,
  KEEP_HINTS,
  KEEP_LABELS,
  defaultOutput,
  intentsFor,
  noteKey,
  whatRemixDoes,
  type Close,
  type Flags,
  type Keep,
} from "@/lib/remix";
import { brandName, loadRemixPrefs, offerNames, saveRemixPrefs, type RemixPrefs } from "@/lib/remixBrand";
import { clearRemixJob, hrefFor, onRemixJob, remixJob, startRemix, type RemixJobState } from "@/lib/remixJob";
import { dayMonth, earlierRemix, seenSources, sourceNoun, type RemixSource } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";
import { useUrlFlag, useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import type { LeoUser } from "@/lib/useLeoOnly";
import { VOICE_MIN_CHARS, isVoiceProfileUsable, loadVoiceProfile } from "@/lib/voiceProfile";

// The Remix sheet (docs/north-star/items/remix-everywhere.md): opened over any page by ?remix=<key>, mounted
// once in StudioLayout and only for Leo. Every choice lives in the URL; the run itself is remixJob.ts, so
// closing the sheet or leaving the page never stops it.

const CLOSE_ORDER = Object.keys(CLOSE_LABELS) as Close[];
/** Closing drops every sheet param with the key, so the next card's sheet starts from the defaults. */
const SHEET_PARAMS = Object.fromEntries(["remix", "keep", "about", "close", "more", "for", "mention", "offer"].map((p) => [p, null]));

export default function RemixSheet({ user }: { user: LeoUser }) {
  const [key] = useUrlItem("remix");
  const update = useUrlUpdate();
  return key ? <Sheet key={`${user.id}|${key}`} remixKey={key} userId={user.id} onClose={() => update(SHEET_PARAMS)} /> : null;
}

function useJob(): RemixJobState | null {
  const [job, setJob] = useState(remixJob);
  useEffect(() => {
    const off = onRemixJob(setJob);
    return () => {
      off();
    };
  }, []);
  return job;
}

const readNote = (key: string) => {
  try {
    return localStorage.getItem(noteKey(key)) ?? "";
  } catch {
    return "";
  }
};
const writeNote = (key: string, text: string) => {
  try {
    if (text) localStorage.setItem(noteKey(key), text);
    else localStorage.removeItem(noteKey(key));
  } catch {
    // the box still holds it until the sheet closes
  }
};

const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "Reel by @handle | 141.9K views" */
function metaLine(s: RemixSource): string {
  const n = s.numbers;
  const stat =
    n?.views ? `${compact(n.views)} views`
    : n?.likes ? `${compact(n.likes)} likes`
    : n?.daysRunning ? `${n.daysRunning} days running`
    : "";
  return [`${cap(sourceNoun(s))}${s.author ? ` by ${s.author}` : ""}`, stat].filter(Boolean).join(" | ");
}

function Sheet({ remixKey, userId, onClose }: { remixKey: string; userId: string; onClose: () => void }) {
  const source = useMemo<RemixSource | null>(() => {
    // a key this tab pressed but the data drop no longer holds still opens from the card's own snapshot
    const s = resolveSource(remixKey, userId) ?? seenSources(userId).find((x) => x.key === remixKey) ?? null;
    return s && { ...s, remixedAt: "" };
  }, [remixKey, userId]);
  const job = useJob();
  const mine = job?.key === remixKey ? job : null;
  const working = mine?.state === "working";
  const otherRunning = job?.state === "working" && !mine;
  const left = useUsesLeft(job?.state === "working")("remix-make");
  const [params] = useSearchParams();
  const update = useUrlUpdate();

  const keeps = useMemo<Keep[]>(() => (source ? intentsFor(source) : ["structure"]), [source]);
  const [keep] = useUrlState<Keep>("keep", "structure", { allowed: keeps });
  const topics = useMemo(() => (loadPositioning(userId)?.topics ?? []).map((t) => t.trim()).filter(Boolean), [userId]);
  const [aboutSlug] = useUrlState<string>("about", "");
  // an empty, unknown or repeated slug falls back to the first topic
  const about = topics.find((t) => slug(t) === aboutSlug) ?? topics[0];
  const [closeness] = useUrlState<Close>("close", "balanced", { allowed: CLOSE_ORDER });
  const [more, setMore] = useUrlFlag("more", "open");
  const [forOpen, setForOpen] = useUrlFlag("for", "open");

  // the URL wins (mention=no, offer=<slug>), then the remembered pick for this brand, then the default
  const [prefs, setPrefs] = useState<RemixPrefs>(() => loadRemixPrefs(userId));
  const offers = useMemo(() => offerNames(userId), [userId]);
  const mention = params.get("mention") === "no" ? false : prefs.mention;
  const offerParam = params.get("offer");
  const offer = mention ? (offerParam && offers.find((o) => slug(o) === offerParam)) || prefs.offer : null;
  const savePrefs = (next: RemixPrefs, url: Record<string, string | null>) => {
    setPrefs(next);
    saveRemixPrefs(userId, next);
    update(url);
  };

  const kit = useMemo(() => loadBrand(userId), [userId]);
  const brand = useMemo(() => brandName(userId), [userId]);
  const voicePosts = useMemo(() => {
    const v = loadVoiceProfile(userId);
    return v && isVoiceProfileUsable(v) ? v.posts.filter((p) => (p ?? "").trim().length >= VOICE_MIN_CHARS).length : 0;
  }, [userId]);
  const [note, setNote] = useState(() => readNote(remixKey));
  const [showOriginal, setShowOriginal] = useState(false);
  const [repeatHidden, setRepeatHidden] = useState(false);
  const repeat = useMemo(() => (source && !repeatHidden ? earlierRemix(userId, source) : null), [source, userId, repeatHidden, job?.state]);
  const repeatDraft = repeat ? getDraftById(userId, repeat.draftId) : null;

  // Escape and the backdrop close it; focus moves in and goes back to the button that opened it.
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  const as = source ? [defaultOutput(source)] : [];
  const out = left === 0;
  const start = () => {
    if (!source) return;
    startRemix(userId, { source, keep, about: keep === "topic" ? about : undefined, close: closeness, as, note: note.trim() || undefined, mention, offer });
  };
  const again = () => {
    clearRemixJob();
    setNote(readNote(remixKey));
    setRepeatHidden(false);
  };

  // a running or finished run shows its own choices, whatever the URL says
  const ran = mine && mine.state !== "failed" ? mine.run : { keep, about, close: closeness };
  const done = mine?.state === "done" ? mine.rows.filter((r) => r.state === "done") : [];
  const failedRow = mine?.state === "failed" ? mine.rows.find((r) => r.state === "failed") : undefined;

  let body: ReactNode;
  let footer: ReactNode;
  if (!source) {
    body = <p className="text-sm text-muted-foreground">This post is no longer in the library.</p>;
    footer = (
      <Button type="button" onClick={onClose} className="w-full">
        Close
      </Button>
    );
  } else if (done.length) {
    const first = done[0];
    body = (
      <div className="space-y-4">
        {done.map((row) => (
          <section key={row.as} className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">Your {AS_NOUN[row.as]} is ready</h3>
            <p className="text-xs text-muted-foreground">{ran.keep === "topic" && ran.about ? `Moved to ${ran.about}` : KEEP_DONE[ran.keep]}</p>
            {row.hook && <blockquote className="border-l-2 border-primary/50 pl-3 text-sm text-foreground">{row.hook}</blockquote>}
            {row.flags && <FlagChips flags={row.flags} />}
          </section>
        ))}
      </div>
    );
    footer = (
      <div className="flex items-center gap-2">
        <Button asChild className="flex-1">
          <Link to={first.href ?? links.generate({ draft: first.draftId })} onClick={clearRemixJob}>
            Open it
          </Link>
        </Button>
        <Button type="button" variant="ghost" onClick={again} className="text-muted-foreground">
          Remix again
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        <section className="rounded-xl border border-border/70 bg-muted/30 p-3">
          <h3 className="mb-1 text-xs font-semibold text-foreground">What Remix does</h3>
          <p className="text-sm leading-snug text-muted-foreground">
            {whatRemixDoes(source, { keep: ran.keep, about: ran.about, as, close: ran.close }, { brand, hasVoice: voicePosts > 0, teardownCached: true })}
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">Keep</h3>
          <div className="flex flex-wrap gap-1.5">
            {keeps.map((k) => (
              <FilterChip
                key={k}
                active={keep === k}
                disabled={working}
                onClick={() => update({ keep: k === "structure" ? null : k, about: k === "topic" ? aboutSlug || null : null })}
              >
                {KEEP_LABELS[k]}
              </FilterChip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{KEEP_HINTS[keep]}</p>
          {keep === "topic" && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="mr-1 text-xs font-semibold text-muted-foreground">Topic</span>
              {topics.length ? (
                topics.map((t) => (
                  <FilterChip key={t} active={about === t} disabled={working} onClick={() => update({ about: t === topics[0] ? null : slug(t) })}>
                    {t}
                  </FilterChip>
                ))
              ) : (
                <Link to={links.plan({ view: "setup" })} className="text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">
                  Add your topics
                </Link>
              )}
            </div>
          )}
        </section>

        <ForRow
          brand={brand}
          mention={mention}
          offer={offer}
          offers={offers}
          voicePosts={voicePosts}
          color={kit?.color}
          logo={kit?.logo}
          open={forOpen}
          setOpen={setForOpen}
          disabled={working}
          onMention={(on) => savePrefs({ ...prefs, mention: on }, { mention: on ? null : "no" })}
          onOffer={(name) => savePrefs({ ...prefs, offer: name }, { offer: name ? slug(name) : null })}
        />

        <section>
          <button
            type="button"
            onClick={() => setMore(!more)}
            aria-expanded={more}
            className="flex w-full items-center justify-between gap-3 py-1 text-left text-xs font-semibold text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11"
          >
            More options
            <span className="flex items-center gap-1 font-normal">
              {CLOSE_LABELS[closeness]}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} />
            </span>
          </button>
          {more && (
            <div className="space-y-2 pt-2">
              <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                How close
                <InfoTip label="About how close">Every level writes new words and leaves out the original's numbers and names.</InfoTip>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CLOSE_ORDER.map((c) => (
                  <FilterChip key={c} active={closeness === c} disabled={working} onClick={() => update({ close: c === "balanced" ? null : c })}>
                    {CLOSE_LABELS[c]}
                  </FilterChip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{CLOSE_HINTS[closeness]}</p>
            </div>
          )}
        </section>

        <section className="space-y-1.5">
          <label htmlFor="remix-note" className="text-xs font-semibold text-muted-foreground">
            Note (optional)
          </label>
          <Textarea
            id="remix-note"
            value={note}
            maxLength={300}
            rows={3}
            disabled={working}
            onChange={(e) => {
              setNote(e.target.value);
              writeNote(remixKey, e.target.value);
            }}
            placeholder="What should the remix keep or change? For example: keep the hook, use my offer"
            className="text-sm"
          />
        </section>
      </div>
    );
    footer = working ? (
      <div className="space-y-1.5">
        <Button type="button" disabled className="w-full gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Remixing...
        </Button>
        <p role="status" className="text-center text-xs font-medium text-foreground">
          {mine?.step}
        </p>
        <p className="text-center text-xs text-muted-foreground">You can leave this page. We'll tell you when it's ready.</p>
      </div>
    ) : (
      <div className="space-y-1.5">
        {failedRow && (
          <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {failedRow.error}
          </p>
        )}
        <Button type="button" onClick={start} disabled={out || otherRunning} className="w-full justify-between gap-3">
          <span className="flex items-center gap-2">
            <Shuffle className="h-4 w-4" />
            {out ? "No remixes left today" : failedRow ? "Try again" : "Remix"}
          </span>
          {!out && (
            <span className="[&>span]:text-primary-foreground/85">
              <PriceChip feature="remix-make" left={left} fallback={left === null ? null : `${left} left today`} />
            </span>
          )}
        </Button>
        {out && <p className="text-center text-xs text-muted-foreground">They reset at 8am Singapore time.</p>}
        {otherRunning && <p className="text-center text-xs text-muted-foreground">Your other remix is still going. This one can start once it's done.</p>}
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="remix-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 animate-in fade-in-0 motion-reduce:animate-none" />
      <div className="relative flex h-full w-full flex-col bg-background shadow-xl animate-in slide-in-from-right duration-200 motion-reduce:animate-none sm:max-w-[480px] sm:border-l sm:border-border/70">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
          <h2 id="remix-title" className="text-base font-semibold text-foreground">
            Remix
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {source && (
            <section className="space-y-2">
              <div className="flex gap-3">
                {source.cover && <img src={source.cover} alt="" className="h-16 w-12 shrink-0 rounded-md bg-muted object-cover" />}
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{source.title || source.caption || "Untitled"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{metaLine(source)}</p>
                  {source.caption && (
                    <button
                      type="button"
                      onClick={() => setShowOriginal(!showOriginal)}
                      aria-expanded={showOriginal}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                    >
                      {showOriginal ? "Hide the original" : "Show the original"}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOriginal ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              </div>
              {showOriginal && (
                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="whitespace-pre-line">{source.caption}</p>
                  {source.url && (
                    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                      Open the original <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
              {repeat && !mine && (
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  You remixed this on {dayMonth(repeat.at)}.
                  <Link
                    to={repeatDraft ? hrefFor(repeatDraft) : links.generate({ draft: repeat.draftId })}
                    className="inline-flex items-center py-1 font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                  >
                    Open that draft
                  </Link>
                  <button
                    type="button"
                    onClick={() => setRepeatHidden(true)}
                    className="inline-flex items-center py-1 font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                  >
                    Remix it again
                  </button>
                </p>
              )}
            </section>
          )}
          {body}
        </div>
        <footer className="border-t border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}

/** Warnings on a finished remix; the draft is saved either way. */
function FlagChips({ flags }: { flags: Flags }) {
  const [open, setOpen] = useState(false);
  if (!flags.copied.length && !flags.claim && !flags.invented) return null;
  const chip = "flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-left text-[11px] text-amber-900 dark:text-amber-200";
  return (
    <div className="space-y-1.5">
      {flags.copied.length > 0 && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`${chip} w-full [@media(pointer:coarse)]:min-h-11`}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <span className="space-y-1">
            <span className="block font-semibold">Shares words with the original</span>
            {open && flags.copied.map((l) => <span key={l} className="block font-mono text-[10px]">{l}</span>)}
          </span>
        </button>
      )}
      {flags.claim && (
        <p className={chip}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> Uses a figure or claim from the original. Check it or take it out.
        </p>
      )}
      {flags.invented && (
        <p className={chip}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> Says something about you that isn't in your profile. Check it.
        </p>
      )}
    </div>
  );
}
