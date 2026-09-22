// Idea Dump: paste or dictate rough post ideas and get a developed brief for
// each (angle, hooks, talking points, CTA, format, platform, funnel stage),
// scored with the Coach's craft rules and the compliance scan. One tap sends a
// brief to the board's Idea column or into Write, prefilled.
//
// Mounted on the Coach page outside the diagnosis gate; the board's Idea column
// links here via /coach#idea-dump. Logic: src/lib/ideaDump.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { getFunnelStage } from "@/data/funnelFramework";
import {
  MAX_IDEAS,
  MAX_NOTES_CHARS,
  MAX_SAVED_BRIEFS,
  NO_IDEAS_MESSAGE,
  addBriefToBoard,
  addBriefs,
  briefWriteUrl,
  buildIdeaDumpContext,
  developIdeas,
  isOnBoard,
  loadBriefs,
  preferredAudience,
  removeBrief,
  scoreBrief,
  splitIdeas,
  updateBrief,
  type IdeaBrief,
  type SkippedNote,
} from "@/lib/ideaDump";
import {
  AlertTriangle,
  Check,
  Clock,
  Columns3,
  Lightbulb,
  Mic,
  PenLine,
  RotateCcw,
  Sparkles,
  Square,
  Wrench,
  X,
} from "lucide-react";

// ---- Dictation (Web Speech API; the button hides where it's missing) ----------

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechRecognition(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function appendDictation(prev: string, chunk: string): string {
  const t = chunk.trim();
  if (!t) return prev;
  const sep = !prev.trim() || /\s$/.test(prev) ? "" : " ";
  return `${prev}${sep}${t}`.slice(0, MAX_NOTES_CHARS);
}

// ---- Display helpers ----------------------------------------------------------

function scoreTone(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

const FORMAT_LABEL: Record<string, string> = {
  "text-post": "Text post",
  carousel: "Carousel",
  "short-video": "Short video",
  story: "Story",
};
const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const PLACEHOLDER = [
  "e.g.",
  "why so many young adults skip hospital plans",
  "CPF top-ups before December, what people get wrong",
  "the day I quit engineering to become an advisor",
  "a client who thought her company insurance was enough",
].join("\n");

const CHIP = "rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

type Notice =
  | {
      kind: "done";
      developed: number;
      heldBack: number;
      thin: number;
      skipped: SkippedNote[];
      usage: { used: number; limit: number } | null;
    }
  | { kind: "error"; message: string }
  | { kind: "limit"; message: string }
  | { kind: "no-ideas"; message: string; thin: string[]; skipped: SkippedNote[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function StatusChip({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const tone = warn
    ? "border-warning/40 bg-warning/10 text-foreground"
    : ok
      ? "border-success/30 bg-success/5 text-success"
      : "border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {ok && !warn ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {children}
    </span>
  );
}

function SkippedList({ skipped }: { skipped: SkippedNote[] }) {
  if (!skipped.length) return null;
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {skipped.map((s) => (
        <li key={s.note} className="[overflow-wrap:anywhere]">
          Skipped “{s.idea}”: {s.reason}
        </li>
      ))}
    </ul>
  );
}

// ---- One brief ------------------------------------------------------------------

function BriefCard({
  brief,
  onBoard,
  writeUrl,
  onChooseHook,
  onAdd,
  onRemove,
}: {
  brief: IdeaBrief;
  onBoard: boolean;
  writeUrl: string;
  onChooseHook: (index: number) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const s = useMemo(() => scoreBrief(brief), [brief]);
  const stage = getFunnelStage(brief.funnelStage);
  const strongCount = s.strongHooks.filter(Boolean).length;
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <Card className="border-border/60 shadow-card" data-testid="idea-brief">
      <CardContent className="space-y-4 p-4 sm:p-5 md:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stage.accent.badge}`}>
                {stage.letter} · {stage.label}
              </span>
              <span className={CHIP}>{PLATFORM_LABEL[brief.platform] ?? brief.platform}</span>
              <span className={CHIP}>{FORMAT_LABEL[brief.format] ?? brief.format}</span>
            </div>
            <h3 className="font-serif text-base font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
              {brief.idea}
            </h3>
            {brief.source && brief.source !== brief.idea && (
              <p className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                From your note: “{brief.source}”
              </p>
            )}
          </div>
          <div className="shrink-0 text-center" title="Craft score: hooks, clear ask, substance and compliance">
            {/* A compliance error never reads as green, whatever the craft weights add up to. */}
            <p
              className={`font-serif text-2xl font-semibold leading-none tabular-nums ${scoreTone(
                s.compliant ? s.score : Math.min(s.score, 59),
              )}`}
            >
              {s.score}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Craft</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
          <span className="font-semibold">Angle: </span>
          {brief.angle}
        </p>

        <div className="space-y-1.5">
          <p className={label}>Pick a hook</p>
          <div className="space-y-1.5">
            {brief.hooks.map((hook, i) => {
              const picked = i === brief.chosenHook;
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onChooseHook(i)}
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    picked
                      ? "border-primary/60 bg-primary/5 text-foreground"
                      : "border-border/60 text-foreground/90 hover:border-primary/30 hover:bg-muted/30"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${
                      picked ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}
                  />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{hook}</span>
                  {s.strongHooks[i] && (
                    <span className="shrink-0 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                      Strong
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className={label}>Talking points</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground/90 marker:text-muted-foreground">
            {brief.talkingPoints.map((p, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                {p}
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-1">
          <p className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
            <span className="font-semibold">CTA: </span>
            {brief.cta}
          </p>
          {brief.stageReason && (
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              <span className={`font-medium ${stage.accent.text}`}>Why {stage.label.toLowerCase()}:</span>{" "}
              {brief.stageReason}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <StatusChip ok={strongCount > 0}>
              {strongCount}/{brief.hooks.length} strong hooks
            </StatusChip>
            <StatusChip ok={s.clearAsk}>{s.clearAsk ? "Clear ask" : "No clear ask"}</StatusChip>
            <StatusChip ok={s.developed}>{plural(brief.talkingPoints.length, "talking point", "talking points")}</StatusChip>
            <StatusChip ok={s.compliant} warn={s.compliant && s.flags.length > 0}>
              {!s.compliant ? "Compliance risk" : s.flags.length ? "Check the wording" : "No compliance flags"}
            </StatusChip>
          </div>
          {s.flags.length > 0 && (
            <ul className="space-y-1.5">
              {s.flags.map((f) => (
                <li
                  key={f.id}
                  className={`rounded-md border px-2.5 py-1.5 text-xs leading-relaxed [overflow-wrap:anywhere] ${
                    f.severity === "error"
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "border-warning/40 bg-warning/10 text-foreground"
                  }`}
                >
                  <span className="font-semibold">“{f.match}”</span> {f.message}
                </li>
              ))}
            </ul>
          )}
          {s.issue && (
            <p className="flex items-start gap-1.5 text-xs font-medium text-primary">
              <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.issue}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          {onBoard ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-success/30 bg-success/5 px-3 text-sm font-medium text-success">
              <Check className="h-4 w-4" /> Added
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
              <Columns3 className="h-4 w-4" /> Add to board
            </Button>
          )}
          <Button asChild size="sm" className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95">
            <Link to={writeUrl}>
              <PenLine className="h-4 w-4" /> Write this post
            </Link>
          </Button>
          {onBoard && (
            <Link to="/board" className="text-xs font-medium text-primary hover:underline">
              View board
            </Link>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove brief: ${brief.idea}`}
            className="ml-auto gap-1.5 text-muted-foreground"
          >
            <X className="h-4 w-4" /> Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- The section ----------------------------------------------------------------

export default function IdeaDump() {
  const { hash } = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<IdeaBrief[]>([]);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [speechSupported] = useState(() => speechRecognition() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const id = data.session?.user.id ?? null;
      setUserId(id);
      setBriefs(loadBriefs(id));
      setDrafts(loadDrafts(id));
    });
    return () => {
      active = false;
      recognitionRef.current?.abort();
    };
  }, []);

  // Arriving from the board's "Dump ideas" link.
  useEffect(() => {
    if (hash !== "#idea-dump") return;
    const t = window.setTimeout(
      () => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80,
    );
    return () => window.clearTimeout(t);
  }, [hash]);

  const split = useMemo(() => splitIdeas(text), [text]);
  const audience = useMemo(() => preferredAudience(userId), [userId]);

  const toggleDictation = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = speechRecognition();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-SG";
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText.trim()) setText((prev) => appendDictation(prev, finalText));
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Microphone access is blocked. Allow it in your browser settings to dictate.");
      } else if (e.error === "no-speech") {
        setMicError("Didn't catch that. Try again a little closer to the mic.");
      } else if (e.error !== "aborted") {
        setMicError("Dictation stopped. Try again.");
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
      setMicError("");
    } catch {
      setMicError("Couldn't start dictation. Try again.");
    }
  };

  const handleDevelop = async () => {
    if (!userId || loading) return;
    recognitionRef.current?.stop();
    const { ideas, overflow, tooShort } = splitIdeas(text);
    if (ideas.length === 0) {
      setNotice({ kind: "no-ideas", message: NO_IDEAS_MESSAGE, thin: tooShort.slice(0, 3), skipped: [] });
      return;
    }
    setNotice(null);
    setPendingCount(ideas.length);
    setLoading(true);
    const outcome = await developIdeas(ideas, buildIdeaDumpContext(userId));
    setLoading(false);
    if (outcome.kind === "ok") {
      setBriefs(addBriefs(userId, outcome.briefs));
      // Leave what wasn't developed in the box: ideas past the limit and thin lines.
      setText([...overflow, ...tooShort].join("\n"));
      setNotice({
        kind: "done",
        developed: outcome.briefs.length,
        heldBack: overflow.length,
        thin: tooShort.length,
        skipped: outcome.skipped,
        usage: outcome.usage,
      });
    } else if (outcome.kind === "no-ideas") {
      setNotice({ kind: "no-ideas", message: outcome.message, thin: tooShort.slice(0, 3), skipped: outcome.skipped });
    } else {
      setNotice(outcome);
    }
  };

  const chooseHook = (brief: IdeaBrief, index: number) => {
    if (!userId || index === brief.chosenHook) return;
    setBriefs(updateBrief(userId, brief.id, { chosenHook: index }));
  };

  const addToBoard = (brief: IdeaBrief) => {
    if (!userId) return;
    const draftId = addBriefToBoard(userId, brief, audience);
    setBriefs(updateBrief(userId, brief.id, { boardDraftId: draftId }));
    setDrafts(loadDrafts(userId));
  };

  const remove = (brief: IdeaBrief) => {
    if (!userId) return;
    setBriefs(removeBrief(userId, brief.id));
  };

  return (
    <section id="idea-dump" ref={sectionRef} className="scroll-mt-20 space-y-4" aria-labelledby="idea-dump-title">
      <div className="flex items-center gap-1">
        <h2 id="idea-dump-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <Lightbulb className="h-4 w-4 text-primary" /> Idea Dump
        </h2>
        <InfoTip label="About Idea Dump">
          Each idea comes back as a brief: angle, hooks, talking points, CTA.
        </InfoTip>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="idea-dump-notes">Your rough ideas</Label>
            {text.trim() && (
              <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                {split.ideas.length > 0 && (
                  <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary">
                    {plural(split.ideas.length, "idea", "ideas")} ready
                  </span>
                )}
                {split.overflow.length > 0 && (
                  <span className={CHIP}>+{split.overflow.length} next round</span>
                )}
                {split.tooShort.length > 0 && (
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-foreground">
                    {split.tooShort.length} too short
                  </span>
                )}
              </div>
            )}
          </div>
          <Textarea
            id="idea-dump-notes"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (notice?.kind === "no-ideas") setNotice(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleDevelop();
              }
            }}
            readOnly={loading}
            rows={6}
            maxLength={MAX_NOTES_CHARS}
            placeholder={PLACEHOLDER}
            aria-describedby="idea-dump-help"
          />
          {listening && (
            <p className="text-xs text-primary [overflow-wrap:anywhere]" aria-live="polite">
              Listening…{interim && <span className="text-muted-foreground"> “{interim}”</span>}
            </p>
          )}
          {micError && <p className="text-xs text-destructive">{micError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void handleDevelop()}
              disabled={loading || !text.trim() || !userId}
              className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" /> Develop my ideas
            </Button>
            {speechSupported && (
              <Button
                type="button"
                variant="outline"
                onClick={toggleDictation}
                disabled={loading}
                aria-pressed={listening}
                className="gap-1.5"
              >
                {listening ? (
                  <>
                    <Square className="h-4 w-4" /> Stop
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" /> Dictate
                  </>
                )}
              </Button>
            )}
            {text.length > MAX_NOTES_CHARS * 0.8 && (
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {text.length.toLocaleString()}/{MAX_NOTES_CHARS.toLocaleString()}
              </span>
            )}
          </div>
          <p id="idea-dump-help" className="text-[11px] text-muted-foreground">
            One idea per line, up to {MAX_IDEAS} at a time. Your briefs are saved to your account.
          </p>
        </CardContent>
      </Card>

      <div aria-live="polite" className="space-y-3 empty:hidden">
        {loading && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" role="status" data-testid="idea-dump-loading">
            <ThinkingOrb state="composing" size={20} theme="light" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Developing {plural(pendingCount, "idea", "ideas")}…
              </p>
              <p className="text-xs text-muted-foreground">
                Working out the angle, hooks and funnel stage for each. This can take up to a minute.
              </p>
            </div>
          </div>
        )}

        {!loading && notice?.kind === "error" && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {notice.message}
            </p>
            <Button size="sm" variant="outline" onClick={() => void handleDevelop()} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
          </div>
        )}

        {!loading && notice?.kind === "limit" && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground" role="status">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-0.5">
              <p className="font-medium">Daily limit reached</p>
              <p className="text-muted-foreground">{notice.message} Your notes stay in the box.</p>
            </div>
          </div>
        )}

        {!loading && notice?.kind === "no-ideas" && (
          <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground" role="status">
            <p className="flex items-start gap-2 font-medium">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {notice.message}
            </p>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              Say who it's for or what the point is. “hospital plans” becomes “why fresh grads put off
              hospital plans”.
            </p>
            {notice.thin.length > 0 && (
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                Too short: {notice.thin.map((t) => `“${t}”`).join(", ")}
              </p>
            )}
            <SkippedList skipped={notice.skipped} />
          </div>
        )}

        {!loading && notice?.kind === "done" && (
          <div className="space-y-1.5 rounded-xl border border-success/30 bg-success/5 p-4 text-sm" role="status">
            <p className="flex items-center gap-2 font-medium text-success">
              <Check className="h-4 w-4" /> Developed {plural(notice.developed, "brief", "briefs")}.
            </p>
            {notice.heldBack > 0 && (
              <p className="text-xs text-muted-foreground">
                {plural(notice.heldBack, "more idea is", "more ideas are")} still in the box. Develop{" "}
                {notice.heldBack === 1 ? "it" : "them"} next.
              </p>
            )}
            {notice.thin > 0 && (
              <p className="text-xs text-muted-foreground">
                {plural(notice.thin, "line needs", "lines need")} a bit more before it can be developed.
              </p>
            )}
            <SkippedList skipped={notice.skipped} />
            {notice.usage && (
              <p className="text-[11px] text-muted-foreground">
                {notice.usage.used} of {notice.usage.limit} runs used today.
              </p>
            )}
          </div>
        )}
      </div>

      {briefs.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Your briefs</p>
            <span className="text-xs text-muted-foreground">
              {briefs.length} saved{briefs.length >= MAX_SAVED_BRIEFS ? ", oldest drop off" : ""}
            </span>
          </div>
          {briefs.map((b) => (
            <BriefCard
              key={b.id}
              brief={b}
              onBoard={isOnBoard(b, drafts)}
              writeUrl={briefWriteUrl(b, audience)}
              onChooseHook={(i) => chooseHook(b, i)}
              onAdd={() => addToBoard(b)}
              onRemove={() => remove(b)}
            />
          ))}
        </div>
      ) : (
        !loading && (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground" data-testid="idea-dump-empty">
            Your briefs land here.
          </div>
        )
      )}
    </section>
  );
}
