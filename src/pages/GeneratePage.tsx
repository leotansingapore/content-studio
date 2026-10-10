import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RealQuestions from "@/components/RealQuestions";
import { withQuestion } from "@/lib/sgFeeds";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { imageBusy, imageJob, makeImage, onImageJob, type ImageJob } from "@/lib/aiImage";
import { FACTORS, loadScores, saveScore, scorePost, textKey } from "@/lib/postScore";
import {
  Sparkles,
  Copy,
  Clapperboard,
  RefreshCw,
  Heart,
  User,
  BookOpen,
  Users,
  Image as ImageIcon,
  Video,
  AlignLeft,
  Smartphone,
  Linkedin,
  Instagram,
  Facebook,
  Lightbulb,
  X as XIcon,
  Check,
  StopCircle,
  Wand2,
  AlertTriangle,
  Mic,
  Hash,
  Image as ImageWandIcon,
  Keyboard,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Gauge,
  BookmarkPlus,
  MessageSquare,
  Eraser,
  Columns3,
  ArrowRight,
  Star,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import inspirationData from "@/data/inspiration.json";
import { type InspirationEntry } from "@/components/Inspiration";
import PostPreview from "@/components/PostPreview";
import { analyzePosts } from "@/lib/coach";
import type { PlatformId } from "@/lib/platformCounters";
import {
  scanCompliance,
  hasComplianceErrors,
  type ComplianceFlag,
} from "@/lib/compliance";
import {
  isVoiceProfileUsable,
  loadVoiceProfile,
  isNudgeDismissed,
  dismissNudgeForSession,
  VOICE_MIN_CHARS,
} from "@/lib/voiceProfile";
import HumanCheck from "@/components/HumanCheck";
import FactFlags from "@/components/FactFlags";
import { ideaIsThin, pickHook } from "@/lib/writingJudge";
import {
  getDraftById,
  loadDrafts,
  newDraftId,
  upsertDraft,
  type DraftEntry,
} from "@/lib/draftHistory";
import { useDraftReviews } from "@/hooks/useDraftReviews";
import { getTrackedPosts, suggestPostingTime } from "@/lib/analytics";
import { scheduleTime, timeLabel } from "@/lib/dueDates";
import { ToastAction } from "@/components/ui/toast";
import {
  BLANKS_RULE,
  checkLimits,
  findBlanks,
  findLinks,
  moveLinksToComment,
  readout,
  REEL_LENGTHS,
  reelLengthRule,
  reelTooLong,
  spokenSeconds,
  spokenWords,
  type CounterReadout,
  type LimitCheck,
  type ReelLength,
} from "@/lib/platformCounters";
import { splitScriptCaption } from "@/lib/scriptCaption";
import ShotList from "@/components/ShotList";
import PostReceipt from "@/components/PostReceipt";
import { BOARD_COLUMNS, columnOf, loadStages, setStage, type ProductionStage } from "@/lib/board";
import { DAILY_LIMITS, ReelCloneError } from "@/lib/reelClone";
import { makeStoryboard, storyboardRun, type Storyboard } from "@/lib/storyboard";
import { formulaOfHook, HOOK_FORMULAS, hookFormula, hookFormulaFields, hookFormulaSet, hookFormulasFrom } from "@/lib/hookFormulas";
import {
  cleanAiTells,
  DISCLOSURES,
  stripDashes,
  tagLinks,
  toPlainText,
  withDisclosure,
  withSignOff,
  type DisclosureId,
} from "@/lib/plainText";
import { loadBrand } from "@/lib/carousel";
import { allowedLinks, applyBrandRules, brandRulesLine } from "@/lib/brandRules";
import { streamOnePost } from "@/lib/batchGenerate";
import QuickTip from "@/components/QuickTip";
import CompetitorReference, {
  buildCompetitorStyleReference,
  findCompetitorByHandle,
  type CompetitorRef,
} from "@/components/CompetitorReference";
import {
  FUNNEL_STAGES,
  getFunnelStage,
  type FunnelStageId,
} from "@/data/funnelFramework";
import { activeProfileId, loadProfiles, scoped, setActiveProfile } from "@/lib/profiles";
import {
  deleteTemplate,
  loadTemplates,
  saveTemplate,
  type BriefTemplate,
} from "@/lib/templates";

type Pillar = "interest" | "identity" | "topic" | "market";
type Format = "carousel" | "short-video" | "text-post" | "story";
type Platform = "linkedin" | "instagram" | "facebook" | "tiktok";
type CtaType =
  | "dm-keyword"
  | "comment-keyword"
  | "save-share"
  | "book-call"
  | "open-question";
type Audience =
  | "young-adult"
  | "working-adult"
  | "parent"
  | "pre-retiree"
  | "general";
type StreamingMode = "idle" | "hooks" | "variants";

const HALT_LABEL = { stopped: "stopped", failed: "didn't finish" } as const;

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://hgdbflprrficdoyxmdxe.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnZGJmbHBycmZpY2RveXhtZHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NjY0NDAsImV4cCI6MjA2NzM0MjQ0MH0.2qwUbh0nkFyOLzzZgXk7bedINzHSf2ULMBUECOqWmIw";

const PILLARS: {
  value: Pillar;
  label: string;
  sub: string;
  icon: typeof Heart;
  tag: "Social" | "Authority";
  placeholder: string;
}[] = [
  {
    value: "interest",
    label: "Interest",
    sub: "A hobby/passion that humanises you",
    icon: Heart,
    tag: "Social",
    placeholder:
      "e.g. weekend running, photography, gaming, hawker hunting",
  },
  {
    value: "identity",
    label: "Identity",
    sub: "A life-stage or role you share with the audience",
    icon: User,
    tag: "Social",
    placeholder:
      "e.g. mum of two, fresh grad, ex-engineer turned FC, late-30s career-switcher",
  },
  {
    value: "topic",
    label: "Topic",
    sub: "A specific financial area you teach",
    icon: BookOpen,
    tag: "Authority",
    placeholder:
      "e.g. CPF SA top-ups, ILPs, critical illness, retirement planning",
  },
  {
    value: "market",
    label: "Market",
    sub: "A specific client segment you serve",
    icon: Users,
    tag: "Authority",
    placeholder:
      "e.g. fresh graduates earning $3.5-4.5K, SME owners, young families with kids under 7",
  },
];

const IDEA_SOURCES: { value: string; label: string; example: string }[] = [
  {
    value: "real-question",
    label: "A real question from a client this week",
    example: "e.g. 'My SA is only $20K at 32, is that bad?'",
  },
  {
    value: "common-mistake",
    label: "A common mistake people make",
    example: "e.g. assuming employer insurance is enough",
  },
  {
    value: "news-hook",
    label: "A news / Budget hook",
    example: "e.g. SG Budget CPF changes, market drop, MAS rule update",
  },
  {
    value: "personal-story",
    label: "A personal story or lesson learned",
    example:
      "e.g. first rejection, first client, what I'd tell my younger self",
  },
  {
    value: "before-after",
    label: "A before-and-after / case study",
    example:
      "e.g. anonymised client moved from Plan X to Plan Y, savings = $$",
  },
  {
    value: "three-things",
    label: "'3 things you didn't know about ___'",
    example: "e.g. 3 things you didn't know about CPF SA top-ups",
  },
  {
    value: "myth-bust",
    label: "Myth-busting",
    example: "e.g. 'Insurance is a scam' / 'CPF is just government money'",
  },
];

const FORMATS: {
  value: Format;
  label: string;
  sub: string;
  icon: typeof ImageIcon;
}[] = [
  {
    value: "carousel",
    label: "Carousel",
    sub: "5-8 slides, one idea per slide",
    icon: ImageIcon,
  },
  {
    value: "short-video",
    label: "Short video",
    sub: "Script for Reels, Shorts or TikTok",
    icon: Video,
  },
  {
    value: "text-post",
    label: "Text post",
    sub: "100-250 words, mobile-readable",
    icon: AlignLeft,
  },
  {
    value: "story",
    label: "Story frames",
    sub: "3-5 IG/FB story frames",
    icon: Smartphone,
  },
];

const PLATFORMS: { value: Platform; label: string; icon: typeof Linkedin }[] =
  [
    { value: "linkedin", label: "LinkedIn", icon: Linkedin },
    { value: "instagram", label: "Instagram", icon: Instagram },
    { value: "facebook", label: "Facebook", icon: Facebook },
    { value: "tiktok", label: "TikTok", icon: Video },
  ];

const CTAS: { value: CtaType; label: string; sub: string }[] = [
  {
    value: "dm-keyword",
    label: "DM keyword",
    sub: "'DM me GUIDE for the CPF top-up guide.'",
  },
  {
    value: "comment-keyword",
    label: "Comment keyword",
    sub: "'Comment INFO and I'll send the calculator.'",
  },
  {
    value: "save-share",
    label: "Save / share",
    sub: "'Save this for your next CPF review.'",
  },
  {
    value: "book-call",
    label: "Soft 15-min call",
    sub: "'DM me if you'd like a no-pressure 15-min review.'",
  },
  {
    value: "open-question",
    label: "Open question",
    sub: "'What's the one CPF question you've never had answered?'",
  },
];

const AUDIENCES: { value: Audience; label: string; sub: string }[] = [
  { value: "general", label: "General", sub: "Broad SG working/family adults" },
  { value: "young-adult", label: "Young adult", sub: "21-27, fresh grads, early-career" },
  { value: "working-adult", label: "Working adult", sub: "28-40, mid-career, building" },
  { value: "parent", label: "Parent", sub: "Kids under 16, family-first" },
  { value: "pre-retiree", label: "Pre-retiree", sub: "50-62, retirement runway" },
];

const PILLAR_FROM_INSPIRATION: Record<
  InspirationEntry["pillar"],
  Pillar
> = {
  Authority: "topic",
  Tip: "topic",
  Hook: "topic",
  CTA: "topic",
  Social: "identity",
};

const FORMAT_FROM_INSPIRATION: Record<
  InspirationEntry["format"],
  Format
> = {
  "text-only": "text-post",
  carousel: "carousel",
  "short-video": "short-video",
};

const PLATFORM_FROM_INSPIRATION: Record<
  InspirationEntry["platform"],
  Platform
> = {
  linkedin: "linkedin",
  instagram: "instagram",
  facebook: "facebook",
};

const AUDIENCE_FROM_INSPIRATION: Record<string, Audience> = {
  "young-adult": "young-adult",
  "working-adult": "working-adult",
  parent: "parent",
  "pre-retiree": "pre-retiree",
  general: "general",
};

const ENTRIES = inspirationData as InspirationEntry[];

// An unfinished brief, kept for this tab until a draft is picked so leaving
// Write (to set a voice, check a post) doesn't throw away what was typed.
// sessionStorage, outside the synced content-studio- prefix: it is scratch.
const briefKey = (userId: string) => `cs-write-brief-${scoped(userId)}`;

// Hook / variation rows read back from the tab's saved brief. A row that never
// finished reads as stopped rather than streaming forever.
function restoreRows(raw: unknown): VariantState[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r.index === "number" && typeof r.text === "string")
    .map((r) => ({
      index: r.index,
      text: r.text,
      complete: r.complete === true,
      ...(r.complete === true ? {} : { halted: r.halted === "failed" ? ("failed" as const) : ("stopped" as const) }),
      ...(hookFormula(r.formula) ? { formula: r.formula as string } : {}),
    }));
}

// Labels for the 4 guided steps, in the order the consultant fills them in.
const STEP_META = [
  { label: "Topic" },
  { label: "Funnel" },
  { label: "Idea" },
  { label: "Format" },
];
const IDEA_STEP = 2;
const LAST_STEP = STEP_META.length - 1;

interface VariantState {
  index: number;
  text: string;
  complete: boolean;
  // Set when the request ended (Stop, error, early close) before this row finished.
  halted?: "stopped" | "failed";
  // The hook formula a hook row was written with (hookFormulas.ts id).
  formula?: string;
}

// A copy of the finished post rewritten for another platform. It is saved to
// My posts as its own draft and never touches the original.
interface PlatformVersion {
  platform: Platform;
  text: string;
  status: "streaming" | "done" | "stopped" | "failed";
  draftId: string;
}

const ADAPT_PLATFORMS: Platform[] = ["instagram", "linkedin", "facebook"];

const platformLabel = (p: string) => PLATFORMS.find((x) => x.value === p)?.label ?? p;

const firstLine = (text: string) =>
  text.split("\n").find((l) => l.trim())?.trim().slice(0, 120) ?? "";

// The idea context for an adapt call: the finished post is the source and the
// payload's platform field carries the target platform's rules.
function adaptContext(post: string, target: Platform): string {
  const name = platformLabel(target);
  return [
    `Adapt the post below for ${name}. Keep its idea, facts, numbers and call to action.`,
    `Rewrite the opening, length, line breaks and tone so it reads like a native ${name} post. Do not mention any other platform.`,
    BLANKS_RULE,
    "",
    "The post:",
    post,
  ].join("\n");
}

// One-tap rewrites of the draft. Each is one generation; the result is offered
// beside the draft and only replaces it when the user picks it.
const REWRITES = [
  { id: "shorter", label: "Shorter", instruction: "make it about a third shorter" },
  { id: "longer", label: "Longer", instruction: "make it about a third longer, adding one more concrete detail" },
  { id: "simpler", label: "Simpler", instruction: "use plain words and short sentences anyone could follow" },
  { id: "casual", label: "More casual", instruction: "make the tone more casual and conversational" },
  { id: "formal", label: "More formal", instruction: "make the tone more formal and polished" },
] as const;
// "lines": the lines the sounds-human check flagged, rewritten, the rest kept.
type RewriteId = (typeof REWRITES)[number]["id"] | "lines";
const rewriteLabel = (id: RewriteId) => (id === "lines" ? "Rewrite flagged lines" : REWRITES.find((r) => r.id === id)!.label);

// The generator's own rules (format length, a framing nudge) win over loose
// context, so a rewrite states a word target and says it overrides them.
const REWRITE_LENGTH: Partial<Record<RewriteId, number>> = { shorter: 0.65, longer: 1.35 };

function rewriteFields(post: string, id: RewriteId, lines: string[] = []): { ideaContext: string; styleReference: string } {
  const instruction =
    id === "lines"
      ? `rewrite only these lines so each sounds like a person talking, and keep every other line word for word: ${lines.map((l) => `"${l}"`).join(" ")}`
      : REWRITES.find((r) => r.id === id)!.instruction;
  const words = post.split(/\s+/).filter(Boolean).length;
  const target = Math.max(20, Math.round(words * (REWRITE_LENGTH[id] ?? 1)));
  const rule = `This is an edit of an existing post, not a new post. Rewrite instruction: ${instruction}. Target length: about ${target} words. The instruction and target length override the format length, variant tone and framing rules.`;
  return {
    ideaContext: [
      rule,
      "Keep the same opening line idea, the same points in the same order, the same facts and numbers, and the same call to action.",
      BLANKS_RULE,
      "",
      "The post:",
      post,
    ].join("\n"),
    styleReference: `${rule} Keep the structure of the post in the context.`,
  };
}

function ComplianceChips({
  flags,
  onDismiss,
}: {
  flags: ComplianceFlag[];
  onDismiss: (id: string) => void;
}) {
  if (flags.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {flags.map((flag) => {
        const isError = flag.severity === "error";
        return (
          <div
            key={flag.id}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
              isError
                ? "border-destructive/50 bg-destructive/10 text-red-700 dark:text-red-300"
                : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            }`}
          >
            <AlertTriangle
              className={`mt-0.5 h-3 w-3 shrink-0 ${
                isError ? "text-destructive" : "text-amber-600"
              }`}
            />
            <div className="space-y-0.5">
              <div className="font-semibold uppercase tracking-[0.14em]">
                {isError ? "Compliance error" : "Compliance warning"}
                <span className="ml-1.5 rounded bg-background/60 px-1 py-0.5 font-mono text-[10px] normal-case tracking-normal">
                  {flag.match}
                </span>
              </div>
              <div className="text-[11px] leading-snug">{flag.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(flag.id)}
              className="-my-1 -mr-1.5 ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-background/40"
              aria-label="Dismiss flag"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Hashtag and character counts of the text a copy puts on the clipboard, with
// a plain warning past a platform's limit.
function LimitChips({ check, platform }: { check: LimitCheck; platform: Platform }) {
  const over = check.chars > check.maxChars;
  return (
    <>
      <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-muted-foreground">
        Hashtags: {check.hashtags}
        {platform === "instagram" ? "/30" : platform === "linkedin" ? " (3 max)" : ""}
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 font-mono ${
          over
            ? "border-destructive/50 bg-destructive/10 text-red-700 dark:text-red-300"
            : "border-border/60 bg-muted/30 text-muted-foreground"
        }`}
      >
        {check.chars.toLocaleString("en-US")}/{check.maxChars.toLocaleString("en-US")} chars
      </span>
      {check.warnings.map((w) => (
        <span
          key={w.message}
          role="alert"
          className={`flex basis-full items-start gap-1.5 text-xs font-medium ${
            w.level === "over" ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w.message}
        </span>
      ))}
    </>
  );
}

const isReelLength = (v: unknown): v is ReelLength => (REEL_LENGTHS as readonly unknown[]).includes(v);

// The length a short-video script is written and counted for.
function ReelLengthPicker({ value, onChange }: { value: ReelLength; onChange: (s: ReelLength) => void }) {
  return (
    <div role="group" aria-label="Video length" className="flex gap-1">
      {REEL_LENGTHS.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          onClick={() => onChange(s)}
          className={`flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors sm:h-9 ${
            value === s
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border/70 text-muted-foreground hover:text-foreground"
          }`}
        >
          {s}s
        </button>
      ))}
    </div>
  );
}

type StreamRequest = BasePayload & {
  mode: "hooks" | "body" | "post";
  n: number;
  chosenHook?: string;
};

interface BasePayload {
  pillar: Pillar;
  pillarDetail: string;
  ideaSource: string;
  ideaContext?: string;
  format: Format;
  platform: Platform;
  ctaType: CtaType;
  styleReference?: string;
  audience: Audience;
  voiceSummary?: string;
  singlish?: boolean;
}

export default function GeneratePage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pillar, setPillar] = useState<Pillar>("topic");
  const [pillarDetail, setPillarDetail] = useState("");
  const [ideaSource, setIdeaSource] = useState<string>("real-question");
  const [ideaContext, setIdeaContext] = useState("");
  const [format, setFormat] = useState<Format>("text-post");
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [ctaType, setCtaType] = useState<CtaType>("dm-keyword");
  const [audience, setAudience] = useState<Audience>("general");
  const [singlish, setSinglish] = useState<boolean>(false);
  // How long a short video runs: the script is written and counted for it.
  const [reelSeconds, setReelSeconds] = useState<ReelLength>(30);
  // Saved brief templates (per profile), and the save-as-template form.
  const [templates, setTemplates] = useState<BriefTemplate[]>([]);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<{ name: string; keepTopic: boolean } | null>(null);
  // Disclosure labels added to the end of the post on copy. Off by default.
  const [disclosure, setDisclosure] = useState<DisclosureId[]>([]);
  // Funnel stage (Willis Lau's ABC funnel) — steers ideation + the draft.
  const [funnelStage, setFunnelStage] = useState<FunnelStageId | null>(null);
  // Competitor whose angle to reference (optional).
  const [competitorRef, setCompetitorRef] = useState<CompetitorRef | null>(null);
  // Hooks-first ON by default: per Day 41, the first 1-2 lines decide whether
  // anyone reads further. Forcing every post through a hook-validation step is
  // the highest-leverage edit on any draft.
  const [hooksFirst, setHooksFirst] = useState<boolean>(true);
  const [hookOptions, setHookOptions] = useState<VariantState[]>([]);
  const [chosenHook, setChosenHook] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantState[]>([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(
    null,
  );
  const [streamingMode, setStreamingMode] = useState<StreamingMode>("idle");
  const [draft, setDraft] = useState<string>("");
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const [vibeSourceId, setVibeSourceId] = useState<string | null>(null);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  // After a hook or variant pick, bring the next card into view: on a phone it
  // renders a full screen or more below the button that was tapped.
  const variantsCardRef = useRef<HTMLDivElement | null>(null);
  const draftCardRef = useRef<HTMLDivElement | null>(null);
  const scrollToVariantsRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamRunRef = useRef(0);
  // Which set of hook formulas the next Generate uses; each run takes the next.
  const hookSetRef = useRef(Math.floor(Math.random() * HOOK_FORMULAS.length));
  // A plan slot's formula: the first Generate opens its set with it.
  const planFormulaRef = useRef<string | null>(null);
  // Jev's recommended hook for the set just written (key: the hooks' texts).
  const [hookPick, setHookPick] = useState<{ key: string; index: number } | null>(null);
  const pickPendingRef = useRef(false);
  // Before writing from a thin idea, one question (asked once per brief text).
  const [ideaAsk, setIdeaAsk] = useState<{ answer: string } | null>(null);
  const [checkingIdea, setCheckingIdea] = useState(false);
  const ideaAskedRef = useRef(new Set<string>());
  const prefillAppliedRef = useRef<boolean>(false);
  // When a scheduled/posted slot is loaded, keep updating that same entry on
  // re-roll/pick (so it stays on the calendar) instead of forking a new draft.
  const preserveIdRef = useRef<string | null>(null);

  // Voice profile + nudge.
  const [userId, setUserId] = useState<string | null>(null);
  const [voiceSummary, setVoiceSummary] = useState<string | null>(null);
  const [voiceProfileUsable, setVoiceProfileUsable] = useState<boolean>(false);
  // Up to three saved voice posts, for the sounds-human check's voice match.
  const [voiceSamples, setVoiceSamples] = useState<string[]>([]);
  const [voiceNudgeDismissed, setVoiceNudgeDismissed] = useState<boolean>(false);

  // Draft history.
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  // ...and kept with the saved post, so reopening it from My posts keeps the line
  const savedDisclosure = useRef<string>("");
  useEffect(() => {
    if (!userId || !currentDraftId) return;
    const key = disclosure.join(",");
    if (key === savedDisclosure.current) return;
    savedDisclosure.current = key;
    const e = getDraftById(userId, currentDraftId);
    if (e && (e.disclosure ?? []).join(",") !== key) upsertDraft(userId, { ...e, disclosure: disclosure.length ? disclosure : undefined });
  }, [disclosure, userId, currentDraftId]);

  // Compliance flags + dismiss tracking.
  const [dismissedFlagIds, setDismissedFlagIds] = useState<Set<string>>(new Set());
  const dismissFlag = (id: string) =>
    setDismissedFlagIds((prev) => new Set(prev).add(id));

  // Platform versions of the finished draft: phones show one at a time behind
  // tabs, desktop puts the shown one beside the original.
  const [versions, setVersions] = useState<PlatformVersion[]>([]);
  const [activeTab, setActiveTab] = useState<"original" | Platform>("original");
  const versionAbortRef = useRef(new Map<string, AbortController>());
  const versionsTopRef = useRef<HTMLDivElement | null>(null);
  // A rewrite on offer, and the draft it replaced so it can be undone.
  const [rewrite, setRewrite] = useState<{
    id: RewriteId;
    text: string;
    status: "streaming" | "done";
  } | null>(null);
  const [undoText, setUndoText] = useState<string | null>(null);
  // What the Undo line says happened: a rewrite or a clean.
  const [undoNote, setUndoNote] = useState("Rewritten.");
  const rewriteAbortRef = useRef<AbortController | null>(null);
  // Links taken out of a LinkedIn draft, to paste as its first comment.
  const [firstComment, setFirstComment] = useState<string | null>(null);
  // A short video's storyboard, the draft one is being made for, and why the last one failed.
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [storyboardFor, setStoryboardFor] = useState<string | null>(null);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [boardStages, setBoardStages] = useState<Record<string, ProductionStage>>({});
  const draftIdRef = useRef<string | null>(null);
  draftIdRef.current = currentDraftId;
  // A new or re-picked draft starts without versions or a rewrite on offer;
  // finished versions are already in My posts.
  const clearDraftExtras = () => {
    versionAbortRef.current.forEach((c) => c.abort());
    versionAbortRef.current.clear();
    setVersions([]);
    setActiveTab("original");
    rewriteAbortRef.current?.abort();
    setRewrite(null);
    setUndoText(null);
    setFirstComment(null);
    setStoryboard(null);
    setStoryboardError(null);
  };
  useEffect(
    () => () => {
      versionAbortRef.current.forEach((c) => c.abort());
      rewriteAbortRef.current?.abort();
    },
    [],
  );

  // Hashtags + image prompt.
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagsLoading, setHashtagsLoading] = useState<boolean>(false);
  const [imagePrompt, setImagePrompt] = useState<string>("");
  const [imagePromptLoading, setImagePromptLoading] = useState<boolean>(false);
  // "Make the image": one job at a time, kept outside React so it survives leaving the page
  const [imgJob, setImgJob] = useState<ImageJob | null>(imageJob);
  useEffect(() => {
    const off = onImageJob(setImgJob);
    return () => {
      off();
    };
  }, []);

  // Keyboard shortcuts dialog visibility.
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);

  // Guided wizard: which of the 4 brief steps is open, and whether the brief
  // editor is expanded. Once a draft exists the brief collapses to a summary so
  // the screen stays focused on the output.
  const [wizardStep, setWizardStep] = useState<number>(0);
  const [briefOpen, setBriefOpen] = useState<boolean>(true);
  // Read once at mount: the prefill effects strip their params from the URL
  // before the async user lookup below resolves.
  const [arrivedWithBrief] = useState(() =>
    ["draft", "platform", "format", "vibe", "pillar", "detail", "funnel", "idea", "ctx"].some(
      (k) => new URLSearchParams(window.location.search).has(k),
    ),
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      // Restore the user's usual platform/format — most advisors post to one
      // platform 90% of the time. Deep-link params always win.
      try {
        if (!arrivedWithBrief && id) {
          const prefs = JSON.parse(
            localStorage.getItem(`content-studio-writeprefs-${scoped(id)}`) ?? "null",
          );
          if (prefs?.platform && PLATFORMS.some((p) => p.value === prefs.platform)) {
            setPlatform(prefs.platform as Platform);
          }
          if (prefs?.format && FORMATS.some((f) => f.value === prefs.format)) {
            setFormat(prefs.format as Format);
          }
          if (isReelLength(prefs?.reelSeconds)) setReelSeconds(prefs.reelSeconds);
          const brief = JSON.parse(sessionStorage.getItem(briefKey(id)) ?? "null");
          if (brief && typeof brief.pillarDetail === "string") {
            if (PILLARS.some((p) => p.value === brief.pillar)) setPillar(brief.pillar);
            setPillarDetail(brief.pillarDetail);
            if (AUDIENCES.some((a) => a.value === brief.audience)) setAudience(brief.audience);
            setSinglish(brief.singlish === true);
            if (FUNNEL_STAGES.some((f) => f.id === brief.funnelStage)) setFunnelStage(brief.funnelStage);
            if (IDEA_SOURCES.some((i) => i.value === brief.ideaSource)) setIdeaSource(brief.ideaSource);
            if (typeof brief.ideaContext === "string") setIdeaContext(brief.ideaContext);
            if (PLATFORMS.some((p) => p.value === brief.platform)) setPlatform(brief.platform);
            if (FORMATS.some((f) => f.value === brief.format)) setFormat(brief.format);
            if (isReelLength(brief.reelSeconds)) setReelSeconds(brief.reelSeconds);
            if (CTAS.some((c) => c.value === brief.ctaType)) setCtaType(brief.ctaType);
            if (Array.isArray(brief.disclosure)) {
              setDisclosure(brief.disclosure.filter((d: string) => d in DISCLOSURES));
            }
            if (typeof brief.wizardStep === "number") {
              setWizardStep(Math.min(LAST_STEP, Math.max(0, brief.wizardStep)));
            }
            const hooks = restoreRows(brief.hookOptions);
            const rows = restoreRows(brief.variants);
            if (typeof brief.hooksFirst === "boolean") setHooksFirst(brief.hooksFirst);
            if (typeof brief.chosenHook === "string") setChosenHook(brief.chosenHook);
            setHookOptions(hooks);
            setVariants(rows);
            if (hooks.length || rows.length) setBriefOpen(false);
            toast({
              title: hooks.length || rows.length ? "Your unfinished post is back" : "Your unfinished brief is back",
            });
          }
        }
      } catch {
        // corrupt prefs or a blocked storage are ignorable
      }
      setTemplates(loadTemplates(id));
      setBoardStages(loadStages(id));
      const profile = loadVoiceProfile(id);
      const usable = isVoiceProfileUsable(profile);
      setVoiceProfileUsable(usable);
      setVoiceSummary(usable ? (profile?.voiceSummary ?? null) : null);
      setVoiceSamples(usable ? (profile?.posts ?? []).filter((p) => p.trim().length >= VOICE_MIN_CHARS).slice(0, 3) : []);
      setVoiceNudgeDismissed(isNudgeDismissed());
    })();
    return () => {
      active = false;
    };
  }, []);

  // On mount or query change: if ?vibe=<id> present, load that entry as vibe.
  useEffect(() => {
    const vibeId = searchParams.get("vibe");
    if (!vibeId) return;
    const entry = ENTRIES.find((e) => e.id === vibeId);
    if (!entry) {
      const next = new URLSearchParams(searchParams);
      next.delete("vibe");
      setSearchParams(next, { replace: true });
      return;
    }
    setPillar(PILLAR_FROM_INSPIRATION[entry.pillar]);
    setPillarDetail(entry.topic);
    setFormat(FORMAT_FROM_INSPIRATION[entry.format]);
    setPlatform(PLATFORM_FROM_INSPIRATION[entry.platform]);
    const entryAudience = (entry as { audience?: string }).audience;
    if (entryAudience && AUDIENCE_FROM_INSPIRATION[entryAudience]) {
      setAudience(AUDIENCE_FROM_INSPIRATION[entryAudience]);
    }
    const snippet = entry.content.slice(0, 100).trim();
    const reference = `Match the structural pattern of this example: ${entry.hook} | ${snippet}`;
    setStyleReference(reference);
    setVibeSourceId(entry.id);
    setWizardStep(IDEA_STEP);
    setIdeaContext((prev) =>
      prev && prev.trim().length > 0
        ? prev
        : `Style reference (do not copy verbatim, match the pattern): ${entry.hook}`,
    );
    toast({
      title: "Vibe loaded",
      description:
        "Form pre-filled. Add your own context and generate when ready.",
    });
    setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("vibe")]);

  // Restore a draft into the form when ?draft=<id> arrives.
  useEffect(() => {
    const draftId = searchParams.get("draft");
    if (!draftId || !userId) return;
    // A phone alert for another profile's post names that profile: open it first.
    const profile = searchParams.get("profile");
    if (profile && profile !== activeProfileId(userId) && loadProfiles(userId).some((p) => p.id === profile)) {
      setActiveProfile(userId, profile);
      // Reload only if the switch stuck (blocked storage would loop forever).
      if (activeProfileId(userId) === profile) {
        window.location.reload();
        return;
      }
    }
    const entry = getDraftById(userId, draftId);
    if (!entry) {
      // Silently strip the param if the id is unknown.
      const next = new URLSearchParams(searchParams);
      next.delete("draft");
      setSearchParams(next, { replace: true });
      return;
    }
    // Board quick-add ideas carry only a hook — keep the wizard's defaults
    // and use the idea text as the topic so Generate works immediately.
    const isBareIdea = !entry.draft && !entry.pillar;
    if (isBareIdea) {
      setPillarDetail(entry.hook);
      setWizardStep(LAST_STEP);
    } else {
      // a saved post can come from Claude, a CSV import or an older version: take only
      // values Write knows, so an unknown one falls back instead of crashing the page
      setPillar(PILLARS.some((x) => x.value === entry.pillar) ? (entry.pillar as Pillar) : "topic");
      setPillarDetail(entry.pillarDetail ?? "");
      setAudience(AUDIENCES.some((x) => x.value === entry.audience) ? (entry.audience as Audience) : "general");
      setFormat(FORMATS.some((x) => x.value === entry.format) ? (entry.format as Format) : "text-post");
      setPlatform(PLATFORMS.some((x) => x.value === entry.platform) ? (entry.platform as Platform) : "linkedin");
      setCtaType(CTAS.some((x) => x.value === entry.ctaType) ? (entry.ctaType as CtaType) : "dm-keyword");
      if (entry.hook) setChosenHook(entry.hook);
    }
    setDraft(entry.draft);
    clearDraftExtras();
    setFirstComment(entry.firstComment ?? null);
    setStoryboard(entry.storyboard ?? null);
    const making = storyboardRun(entry.id);
    if (making) void followStoryboard(entry.id, making);
    // A written post opens on its draft, not on step 1 of a brief it already has.
    if (entry.draft.trim()) setBriefOpen(false);
    setCurrentDraftId(entry.id);
    preserveIdRef.current =
      entry.status === "scheduled" || entry.status === "posted"
        ? entry.id
        : null;
    setVibeSourceId(entry.vibeSourceId ?? null);
    setDisclosure((entry.disclosure ?? []).filter((d): d is DisclosureId => d in DISCLOSURES));
    toast({
      title: isBareIdea ? "Idea loaded" : "Draft restored",
      description: isBareIdea
        ? "Your board idea is the topic. Pick a format and generate."
        : "Form repopulated. Edit and re-roll, or copy as-is.",
    });
    setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, searchParams.get("draft")]);

  // Prefill from a Plan deep-link: /generate?pillar=&detail=&audience=&format=
  // &platform=&cta=&funnel=&idea=&ctx=&ref=&formula=  (runs once, then strips params).
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const has =
      searchParams.has("pillar") ||
      searchParams.has("detail") ||
      searchParams.has("funnel") ||
      searchParams.has("idea") ||
      searchParams.has("ctx");
    if (!has) return;
    prefillAppliedRef.current = true;

    const pillarParam = searchParams.get("pillar");
    if (pillarParam && PILLARS.some((p) => p.value === pillarParam)) {
      setPillar(pillarParam as Pillar);
    }
    const detailParam = searchParams.get("detail");
    if (detailParam) {
      setPillarDetail(detailParam);
      // Every step is filled in: open the one with Generate. The step chips
      // show the rest as done and stay one tap away.
      setWizardStep(LAST_STEP);
    }

    const audienceParam = searchParams.get("audience");
    if (audienceParam && AUDIENCES.some((a) => a.value === audienceParam)) {
      setAudience(audienceParam as Audience);
    }
    const formatParam = searchParams.get("format");
    if (formatParam && FORMATS.some((f) => f.value === formatParam)) {
      setFormat(formatParam as Format);
    }
    const platformParam = searchParams.get("platform");
    if (platformParam && PLATFORMS.some((p) => p.value === platformParam)) {
      setPlatform(platformParam as Platform);
    }
    const ctaParam = searchParams.get("cta");
    if (ctaParam && CTAS.some((c) => c.value === ctaParam)) {
      setCtaType(ctaParam as CtaType);
    }
    const ideaParam = searchParams.get("idea");
    if (ideaParam && IDEA_SOURCES.some((s) => s.value === ideaParam)) {
      setIdeaSource(ideaParam);
    }
    const funnelParam = searchParams.get("funnel");
    if (funnelParam && FUNNEL_STAGES.some((s) => s.id === funnelParam)) {
      setFunnelStage(funnelParam as FunnelStageId);
    }
    const ctxParam = searchParams.get("ctx");
    if (ctxParam) setIdeaContext(ctxParam);

    const refParam = searchParams.get("ref");
    if (refParam) {
      const found = findCompetitorByHandle(refParam);
      if (found) setCompetitorRef(found);
    }
    planFormulaRef.current = hookFormula(searchParams.get("formula") ?? undefined)?.id ?? null;

    const next = new URLSearchParams(searchParams);
    ["pillar", "detail", "audience", "format", "platform", "cta", "funnel", "idea", "ctx", "ref", "formula"].forEach(
      (k) => next.delete(k),
    );
    setSearchParams(next, { replace: true });

    toast({
      title: "Loaded from your plan",
      description: "Form pre-filled for this funnel slot. Tweak and generate.",
    });
    setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearVibe = () => {
    setStyleReference(null);
    setVibeSourceId(null);
    if (searchParams.get("vibe")) {
      const next = new URLSearchParams(searchParams);
      next.delete("vibe");
      setSearchParams(next, { replace: true });
    }
  };

  const pillarMeta = useMemo(
    () => PILLARS.find((p) => p.value === pillar)!,
    [pillar],
  );
  const ideaMeta = useMemo(
    () => IDEA_SOURCES.find((s) => s.value === ideaSource)!,
    [ideaSource],
  );

  // Debounced compliance scan on draft (500ms).
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  useEffect(() => {
    if (!draft) {
      setComplianceFlags([]);
      return;
    }
    const t = setTimeout(() => {
      setComplianceFlags(scanCompliance(draft));
    }, 500);
    return () => clearTimeout(t);
  }, [draft]);

  const visibleFlags = useMemo(
    () => complianceFlags.filter((f) => !dismissedFlagIds.has(f.id)),
    [complianceFlags, dismissedFlagIds],
  );
  const hasErrors = useMemo(() => hasComplianceErrors(visibleFlags), [visibleFlags]);

  // Short-video drafts bundle the spoken script with the caption; the split
  // drives caption-only counters and the separate copy buttons.
  const svSplit = useMemo(
    () => (format === "short-video" ? splitScriptCaption(draft) : null),
    [draft, format],
  );

  // Counter readout for the draft. Only the caption counts against platform limits.
  const counters: CounterReadout = useMemo(
    () => readout(svSplit ? svSplit.caption : draft, platform),
    [draft, platform, svSplit],
  );

  // What a copy puts on the clipboard: plain text, the brand kit sign-off and
  // any disclosure line.
  const brandKit = useMemo(() => loadBrand(userId), [userId]);
  const brandSignOff = brandKit?.signOff?.trim() ?? "";
  // links that aren't the kit's offers are flagged under the post
  const brandLinks = useMemo(() => allowedLinks(brandKit), [brandKit]);
  // ...and, when the brand kit asks for it, UTM tracking on every link
  const forPosting = (text: string, plat: string = platform) => {
    const out = withDisclosure(withSignOff(toPlainText(text), brandSignOff), disclosure);
    return brandKit?.tagLinks ? tagLinks(out, { source: plat, campaign: chosenHook || pillarDetail || "post" }) : out;
  };
  const limits = checkLimits(forPosting(svSplit ? svSplit.caption : draft), platform, brandLinks);
  const draftBlanks = useMemo(() => findBlanks(draft), [draft]);
  // tracked the same way the post's own links would have been
  const commentText = firstComment && brandKit?.tagLinks
    ? tagLinks(firstComment, { source: platform, campaign: chosenHook || pillarDetail || "post" })
    : (firstComment ?? "");

  // Live craft check on the current draft (reuses the Coach engine).
  const craftCheck = useMemo(
    () =>
      draft.trim().length > 30
        ? analyzePosts([{ text: draft, platform: platform as PlatformId }])
        : null,
    [draft, platform],
  );

  const isStreaming = streamingMode !== "idle";

  // Once a fresh set of hooks has all finished, Jev picks the strongest for
  // this audience. No pick (a failed call, or no clear leader) shows nothing.
  const hookKey = hookOptions.map((h) => h.text.trim()).join("\n");
  useEffect(() => {
    if (!pickPendingRef.current || isStreaming || !hookOptions.length || hookOptions.some((h) => !h.complete && !h.halted)) return;
    pickPendingRef.current = false;
    const hooks = hookOptions.map((h) => h.text.trim());
    if (hooks.length < 2 || hookOptions.some((h) => !h.complete || !h.text.trim())) return;
    const aud = AUDIENCES.find((a) => a.value === audience);
    void pickHook(hooks, aud ? `${aud.label}: ${aud.sub}` : "", pillarDetail.trim(), platformLabel(platform)).then((index) => {
      if (index !== null) setHookPick({ key: hooks.join("\n"), index });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookOptions, isStreaming]);

  // Predicted engagement: Jev's checks on this exact text, remembered on this device per text
  const [scores, setScores] = useState<ReturnType<typeof loadScores>>({});
  useEffect(() => setScores(loadScores(userId)), [userId]);
  const scoreKeyNow = useMemo(() => textKey(platform, draft), [platform, draft]);
  const postScore = scores[scoreKeyNow] ?? null;
  const [scoring, setScoring] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<{ key: string; message: string } | null>(null);
  const runScore = async () => {
    if (!userId || scoring) return;
    const key = scoreKeyNow;
    setScoring(key);
    setScoreError(null);
    try {
      setScores(saveScore(userId, key, await scorePost(draft, platform)));
    } catch (e) {
      setScoreError({ key, message: (e as Error).message });
    } finally {
      setScoring(null);
    }
  };

  // Keep the unfinished brief, and the hooks and variations it produced, for
  // this tab; drop it once a draft exists (the draft is saved to My posts) or
  // the typed fields are empty. Saved between streams, not on every token.
  useEffect(() => {
    if (!userId || isStreaming) return;
    try {
      if (draft || (!pillarDetail.trim() && !ideaContext.trim())) {
        sessionStorage.removeItem(briefKey(userId));
      } else {
        sessionStorage.setItem(
          briefKey(userId),
          JSON.stringify({
            pillar,
            pillarDetail,
            audience,
            singlish,
            funnelStage,
            ideaSource,
            ideaContext,
            platform,
            format,
            reelSeconds,
            ctaType,
            wizardStep,
            disclosure,
            hooksFirst,
            chosenHook,
            hookOptions,
            variants,
          }),
        );
      }
    } catch {
      // storage blocked: the brief just won't survive a page change
    }
  }, [
    userId,
    draft,
    pillar,
    pillarDetail,
    audience,
    singlish,
    funnelStage,
    ideaSource,
    ideaContext,
    platform,
    format,
    reelSeconds,
    ctaType,
    wizardStep,
    disclosure,
    isStreaming,
    hooksFirst,
    chosenHook,
    hookOptions,
    variants,
  ]);

  // The variant rows mount once the stream starts, after an async session read.
  useEffect(() => {
    if (!scrollToVariantsRef.current || !variantsCardRef.current) return;
    scrollToVariantsRef.current = false;
    variantsCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [variants.length]);

  /** `answered`: the answer to the one question about a thin idea, for this run. */
  const buildBasePayload = (answered?: string): BasePayload => {
    // Fold the funnel-stage directive into the free-text context so the draft is
    // steered for where the reader sits in the funnel (the edge function is
    // prompt-driven, so this is how we shape it without server changes).
    const funnelMeta = funnelStage ? getFunnelStage(funnelStage) : null;
    const ctxParts: string[] = [];
    if (funnelMeta) ctxParts.push(funnelMeta.directive);
    const trimmedCtx = ideaContext.trim();
    if (trimmedCtx) ctxParts.push(trimmedCtx);
    if (answered?.trim()) ctxParts.push(answered.trim());
    if (format === "short-video") ctxParts.push(reelLengthRule(reelSeconds));
    ctxParts.push(BLANKS_RULE);
    const rules = brandRulesLine(brandKit);
    if (rules) ctxParts.push(rules);

    // Combine an active vibe reference with a competitor's angle reference.
    const styleParts: string[] = [];
    if (styleReference) styleParts.push(styleReference);
    if (competitorRef) styleParts.push(buildCompetitorStyleReference(competitorRef));

    return {
      pillar,
      pillarDetail: pillarDetail.trim(),
      ideaSource: ideaMeta.label,
      ideaContext: ctxParts.join("\n\n") || undefined,
      format,
      platform,
      ctaType,
      styleReference: styleParts.join("\n") || undefined,
      audience,
      voiceSummary: voiceSummary && voiceSummary.trim().length > 0 ? voiceSummary.trim() : undefined,
      singlish: singlish ? true : undefined,
    };
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStreamingMode("idle");
  };

  // Each request fills its own rows, in order: request k's variant v is the row
  // after every earlier request's rows. A hook row keeps the formula it was
  // written with (formulas[row]).
  const runStream = async (
    requests: StreamRequest[],
    target: "hooks" | "variants",
    formulas?: string[],
  ) => {
    const runId = ++streamRunRef.current;
    const setRows = target === "hooks" ? setHookOptions : setVariants;
    // This run supersedes anything still in flight. Cancel it, or its chunks
    // keep landing in the rows this run is about to create.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    try {
      await streamRows(requests, target, controller, runId, formulas);
    } finally {
      // Only the newest run owns the rows and the Stop control. An older run
      // finishing later must not clear the label or the controller under it.
      if (streamRunRef.current === runId) {
        const halted = controller.signal.aborted ? "stopped" : "failed";
        setRows((prev) =>
          prev.map((v) => (v.complete || v.halted ? v : { ...v, halted })),
        );
        abortControllerRef.current = null;
        setStreamingMode("idle");
      }
    }
  };

  const streamRows = async (
    requests: StreamRequest[],
    target: "hooks" | "variants",
    controller: AbortController,
    runId: number,
    formulas?: string[],
  ) => {
    const session = (await supabase.auth.getSession()).data.session;
    // A second click while the session was resolving already started a newer
    // run. Drop this one before it costs a call or overwrites the new rows.
    if (streamRunRef.current !== runId) return;
    const token = session?.access_token ?? SUPABASE_ANON_KEY;

    const total = requests.reduce((sum, r) => sum + r.n, 0);
    const initial: VariantState[] = Array.from({ length: total }, (_, i) => ({
      index: i,
      text: "",
      complete: false,
      ...(formulas?.[i] ? { formula: formulas[i] } : {}),
    }));
    if (target === "hooks") setHookOptions(initial);
    else setVariants(initial);

    abortControllerRef.current = controller;
    setStreamingMode(target);

    // Every request runs to its end before a failure is raised, so a row that
    // finished is never labelled "didn't finish".
    let firstRow = 0;
    const results = await Promise.allSettled(
      requests.map((payload) => {
        const first = firstRow;
        firstRow += payload.n;
        return streamRequest(payload, first, target, controller, runId, token);
      }),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
  };

  const streamRequest = async (
    payload: StreamRequest,
    firstRow: number,
    target: "hooks" | "variants",
    controller: AbortController,
    runId: number,
    token: string,
  ) => {
    const url = `${SUPABASE_URL}/functions/v1/generate-social-content`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ ...payload, stream: true }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      throw err;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Stream request failed (${res.status}) ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Returns the message of a terminal error event, or null to keep reading.
    // It must not throw: the parse guard below would swallow it and the read
    // loop would spin on a dead stream with the rows still animating.
    const applyEvent = (evt: {
      type: string;
      [k: string]: unknown;
    }): string | null => {
      // A chunk that arrives after a newer run started belongs to nobody.
      if (streamRunRef.current !== runId) return null;
      if (evt.type === "token") {
        const idx = firstRow + (evt.variantIndex as number);
        const text = evt.text as string;
        const setter = target === "hooks" ? setHookOptions : setVariants;
        setter((prev) =>
          prev.map((v) =>
            v.index === idx ? { ...v, text: v.text + text } : v,
          ),
        );
      } else if (evt.type === "variant_complete") {
        const idx = firstRow + (evt.variantIndex as number);
        // Dashes, and emoji or hashtags over the brand kit's policy, go before the text is shown or saved.
        const finalText = applyBrandRules(stripDashes(evt.text as string), brandKit);
        const setter = target === "hooks" ? setHookOptions : setVariants;
        setter((prev) =>
          prev.map((v) =>
            v.index === idx ? { ...v, text: finalText, complete: true } : v,
          ),
        );
      } else if (evt.type === "error") {
        return (evt.message as string) ?? "Stream error";
      }
      return null;
    };

    let failure: string | null = null;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const payloadStr = line.slice(5).trim();
          if (!payloadStr) continue;
          try {
            const evt = JSON.parse(payloadStr);
            const message = applyEvent(evt);
            if (message) {
              failure = message;
              break;
            }
          } catch (err) {
            console.error("SSE parse error:", err, payloadStr);
          }
        }
        if (failure) break;
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_) {
        // ignore
      }
    }

    // Raised out here, after the reader is released, so it lands in the same
    // place a network failure does: rows get their halt label and the caller
    // toasts.
    if (failure) throw new Error(failure);
  };

  const validateForm = (): boolean => {
    if (!pillarDetail.trim()) {
      // The field lives on step 1: take the user there instead of leaving a
      // toast on the last step pointing at a box they can't see.
      setBriefOpen(true);
      setWizardStep(0);
      setTimeout(() => document.getElementById("pillar-detail")?.focus(), 50);
      toast({
        title: `Add your ${pillarMeta.label.toLowerCase()} first`,
        description: pillarMeta.placeholder,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // answered: undefined runs the thin-idea check first; a string (empty when
  // skipped) is the answer to its one question, and writes straight away.
  const handleGenerate = async (answered?: string) => {
    if (checkingIdea || !validateForm()) return;
    if (answered === undefined) {
      const key = `${pillarDetail.trim()}\n${ideaContext.trim()}`;
      if (!ideaAskedRef.current.has(key)) {
        ideaAskedRef.current.add(key);
        setCheckingIdea(true);
        const thin = await ideaIsThin(pillarDetail.trim(), ideaContext.trim(), ideaMeta.label);
        setCheckingIdea(false);
        if (thin) {
          setIdeaAsk({ answer: "" });
          return;
        }
      }
    }
    setIdeaAsk(null);
    // Remember the working platform/format as next session's defaults.
    if (userId) {
      try {
        localStorage.setItem(
          `content-studio-writeprefs-${scoped(userId)}`,
          JSON.stringify({ platform, format, reelSeconds }),
        );
      } catch {
        // storage full — defaults just won't stick
      }
    }
    // Collapse the wizard only after validation passes — collapsing first
    // strands the user on a dead brief summary when the topic is missing.
    setBriefOpen(false);
    clearDraftExtras();
    setSelectedVariantIndex(null);
    setDraft("");
    setChosenHook(null);
    setHookOptions([]);
    setVariants([]);
    const base = buildBasePayload(answered);

    try {
      if (hooksFirst) {
        // one call per hook, each with its own formula
        const set = planFormulaRef.current ? hookFormulasFrom(planFormulaRef.current) : hookFormulaSet(hookSetRef.current++);
        planFormulaRef.current = null;
        setHookPick(null);
        pickPendingRef.current = true;
        await runStream(
          set.map((f) => ({ ...base, mode: "hooks" as const, n: 1, ...hookFormulaFields(f, base) })),
          "hooks",
          set.map((f) => f.id),
        );
      } else {
        await runStream([{ ...base, mode: "post", n: 3 }], "variants");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      console.error(err);
      toast({
        title: "Couldn't generate draft",
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  // The answer joins the brief's notes, so a re-roll keeps it and is not asked again.
  const answerIdea = (skip: boolean) => {
    const answer = skip ? "" : (ideaAsk?.answer ?? "").trim();
    if (answer) {
      const next = [ideaContext.trim(), answer].filter(Boolean).join("\n");
      setIdeaContext(next);
      ideaAskedRef.current.add(`${pillarDetail.trim()}\n${next}`);
    }
    setIdeaAsk(null);
    void handleGenerate(answer);
  };

  const handlePickHook = async (hookText: string) => {
    if (!hookText.trim()) return;
    setChosenHook(hookText.trim());
    clearDraftExtras();
    scrollToVariantsRef.current = true;
    setVariants([]);
    setSelectedVariantIndex(null);
    setDraft("");
    const base = buildBasePayload();
    try {
      await runStream([{ ...base, mode: "body", n: 3, chosenHook: hookText.trim() }], "variants");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      toast({
        title: "Couldn't generate variations",
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const handleReroll = async () => {
    clearDraftExtras();
    if (!validateForm()) return;
    setSelectedVariantIndex(null);
    setDraft("");
    const base = buildBasePayload();
    try {
      if (chosenHook) {
        await runStream([{ ...base, mode: "body", n: 3, chosenHook }], "variants");
      } else {
        await runStream([{ ...base, mode: "post", n: 3 }], "variants");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      toast({
        title: "Couldn't re-roll",
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const fetchAuxForDraft = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const url = `${SUPABASE_URL}/functions/v1/generate-social-content`;
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token ?? SUPABASE_ANON_KEY;

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      };
      const baseFields = {
        platform,
        pillar,
        pillarDetail: pillarDetail.trim(),
        audience,
        format,
        ctaType,
        ideaSource: ideaMeta.label,
        draft: trimmed,
        voiceSummary: voiceSummary ?? undefined,
        singlish: singlish ? true : undefined,
      };

      setHashtagsLoading(true);
      setImagePromptLoading(true);

      const hashtagsPromise = fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...baseFields, mode: "hashtags" }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`hashtags ${r.status}`);
          return (await r.json()) as { hashtags?: string[]; error?: string };
        })
        .then((data) => {
          if (data?.hashtags && Array.isArray(data.hashtags)) {
            setHashtags(data.hashtags);
          }
        })
        .catch((err) => {
          console.error("hashtags fetch failed:", err);
          toast({
            title: "Couldn't fetch hashtags",
            description: "Drafted post is fine; hashtags can be added later.",
            variant: "destructive",
          });
        })
        .finally(() => setHashtagsLoading(false));

      const imagePromptPromise = fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...baseFields, mode: "image-prompt" }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`image-prompt ${r.status}`);
          return (await r.json()) as { prompt?: string; error?: string };
        })
        .then((data) => {
          if (typeof data?.prompt === "string") {
            setImagePrompt(data.prompt);
          }
        })
        .catch((err) => {
          console.error("image-prompt fetch failed:", err);
          toast({
            title: "Couldn't fetch image prompt",
            description: "Drafted post is fine; image prompt can be added later.",
            variant: "destructive",
          });
        })
        .finally(() => setImagePromptLoading(false));

      await Promise.allSettled([hashtagsPromise, imagePromptPromise]);
    },
    [
      audience,
      ctaType,
      format,
      ideaMeta.label,
      pillar,
      pillarDetail,
      platform,
      singlish,
      toast,
      voiceSummary,
    ],
  );

  const persistDraftEntry = useCallback(
    // A new pick passes null: the comment state it would read is the last draft's.
    (text: string, hookText: string, comment: string | null = firstComment) => {
      if (!userId || !text.trim()) return;
      const id = currentDraftId ?? newDraftId();
      // Preserve scheduling/status/created-at when updating an existing entry
      // (e.g. writing a slot that was scheduled from the Plan).
      const existing = getDraftById(userId, id);
      const entry: DraftEntry = {
        id,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        hook: hookText,
        draft: text,
        pillar,
        pillarDetail: pillarDetail.trim(),
        audience,
        format,
        platform,
        ctaType,
        vibeSourceId: vibeSourceId ?? undefined,
        status: existing?.status,
        scheduledFor: existing?.scheduledFor,
        postedAt: existing?.postedAt,
        repeat: existing?.repeat,
        disclosure: disclosure.length ? disclosure : undefined,
        firstComment: comment ?? undefined,
        hookFormula: formulaOfHook(hookText, hookOptions)?.id,
      };
      upsertDraft(userId, entry);
      setCurrentDraftId(id);
    },
    [
      disclosure,
      firstComment,
      hookOptions,
      audience,
      ctaType,
      currentDraftId,
      format,
      pillar,
      pillarDetail,
      platform,
      userId,
      vibeSourceId,
    ],
  );

  const handlePickVariant = (idx: number) => {
    const v = variants.find((x) => x.index === idx);
    if (!v) return;
    setSelectedVariantIndex(idx);
    clearDraftExtras();
    setDraft(v.text);
    setTimeout(
      () => draftCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
    setHashtags([]);
    setImagePrompt("");
    setDismissedFlagIds(new Set());
    // Save to history immediately on selection. Normally each pick forks a
    // fresh entry, but when editing a scheduled/posted slot we keep updating
    // it so it stays put on the calendar.
    if (!preserveIdRef.current) setCurrentDraftId(null);
    persistDraftEntry(v.text, chosenHook ?? "", null);
    // Fire hashtags + image-prompt in parallel; failures don't block. The
    // draft card's saved line confirms the pick, so no toast over the editor.
    void fetchAuxForDraft(v.text);
  };

  // Everything copied from here is headed for a social platform, none of which
  // render markdown - strip it so "**hook**" doesn't paste as literal asterisks.
  // A post or caption also gets the brand kit sign-off; a script doesn't.
  const copyText = async (text: string, title: string, description: string, signOff = false, plat?: string) => {
    try {
      await navigator.clipboard.writeText(signOff ? forPosting(text, plat) : toPlainText(text));
      const done = signOff && brandSignOff ? `${title} with your sign-off` : title;
      const left = findBlanks(text);
      toast(
        left.length
          ? { title: `${done}. Fill ${left.length === 1 ? "1 blank" : `${left.length} blanks`} first`, description: left.join(", "), variant: "destructive" }
          : { title: done, description },
      );
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually and copy.",
        variant: "destructive",
      });
    }
  };

  // Team rule "needs approval before posting": a member on it can copy a post
  // only once its latest submission is approved and unchanged.
  const gateEntries = useMemo(
    () =>
      [
        ...(currentDraftId && draft ? [{ id: currentDraftId, draft }] : []),
        ...versions.map((v) => ({ id: v.draftId, draft: v.text })),
      ] as DraftEntry[],
    [currentDraftId, draft, versions],
  );
  const reviews = useDraftReviews(userId, gateEntries);
  const copyBlockFor = (id: string | null, text: string): string | null => {
    if (!reviews.ruleOn) return null;
    if (!id) return "Save the post and submit it for review first.";
    return reviews.blockReason({ id, draft: text } as DraftEntry);
  };
  const warnBlocked = (reason: string | null): boolean => {
    if (reason) toast({ title: "Approval needed before posting", description: `Team rule. ${reason}` });
    return reason !== null;
  };
  const mainCopyBlock = copyBlockFor(currentDraftId, draft);

  const handleCopy = async () => {
    if (!draft) return;
    if (warnBlocked(copyBlockFor(currentDraftId, draft))) return;
    await copyText(draft, "Copied", "Paste into your platform of choice.", true);
  };

  const updateVersion = (id: string, patch: Partial<PlatformVersion>) =>
    setVersions((prev) => prev.map((v) => (v.draftId === id ? { ...v, ...patch } : v)));

  // Each version is its own My posts entry with the same brief.
  const saveVersion = (v: Pick<PlatformVersion, "draftId" | "platform" | "text">) => {
    if (!userId || !v.text.trim()) return;
    const existing = getDraftById(userId, v.draftId);
    upsertDraft(userId, {
      id: v.draftId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      hook: firstLine(v.text),
      draft: v.text,
      pillar,
      pillarDetail: pillarDetail.trim(),
      audience,
      format,
      platform: v.platform,
      ctaType,
      vibeSourceId: vibeSourceId ?? undefined,
      status: existing?.status,
      scheduledFor: existing?.scheduledFor,
      postedAt: existing?.postedAt,
      repeat: existing?.repeat,
    });
  };

  // One generation per adapt: the same brief, the finished draft as the idea
  // context, the target platform.
  const runAdapt = async (target: Platform, id: string) => {
    versionAbortRef.current.get(id)?.abort();
    const controller = new AbortController();
    versionAbortRef.current.set(id, controller);
    let settled = false;
    const fail = (message: string) => {
      settled = true;
      updateVersion(id, { status: "failed" });
      toast({
        title: `Couldn't adapt for ${platformLabel(target)}`,
        description: message,
        variant: "destructive",
      });
    };
    try {
      await streamOnePost(
        { ...buildBasePayload(), platform: target, ideaContext: adaptContext(draft.trim(), target) },
        {
          onToken: (text) => updateVersion(id, { text }),
          onComplete: (raw) => {
            const text = applyBrandRules(stripDashes(raw), brandKit).trim();
            if (!text) return fail("The reply came back empty. Try again.");
            settled = true;
            updateVersion(id, { text, status: "done" });
            saveVersion({ draftId: id, platform: target, text });
          },
          onError: fail,
        },
        controller.signal,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : "Try again in a moment.");
    }
    if (versionAbortRef.current.get(id) === controller) versionAbortRef.current.delete(id);
    if (!settled) updateVersion(id, { status: controller.signal.aborted ? "stopped" : "failed" });
  };

  const handleAdapt = (target: Platform) => {
    setActiveTab(target);
    setTimeout(
      () => versionsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
    if (versions.some((v) => v.platform === target) || !draft.trim()) return;
    const id = newDraftId();
    setVersions((prev) => [...prev, { platform: target, text: "", status: "streaming", draftId: id }]);
    void runAdapt(target, id);
  };

  const retryVersion = (v: PlatformVersion) => {
    updateVersion(v.draftId, { text: "", status: "streaming" });
    void runAdapt(v.platform, v.draftId);
  };

  const handleRewrite = async (id: RewriteId, lines?: string[]) => {
    const source = draft.trim();
    if (!source) return;
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    rewriteAbortRef.current = controller;
    setRewrite({ id, text: "", status: "streaming" });
    const mine = () => rewriteAbortRef.current === controller;
    const fail = (message: string) => {
      if (!mine()) return;
      setRewrite(null);
      toast({ title: "Couldn't rewrite the draft", description: message, variant: "destructive" });
    };
    try {
      await streamOnePost(
        { ...buildBasePayload(), ...rewriteFields(source, id, lines) },
        {
          onToken: (text) => mine() && setRewrite({ id, text, status: "streaming" }),
          onComplete: (raw) => {
            const text = applyBrandRules(stripDashes(raw), brandKit).trim();
            if (!text) return fail("The reply came back empty. Try again.");
            if (mine()) setRewrite({ id, text, status: "done" });
          },
          onError: fail,
        },
        controller.signal,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : "Try again in a moment.");
    }
    if (mine()) rewriteAbortRef.current = null;
  };

  const discardRewrite = () => {
    rewriteAbortRef.current?.abort();
    rewriteAbortRef.current = null;
    setRewrite(null);
  };

  // The draft as it stands (typed edits included) is what Undo brings back.
  const acceptRewrite = () => {
    if (!rewrite || rewrite.status !== "done") return;
    setUndoText(draft);
    setUndoNote("Rewritten.");
    setDraft(rewrite.text);
    persistDraftEntry(rewrite.text, chosenHook ?? "");
    setRewrite(null);
  };

  // A transform with a fixed list, not a judgment, so it runs in the browser.
  const cleanDraft = () => {
    const { text, changes } = cleanAiTells(draft);
    if (!changes) {
      toast({ title: "Nothing to clean" });
      return;
    }
    setUndoText(draft);
    setUndoNote(`${changes} ${changes === 1 ? "change" : "changes"} made.`);
    setDraft(text);
    persistDraftEntry(text, chosenHook ?? "");
  };

  const undoRewrite = () => {
    if (undoText === null) return;
    setDraft(undoText);
    persistDraftEntry(undoText, chosenHook ?? "");
    setUndoText(null);
  };

  // The link stays in My posts with the draft, so nothing is lost before it's copied.
  const moveLinkToComment = () => {
    const moved = moveLinksToComment(draft, firstComment ?? "");
    if (!moved) return;
    setDraft(moved.body);
    setUndoText(null);
    setFirstComment(moved.comment);
    persistDraftEntry(moved.body, chosenHook ?? "", moved.comment);
  };

  const copyVersion = (v: PlatformVersion) => {
    if (warnBlocked(copyBlockFor(v.draftId, v.text))) return;
    const caption = format === "short-video" ? splitScriptCaption(v.text).caption : v.text;
    void copyText(caption, "Copied", `Paste into ${platformLabel(v.platform)}.`, true, v.platform);
  };

  // Suppress unused import warning - navigate may be needed by future flows.
  void navigate;

  const handleCopyHashtags = async () => {
    if (hashtags.length === 0) return;
    const text = hashtags.map((h) => `#${h}`).join(" ");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Hashtags copied", description: text });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually and copy.",
        variant: "destructive",
      });
    }
  };

  const handleCopyImagePrompt = async () => {
    if (!imagePrompt) return;
    try {
      await navigator.clipboard.writeText(imagePrompt);
      toast({
        title: "Image prompt copied",
        description: "Paste into Canva, Midjourney, or kie.ai.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually and copy.",
        variant: "destructive",
      });
    }
  };

  const handleDismissNudge = () => {
    dismissNudgeForSession();
    setVoiceNudgeDismissed(true);
  };

  const handleDraftBlur = () => {
    if (!draft.trim()) return;
    persistDraftEntry(draft, chosenHook ?? "");
  };

  // Keyboard shortcuts: Cmd/Ctrl+Enter, Cmd/Ctrl+Shift+C, Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "Enter") {
        e.preventDefault();
        if (!isStreaming) {
          void handleGenerate();
        }
        return;
      }
      if (meta && e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        if (draft) {
          void handleCopy();
        }
        return;
      }
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (styleReference) {
          handleClearVibe();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, draft, showShortcuts, styleReference]);

  const generateButtonLabel = (() => {
    if (checkingIdea) return "Reading your idea...";
    if (isStreaming) return hooksFirst ? "Drafting hooks..." : "Drafting variations...";
    if (draft || variants.length > 0 || hookOptions.length > 0) {
      return hooksFirst ? "Start over: 3 hooks" : "Generate 3 new variations";
    }
    return hooksFirst ? "Generate 3 hooks" : "Generate 3 variations";
  })();

  const showVoiceNudge =
    !voiceProfileUsable && !voiceNudgeDismissed && userId !== null;

  // The example a locked vibe copies, shown by its hook rather than its id.
  const vibeHook = vibeSourceId ? ENTRIES.find((e) => e.id === vibeSourceId)?.hook : undefined;

  // The saved entry behind the draft card, for its "saved / scheduled" line.
  // the next good time to post this one: from the user's own results, else a common slot
  const [scheduleTick, setScheduleTick] = useState(0);
  const suggestedTime = useMemo(() => {
    if (!userId || !currentDraftId) return null;
    const taken = loadDrafts(userId).filter((d) => d.status === "scheduled" && d.scheduledFor).map((d) => d.scheduledFor as string);
    return suggestPostingTime(getTrackedPosts(userId), platform, taken, new Date(), brandKit?.slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentDraftId, platform, scheduleTick]);
  const whenLabel = (at: string) =>
    `${new Date(`${at.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${scheduleTime(at) ? `, ${timeLabel(scheduleTime(at)!)}` : ""}`;
  const scheduleSuggested = () => {
    if (!userId || !currentDraftId || !suggestedTime) return;
    const before = getDraftById(userId, currentDraftId);
    if (!before) return;
    upsertDraft(userId, { ...before, status: "scheduled", scheduledFor: suggestedTime.at });
    setScheduleTick((n) => n + 1);
    toast({
      title: `Scheduled for ${whenLabel(suggestedTime.at)}`,
      action: (
        <ToastAction altText="Undo" onClick={() => { upsertDraft(userId, before); setScheduleTick((n) => n + 1); }}>
          Undo
        </ToastAction>
      ),
    });
  };

  const savedEntry =
    draft && userId && currentDraftId ? getDraftById(userId, currentDraftId) : null;
  // The formula the draft's hook was written with: from its hook rows, else as saved.
  const draftFormula = (chosenHook ? formulaOfHook(chosenHook, hookOptions) : undefined) ?? hookFormula(savedEntry?.hookFormula);

  // Storyboard: the spoken script of a short video (the whole draft when it has no caption heading).
  const shortScript = format === "short-video" ? (svSplit?.script ?? draft).trim() : "";
  const scriptWords = shortScript ? spokenWords(shortScript) : 0;
  const scriptLong = shortScript ? reelTooLong(scriptWords, reelSeconds) : null;
  const storyboardStale = Boolean(storyboard && storyboard.script !== shortScript);
  const storyboardBusy = Boolean(currentDraftId && storyboardFor === currentDraftId);
  const boardColumn = savedEntry ? columnOf(savedEntry, boardStages) : null;
  const readyToFilm = boardColumn !== null && boardColumn !== "idea" && boardColumn !== "scripted";

  // Shows a storyboard once it's made; the run itself saves it on the draft, wherever the consultant is.
  async function followStoryboard(draftId: string, run: Promise<Storyboard>) {
    setStoryboardFor(draftId);
    setStoryboardError(null);
    try {
      const board = await run;
      if (draftIdRef.current === draftId) setStoryboard(board);
    } catch (e) {
      if (draftIdRef.current === draftId) {
        setStoryboardError(e instanceof ReelCloneError ? e.message : "Couldn't make the storyboard. Try again.");
      }
    } finally {
      setStoryboardFor((f) => (f === draftId ? null : f));
    }
  }

  const handleStoryboard = () => {
    if (!userId || !currentDraftId || storyboardBusy) return;
    const topic = pillarDetail.trim() || chosenHook || "";
    void followStoryboard(currentDraftId, makeStoryboard(userId, currentDraftId, shortScript, topic));
  };

  const markReadyToFilm = () => {
    if (!userId || !currentDraftId) return;
    setBoardStages(setStage(userId, currentDraftId, "to-film"));
    toast({ title: "Moved to To film", description: "It's on your board with its shot list." });
  };

  // The version beside the original on desktop: the active tab, else the newest.
  const shownVersion =
    versions.find((v) => v.platform === activeTab) ?? versions[versions.length - 1] ?? null;
  const versionSaved =
    shownVersion && userId ? getDraftById(userId, shownVersion.draftId) : null;
  const versionLimits = checkLimits(
    forPosting(
      shownVersion && format === "short-video"
        ? splitScriptCaption(shownVersion.text).caption
        : (shownVersion?.text ?? ""),
      shownVersion?.platform ?? platform,
    ),
    shownVersion?.platform ?? platform,
    brandLinks,
  );
  const versionFlags =
    shownVersion && shownVersion.status !== "streaming"
      ? scanCompliance(shownVersion.text).filter((f) => !dismissedFlagIds.has(f.id))
      : [];

  const hasOutput =
    hookOptions.length > 0 || variants.length > 0 || draft.trim().length > 0;

  const defaultTemplateName = () =>
    `${platformLabel(platform)} ${FORMATS.find((f) => f.value === format)!.label.toLowerCase()}, ${AUDIENCES.find(
      (a) => a.value === audience,
    )!.label.toLowerCase()}`;

  const handleSaveTemplate = () => {
    if (!userId || !templateForm) return;
    const name = templateForm.name.trim() || defaultTemplateName();
    const topic = pillarDetail.trim();
    setTemplates(
      saveTemplate(userId, {
        name,
        pillar,
        ...(templateForm.keepTopic && topic ? { pillarDetail: topic } : {}),
        audience,
        singlish: singlish || undefined,
        funnelStage,
        ideaSource,
        platform,
        format,
        ctaType,
      }),
    );
    setTemplateForm(null);
    toast({ title: "Template saved", description: `Pick "${name}" at the start of your next post.` });
  };

  // A template sets the brief's choices; its topic only fills an empty box.
  const applyTemplate = (t: BriefTemplate) => {
    if (PILLARS.some((p) => p.value === t.pillar)) setPillar(t.pillar as Pillar);
    if (t.pillarDetail && !pillarDetail.trim()) setPillarDetail(t.pillarDetail);
    if (AUDIENCES.some((a) => a.value === t.audience)) setAudience(t.audience as Audience);
    setSinglish(t.singlish === true);
    setFunnelStage(FUNNEL_STAGES.some((f) => f.id === t.funnelStage) ? (t.funnelStage as FunnelStageId) : null);
    if (IDEA_SOURCES.some((i) => i.value === t.ideaSource)) setIdeaSource(t.ideaSource);
    if (PLATFORMS.some((p) => p.value === t.platform)) setPlatform(t.platform as Platform);
    if (FORMATS.some((f) => f.value === t.format)) setFormat(t.format as Format);
    if (CTAS.some((c) => c.value === t.ctaType)) setCtaType(t.ctaType as CtaType);
    setAppliedTemplateId(t.id);
    toast({ title: `Using "${t.name}"` });
    if (!pillarDetail.trim() && !t.pillarDetail) {
      setTimeout(() => document.getElementById("pillar-detail")?.focus(), 50);
    }
  };

  const removeTemplate = (t: BriefTemplate) => {
    if (!userId || !window.confirm(`Delete the template "${t.name}"?`)) return;
    setTemplates(deleteTemplate(userId, t.id));
    if (appliedTemplateId === t.id) setAppliedTemplateId(null);
  };

  // The topic is the only required field: once it is in, Generate is one tap
  // from any step and the optional steps stay a Next away.
  const canGenerateEarly = wizardStep < LAST_STEP && pillarDetail.trim().length > 0 && !isStreaming;

  const goNext = () =>
    setWizardStep((s) => Math.min(LAST_STEP, s + 1));
  const goBack = () => setWizardStep((s) => Math.max(0, s - 1));

  return (
    <div ref={formAnchorRef} className="space-y-6">
      <SectionTabs tabs={WRITE_TABS} />
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Write a post
        </h1>
      </header>

      {showVoiceNudge && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-start gap-2">
            <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="font-semibold text-primary">
                Set your voice (recommended)
              </p>
              <p className="text-muted-foreground">
                Paste 3-5 of your past posts once. Drafts will sound like YOU,
                not generic AI.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/voice"
              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-background px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3"
            >
              <Mic className="h-3 w-3" /> Set voice
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissNudge}
              className="h-7 gap-1 text-xs text-muted-foreground [@media(pointer:coarse)]:h-11"
            >
              <XIcon className="h-3 w-3" /> Dismiss
            </Button>
          </div>
        </div>
      )}

      {voiceProfileUsable && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
          <div className="flex items-start gap-2">
            <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              Voice profile active
            </p>
          </div>
          <Link
            to="/voice"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Edit voice
          </Link>
        </div>
      )}

      {styleReference && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-foreground" />
            <div className="space-y-0.5">
              <p className="font-semibold text-accent-foreground">
                Vibe locked in
              </p>
              {vibeHook && (
                <p className="line-clamp-2 text-muted-foreground">{vibeHook}</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearVibe}
            className="h-7 gap-1 text-xs text-muted-foreground"
          >
            <XIcon className="h-3 w-3" /> Clear vibe
          </Button>
        </div>
      )}

      <QuickTip context="generate" />

      {briefOpen ? (
        <div className="space-y-6">
          {/* Progress chips — click any step to jump; all steps have defaults. */}
          <div className="scrollbar-none flex items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-1.5">
            {STEP_META.map((s, i) => {
              const active = wizardStep === i;
              const done = wizardStep > i;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setWizardStep(i)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors [@media(pointer:coarse)]:min-h-11 ${
                    active ? "bg-background shadow-sm" : "hover:bg-background/60"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-primary/20 text-primary"
                          : "border border-border/70 text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span
                    className={`hidden text-xs font-semibold leading-none sm:block ${
                      active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {wizardStep === 0 && (
            <div className="space-y-6">
      {templates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">From a template</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className={`flex items-center rounded-full border text-xs font-medium transition-colors ${
                  appliedTemplateId === t.id
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/70 text-foreground hover:border-primary/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  aria-pressed={appliedTemplateId === t.id}
                  className="flex h-9 max-w-[16rem] items-center gap-1.5 truncate pl-3 pr-1"
                >
                  {appliedTemplateId === t.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{t.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeTemplate(t)}
                  aria-label={`Delete template ${t.name}`}
                  className="flex h-9 w-8 items-center justify-center rounded-r-full text-muted-foreground hover:text-destructive"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle className="font-serif text-xl">
              What&apos;s your post about?
            </CardTitle>
            <InfoTip label="About content pillars">
              Social pillars humanise you; Authority pillars build your credibility.
            </InfoTip>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <RadioGroup
            value={pillar}
            onValueChange={(v) => setPillar(v as Pillar)}
            className="grid gap-3 sm:grid-cols-2"
          >
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <Label
                  key={p.value}
                  htmlFor={`pillar-${p.value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
                    pillar === p.value
                      ? "border-primary/60 bg-primary/5 shadow-sm"
                      : "border-border/70 hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem
                    value={p.value}
                    id={`pillar-${p.value}`}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-foreground">
                        {p.label}
                      </span>
                      <span className="rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {p.tag}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.sub}</p>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
          <div className="space-y-1.5">
            <Label htmlFor="pillar-detail">
              Your specific {pillarMeta.label.toLowerCase()}
            </Label>
            <Textarea
              id="pillar-detail"
              value={pillarDetail}
              onChange={(e) => setPillarDetail(e.target.value)}
              placeholder={pillarMeta.placeholder}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Audience / life-stage</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAudience(a.value)}
                  className={`rounded-lg border p-2 text-left text-xs transition-all ${
                    audience === a.value
                      ? "border-primary/60 bg-primary/5 shadow-sm"
                      : "border-border/70 hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <div className="font-semibold text-foreground">{a.label}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    {a.sub}
                  </div>
                </button>
              ))}
            </div>
            <label
              className={`mt-1 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all [@media(pointer:coarse)]:min-h-11 ${
                singlish
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:border-primary/40"
              }`}
              title="Add light Singlish flavour where it lands naturally."
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={singlish}
                onChange={(e) => setSinglish(e.target.checked)}
              />
              Light Singlish (SG-native voice)
              <span className="ml-auto text-[10px] text-muted-foreground">
                1-3 Singlish moments per post max
              </span>
            </label>
          </div>
        </CardContent>
      </Card>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-6">
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Funnel stage</CardTitle>
          <CardDescription>
            Optional, but it sharpens the draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {FUNNEL_STAGES.map((s) => {
              const active = funnelStage === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setFunnelStage(null);
                    } else {
                      setFunnelStage(s.id);
                      setCtaType(s.cta as CtaType);
                    }
                  }}
                  className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-all ${
                    active
                      ? `border-primary/60 bg-primary/5 shadow-sm ring-1 ${s.accent.ring}`
                      : "border-border/70 hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold ${s.accent.badge}`}
                    >
                      {s.letter}
                    </span>
                    <span className="font-semibold text-foreground">
                      {s.label}
                    </span>
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {s.tagline}
                  </span>
                </button>
              );
            })}
          </div>
          {funnelStage &&
            (() => {
              const s = getFunnelStage(funnelStage);
              const ctaLabel =
                CTAS.find((c) => c.value === s.cta)?.label ?? s.cta;
              return (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
                  <p className={`font-semibold ${s.accent.text}`}>
                    {s.label}: {s.goal}
                  </p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    {s.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.contentTypes.map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    CTA set to{" "}
                    <span className="font-medium text-foreground">
                      {ctaLabel}
                    </span>
                    . Change it in step {LAST_STEP + 1}.
                  </p>
                </div>
              );
            })()}
        </CardContent>
      </Card>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-6">
      <CompetitorReference
        selectedId={competitorRef?.id ?? null}
        onSelect={setCompetitorRef}
      />

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle className="font-serif text-xl">
              What&apos;s the spark?
            </CardTitle>
            <InfoTip label="About idea sources">
              Day 41&apos;s seven idea sources; real conversations make the strongest posts.
            </InfoTip>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={ideaSource} onValueChange={setIdeaSource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDEA_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{ideaMeta.example}</p>
          {ideaSource === "real-question" && (
            <RealQuestions onPick={(q) => setIdeaContext((c) => withQuestion(c, q))} />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="idea-context" className="flex items-center gap-1.5">
              Context{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (optional, but better drafts)
              </span>
            </Label>
            <Textarea
              id="idea-context"
              value={ideaContext}
              onChange={(e) => setIdeaContext(e.target.value)}
              placeholder="The actual question, mistake, story, or numbers. Specific beats generic every time."
              rows={3}
              autoResize
            />
          </div>
        </CardContent>
      </Card>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-6">
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Where and how to post
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select
              value={platform}
              onValueChange={(v) => setPlatform(v as Platform)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as Format)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {FORMATS.find((f) => f.value === format)!.sub}
            </p>
            {format === "short-video" && <ReelLengthPicker value={reelSeconds} onChange={setReelSeconds} />}
          </div>
          <div className="space-y-1.5">
            <Label>CTA style</Label>
            <Select
              value={ctaType}
              onValueChange={(v) => setCtaType(v as CtaType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CTAS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {CTAS.find((c) => c.value === ctaType)!.sub}
            </p>
          </div>
        </CardContent>
      </Card>

      {ideaAsk && (
        <section aria-label="One question first" className="space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Label htmlFor="idea-answer" className="block text-sm font-semibold leading-snug">
            One question first: what happened, to whom, and what did it cost or save them?
          </Label>
          <Textarea
            id="idea-answer"
            autoFocus
            rows={3}
            value={ideaAsk.answer}
            onChange={(e) => setIdeaAsk({ answer: e.target.value })}
            placeholder="e.g. A mum of two, 38. Her son's 3 nights at KK cost $9,800 and her plan paid none of it."
            className="text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => answerIdea(false)} disabled={!ideaAsk.answer.trim()} className="h-11 gap-1.5 sm:h-10">
              <Sparkles className="h-4 w-4" /> Write with this
            </Button>
            <Button variant="ghost" onClick={() => answerIdea(true)} className="h-11 sm:h-10">
              Skip
            </Button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setTemplateForm((f) => (f ? null : { name: defaultTemplateName(), keepTopic: false }))
          }
          aria-expanded={templateForm !== null}
          className="gap-1.5 text-muted-foreground"
        >
          <BookmarkPlus className="h-4 w-4" /> Save as template
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
              hooksFirst
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:border-primary/40"
            }`}
            title="Generate 3 hooks first, each from a named formula, pick one, then 3 full drafts off that hook."
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={hooksFirst}
              onChange={(e) => setHooksFirst(e.target.checked)}
              disabled={isStreaming}
            />
            <Wand2 className="h-3.5 w-3.5" />
            Hooks first (recommended)
          </label>
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary sm:inline-flex"
          >
            <Keyboard className="h-3.5 w-3.5" />
          </button>
          {isStreaming ? (
            <Button
              size="lg"
              variant="outline"
              onClick={stopStreaming}
              className="gap-2"
            >
              <StopCircle className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => void handleGenerate()}
              disabled={checkingIdea}
              className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" />
              {generateButtonLabel}
            </Button>
          )}
        </div>
        {templateForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveTemplate();
            }}
            className="flex basis-full flex-wrap items-end gap-3 border-t border-primary/20 pt-3"
          >
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                maxLength={60}
                autoFocus
              />
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={templateForm.keepTopic}
                disabled={!pillarDetail.trim()}
                onChange={(e) => setTemplateForm({ ...templateForm, keepTopic: e.target.checked })}
              />
              Keep the topic
            </label>
            <Button type="submit" variant="outline" className="gap-1.5">
              <Check className="h-4 w-4" /> Save template
            </Button>
          </form>
        )}
      </div>
            </div>
          )}

          {/* Wizard footer navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={goBack}
              disabled={wizardStep === 0}
              className="gap-1.5 text-muted-foreground disabled:opacity-40 [@media(pointer:coarse)]:h-11"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <span className={`text-xs text-muted-foreground ${canGenerateEarly ? "hidden sm:inline" : ""}`}>
              Step {wizardStep + 1} of {STEP_META.length}
            </span>
            {wizardStep < LAST_STEP ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={canGenerateEarly ? "outline" : "default"}
                  onClick={goNext}
                  className="gap-1.5 [@media(pointer:coarse)]:h-11"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
                {canGenerateEarly && (
                  <Button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={checkingIdea}
                    className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95 [@media(pointer:coarse)]:h-11"
                  >
                    <Sparkles className="h-4 w-4" />
                    {generateButtonLabel}
                  </Button>
                )}
              </div>
            ) : (
              <span className="w-[74px]" aria-hidden />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="flex items-start gap-2 text-xs">
            <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="font-semibold text-foreground">Your brief</p>
              <p className="text-muted-foreground">
                {pillarMeta.label}
                {pillarDetail.trim() ? ` · ${pillarDetail.trim()}` : ""} ·{" "}
                {PLATFORMS.find((p) => p.value === platform)?.label} ·{" "}
                {FORMATS.find((f) => f.value === format)?.label}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBriefOpen(true)}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit brief
          </Button>
        </div>
      )}

      {hookOptions.length > 0 && (
        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Pick a hook
            </CardTitle>
            <CardDescription>
              Click one and we&apos;ll draft three full posts that lead with it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {hookOptions.map((h) => {
              const isPicked = chosenHook && chosenHook === h.text.trim();
              const formula = hookFormula(h.formula);
              return (
                <button
                  key={h.index}
                  type="button"
                  disabled={!h.complete || isStreaming}
                  onClick={() => handlePickHook(h.text)}
                  className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                    isPicked
                      ? "border-primary/60 bg-primary/10 shadow-sm"
                      : h.complete
                        ? "border-border/70 hover:border-primary/40 hover:bg-muted/40"
                        : "border-border/40 bg-muted/20"
                  }`}
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-[11px] font-semibold text-muted-foreground">
                    {String.fromCharCode(65 + h.index)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-sans text-sm leading-relaxed text-foreground">
                      {h.text ||
                        (h.halted ? (
                          <span className="text-muted-foreground">
                            {HALT_LABEL[h.halted]}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <ThinkingOrb state="composing" size={20} theme="light" aria-hidden />{" "}
                            drafting...
                          </span>
                        ))}
                    </div>
                    {h.halted && h.text && (
                      <span className="text-[11px] text-muted-foreground">
                        {h.halted === "stopped" ? "stopped before finishing" : HALT_LABEL.failed}
                      </span>
                    )}
                    {hookPick?.key === hookKey && hookPick.index === h.index && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <Star className="h-3 w-3" aria-hidden /> Recommended
                      </span>
                    )}
                    {formula && (
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        <span className="font-semibold text-foreground">{formula.name}.</span> Trap: {formula.trap}
                      </span>
                    )}
                    {isPicked && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                        <Check className="h-3 w-3" /> Chosen
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {variants.length > 0 && (
        <Card ref={variantsCardRef} className="scroll-mt-20 border-border/60 shadow-card">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="font-serif text-xl">
              Three variations
            </CardTitle>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReroll}
                disabled={isStreaming}
                className="gap-1.5"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isStreaming ? "animate-spin" : ""}`}
                />{" "}
                Re-roll 3
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {variants.map((v) => {
                const isSelected = selectedVariantIndex === v.index;
                return (
                  <div
                    key={v.index}
                    className={`flex flex-col rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-primary/60 bg-primary/5 shadow-sm"
                        : "border-border/70 bg-background"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Variant {String.fromCharCode(65 + v.index)}
                      </span>
                      {!v.complete && v.halted ? (
                        <span className="text-[10px] text-muted-foreground">
                          {HALT_LABEL[v.halted]}
                        </span>
                      ) : !v.complete ? (
                        <span className="flex items-center gap-1 text-[10px] text-primary">
                          <ThinkingOrb state="weaving" size={20} theme="light" aria-hidden />{" "}
                          streaming
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Check className="h-3 w-3" /> ready
                        </span>
                      )}
                    </div>
                    <pre className="min-h-[180px] flex-1 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground">
                      {v.text || (
                        <span className="text-muted-foreground">
                          {v.halted ? HALT_LABEL[v.halted] : "drafting..."}
                        </span>
                      )}
                    </pre>
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      disabled={!v.complete}
                      onClick={() => handlePickVariant(v.index)}
                      className="mt-3 w-full gap-1.5"
                    >
                      {isSelected ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Selected
                        </>
                      ) : (
                        <>Use this</>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {draft && (
        <div ref={versionsTopRef} className="scroll-mt-20 space-y-3">
          {versions.length > 0 && (
            <div
              role="tablist"
              aria-label="Platform versions"
              className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-1 lg:hidden"
            >
              {[
                { key: "original" as const, label: `${platformLabel(platform)} (original)` },
                ...versions.map((v) => ({ key: v.platform, label: platformLabel(v.platform) })),
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`min-h-[40px] shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    activeTab === t.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className={versions.length > 0 ? "grid items-start gap-4 lg:grid-cols-2" : ""}>
        <Card
          ref={draftCardRef}
          className={`scroll-mt-20 border-border/60 shadow-card ${
            versions.length > 0 && activeTab !== "original" ? "hidden lg:block" : ""
          }`}
        >
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="flex items-center gap-1">
              <CardTitle className="font-serif text-xl">Your draft</CardTitle>
              <InfoTip label="About editing your draft">
                Cut about 30% of the words and edit for your voice first.
              </InfoTip>
            </div>
            <div className="flex flex-wrap gap-2">
              {svSplit?.script ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mainCopyBlock !== null}
                    title={mainCopyBlock ?? undefined}
                    onClick={() =>
                      void copyText(
                        svSplit.caption,
                        "Caption copied",
                        "Paste into the post caption.",
                        true,
                      )
                    }
                    className="relative gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy caption
                    {hasErrors && (
                      <span
                        title="Compliance error flag detected - review before posting"
                        className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-destructive bg-destructive text-[10px] font-bold leading-none text-destructive-foreground"
                      >
                        !
                      </span>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void copyText(
                        svSplit.script!,
                        "Script copied",
                        "This is what you say on camera.",
                      )
                    }
                    className="gap-1.5"
                  >
                    <Clapperboard className="h-3.5 w-3.5" /> Copy script
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={mainCopyBlock !== null}
                  title={mainCopyBlock ?? undefined}
                  className="relative gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                  {hasErrors && (
                    <span
                      title="Compliance error flag detected - review before posting"
                      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-destructive bg-destructive text-[10px] font-bold leading-none text-destructive-foreground"
                    >
                      !
                    </span>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReroll}
                disabled={isStreaming}
                className="gap-1.5"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isStreaming ? "animate-spin" : ""}`}
                />{" "}
                Re-roll
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {mainCopyBlock && (
              <p className="mb-3 text-xs text-muted-foreground">
                Team rule: approval needed before posting. {mainCopyBlock}
              </p>
            )}
            {savedEntry && (
              <p className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-success" />
                {savedEntry.status === "posted" ? (
                  "Posted. Edits save to My posts."
                ) : savedEntry.status === "scheduled" && savedEntry.scheduledFor ? (
                  <>
                    Scheduled for {whenLabel(savedEntry.scheduledFor)}.
                    <Link to="/calendar" className="-my-2 py-2 font-semibold text-primary hover:underline">
                      Open calendar
                    </Link>
                  </>
                ) : (
                  <>
                    Saved to My posts.
                    {suggestedTime && (
                      <>
                        <span className="font-medium text-foreground">Best time {whenLabel(suggestedTime.at)}</span>
                        <InfoTip label="About the best time">
                          {suggestedTime.why === "slot" ? "Your next open posting time, from Brand kit." : suggestedTime.why === "best" ? "When your past posts landed best." : "A common slot until your posts have results."}
                        </InfoTip>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={scheduleSuggested}>
                          Schedule then
                        </Button>
                      </>
                    )}
                    <Link to="/calendar" className="-my-2 py-2 font-semibold text-primary hover:underline">
                      {suggestedTime ? "Pick another time" : "Schedule it"}
                    </Link>
                  </>
                )}
              </p>
            )}
            <ComplianceChips flags={visibleFlags} onDismiss={dismissFlag} />

            <div className={`grid gap-4 ${versions.length > 0 ? "" : "lg:grid-cols-2"}`}>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    // Undo would throw away what was just typed.
                    if (undoText !== null) setUndoText(null);
                  }}
                  onBlur={handleDraftBlur}
                  rows={Math.min(28, Math.max(12, draft.split("\n").length + 2))}
                  className="flex-1 font-sans text-sm leading-relaxed"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Rewrite</span>
                  {REWRITES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={rewrite?.status === "streaming"}
                      onClick={() => void handleRewrite(r.id)}
                      className={`flex h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50 sm:h-9 ${
                        rewrite?.id === r.id
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/70 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={cleanDraft}
                    title="Removes hidden characters and swaps fancy punctuation and stock AI words."
                    className="flex h-11 items-center gap-1 rounded-full border border-border/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:h-9"
                  >
                    <Eraser className="h-3.5 w-3.5" /> Clean AI tells
                  </button>
                </div>
                {undoText !== null && (
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-success" /> {undoNote}
                    <button
                      type="button"
                      onClick={undoRewrite}
                      className="-my-3.5 py-3.5 font-semibold text-primary hover:underline sm:-my-2 sm:py-2"
                    >
                      Undo
                    </button>
                  </p>
                )}
                {rewrite && (
                  <div id="rewrite-panel" className="mt-1.5 scroll-mt-24 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {rewrite.status === "streaming" && (
                        <ThinkingOrb state="weaving" size={20} theme="light" aria-hidden />
                      )}
                      {rewriteLabel(rewrite.id)}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {rewrite.text || <span className="text-muted-foreground">Rewriting...</span>}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={rewrite.status !== "done"}
                        onClick={acceptRewrite}
                        className="gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" /> Use this
                      </Button>
                      <Button size="sm" variant="ghost" onClick={discardRewrite}>
                        {rewrite.status === "streaming" ? "Stop" : "Discard"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> Live preview
                </div>
                <PostPreview text={draft} platform={platform} format={format} disclosure={disclosure} />
              </div>
            </div>

            {shortScript && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                    scriptLong
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {scriptLong ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                  Script: {scriptWords} words, about {spokenSeconds(scriptWords)}s
                </span>
                <ReelLengthPicker value={reelSeconds} onChange={setReelSeconds} />
                {scriptLong && (
                  <span role="alert" className="flex basis-full items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {scriptLong}
                  </span>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-muted-foreground">
                {svSplit?.script ? "Caption words" : "Words"}: {counters.words}
              </span>
              <span
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                  counters.status === "good"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : counters.status === "warn"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "border-destructive/50 bg-destructive/10 text-red-700 dark:text-red-300"
                }`}
              >
                {counters.status === "good" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {counters.message}
              </span>
              {counters.firstNote && (
                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-muted-foreground">
                  {counters.firstNote}
                </span>
              )}
              <LimitChips check={limits} platform={platform} />
              {draftBlanks.length > 0 && (
                <span role="status" className="flex basis-full items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {draftBlanks.length === 1 ? "1 blank" : `${draftBlanks.length} blanks`} to fill before posting: {draftBlanks.join(", ")}
                </span>
              )}
              {platform === "linkedin" && findLinks(draft).length > 0 && (
                <Button variant="outline" size="sm" onClick={moveLinkToComment} className="h-11 gap-1.5 sm:h-9">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Move {findLinks(draft).length > 1 ? "links" : "link"} to first comment
                </Button>
              )}
            </div>

            {firstComment && (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" /> First comment
                    <InfoTip label="About the first comment">
                      Post this as your own first comment once the post is up.
                    </InfoTip>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copyText(commentText, "First comment copied", "Paste it as a comment on your post.")}
                    className="h-11 gap-1 text-xs sm:h-7"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <p className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">{commentText}</p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Disclose</span>
              {(Object.keys(DISCLOSURES) as DisclosureId[]).map((id) => {
                const on = disclosure.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDisclosure((prev) => (on ? prev.filter((d) => d !== id) : [...prev, id]))
                    }
                    className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                      on
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                    {DISCLOSURES[id].label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Adapt for</span>
              {ADAPT_PLATFORMS.filter((p) => p !== platform).map((p) => {
                const Icon = PLATFORMS.find((x) => x.value === p)!.icon;
                const has = versions.some((v) => v.platform === p);
                return (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    onClick={() => handleAdapt(p)}
                    className="h-9 gap-1.5"
                  >
                    <Icon className="h-3.5 w-3.5" /> {platformLabel(p)}
                    {has && <Check className="h-3.5 w-3.5 text-success" />}
                  </Button>
                );
              })}
            </div>

            {format === "short-video" && savedEntry && (
              <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3" aria-live="polite">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Clapperboard className="h-3.5 w-3.5" /> Storyboard
                </div>
                {storyboard ? (
                  <>
                    <ShotList beats={storyboard.beats} />
                    {storyboardStale && (
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Your script changed since.
                        <button
                          type="button"
                          onClick={handleStoryboard}
                          disabled={storyboardBusy}
                          className="-my-3.5 py-3.5 font-semibold text-primary hover:underline disabled:opacity-60 sm:-my-2 sm:py-2"
                        >
                          {storyboardBusy ? "Redoing it..." : "Redo it"}
                        </button>
                      </p>
                    )}
                    {readyToFilm ? (
                      <Button asChild variant="outline" size="sm" className="h-11 gap-1.5 border-success/40 text-success sm:h-9">
                        <Link to="/board">
                          <Check className="h-3.5 w-3.5" /> On your board in{" "}
                          {BOARD_COLUMNS.find((c) => c.key === boardColumn)?.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={markReadyToFilm} className="h-11 gap-1.5 sm:h-9">
                        <Columns3 className="h-3.5 w-3.5" /> Mark ready to film
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStoryboard}
                      disabled={storyboardBusy || !shortScript}
                      className="h-11 gap-1.5 disabled:opacity-100 sm:h-9"
                    >
                      {storyboardBusy ? (
                        <ThinkingOrb state="working" size={20} theme="light" aria-hidden />
                      ) : (
                        <Clapperboard className="h-3.5 w-3.5" />
                      )}
                      {storyboardBusy ? "Planning the shots..." : "Make a storyboard"}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      Uses 1 of your {DAILY_LIMITS.storyboard} a day.
                    </span>
                  </div>
                )}
                {storyboardError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {storyboardError}
                  </p>
                )}
              </div>
            )}


            {craftCheck && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Craft check
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      craftCheck.score >= 75
                        ? "bg-success/15 text-success"
                        : craftCheck.score >= 50
                          ? "bg-primary/15 text-primary"
                          : "bg-warning/15 text-warning"
                    }`}
                  >
                    {craftCheck.score}/100
                  </span>
                </div>
                <p className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
                  {craftCheck.fixes[0]}
                </p>
                <Link
                  to="/coach"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Full check &rarr;
                </Link>
              </div>
            )}

            {craftCheck && !isStreaming && (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3" aria-live="polite">
                {postScore ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Gauge className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Predicted engagement
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          postScore.score >= 7.5
                            ? "bg-success/15 text-success"
                            : postScore.score >= 5
                              ? "bg-primary/15 text-primary"
                              : "bg-warning/15 text-warning"
                        }`}
                      >
                        {postScore.score.toFixed(1)}/10
                      </span>
                      <InfoTip label="About the score">Five checks on this draft, weighed out of 10. A guide, not a promise of reach.</InfoTip>
                    </div>
                    {postScore.down.length > 0 ? (
                      <ul className="mt-2 space-y-1.5" aria-label="What pulled it down">
                        {postScore.down.map((id) => (
                          <li key={id} className="text-xs">
                            <span className="font-semibold">{FACTORS[id].label}:</span>{" "}
                            <span className="text-muted-foreground">{FACTORS[id].tip}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Nothing big is holding it back.</p>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-9 gap-1.5 ${scoring === scoreKeyNow ? "disabled:opacity-100" : ""}`}
                      onClick={() => void runScore()}
                      disabled={!!scoring || !userId}
                    >
                      {scoring === scoreKeyNow ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Gauge className="h-3.5 w-3.5" />}
                      {scoring === scoreKeyNow ? "Scoring..." : "Predict engagement"}
                    </Button>
                    {scoreError?.key === scoreKeyNow && <p className="text-xs text-destructive" role="alert">{scoreError.message}</p>}
                  </div>
                )}
              </div>
            )}

            {craftCheck && !isStreaming && (
              <HumanCheck
                draft={draft}
                samples={voiceSamples}
                disabled={rewrite?.status === "streaming"}
                onClean={cleanDraft}
                onRewriteLines={(lines) => {
                  void handleRewrite("lines", lines);
                  setTimeout(() => document.getElementById("rewrite-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                }}
              />
            )}

            {craftCheck && !isStreaming && (
              <div className="mt-3">
                <FactFlags text={draft} live={false} />
              </div>
            )}

            {(hashtags.length > 0 || hashtagsLoading) && (
              <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" /> Hashtags
                  </div>
                  {hashtags.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopyHashtags}
                      className="h-7 gap-1 text-xs"
                    >
                      <Copy className="h-3 w-3" /> Copy all
                    </Button>
                  )}
                </div>
                {hashtagsLoading && hashtags.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Generating...
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border/60 bg-background px-2 py-0.5 font-mono text-[11px] text-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(imagePrompt || imagePromptLoading) && (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <ImageWandIcon className="h-3.5 w-3.5" /> Image prompt
                  </div>
                  {imagePrompt && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopyImagePrompt}
                        className="h-9 gap-1 text-xs"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                      {!(imgJob?.prompt === imagePrompt && imgJob.state === "done") && (
                        <Button
                          size="sm"
                          disabled={imageBusy() || !userId}
                          onClick={() => userId && void makeImage(userId, imagePrompt, (chosenHook || draft.trim().split("\n")[0] || "AI image").slice(0, 80))}
                          className="h-9 gap-1.5 text-xs"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {imgJob?.prompt === imagePrompt && imgJob.state === "failed" ? "Try again" : "Make the image"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {imagePromptLoading && !imagePrompt ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Generating...
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-foreground">
                    {imagePrompt}
                  </p>
                )}
                {imgJob && (imgJob.prompt === imagePrompt || imageBusy()) && (
                  <div className="mt-3" aria-live="polite">
                    {imgJob.state === "working" || imgJob.state === "saving" ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ThinkingOrb state="working" size={20} theme="light" aria-hidden />
                        {imgJob.prompt !== imagePrompt
                          ? "Making the image for your earlier draft..."
                          : imgJob.state === "saving"
                            ? "Saving it to Media..."
                            : "Making the image, about 30 seconds. You can keep working."}
                      </div>
                    ) : imgJob.state === "failed" ? (
                      <p className="text-xs text-destructive" role="alert">{imgJob.error}</p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        {imgJob.preview && (
                          <img
                            src={imgJob.preview}
                            alt={imagePrompt.slice(0, 120)}
                            className="max-h-64 rounded-lg border border-border/60"
                          />
                        )}
                        <div className="space-y-1.5 text-xs">
                          <p className="flex items-center gap-1 font-semibold">
                            <Check className="h-3.5 w-3.5 text-success" /> Saved to Media, in AI images
                          </p>
                          <Link to="/carousel" className="font-semibold text-primary hover:underline">
                            Use it on a carousel slide
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {savedEntry && savedEntry.status !== "posted" && !isStreaming && (
              <PostReceipt
                formula={draftFormula?.name}
                chars={limits.chars}
                maxChars={limits.maxChars}
                platformName={platformLabel(platform)}
                when={
                  savedEntry.status === "scheduled" && savedEntry.scheduledFor
                    ? `${whenLabel(savedEntry.scheduledFor)}, as scheduled`
                    : suggestedTime
                      ? whenLabel(suggestedTime.at)
                      : null
                }
                blanks={draftBlanks}
                copyLabel={svSplit?.script ? "Copy caption" : "Copy post"}
                onCopy={() =>
                  svSplit?.script
                    ? void copyText(svSplit.caption, "Caption copied", "Paste into the post caption.", true)
                    : void handleCopy()
                }
                copyBlocked={mainCopyBlock}
              />
            )}
          </CardContent>
        </Card>
        {shownVersion && (
          <Card
            className={`border-border/60 shadow-card ${
              activeTab === "original" ? "hidden lg:block" : ""
            }`}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="font-serif text-xl">
                {platformLabel(shownVersion.platform)} version
              </CardTitle>
              {shownVersion.status === "streaming" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => versionAbortRef.current.get(shownVersion.draftId)?.abort()}
                  className="shrink-0 gap-1.5"
                >
                  <StopCircle className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!shownVersion.text.trim()}
                  onClick={() => copyVersion(shownVersion)}
                  className="relative shrink-0 gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                  {hasComplianceErrors(versionFlags) && (
                    <span
                      title="Compliance error flag detected - review before posting"
                      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-destructive bg-destructive text-[10px] font-bold leading-none text-destructive-foreground"
                    >
                      !
                    </span>
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {versions.length > 1 && (
                <div className="hidden flex-wrap gap-1.5 lg:flex">
                  {versions.map((v) => (
                    <button
                      key={v.platform}
                      type="button"
                      onClick={() => setActiveTab(v.platform)}
                      aria-pressed={v === shownVersion}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        v === shownVersion
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/70 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {platformLabel(v.platform)}
                    </button>
                  ))}
                </div>
              )}
              {shownVersion.status === "streaming" ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ThinkingOrb state="weaving" size={20} theme="light" aria-hidden /> Adapting for{" "}
                  {platformLabel(shownVersion.platform)}...
                </p>
              ) : shownVersion.status !== "done" && !versionSaved ? (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  {shownVersion.status === "stopped" ? "Stopped before finishing." : "Didn't finish."}
                  <button
                    type="button"
                    onClick={() => retryVersion(shownVersion)}
                    className="-my-2 py-2 font-semibold text-primary hover:underline"
                  >
                    Try again
                  </button>
                </p>
              ) : versionSaved ? (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-success" />
                  Saved to My posts.
                  <Link to="/calendar" className="-my-2 py-2 font-semibold text-primary hover:underline">
                    Schedule it
                  </Link>
                </p>
              ) : null}
              <ComplianceChips flags={versionFlags} onDismiss={dismissFlag} />
              <Textarea
                aria-label={`${platformLabel(shownVersion.platform)} version`}
                value={shownVersion.text}
                readOnly={shownVersion.status === "streaming"}
                onChange={(e) => updateVersion(shownVersion.draftId, { text: e.target.value })}
                onBlur={() => {
                  if (shownVersion.status !== "streaming") saveVersion(shownVersion);
                }}
                rows={Math.min(28, Math.max(12, shownVersion.text.split("\n").length + 2))}
                className="font-sans text-sm leading-relaxed"
              />
              {shownVersion.text.trim() && (
                <div className="-mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <LimitChips check={versionLimits} platform={shownVersion.platform} />
                </div>
              )}
              <PostPreview
                text={shownVersion.text}
                platform={shownVersion.platform}
                format={format}
                disclosure={disclosure}
              />
            </CardContent>
          </Card>
        )}
          </div>
        </div>
      )}

      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setShowShortcuts(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border/70 bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="rounded p-1 hover:bg-muted"
                aria-label="Close shortcuts"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Generate</span>
                <kbd className="rounded border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-xs">
                  Cmd / Ctrl + Enter
                </kbd>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Copy current draft</span>
                <kbd className="rounded border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-xs">
                  Cmd / Ctrl + Shift + C
                </kbd>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  Clear vibe / close dialog
                </span>
                <kbd className="rounded border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-xs">
                  Esc
                </kbd>
              </li>
            </ul>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="fixed bottom-20 left-1/2 z-50 !mt-0 -translate-x-1/2 lg:bottom-6">
          <Button
            size="lg"
            variant="outline"
            onClick={stopStreaming}
            className="gap-2 bg-background shadow-lg"
          >
            <StopCircle className="h-4 w-4" />
            <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Stop
          </Button>
        </div>
      )}
    </div>
  );
}
