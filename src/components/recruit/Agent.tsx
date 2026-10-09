import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Save, Square, Wand2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FORMULAS, INTERVIEW, RECRUIT_FORMATS, STAGES, type FormulaId, type RecruitFormat, type RecruitStage } from "@/data/recruitKit";
import {
  anglesFrom,
  buildAgentPack,
  buildContextDocument,
  buildRecruitBrief,
  interviewAnswered,
  scanRecruitCompliance,
  stripDashes,
  unsupportedNumbers,
  type RecruitBrain,
} from "@/lib/recruit";
import { streamOnePost } from "@/lib/batchGenerate";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { upsertDraft } from "@/lib/draftHistory";
import { scoped } from "@/lib/profiles";
import { CopyButton, Flags, Part } from "./shared";

type Update = (fn: (b: RecruitBrain) => RecruitBrain) => void;

const CTA_FOR_STAGE: Record<RecruitStage, string> = { tofu: "save-share", mofu: "open-question", bofu: "book-call" };

export function recruitDraftLabel(stage: RecruitStage, formula: FormulaId | null): string {
  const f = formula ? FORMULAS.find((x) => x.id === formula)?.label : "Best-fit formula";
  return `Recruitment - ${stage.toUpperCase()} - ${f}`;
}

export default function Agent({ brain, update, userId }: { brain: RecruitBrain; update: Update; userId: string | null }) {
  const { toast } = useToast();
  const answered = interviewAnswered(brain);
  const angles = useMemo(() => anglesFrom(brain), [brain]);
  const contextDoc = useMemo(() => buildContextDocument(brain), [brain]);
  const [showDoc, setShowDoc] = useState(false);

  // Device-only memory: the topic and the draft (an AI call already paid for)
  // survive a tab switch or a trip to another page.
  const memoKey = `cs-recruit-agent-${scoped(userId) ?? "anon"}`;
  const [memo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(memoKey) ?? "{}") as Partial<{
        format: RecruitFormat; formula: FormulaId | null; stage: RecruitStage; topic: string; draft: string; savedId: string | null;
      }>;
    } catch {
      return {};
    }
  });
  const [format, setFormat] = useState<RecruitFormat>(
    RECRUIT_FORMATS.some((f) => f.id === memo.format) ? memo.format! : "li-text",
  );
  const [formula, setFormula] = useState<FormulaId | null>(memo.formula ?? null);
  const [stage, setStage] = useState<RecruitStage>(memo.stage ?? "tofu");
  const [topic, setTopic] = useState(memo.topic ?? "");
  const [draft, setDraft] = useState(memo.draft ?? "");
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(memo.savedId ?? null);
  useEffect(() => {
    try {
      localStorage.setItem(memoKey, JSON.stringify({ format, formula, stage, topic, draft, savedId }));
    } catch {
      // storage full or blocked: the page still works, it just won't remember
    }
  }, [memoKey, format, formula, stage, topic, draft, savedId]);
  const abort = useRef<AbortController | null>(null);
  // The last text the agent wrote and the last text saved: anything else in the
  // box is the consultant's own edit, which "Write it again" must not wipe silently.
  const generated = useRef(memo.draft ?? "");
  const lastSaved = useRef(memo.savedId ? memo.draft ?? "" : "");
  const flags = useMemo(() => {
    const f = scanRecruitCompliance(draft);
    for (const n of busy ? [] : unsupportedNumbers(draft, contextDoc)) {
      f.push({ id: `num::${n}`, ruleId: "unsupported-number", severity: "warn", match: n, message: "This number isn't in your answers or Brand Brain. Check it, or replace it with one of your own." });
    }
    return f;
  }, [draft, busy, contextDoc]);

  const pickAngle = (id: string) => {
    const a = angles.find((x) => x.id === id);
    if (!a) return;
    setTopic(a.text);
    setFormula(a.formula);
    setStage(a.stage);
  };

  const write = async () => {
    if (!topic.trim()) return;
    if (draft.trim() && draft !== generated.current && draft !== lastSaved.current
      && !window.confirm("Replace the draft below? Your edits to it will be lost.")) return;
    const fmt = RECRUIT_FORMATS.find((f) => f.id === format)!;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setDraft("");
    setSavedId(null);
    await streamOnePost(
      {
        pillar: "identity",
        pillarDetail: "Recruitment: a career as a financial adviser on my team",
        ideaSource: "Recruitment post (#TopofMind method)",
        ideaContext: buildRecruitBrief(brain, { format, formula, stage, topic }),
        format: fmt.format,
        platform: fmt.platform,
        ctaType: CTA_FOR_STAGE[stage],
        audience: "working-adult",
        voiceSummary: loadVoiceProfile(userId)?.voiceSummary || undefined,
      },
      {
        onToken: (text) => {
          generated.current = stripDashes(text);
          setDraft(generated.current);
        },
        onComplete: (text) => {
          generated.current = stripDashes(text);
          setDraft(generated.current);
          setBusy(false);
        },
        onError: (message) => {
          setBusy(false);
          toast({ title: "The draft didn't come through", description: `${message}. Your inputs are kept; try again.`, variant: "destructive" });
        },
      },
      controller.signal,
    );
    setBusy(false);
  };

  const save = () => {
    if (!userId || !draft.trim()) return;
    const fmt = RECRUIT_FORMATS.find((f) => f.id === format)!;
    const id = savedId ?? `recruit-${Date.now()}`;
    upsertDraft(userId, {
      id,
      createdAt: new Date().toISOString(),
      hook: draft.trim().split("\n")[0].slice(0, 160),
      draft,
      pillar: "identity",
      pillarDetail: recruitDraftLabel(stage, formula),
      audience: "working-adult",
      format: fmt.format,
      platform: fmt.platform,
      ctaType: CTA_FOR_STAGE[stage],
      status: "draft",
    });
    setSavedId(id);
    lastSaved.current = draft;
    toast({ title: "Saved to My posts", description: "Schedule it from Pipeline." });
  };

  return (
    <div className="space-y-5">
      <Part n="1" title="The interview" done={answered === INTERVIEW.length}
        tip="Answer the way you'd say it out loud; your raw words become the agent's voice reference. On a phone, use the keyboard mic.">
        <p className="text-xs font-semibold text-muted-foreground">{answered}/{INTERVIEW.length} answered</p>
        <ol className="space-y-3">
          {INTERVIEW.map((q, i) => (
            <li key={q.id} className="space-y-1">
              <label htmlFor={`iv-${q.id}`} className="text-xs font-semibold leading-snug">{i + 1}. {q.q}</label>
              <Textarea
                id={`iv-${q.id}`}
                rows={2}
                value={brain.interview[q.id] ?? ""}
                onChange={(e) => update((b) => ({ ...b, interview: { ...b.interview, [q.id]: e.target.value } }))}
                placeholder="In your own words. Push for a name, a number or a moment."
              />
            </li>
          ))}
        </ol>
      </Part>

      <Part n="2" title="Your Context Document" tip="Built only from what you typed here and on Brand Brain, so it can't invent a fact.">
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={buildAgentPack(brain)} label="Copy agent for ChatGPT / Claude" what="Agent copied: paste it into a new chat or project" />
          <CopyButton text={contextDoc} label="Copy Context Document" what="Context Document copied" />
          <Button variant="ghost" size="sm" className="h-9 text-xs sm:h-8 [@media(pointer:coarse)]:h-11" onClick={() => setShowDoc((v) => !v)} aria-expanded={showDoc}>
            {showDoc ? "Hide" : "Preview"}
          </Button>
        </div>
        {showDoc && (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 font-sans text-xs leading-relaxed">
            {contextDoc}
          </pre>
        )}
      </Part>

      <Part n="3" title="Write with your agent">
        {angles.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Angles from your answers</p>
            <div className="flex flex-wrap gap-1.5">
              {angles.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickAngle(a.id)}
                  className="h-9 max-w-full truncate rounded-full border border-border/60 px-3 text-left text-[11px] sm:h-7 [@media(pointer:coarse)]:h-11 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  title={a.text}
                >
                  {a.text.split(":")[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="rc-topic" className="text-xs font-semibold">What is this post about?</label>
          <Textarea id="rc-topic" rows={2} value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder="The one thing most people get wrong about changing careers" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold">
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value as RecruitFormat)}
              className="h-9 [@media(pointer:coarse)]:h-11 w-full rounded-md border border-input bg-background px-2 text-sm font-normal">
              {RECRUIT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Funnel stage
            <select value={stage} onChange={(e) => setStage(e.target.value as RecruitStage)}
              className="h-9 [@media(pointer:coarse)]:h-11 w-full rounded-md border border-input bg-background px-2 text-sm font-normal">
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.id.toUpperCase()} - {s.label} ({s.share}%)</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Formula
            <select value={formula ?? ""} onChange={(e) => setFormula((e.target.value || null) as FormulaId | null)}
              className="h-9 [@media(pointer:coarse)]:h-11 w-full rounded-md border border-input bg-background px-2 text-sm font-normal">
              <option value="">Pick the best fit for me</option>
              {FORMULAS.map((f) => <option key={f.id} value={f.id}>{f.n}. {f.label}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">{STAGES.find((s) => s.id === stage)?.ask}</p>

        <div className="flex flex-wrap gap-2">
          {/* Once a draft is in, Save leads and writing again steps back. */}
          <Button
            onClick={write}
            disabled={!topic.trim() || busy}
            variant={draft && !busy ? "outline" : "default"}
            className={`gap-1.5 ${draft && !busy ? "" : "bg-gradient-primary text-primary-foreground"} ${busy ? "disabled:opacity-100" : ""}`}
          >
            {busy ? <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-4 w-4" />}
            {busy ? "Writing in your voice..." : draft ? "Write it again" : "Draft it"}
          </Button>
          {busy && (
            <Button variant="outline" onClick={() => abort.current?.abort()} className="gap-1.5">
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          )}
        </div>

        {draft && (
          <div className="space-y-2">
            <Textarea rows={Math.min(30, Math.max(8, draft.split("\n").length + 2))} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Draft" className="font-sans text-sm leading-relaxed" />
            <Flags flags={flags} />
            {!busy && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={save} disabled={!userId} className="gap-1.5">
                  <Save className="h-3.5 w-3.5" /> {savedId ? "Save changes" : "Save to My posts"}
                </Button>
                <CopyButton text={draft} label="Copy" what="Draft copied" />
                {savedId && (
                  <Link to="/calendar" className="text-xs font-semibold text-primary hover:underline">Schedule it</Link>
                )}
              </div>
            )}
          </div>
        )}
      </Part>
    </div>
  );
}
