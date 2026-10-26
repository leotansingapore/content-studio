import { moveHashtags } from "@/components/NetworkCaptions";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import RealQuestions from "@/components/RealQuestions";
import AudiencePicker, { useSavedAudiences } from "@/components/AudiencePicker";
import { audienceFromParams, audienceLine, loadAudiences } from "@/lib/audiences";
import { labelsForNewDraft, loadLabels } from "@/lib/labels";
import { loadPositioning } from "@/lib/positioning";
import { withQuestion } from "@/lib/sgFeeds";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import CopyLinkButton from "@/components/CopyLinkButton";
import { COMPARE_TABS, links, WRITE_STEPS, type PostLang } from "@/lib/links";
import { asPostLang, langOf } from "@/lib/translate";
import { takeNavTranslate } from "@/lib/translateJob";
import { useScrollToHash, useUrlItem, useUrlState, withParam } from "@/lib/urlState";
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
import { fixImage, imageBusy, imageJob, makeImage, onImageJob, resumeImage, type ImageJob } from "@/lib/aiImage";
import { currentScore, labelFor, loadScores, saveScore, scorePost, textKey, tipFor, type FactorId, type PostScore, type ScoreFormat } from "@/lib/postScore";
import { otherFormulas, splitHook } from "@/lib/variants";
import { slotTimesFor } from "@/lib/postingSlots";
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
  ImagePlus,
  Loader2,
  Mic,
  Hash,
  Image as ImageWandIcon,
  Keyboard,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Gauge,
  BookmarkPlus,
  MessageSquare,
  Eraser,
  Columns3,
  ArrowRight,
  Star,
  Shuffle,
  ExternalLink,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import inspirationData from "@/data/inspiration.json";
import { type InspirationEntry } from "@/components/Inspiration";
import PostPreview, { type PreviewMedia } from "@/components/PostPreview";
import { deleteFile, getFile, putFile } from "@/lib/deviceFiles";
import { storePicture } from "@/lib/mediaLibrary";
import StockSearch from "@/components/StockSearch";
import { downloadStock } from "@/lib/stockMedia";
import { fileProblem, fileType, MAX_PICTURES, NEEDS_MEDIA } from "@/lib/autoPost";
import { analyzePosts } from "@/lib/coach";
import type { PlatformId } from "@/lib/platformCounters";
import {
  scanCompliance,
  hasComplianceErrors,
  type ComplianceFlag,
} from "@/lib/compliance";
import { ctaKeyword } from "@/lib/autoDm";
import { socialConnectShown } from "@/lib/socialConnect";
import { PostItForMePanel, ZernioStatus } from "@/components/PostItForMe";
import {
  isVoiceProfileUsable,
  loadVoiceProfile,
  isNudgeDismissed,
  dismissNudgeForSession,
  VOICE_MIN_CHARS,
  voiceSummaryOf,
} from "@/lib/voiceProfile";
import { memoryLine, undoLearning } from "@/lib/voiceMemory";
import { REWRITE_LEARNINGS, dismissRewriteNudge, logRewrite, rememberRewrite, rewriteNudge, type LoggedRewrite } from "@/lib/rewriteLog";
import HumanCheck from "@/components/HumanCheck";
import ComplianceChips from "@/components/ComplianceChips";
import FactFlags from "@/components/FactFlags";
import { ideaIsThin, pickHook } from "@/lib/writingJudge";
import {
  getDraftById,
  loadDrafts,
  newDraftId,
  setDraftAttached,
  coverOf,
  titlesOf,
  upsertDraft,
  type DraftEntry,
  type DraftRemix,
} from "@/lib/draftHistory";
import { useDraftReviews } from "@/hooks/useDraftReviews";
import { getTrackedPosts, postingTimeOn, suggestPostingTime } from "@/lib/analytics";
import { keyToDate, localDateKey, postedDay, scheduleTime, timeLabel } from "@/lib/dueDates";
import { nearDuplicate } from "@/lib/nearDuplicate";
import { ToastAction } from "@/components/ui/toast";
import {
  BLANKS_RULE,
  checkLimits,
  countHashtags,
  HASHTAG_CAP,
  findBlanks,
  findLinks,
  MAX_CHARS,
  moveLinksToComment,
  readout,
  REEL_LENGTHS,
  reelLengthRule,
  reelTooLong,
  reelTooShort,
  spokenSeconds,
  spokenWords,
  type CounterReadout,
  type LimitCheck,
  type ReelLength,
} from "@/lib/platformCounters";
import { MAKE_VIDEO, makeVideoHref, splitScriptCaption } from "@/lib/scriptCaption";
import ShotList from "@/components/ShotList";
import PostReceipt from "@/components/PostReceipt";
import { BOARD_COLUMNS, columnOf, loadStages, setStage, type ProductionStage } from "@/lib/board";
import { DAILY_LIMITS, ReelCloneError } from "@/lib/reelClone";
import { makeStoryboard, storyboardRun, type Storyboard } from "@/lib/storyboard";
import { formulaOfHook, HOOK_FORMULAS, hookFormula, hookFormulaFields, hookFormulaSet, hookFormulasFrom, provenFormulas, provenOpen, type HookFormula, type HookSpeaker } from "@/lib/hookFormulas";
import { HOOK_BANK } from "@/lib/hookBank";
import { prompterLines, titlesRun, writeTitles, TITLES_FAILED } from "@/lib/prompter";
import {
  cleanAiTells,
  DISCLOSURES,
  stripDashes,
  tagLinks,
  toPlainText,
  withCredit,
  withDisclosure,
  withSignOff,
  type DisclosureId,
} from "@/lib/plainText";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUsesLeft } from "@/lib/aiUsage";
import PriceChip from "@/components/PriceChip";
import { WRITE_PRICE, priceOf, reasonText, sumPrices } from "@/lib/prices";
import { canCredit, dayMonth, draftLine, earlierRemix, rememberSource, sourceChip, type RemixSource } from "@/lib/remixSource";
import { speakerFor } from "@/lib/remixBrand";
import { reusedItems, sharedRuns } from "../../supabase/functions/remix/overlap.ts";
import { loadBrand } from "@/lib/carousel";
import { allowedLinks, applyBrandRules, avoidList, brandRulesLine } from "@/lib/brandRules";
import { capHashtags } from "../../supabase/functions/video-assist/captions.ts";
import { loadSocialAccounts } from "@/lib/socialAccounts";
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
// newHooks (Leo only): the hooks panel's rows, new openings for a finished post
type StreamingMode = "idle" | "hooks" | "variants" | "newHooks";
type StreamTarget = Exclude<StreamingMode, "idle">;

// blank (Leo only): a hook that came back holding a blank to fill is left out, never offered (live-p7a D9)
const HALT_LABEL = { stopped: "stopped", failed: "didn't finish", blank: "left out: it needed a fact you haven't given" } as const;

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
      ...(r.complete === true ? {} : { halted: r.halted === "failed" || r.halted === "blank" ? (r.halted as "failed" | "blank") : ("stopped" as const) }),
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
  // Set when the request ended (Stop, error, early close) before this row finished, or a hook came back with a blank.
  halted?: keyof typeof HALT_LABEL;
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
// "ask": the change asked for in the assistant (/generate?draft=<id>&ask=<words>).
type RewriteId = (typeof REWRITES)[number]["id"] | "lines" | "ask";
/** The rewrite panel's title; a score fix (Leo only) passes its factor's label. */
export const rewriteLabel = (id: RewriteId, fix?: string) =>
  fix ? `Fix: ${fix}` : id === "lines" ? "Rewrite flagged lines" : id === "ask" ? "Your change" : REWRITES.find((r) => r.id === id)!.label;

// edit-score (Leo only): "Fix this" on a score line sends its factor's ask as the ask rewrite. specific adds no
// number on purpose (MAS: no invented numbers).
export const FIX_ASK: Record<FactorId, string> = {
  hook: "Rewrite only the first line so it opens with a number, a surprise or the question the reader is asking. Keep every other line word for word.",
  oneIdea: "Cut the points that are not about the main idea. Keep the first line and the call to action.",
  specific: "Add one concrete detail: a step the reader can take today or a short client story with no names. Do not add any number that is not already in the post.",
  cta: "Rewrite only the last line as one clear ask: comment a word, send a DM or save the post. Keep every other line word for word.",
  readable: "Break it into short lines of one or two sentences and cut what is not needed. Keep every point, fact and number.",
};
const scoreBand = (v: number) => (v >= 7.5 ? "Strong" : v >= 5 ? "Fair" : "Weak");

// remix-variations (Leo only): "Try new hooks" writes openings for a finished post whose body stays as it is.
export const newHookContext = (body: string) =>
  `Write a new opening line for this finished post. Keep it under 25 words. The body below stays exactly as it is, so the line must lead into it.\n\n${body}`;
// A hook is one line with no room for a blank, so it keeps its formula's shape without a fact the brief does not give
// (Leo only; live-p7a D9 wrote "[Number] things I wish I knew..."). The list's count is its shape, as in remix's hooks.
export const HOOK_FACTS_RULE =
  "Never invent a number, a client or a result, and never write a blank in square brackets. When the formula needs a number this brief does not give, keep its shape without one.";
const LIST_COUNT_RULE = "The list formula always says how many things it holds, as a digit or a word, at most 10. That count is its shape, not a fact.";
/** One hook request's fields: the formula in the brand's speaker, with the hook's facts rule in place of the post's blanks rule. */
export function hookFields(f: HookFormula, base: { ideaContext?: string; styleReference?: string }, speaker: HookSpeaker) {
  const rule = f.id === "list" ? `${HOOK_FACTS_RULE} ${LIST_COUNT_RULE}` : HOOK_FACTS_RULE;
  const ctx = base.ideaContext ?? "";
  return hookFormulaFields(f, { ...base, ideaContext: ctx.includes(BLANKS_RULE) ? ctx.replace(BLANKS_RULE, rule) : [ctx, rule].filter(Boolean).join("\n\n") }, speaker);
}
/** A hook still holding a blank to fill (a "[HOOK]" label in front is not one): no hook row offers it. */
export const hookBlank = (text: string) => /\[[^\]\n]+\]/.test(text.replace(HOOK_LABEL, ""));

// a script's spoken label on its first line ("HOOK:", "**HOOK (0-3s):**", "[HOOK]"), kept when its hook is swapped
const HOOK_LABEL = /^[\s*_#>[]*hook\b[^:\]\n]*[:\]][*_\s]*/i;
/** The post with its first line swapped for `hook`; everything after the first line stays byte for byte. */
export function withOpening(draft: string, hook: string): string {
  const first = draft.split("\n")[0];
  return (first.match(HOOK_LABEL)?.[0] ?? "") + hook.trim() + draft.slice(first.length);
}
/** A post's version with a new opening: its brief and source in the set, nothing scheduled, posted, numbered or scored. */
export function versionOf(parent: DraftEntry, text: string, hook: string, formula: string | undefined, set: NonNullable<DraftEntry["set"]>, id = newDraftId(), at = new Date().toISOString()): DraftEntry {
  const v: DraftEntry = { ...parent, id, createdAt: at, hook, draft: text, hookFormula: formula, set, status: "draft" };
  for (const k of ["scheduledFor", "postedAt", "repeat", "metrics", "zernio", "live", "score", "versions", "thread", "storyboard", "titles", "cover", "agent"] as const) delete v[k];
  return v;
}
// set ids sync inside the drafts key, so never uuid-shaped
const newSetId = () => `vs-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Trailing hashtags into the first comment: one rule, shared with the schedule steps (NetworkCaptions). */
export const moveHashtagsToComment = moveHashtags;
/** The longest change the assistant passes in. */
const MAX_ASK = 300;

// The generator's own rules (format length, a framing nudge) win over loose
// context, so a rewrite states a word target and says it overrides them.
const REWRITE_LENGTH: Partial<Record<RewriteId, number>> = { shorter: 0.65, longer: 1.35 };

function rewriteFields(post: string, id: RewriteId, lines: string[] = [], ask = ""): { ideaContext: string; styleReference: string } {
  const instruction =
    id === "lines"
      ? `rewrite only these lines so each sounds like a person talking, and keep every other line word for word: ${lines.map((l) => `"${l}"`).join(" ")}`
      : id === "ask"
        ? ask
        : REWRITES.find((r) => r.id === id)!.instruction;
  const words = post.split(/\s+/).filter(Boolean).length;
  const target = Math.max(20, Math.round(words * (REWRITE_LENGTH[id] ?? 1)));
  // the asked change may itself be about length, so it gets no word target to fight
  const rule =
    id === "ask"
      ? `This is an edit of an existing post, not a new post. Rewrite instruction: ${instruction}. The instruction overrides the format length, variant tone and framing rules.`
      : `This is an edit of an existing post, not a new post. Rewrite instruction: ${instruction}. Target length: about ${target} words. The instruction and target length override the format length, variant tone and framing rules.`;
  return {
    ideaContext: [
      rule,
      `Keep${id === "ask" ? " everything the instruction does not ask to change:" : ""} the same opening line idea, the same points in the same order, the same facts and numbers, and the same call to action.`,
      BLANKS_RULE,
      "",
      "The post:",
      post,
    ].join("\n"),
    styleReference: `${rule} Keep the structure of the post in the context.`,
  };
}

// What the copy check found when the Remix sheet made this post (remixJob.ts). A copied line drops off once it
// is edited out; the claim and invented warnings stay until dismissed.
function RemixFlags({
  flags,
  text,
  dismissed,
  onDismiss,
  besideStrip = false,
}: {
  flags: NonNullable<DraftRemix["flags"]>;
  text: string;
  dismissed: Set<string>;
  onDismiss: (id: string) => void;
  /** The compare strip sits beside the draft on large screens and lists the copied and claim lines there. */
  besideStrip?: boolean;
}) {
  const items = [
    ...flags.copied
      .filter((l) => reusedItems(text, [l]).length > 0 || sharedRuns(text, l).length > 0)
      .map((l) => ({ id: `remix-copied:${l}`, title: "Shares words with the original", match: l })),
    ...(flags.claim ? [{ id: "remix-claim", title: "Uses a figure or claim from the original. Check it or take it out.", match: "" }] : []),
    ...(flags.invented ? [{ id: "remix-invented", title: "Says something about you that isn't in your profile. Check it.", match: "" }] : []),
    ...(flags.mas ? [{ id: "remix-mas", title: "These words may promise a result or point to a product. Check them before you post.", match: "" }] : []),
  ].filter((f) => !dismissed.has(f.id));
  if (!items.length) return null;
  // so each warning shows once on a large screen: the strip's copy, beside the draft, is the one counted live
  const wide = (id: string) => (besideStrip && id !== "remix-invented" && id !== "remix-mas" ? "lg:hidden " : "");
  return (
    <div className={`${items.every((f) => wide(f.id)) ? "lg:hidden " : ""}mb-3 flex flex-wrap gap-2`}>
      {items.map((f) => (
        <div key={f.id} className={`${wide(f.id)}flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200`}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <div className="space-y-0.5">
            <div className="font-semibold">{f.title}</div>
            {f.match && <div className="font-mono text-[10px]">{f.match}</div>}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(f.id)}
            className="-my-1 -mr-1.5 ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-background/40 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
            aria-label="Dismiss flag"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
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
        {HASHTAG_CAP[platform] ? `/${HASHTAG_CAP[platform]}` : platform === "linkedin" ? " (3 max)" : ""}
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
          className={`flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors sm:h-9 [@media(pointer:coarse)]:h-11 ${
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

// A remixed post's original beside it (Leo only). Lazy: it reads the top posts and ads drops.
const RemixCompare = lazy(() => import("@/components/RemixCompare"));
// Make it a thread (Leo only, formats-text-threads). Lazy, so nobody else loads it.
const ThreadPanel = lazy(() => import("@/components/ThreadPanel"));
// The teleprompter that films a short video script (Leo only, formats-hooks-scripts). Lazy: it loads the editor hand-off.
const Prompter = lazy(() => import("@/components/Prompter"));
// "Proven in your niche" (Leo only): the three formulas with the strongest real lines in the weekly hook bank.
const PROVEN = provenFormulas(HOOK_BANK);
const PROVEN_OPEN = provenOpen(HOOK_BANK);
const HOOK_TABS = ["formulas", "proven"] as const;
const ThreadButton = lazy(() => import("@/components/ThreadPanel").then((m) => ({ default: m.ThreadButton })));
// Insert (Leo only, edit-snippets): saved lines, hashtag sets, endings, hooks and post templates. Lazy, so nobody else loads it.
const InsertPanel = lazy(() => import("@/components/InsertPanel"));
const InsertButton = lazy(() => import("@/components/InsertPanel").then((m) => ({ default: m.InsertButton })));
// Posts in Chinese, Malay or Tamil (Leo only, edit-translate): the Language row, the versions row and Make it in. Lazy, so nobody else loads it.
const TranslateBar = lazy(() => import("@/components/TranslateBar"));
const LanguageRow = lazy(() => import("@/components/TranslateBar").then((m) => ({ default: m.LanguageRow })));
const VersionTabs = lazy(() => import("@/components/TranslateBar").then((m) => ({ default: m.VersionTabs })));

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
  // Leo only (remix-variations): the hooks panel over the open post (?panel=hooks): its rows, the post they were
  // written for and with which formulas, Jev's pick, the drafts saved from it, and whether the last run failed.
  const [newHookRows, setNewHookRows] = useState<VariantState[]>([]);
  const [hookPanel, setHookPanel] = useState<{
    draftId: string;
    formulas: string[];
    running: boolean;
    failed: boolean;
    pick: { key: string; index: number } | null;
    saved: Record<number, string>;
    testSet?: string;
  } | null>(null);
  const newPickPendingRef = useRef(false);
  // Leo only: the variations Keep all 3 saved (key: their texts), and each one's draft, so a later pick opens it
  const [keptVariants, setKeptVariants] = useState<{ key: string; set: string; ids: Record<number, string> } | null>(null);
  const keptNow = keptVariants?.key === variants.map((v) => v.text).join("\n") ? keptVariants : null;
  const [draft, setDraft] = useState<string>("");
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const [vibeSourceId, setVibeSourceId] = useState<string | null>(null);
  // The post, ad or trend this one is remixed from (remixSource.ts), saved with the draft. Only Leo's sessions
  // read ?source= (north-star gate); a draft that already carries one keeps it on every save.
  const leo = useLeoUser();
  const [remixSource, setRemixSource] = useState<RemixSource | null>(null);
  // An adapt that finishes after the x or the credit box saves the source as it is then
  const remixSourceRef = useRef(remixSource);
  remixSourceRef.current = remixSource;
  const [pendingSourceKey, setPendingSourceKey] = useState<string | null>(null);
  // Leo only (brand-audiences): a saved audience picked for this brief (?aud= once the session is read), and the
  // plan slot's label (?label=) that the drafts saved from this brief wear
  const [pendingAud, setPendingAud] = useState<string | null>(null);
  const [audId, setAudId] = useState<string | null>(null);
  const [labelId, setLabelId] = useState<string | null>(null);
  // Leo only (edit-translate): this make's language (undefined follows the brand's), a version to make once for a
  // post (just written in another language, or asked for on My posts), and the toast a version opens with.
  const [postLang, setPostLang] = useState<PostLang | null | undefined>(undefined);
  const [autoTranslate, setAutoTranslate] = useState<{ id: string; lang: PostLang } | null>(null);
  const openNote = useRef<Parameters<typeof toast>[0] | null | undefined>(undefined);
  useEffect(() => {
    const t = takeNavTranslate();
    if (t) setAutoTranslate(t);
  }, []);
  // "Remix it again" hides the repeat notice for that key
  const [repeatHidden, setRepeatHidden] = useState<string | null>(null);
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
  const savedAudiences = useSavedAudiences(leo ? userId : null);
  // the pick holds while the life stage is still its own: a life-stage chip, a loaded draft or a template drops it
  const audPick = (audId && savedAudiences.find((a) => a.id === audId && a.lifeStage === audience)) || null;
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
    // Leo only (edit-score): the score line it fixes and the score before
    fix?: { id: FactorId; from: number };
  } | null>(null);
  const [undoText, setUndoText] = useState<string | null>(null);
  // What the Undo line says happened: a rewrite, a clean or an insert.
  const [undoNote, setUndoNote] = useState("Rewritten.");
  // Leo only (brand-voice-memory): a rewrite kept on 3 drafts in 14 days, offered as a standing note under the draft.
  const [rewriteHabit, setRewriteHabit] = useState<LoggedRewrite | null>(null);
  useEffect(() => {
    setRewriteHabit(leo && userId ? rewriteNudge(userId) : null);
  }, [leo, userId]);
  // The editor, and the text its cursor was placed in (by a tap, typing or an insert): Insert puts text at the
  // cursor while the post is still that text, else where its kind goes, so a rewrite, Undo or a new post resets it.
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const caretIn = useRef<string | null>(null);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  // Links taken out of a LinkedIn draft, to paste as its first comment.
  const [firstComment, setFirstComment] = useState<string | null>(null);
  // A short video's storyboard, the draft one is being made for, and why the last one failed.
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [storyboardFor, setStoryboardFor] = useState<string | null>(null);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [boardStages, setBoardStages] = useState<Record<string, ProductionStage>>({});
  // A short video's titles being written (Leo only): the draft they are for, and why the last run failed.
  const [titlesFor, setTitlesFor] = useState<string | null>(null);
  const [titlesError, setTitlesError] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  draftIdRef.current = currentDraftId;
  // The address names the post being written, so a reload or a copied link reopens it (docs/deep-links.md).
  useEffect(() => {
    if (currentDraftId && searchParams.get("draft") !== currentDraftId)
      setSearchParams((prev) => withParam(prev, "draft", currentDraftId), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDraftId]);
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
    setTitlesError(null);
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
  const [fixText, setFixText] = useState("");
  useEffect(() => {
    const off = onImageJob(setImgJob);
    return () => {
      off();
    };
  }, []);
  // a picture whose make a reload cut off is picked up again at no cost
  useEffect(() => {
    if (userId) resumeImage(userId);
  }, [userId]);

  // ?panel=shortcuts (the keyboard shortcuts dialog), post (Post it for me), thread (Leo's Make it a thread,
  // ThreadPanel.tsx) or insert (Leo's Insert panel, InsertPanel.tsx); opening pushes, so Back closes it.
  const [panel, openPanel] = useUrlItem("panel");
  // ?view=prompter: the teleprompter over a short video draft (Leo only); opening pushes, so Back closes it.
  const [view, openView, closeView] = useUrlItem("view");
  // ?hooks=proven: the hook card on "Proven in your niche" (Leo only); formulas is the default and left out.
  const [hookTab, setHookTab] = useUrlState("hooks", "formulas", { allowed: HOOK_TABS });
  const proven = Boolean(leo) && hookTab === "proven" && PROVEN_OPEN;
  // ?compare=original|more: a remixed post's compare tab on phones (RemixCompare reads the same param)
  const [compareTab, setCompareTab] = useUrlState("compare", "version", { allowed: COMPARE_TABS });
  const showShortcuts = panel === "shortcuts";

  // Guided wizard: which of the 4 brief steps is open, and whether the brief
  // editor is expanded. Once a draft exists the brief collapses to a summary so
  // the screen stays focused on the output.
  // ?step=topic|funnel|idea|format (docs/deep-links.md): the link's step wins, then the tab's unfinished brief.
  const [stepParam, setStepParam] = useUrlState("step", "topic", { allowed: WRITE_STEPS });
  // the schedule steps (panel=post) own ?step= and ?network= while open: Write keeps the step it had underneath
  const writeStep = useRef(stepParam);
  if (panel !== "post") writeStep.current = stepParam;
  const wizardStep = WRITE_STEPS.indexOf(panel === "post" ? writeStep.current : stepParam);
  // closing gives ?step= back to Write in the same write, so the two never fight over it
  const closePanel = useCallback(
    () =>
      setSearchParams((prev) => {
        const p = withParam(prev, "panel", null);
        if (panel === "hooks") p.delete("formula");
        if (panel !== "post") return p;
        p.delete("network");
        return withParam(p, "step", writeStep.current, "topic");
      }, { replace: true }),
    [panel, setSearchParams],
  );
  const setWizardStep = (next: number | ((s: number) => number)) =>
    setStepParam(WRITE_STEPS[Math.min(LAST_STEP, Math.max(0, typeof next === "function" ? next(wizardStep) : next))]);
  const [briefOpen, setBriefOpen] = useState<boolean>(true);
  // Read once at mount: the prefill effects strip their params from the URL
  // before the async user lookup below resolves.
  const [arrivedWithBrief] = useState(() =>
    ["draft", "platform", "format", "vibe", "pillar", "detail", "funnel", "idea", "ctx", "source"].some(
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
            if (typeof brief.aud === "string") setAudId(brief.aud);
            if (typeof brief.label === "string") setLabelId(brief.label);
            setSinglish(brief.singlish === true);
            if (FUNNEL_STAGES.some((f) => f.id === brief.funnelStage)) setFunnelStage(brief.funnelStage);
            if (IDEA_SOURCES.some((i) => i.value === brief.ideaSource)) setIdeaSource(brief.ideaSource);
            if (typeof brief.ideaContext === "string") setIdeaContext(brief.ideaContext);
            if (PLATFORMS.some((p) => p.value === brief.platform)) setPlatform(brief.platform);
            if (FORMATS.some((f) => f.value === brief.format)) setFormat(brief.format);
            if (isReelLength(brief.reelSeconds)) setReelSeconds(brief.reelSeconds);
            if (CTAS.some((c) => c.value === brief.ctaType)) setCtaType(brief.ctaType);
            // a lang the link carried wins over the one this tab's brief had
            if (brief.postLang === null || asPostLang(brief.postLang)) setPostLang((cur) => (cur === undefined ? brief.postLang : cur));
            if (Array.isArray(brief.disclosure)) {
              setDisclosure(brief.disclosure.filter((d: string) => d in DISCLOSURES));
            }
            if (typeof brief.source?.key === "string" && typeof brief.source?.kind === "string") setRemixSource(brief.source);
            if (typeof brief.wizardStep === "number" && !new URLSearchParams(window.location.search).has("step")) {
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
  // Leo only (brand-voice-memory): a summary with no posts behind it, such as a brand read from its website, still writes.
  useEffect(() => {
    if (leo && userId && !voiceProfileUsable) setVoiceSummary(voiceSummaryOf(loadVoiceProfile(userId)) || null);
  }, [leo, userId, voiceProfileUsable]);

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
    // the address follows the post being written (below): that post is already in the editor
    if (!draftId || !userId || draftId === draftIdRef.current) return;
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
    // a version tab or a finished translation (Leo only) opens with its own toast, or none, and no scroll
    const note = openNote.current;
    openNote.current = undefined;
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
      // every post opens with its own hook (or none), so a save never writes the last post's hook onto it
      setChosenHook(entry.hook || null);
    }
    setDraft(entry.draft);
    clearDraftExtras();
    setFirstComment(entry.firstComment ?? null);
    setStoryboard(entry.storyboard ?? null);
    const making = storyboardRun(entry.id);
    if (making) void followStoryboard(entry.id, making);
    const titling = titlesRun(entry.id);
    if (titling) void followTitles(entry.id, titling);
    // A written post opens on its draft, not on step 1 of a brief it already has.
    if (entry.draft.trim()) setBriefOpen(false);
    setCurrentDraftId(entry.id);
    preserveIdRef.current =
      entry.status === "scheduled" || entry.status === "posted"
        ? entry.id
        : null;
    setVibeSourceId(entry.vibeSourceId ?? null);
    setRemixSource(entry.source ?? null);
    setDisclosure((entry.disclosure ?? []).filter((d): d is DisclosureId => d in DISCLOSURES));
    if (note !== undefined) {
      if (note) toast(note);
      return;
    }
    toast({
      title: isBareIdea ? "Idea loaded" : "Draft restored",
      description: isBareIdea
        ? "Your board idea is the topic. Pick a format and generate."
        : "Form repopulated. Edit and re-roll, or copy as-is.",
    });
    // a compare= link scrolls to the compare strip instead, and Leo's #score to the score panel
    if (!searchParams.has("compare") && !(leo && window.location.hash === "#score"))
      setTimeout(() => {
        formAnchorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, searchParams.get("draft")]);

  // The assistant's "open it in Write and change it" (?draft=<id>&ask=<words>): the
  // rewrite starts once that draft is in the editor and is offered like any other,
  // so Use this, Discard and Undo work as they do for the one-tap rewrites.
  const [pendingAsk, setPendingAsk] = useState<{ id: string; ask: string } | null>(null);
  useEffect(() => {
    const ask = searchParams.get("ask")?.trim().slice(0, MAX_ASK);
    const id = searchParams.get("draft");
    if (!searchParams.has("ask")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("ask");
    setSearchParams(next, { replace: true });
    if (ask && id) setPendingAsk({ id, ask });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("ask")]);
  useEffect(() => {
    if (!pendingAsk || currentDraftId !== pendingAsk.id || !draft.trim()) return;
    setPendingAsk(null);
    void handleRewrite("ask", undefined, pendingAsk.ask);
    setTimeout(() => document.getElementById("rewrite-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk, currentDraftId, draft]);

  // Prefill from a Plan deep-link: /generate?pillar=&detail=&audience=&format=
  // &platform=&cta=&funnel=&idea=&ctx=&ref=&formula=  (runs once, then strips params).
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const filled =
      searchParams.has("pillar") ||
      searchParams.has("detail") ||
      searchParams.has("funnel") ||
      searchParams.has("idea") ||
      searchParams.has("ctx");
    if (!filled && !["source", "lang", "aud", "label"].some((k) => searchParams.has(k))) return;
    prefillAppliedRef.current = true;

    const pillarParam = searchParams.get("pillar");
    if (pillarParam && PILLARS.some((p) => p.value === pillarParam)) {
      setPillar(pillarParam as Pillar);
    }
    const detailParam = searchParams.get("detail");
    if (detailParam) setPillarDetail(detailParam);

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
    // resolved below once the session is read: other sign-ins ignore it
    const sourceParam = searchParams.get("source");
    if (sourceParam) setPendingSourceKey(sourceParam.slice(0, 300));
    // only Leo's sessions read it (makeLang below)
    const langParam = asPostLang(searchParams.get("lang"));
    if (langParam) setPostLang(langParam);
    // both resolved below once the session is read: other sign-ins ignore them
    const audParam = searchParams.get("aud");
    if (audParam) setPendingAud(audParam.slice(0, 60));
    const labelParam = searchParams.get("label");
    if (labelParam) setLabelId(labelParam.slice(0, 60));

    const next = new URLSearchParams(searchParams);
    ["pillar", "detail", "audience", "format", "platform", "cta", "funnel", "idea", "ctx", "ref", "formula", "source", "lang", "aud", "label"].forEach(
      (k) => next.delete(k),
    );
    // Every step is filled in: open the one with Generate (in this same write, or the strip would undo it). The
    // step chips show the rest as done and stay one tap away.
    if (detailParam && !next.has("step")) next.set("step", WRITE_STEPS[LAST_STEP]);
    setSearchParams(next, { replace: true });

    // links come from the plan, Mentions, Your market, feeds and remixes, so the toast names none of them; a
    // link with only source= fills in nothing
    if (filled)
      toast({
        title: "Filled in for you",
        // only a link with a topic opens on the last step; the rest open where the person carries on
        description: detailParam ? "Every step is set. Check what it's about, then generate." : "Check what's filled in, then carry on.",
      });
    setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?source=<key> becomes the chip, from data on this device (resolveSource.ts, loaded only for Leo). A key that
  // doesn't resolve opens Write as it opens today.
  useEffect(() => {
    if (!pendingSourceKey || leo === undefined || !userId) return;
    const key = pendingSourceKey;
    setPendingSourceKey(null);
    if (!leo) return;
    void import("@/lib/resolveSource")
      .then(({ resolveSource }) => setRemixSource(resolveSource(key, userId)))
      .catch(() => {});
  }, [pendingSourceKey, leo, userId]);

  // ?aud=<id> picks that saved audience and its life stage (it wins over ?audience=); an unknown or removed id leaves
  // the life stages as they are. Leo's sessions only.
  useEffect(() => {
    if (!pendingAud || leo === undefined || !userId) return;
    const id = pendingAud;
    setPendingAud(null);
    if (!leo) return;
    const { aud } = audienceFromParams(new URLSearchParams({ aud: id }), loadAudiences(userId));
    if (!aud) return;
    setAudId(aud.id);
    setAudience(aud.lifeStage);
  }, [pendingAud, leo, userId]);

  // The chip's x and the credit box change the saved post and its platform versions too, once there are any.
  const changeSource = (next: RemixSource | null) => {
    setRemixSource(next);
    remixSourceRef.current = next;
    if (!userId) return;
    for (const id of [currentDraftId, ...versions.map((v) => v.draftId)]) {
      const e = id ? getDraftById(userId, id) : null;
      if (e) upsertDraft(userId, { ...e, source: next ?? undefined });
    }
  };
  // The x, with Undo: a source that has rotated out of its drop can't be remixed again from its card.
  const removeSource = () => {
    const prev = remixSource;
    changeSource(null);
    toast({
      title: "Source removed",
      action: (
        <ToastAction altText="Undo" onClick={() => changeSource(prev)}>
          Undo
        </ToastAction>
      ),
    });
  };
  // An earlier remix of the same source in the last 30 days, while this one is not saved yet.
  const repeat = useMemo(() => {
    const r = userId ? earlierRemix(userId, remixSource) : null;
    return r && r.draftId !== currentDraftId && repeatHidden !== remixSource?.key ? r : null;
  }, [userId, remixSource, currentDraftId, repeatHidden]);

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

  // The open post's language (Leo only, edit-translate): a Chinese version counts characters, not words.
  const draftLang = useMemo(() => (leo && userId && currentDraftId ? langOf(getDraftById(userId, currentDraftId) ?? {}) : null), [leo, userId, currentDraftId]);
  // Counter readout for the draft. Only the caption counts against platform limits.
  const counters: CounterReadout = useMemo(
    () => readout(svSplit ? svSplit.caption : draft, platform, draftLang),
    [draft, platform, svSplit, draftLang],
  );

  // What a copy puts on the clipboard: plain text, the brand kit sign-off and
  // any disclosure line.
  const brandKit = useMemo(() => loadBrand(userId), [userId]);
  const brandSignOff = brandKit?.signOff?.trim() ?? "";
  // Leo only: the Language row's pick, else the brand's post language; English (null) writes as today
  const makeLang = leo ? (postLang !== undefined ? postLang : asPostLang(brandKit?.postLang)) : null;
  // links that aren't the kit's offers are flagged under the post
  const brandLinks = useMemo(() => allowedLinks(brandKit, loadSocialAccounts(userId)), [brandKit, userId]);
  // ...and so are the words the kit says never to use
  const brandAvoid = useMemo(() => avoidList(brandKit), [brandKit]);
  // ...and, when the brand kit asks for it, UTM tracking on every link
  const forPosting = (text: string, plat: string = platform) => {
    const out = withCredit(withDisclosure(withSignOff(toPlainText(text), brandSignOff), disclosure), remixSource ?? undefined);
    return brandKit?.tagLinks ? tagLinks(out, { source: plat, campaign: chosenHook || pillarDetail || "post" }) : out;
  };
  const limits = checkLimits(forPosting(svSplit ? svSplit.caption : draft), platform, brandLinks, brandAvoid);
  // A version whose posted text runs past its platform's limit gets a red dot on its tab.
  const overLimit = (text: string, plat: string) =>
    plat in MAX_CHARS &&
    forPosting(format === "short-video" ? splitScriptCaption(text).caption : text, plat).length > MAX_CHARS[plat as PlatformId];
  const draftBlanks = useMemo(() => findBlanks(draft), [draft]);
  // One of the last posts on this network that the draft mostly repeats (read fresh: Write saves as you type).
  const repeats = useMemo(
    () => (userId && draft.trim() ? nearDuplicate(draft, platform, loadDrafts(userId), currentDraftId) : null),
    [userId, draft, platform, currentDraftId],
  );
  // tracked the same way the post's own links would have been
  const commentText = firstComment && brandKit?.tagLinks
    ? tagLinks(firstComment, { source: platform, campaign: chosenHook || pillarDetail || "post" })
    : (firstComment ?? "");

  // Live craft check on the current draft (reuses the Coach engine). It and the checks drawn with it read English
  // only, so a Chinese, Malay or Tamil version has none (TranslateBar points to the English post's).
  const craftCheck = useMemo(
    () =>
      draft.trim().length > 30 && !draftLang
        ? analyzePosts([{ text: draft, platform: platform as PlatformId }])
        : null,
    [draft, platform, draftLang],
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

  // Predicted engagement: Jev's checks on this exact text, remembered on this device per text. Leo's (edit-score) are
  // asked as the draft's own format and saved on the draft too, so his other devices and My posts read them.
  const scoreFormat: ScoreFormat = format === "carousel" || format === "short-video" ? format : "text-post";
  const [scores, setScores] = useState<ReturnType<typeof loadScores>>({});
  useEffect(() => setScores(loadScores(userId)), [userId]);
  const scoreKeyNow = useMemo(() => textKey(platform, draft), [platform, draft]);
  const savedScore = scores[scoreKeyNow] || !leo || !userId || !currentDraftId ? null : currentScore({ platform, score: getDraftById(userId, currentDraftId)?.score }, draft);
  const postScore: PostScore | null = scores[scoreKeyNow] ?? (savedScore && { score: savedScore.v, down: savedScore.down });
  const [scoring, setScoring] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<{ key: string; message: string } | null>(null);
  // /generate?draft=<id>#score (Leo only): lands on the score panel once the draft has drawn; it never scores on load
  useScrollToHash(Boolean(leo && userId && currentDraftId && draft.trim()));
  // Leo only: the score before a fix that was used, for "Was a, now b" while the text is the fixed one
  const [fixedFrom, setFixedFrom] = useState<{ key: string; from: number } | null>(null);
  /** `text`: a fix just used, scored before the editor has drawn it. */
  const runScore = async (text = draft) => {
    if (!userId || scoring) return;
    const key = textKey(platform, text);
    // typed edits are saved first, so the saved draft holds the text scored
    if (leo) flushSave.current();
    setScoring(key);
    setScoreError(null);
    try {
      const score = await scorePost(text, platform, leo ? scoreFormat : undefined);
      setScores(saveScore(userId, key, score));
      const entry = leo && currentDraftId ? getDraftById(userId, currentDraftId) : null;
      if (entry && textKey(entry.platform, entry.draft) === key)
        upsertDraft(userId, { ...entry, score: { v: score.score, down: score.down, key, at: new Date().toISOString() } });
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
            source: remixSource ?? undefined,
            ...(leo && postLang !== undefined ? { postLang } : {}),
            ...(leo && audPick ? { aud: audPick.id } : {}),
            ...(leo && labelId ? { label: labelId } : {}),
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
    remixSource,
    leo,
    postLang,
    audPick,
    labelId,
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
    const rules = brandRulesLine(brandKit, platform);
    if (rules) ctxParts.push(rules);
    // Leo only (brand-audiences): the picked audience in words, since the post writer knows only the five life stages
    if (audPick) ctxParts.push(audienceLine(audPick, userId ? speakerFor(userId) : undefined));
    // Leo only (brand-voice-memory): his facts and learnings after the brand rules; the voice summary has its own field
    const memory = leo && userId ? memoryLine(userId, "posts") : "";
    if (memory) ctxParts.push(memory);

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

  const rowsSetter = (target: StreamTarget) => (target === "hooks" ? setHookOptions : target === "variants" ? setVariants : setNewHookRows);

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
    target: StreamTarget,
    formulas?: string[],
  ) => {
    const runId = ++streamRunRef.current;
    const setRows = rowsSetter(target);
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
    target: StreamTarget,
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
    rowsSetter(target)(initial);

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
    target: StreamTarget,
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
        const setter = rowsSetter(target);
        setter((prev) =>
          prev.map((v) =>
            v.index === idx ? { ...v, text: v.text + text } : v,
          ),
        );
      } else if (evt.type === "variant_complete") {
        const idx = firstRow + (evt.variantIndex as number);
        // Dashes, and emoji or hashtags over the brand kit's policy or the platform's cap, go before the text is shown or saved.
        const finalText = applyBrandRules(stripDashes(evt.text as string), brandKit, platform);
        // Leo only: a hook with a blank in it is left out rather than offered (live-p7a D9)
        const blank = !!leo && (target === "hooks" || target === "newHooks") && hookBlank(finalText);
        const setter = rowsSetter(target);
        setter((prev) =>
          prev.map((v) =>
            v.index === idx ? (blank ? { ...v, text: "", halted: "blank" as const } : { ...v, text: finalText, complete: true }) : v,
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
        const set = planFormulaRef.current ? hookFormulasFrom(planFormulaRef.current) : proven ? PROVEN.map((p) => p.formula) : hookFormulaSet(hookSetRef.current++);
        planFormulaRef.current = null;
        await writeHooks(set, base);
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

  // One call per hook, each with its own formula; Jev's Recommended pick follows the set.
  const writeHooks = async (set: HookFormula[], base: BasePayload) => {
    setHookPick(null);
    pickPendingRef.current = true;
    await runStream(
      // Leo only: each hook in the brand's speaker with no blank to fill (live-p7a D9)
      set.map((f) => ({ ...base, mode: "hooks" as const, n: 1, ...(leo && userId ? hookFields(f, base, speakerFor(userId)) : hookFormulaFields(f, base)) })),
      "hooks",
      set.map((f) => f.id),
    );
  };

  // The hook card's switch (Leo only) writes the hooks again from the other set; the drafts below stay.
  const switchHooks = (tab: (typeof HOOK_TABS)[number]) => {
    if (tab === (proven ? "proven" : "formulas") || isStreaming || !validateForm()) return;
    setHookTab(tab);
    const set = tab === "proven" ? PROVEN.map((p) => p.formula) : hookFormulaSet(hookSetRef.current++);
    writeHooks(set, buildBasePayload()).catch((err) => {
      if ((err as Error).name === "AbortError") return;
      toast({ title: "Couldn't write hooks", description: err instanceof Error ? err.message : "Try again in a moment.", variant: "destructive" });
    });
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
            setHashtags(data.hashtags.slice(0, HASHTAG_CAP[platform]));
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
    // A new pick passes null: the comment state it would read is the last draft's. Leo's hooks panel passes the formula
    // of a hook that is not in the brief's rows; Keep all 3 saves into a set without opening each draft.
    (text: string, hookText: string, comment: string | null = firstComment, opts: { id?: string; formula?: string; set?: DraftEntry["set"]; open?: false } = {}) => {
      if (!userId || !text.trim()) return;
      const id = opts.id ?? currentDraftId ?? newDraftId();
      // Preserve scheduling/status/created-at when updating an existing entry
      // (e.g. writing a slot that was scheduled from the Plan).
      const existing = getDraftById(userId, id);
      // Write always sets the key (no source clears it); dated on the first save and kept after that.
      const source = remixSource && !remixSource.remixedAt ? { ...remixSource, remixedAt: new Date().toISOString() } : (remixSource ?? undefined);
      if (source && source !== remixSource) setRemixSource(source);
      // Leo only: a new draft from a labelled plan slot wears its label (one already saved keeps its own)
      const labels = leo ? labelsForNewDraft(labelId, loadLabels(userId), existing) : undefined;
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
        firstComment: comment?.trim() ? comment : undefined,
        hookFormula: opts.formula ?? formulaOfHook(hookText, hookOptions)?.id,
        source,
        ...(labels ? { labels } : {}),
        ...(opts.set ? { set: opts.set } : {}),
      };
      upsertDraft(userId, entry);
      if (opts.open !== false) setCurrentDraftId(id);
      return id;
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
      remixSource,
      leo,
      labelId,
    ],
  );

  const handlePickVariant = (idx: number) => {
    const v = variants.find((x) => x.index === idx);
    if (!v) return;
    setSelectedVariantIndex(idx);
    clearDraftExtras();
    setDraft(v.text);
    // a phone left on the Original or More tab would hide the post just picked
    if (compareTab !== "version") setCompareTab("version");
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
    // Leo only: a variation Keep all 3 saved opens its own draft rather than forking another
    const kept = preserveIdRef.current ? undefined : keptNow?.ids[idx];
    const id = persistDraftEntry(v.text, chosenHook ?? "", null, kept ? { id: kept } : {});
    // written in another language (Leo only): its version is made straight after, under the post
    if (makeLang && id) setAutoTranslate({ id, lang: makeLang });
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
    if (reviews.ruleOn === false) return null;
    if (!id && reviews.ruleOn) return "Save the post and submit it for review first.";
    return reviews.blockReason({ id: id ?? "", draft: text } as DraftEntry);
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
    const labels = leo ? labelsForNewDraft(labelId, loadLabels(userId), existing) : undefined;
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
      source: remixSourceRef.current
        ? { ...remixSourceRef.current, remixedAt: remixSourceRef.current.remixedAt || new Date().toISOString() }
        : undefined,
      status: existing?.status,
      scheduledFor: existing?.scheduledFor,
      postedAt: existing?.postedAt,
      repeat: existing?.repeat,
      ...(labels ? { labels } : {}),
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
            const text = applyBrandRules(stripDashes(raw), brandKit, target).trim();
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

  const handleRewrite = async (id: RewriteId, lines?: string[], ask?: string, fix?: { id: FactorId; from: number }) => {
    const source = draft.trim();
    if (!source) return;
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    rewriteAbortRef.current = controller;
    setRewrite({ id, text: "", status: "streaming", fix });
    const mine = () => rewriteAbortRef.current === controller;
    const fail = (message: string) => {
      if (!mine()) return;
      setRewrite(null);
      toast({ title: "Couldn't rewrite the draft", description: message, variant: "destructive" });
    };
    try {
      await streamOnePost(
        { ...buildBasePayload(), ...rewriteFields(source, id, lines, ask) },
        {
          onToken: (text) => mine() && setRewrite({ id, text, status: "streaming", fix }),
          onComplete: (raw) => {
            const text = applyBrandRules(stripDashes(raw), brandKit, platform).trim();
            if (!text) return fail("The reply came back empty. Try again.");
            if (mine()) setRewrite({ id, text, status: "done", fix });
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

  // "Fix this" on a score line (Leo only): the factor's ask goes through the rewrite panel, so nothing changes until Use this.
  const fixFactor = (id: FactorId) => {
    if (!postScore) return;
    void handleRewrite("ask", undefined, FIX_ASK[id], { id, from: postScore.score });
    setTimeout(() => document.getElementById("rewrite-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };

  // ---- Versions of one post (remix-variations, Leo only) ----

  // Keep all 3: every written variation as its own draft in one set; the one already picked keeps its draft.
  const keepAllVariants = () => {
    if (!userId || isStreaming) return;
    const rows = variants.filter((v) => v.complete && v.text.trim());
    if (!rows.length) return;
    const set = { id: newSetId(), kind: "versions" as const, ...(remixSource ? { from: remixSource.key } : {}) };
    const ids: Record<number, string> = {};
    for (const v of rows) {
      const open = v.index === selectedVariantIndex && currentDraftId ? currentDraftId : null;
      // the picked one is saved as it stands in the editor, typed edits and its first comment included
      ids[v.index] = persistDraftEntry(open ? draft : v.text, chosenHook ?? "", open ? firstComment : null, { id: open ?? newDraftId(), set, open: false })!;
    }
    setKeptVariants({ key: variants.map((v) => v.text).join("\n"), set: set.id, ids });
    toast({
      title: `${rows.length} ${rows.length === 1 ? "version" : "versions"} saved to My posts`,
      action: (
        <ToastAction altText="Open" onClick={() => navigate(links.drafts({ set: set.id }))}>
          Open
        </ToastAction>
      ),
    });
  };

  // Try new hooks: the requests Pick a hook sends (one formula each) with the post's body as the idea, into the panel's
  // own rows. The formulas are the 3 after the post's own (its own first when ?formula= names it: Make 3 more like the
  // winner), else the next set; Try again keeps the last ones.
  const tryNewHooks = async (again?: string[]) => {
    if (!userId || !currentDraftId || isStreaming || !draft.trim()) return;
    if (panel !== "hooks") openPanel("hooks");
    const set = again
      ? again.flatMap((id) => hookFormula(id) ?? [])
      : draftFormula
        ? otherFormulas(draftFormula.id, searchParams.get("formula") === draftFormula.id).flatMap((id) => hookFormula(id) ?? [])
        : hookFormulaSet(hookSetRef.current++);
    setNewHookRows([]);
    setHookPanel({ draftId: currentDraftId, formulas: set.map((f) => f.id), running: true, failed: false, pick: null, saved: {} });
    newPickPendingRef.current = true;
    const base = buildBasePayload();
    const withBody = { ...base, ideaContext: [newHookContext(splitHook(draft, draft.split("\n")[0])), base.ideaContext].filter(Boolean).join("\n\n") };
    let failed = false;
    try {
      await runStream(set.map((f) => ({ ...withBody, mode: "hooks" as const, n: 1, ...hookFields(f, withBody, speakerFor(userId)) })), "newHooks", set.map((f) => f.id));
    } catch (err) {
      failed = true;
      // a lapsed session says so the way Write's own writing does
      if (/\(401\)/.test((err as Error).message)) toast({ title: "Couldn't write hooks", description: (err as Error).message, variant: "destructive" });
    }
    setHookPanel((p) => (p ? { ...p, running: false, failed } : p));
  };

  // Jev's Recommended once all three are written; over its cap there is just no tag
  useEffect(() => {
    if (!newPickPendingRef.current || !hookPanel || hookPanel.running) return;
    newPickPendingRef.current = false;
    const hooks = newHookRows.map((h) => h.text.trim());
    if (hooks.length < 2 || newHookRows.some((h) => !h.complete || !h.text.trim())) return;
    const aud = AUDIENCES.find((a) => a.value === audience);
    void pickHook(hooks, aud ? `${aud.label}: ${aud.sub}` : "", pillarDetail.trim(), platformLabel(platform)).then((index) => {
      if (index !== null) setHookPanel((p) => (p ? { ...p, pick: { key: hooks.join("\n"), index } } : p));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookPanel?.running]);

  // Use this one: the post's first line becomes the hook, its formula is saved with it, and Undo puts the old one back.
  const pickNewHook = (row: VariantState) => {
    const hook = row.text.trim();
    if (!userId || !hook) return;
    const before = { text: draft, hook: chosenHook, formula: savedEntry?.hookFormula };
    const text = withOpening(draft, hook);
    setDraft(text);
    setChosenHook(hook);
    setUndoText(null);
    caretIn.current = null;
    persistDraftEntry(text, hook, firstComment, { formula: row.formula });
    toast({
      title: "Hook changed",
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            setDraft(before.text);
            setChosenHook(before.hook);
            caretIn.current = null;
            persistDraftEntry(before.text, before.hook ?? "", firstComment, { formula: before.formula });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  // Save as a version: the new hook on the same body as a new draft in the post's set (a new set when it has none).
  const saveHookVersion = (row: VariantState) => {
    if (!userId || !currentDraftId || !row.text.trim()) return;
    flushSave.current();
    const parent = getDraftById(userId, currentDraftId);
    if (!parent) return;
    const set = parent.set ?? { id: newSetId(), kind: "versions" as const, from: parent.id };
    if (!parent.set) upsertDraft(userId, { ...parent, set });
    const v = versionOf(parent, withOpening(parent.draft, row.text), row.text.trim(), row.formula, set);
    upsertDraft(userId, v);
    setHookPanel((p) => (p ? { ...p, saved: { ...p.saved, [row.index]: v.id } } : p));
    toast({ title: "Saved as a version" });
  };

  // Save all as a hook test: this post and its new hooks as one set; versions already saved move into it.
  const saveHookTest = () => {
    if (!userId || !currentDraftId || !hookPanel) return;
    flushSave.current();
    const parent = getDraftById(userId, currentDraftId);
    const rows = newHookRows.filter((r) => r.complete && r.text.trim());
    if (!parent || !rows.length) return;
    const set = { id: newSetId(), kind: "hook-test" as const, from: parent.id };
    upsertDraft(userId, { ...parent, set });
    const saved: Record<number, string> = {};
    for (const r of rows) {
      const had = hookPanel.saved[r.index] ? getDraftById(userId, hookPanel.saved[r.index]) : null;
      const v = had ? { ...had, set } : versionOf(parent, withOpening(parent.draft, r.text), r.text.trim(), r.formula, set);
      upsertDraft(userId, v);
      saved[r.index] = v.id;
    }
    setHookPanel((p) => (p ? { ...p, saved, testSet: set.id } : p));
    toast({
      title: `Hook test saved: ${rows.length + 1} versions`,
      action: (
        <ToastAction altText="Open" onClick={() => navigate(links.drafts({ set: set.id }))}>
          Open
        </ToastAction>
      ),
    });
  };

  // The draft as it stands (typed edits included) is what Undo brings back.
  const acceptRewrite = () => {
    if (!rewrite || rewrite.status !== "done") return;
    setUndoText(draft);
    setUndoNote("Rewritten.");
    setDraft(rewrite.text);
    persistDraftEntry(rewrite.text, chosenHook ?? "");
    // Leo only (edit-score): a fix that is used is scored once by itself, so the panel can say how the score moved
    if (rewrite.fix) {
      setFixedFrom({ key: textKey(platform, rewrite.text), from: rewrite.fix.from });
      if (!scores[textKey(platform, rewrite.text)]) void runScore(rewrite.text);
    }
    // Leo only: only the five one-tap rewrites are counted (rewriteLog.ts), never flagged lines or an asked change
    if (leo && userId) {
      logRewrite(userId, rewrite.id, currentDraftId);
      setRewriteHabit(rewriteNudge(userId));
    }
    setRewrite(null);
  };

  // The nudge's answers: Remember saves the habit as a learning for posts (Undo in the toast), No thanks hides it 30 days.
  const rememberHabit = () => {
    if (!userId || !rewriteHabit) return;
    const saved = rememberRewrite(userId, rewriteHabit);
    if ("error" in saved) return void toast({ title: saved.error, variant: "destructive" });
    setRewriteHabit(null);
    toast({
      title: `Learned: ${saved.item.text}`,
      action: (
        <ToastAction altText="Undo" onClick={() => undoLearning(userId, saved.item.id)}>
          Undo
        </ToastAction>
      ),
    });
  };
  const dismissHabit = () => {
    if (!userId || !rewriteHabit) return;
    dismissRewriteNudge(userId, rewriteHabit);
    setRewriteHabit(null);
  };

  // Hashtags past the platform's cap, the first ones kept. The sign-off's own count first, so the posted text fits.
  const tagCap = HASHTAG_CAP[platform];
  const tagsToKeep = tagCap === undefined ? 0 : Math.max(0, tagCap - (limits.hashtags - countHashtags(svSplit ? svSplit.caption : draft)));
  const tagsOver = tagCap !== undefined && limits.hashtags > tagCap;
  const cutHashtags = () => {
    setUndoText(draft);
    setUndoNote(tagsToKeep ? `Kept the first ${tagsToKeep} hashtags.` : "Hashtags taken out.");
    const text = capHashtags(draft, tagsToKeep);
    setDraft(text);
    persistDraftEntry(text, chosenHook ?? "");
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

  // A snippet from the Insert panel goes in with Undo, and the cursor lands after it.
  const insertText = (text: string, caret: number) => {
    setUndoText(draft);
    setUndoNote("Inserted.");
    setDraft(text);
    caretIn.current = text;
    persistDraftEntry(text, chosenHook ?? "");
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(caret, caret);
    });
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

  // Leo only (publish-comments-followups): Instagram's trailing hashtags go under the first comment, with Undo.
  const tagsMovable = Boolean(leo) && platform === "instagram" && moveHashtagsToComment(draft) !== null;
  const moveTagsToComment = () => {
    const moved = moveHashtagsToComment(draft, firstComment ?? "");
    if (!moved) return;
    const before = { text: draft, comment: firstComment };
    setDraft(moved.body);
    setUndoText(null);
    setFirstComment(moved.comment);
    persistDraftEntry(moved.body, chosenHook ?? "", moved.comment);
    toast({
      title: "Hashtags moved to the first comment",
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            setDraft(before.text);
            setFirstComment(before.comment);
            persistDraftEntry(before.text, chosenHook ?? "", before.comment);
          }}
        >
          Undo
        </ToastAction>
      ),
    });
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

  // Typed edits save 800ms after typing stops, on blur, and when the tab is hidden (a phone
  // closing the browser keeps them). A full browser storage throws: that shows "Not saved".
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const pendingSave = useRef<{ draft: boolean; version: string | null }>({ draft: false, version: null });
  const flushSave = useRef(() => {});
  flushSave.current = () => {
    const p = pendingSave.current;
    try {
      if (p.draft) {
        handleDraftBlur();
        p.draft = false;
      }
      const v = p.version ? versions.find((x) => x.draftId === p.version) : null;
      if (v && v.status !== "streaming") {
        saveVersion(v);
        p.version = null;
      }
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  };
  useEffect(() => {
    if (!pendingSave.current.draft && !pendingSave.current.version) return;
    setSaveState("saving");
    const t = setTimeout(() => flushSave.current(), 800);
    return () => clearTimeout(t);
  }, [draft, versions, firstComment]);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushSave.current();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  // Leo only (edit-translate): another language's version, or its English, opens in place once the typing is saved
  const openDraft = (id: string, note: Parameters<typeof toast>[0] | null) => {
    // already open (a toast's link pressed after the tab): nothing loads, so no note may wait for the next post
    if (id === draftIdRef.current) return;
    flushSave.current();
    openNote.current = note;
    navigate(links.generate({ draft: id }));
  };
  // a version asked for once is forgotten when another post opens, so coming back to the English never spends again
  useEffect(() => {
    if (autoTranslate && currentDraftId && currentDraftId !== autoTranslate.id) setAutoTranslate(null);
  }, [currentDraftId, autoTranslate]);

  // Pictures or one video attached in Write: kept on this device, shown in the preview and
  // loaded into Post it for me. Pictures are shrunk to 1080px JPEGs, so size and WebP never block them.
  const [attachedKeys, setAttachedKeys] = useState<string[]>([]);
  const [attachedMedia, setAttachedMedia] = useState<{ media: (PreviewMedia & { key: string })[]; missing: number }>({ media: [], missing: 0 });
  const [attaching, setAttaching] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const attachInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setAttachedKeys(userId && currentDraftId ? (getDraftById(userId, currentDraftId)?.attached ?? []) : []);
  }, [userId, currentDraftId]);
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    void Promise.all(attachedKeys.map((k) => getFile(k).catch(() => undefined))).then((blobs) => {
      if (!live) return;
      const media = blobs.flatMap((b, i) => {
        if (!b) return [];
        const url = URL.createObjectURL(b);
        urls.push(url);
        return [{ key: attachedKeys[i]!, url, video: b.type.startsWith("video/") }];
      });
      setAttachedMedia({ media, missing: blobs.length - media.length });
    });
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [attachedKeys]);
  const attachedVideo = attachedMedia.media.some((m) => m.video);
  const attachFiles = async (picked: File[]) => {
    if (!picked.length || !userId || attaching) return;
    const fail = (description: string) => toast({ title: "Couldn't attach that", description, variant: "destructive" });
    const problem = picked.map((f) => (fileType(f)?.startsWith("image/") ? null : fileProblem(f))).find(Boolean);
    if (problem) return fail(problem);
    const video = attachedVideo || picked.some((f) => fileType(f)?.startsWith("video/"));
    if (video && attachedKeys.length + picked.length > 1) return fail(`Attach one video on its own, or up to ${MAX_PICTURES} pictures.`);
    if (attachedKeys.length + picked.length > MAX_PICTURES) return fail(`Attach up to ${MAX_PICTURES} pictures.`);
    try {
      await attachWith(() =>
        Promise.all(
          picked.map(async (f) => {
            if (fileType(f)?.startsWith("image/")) return (await storePicture(f)).key;
            const key = `cvid-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            await putFile(key, f);
            return key;
          }),
        ),
      );
    } catch (e) {
      fail(e instanceof Error ? e.message : "Try a JPG, PNG or MP4 file.");
    }
  };
  // Saves the draft first (attachments hang off its id), then adds the files `store` kept on the device.
  const attachWith = async (store: () => Promise<string[]>) => {
    if (!userId) return;
    setAttaching(true);
    try {
      const id = persistDraftEntry(draft, chosenHook ?? "");
      if (!id) throw new Error("Write the post first, then attach.");
      const next = [...attachedKeys, ...(await store())];
      setDraftAttached(userId, id, next);
      setAttachedKeys(next);
    } finally {
      setAttaching(false);
    }
  };
  // A free Pexels photo; a throw shows on the photo's tile.
  const attachStock = async (it: { src: string }) => {
    if (attachedVideo || attachedKeys.length >= MAX_PICTURES) throw new Error(`Attach one video on its own, or up to ${MAX_PICTURES} pictures.`);
    await attachWith(async () => [(await storePicture(await downloadStock(it.src))).key]);
  };
  const detach = (key: string) => {
    if (!userId || !currentDraftId) return;
    const next = attachedKeys.filter((k) => k !== key);
    setDraftAttached(userId, currentDraftId, next);
    setAttachedKeys(next);
    // a duplicate of this post can still be using the file
    if (!loadDrafts(userId).some((d) => d.attached?.includes(key))) void deleteFile(key).catch(() => {});
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
          closePanel();
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
  const postOpen = panel === "post";
  // /generate?day=YYYY-MM-DD comes from a calendar day: the suggested time lands on that day. Read once,
  // so later URL rewrites on this page can't drop it; a past or malformed day is ignored.
  const [pickedDay] = useState(() => {
    const d = searchParams.get("day");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= localDateKey() ? d : null;
  });
  // &time=HH:MM comes with an open posting slot: that exact time, not the weekday's best one.
  const [pickedTime] = useState(() => {
    const t = searchParams.get("time");
    return t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
  });
  const suggestedTime = useMemo(() => {
    if (!userId || !currentDraftId) return null;
    if (pickedDay) {
      const t = pickedTime
        ? { time: pickedTime, why: "slot" as const }
        : postingTimeOn(getTrackedPosts(userId), platform, (keyToDate(pickedDay).getDay() + 6) % 7, slotTimesFor(brandKit, platform));
      const at = `${pickedDay}T${t.time}`;
      // today with that time already gone: the day alone, never a time in the past
      return { at: new Date(at) < new Date() ? pickedDay : at, why: t.why };
    }
    // with the brand kit and each post's network, so Leo's per-network times name the slot the calendar names
    const taken = loadDrafts(userId).filter((d) => d.status === "scheduled" && d.scheduledFor).map((d) => ({ platform: d.platform, scheduledFor: d.scheduledFor }));
    return suggestPostingTime(getTrackedPosts(userId), platform, taken, new Date(), brandKit ?? undefined);
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
  // The original beside a remixed post (north-star gate); on phones a compare tab other than yours hides the draft.
  // While variations are written there is no draft text yet, so the strip stays on the source being written from.
  const compareDraft = !leo
    ? null
    : draft
      ? savedEntry?.source
        ? savedEntry
        : null
      : remixSource && (variants.length > 0 || hookOptions.length > 0)
        ? { source: remixSource }
        : null;
  const compareOn = Boolean(compareDraft);
  const draftHidden = compareOn && compareTab !== "version";
  // The formula the draft's hook was written with: from its hook rows, else as saved.
  const draftFormula = (chosenHook ? formulaOfHook(chosenHook, hookOptions) : undefined) ?? hookFormula(savedEntry?.hookFormula);

  // Storyboard: the spoken script of a short video (the whole draft when it has no caption heading).
  const shortScript = format === "short-video" ? (svSplit?.script ?? draft).trim() : "";
  const scriptWords = shortScript ? spokenWords(shortScript) : 0;
  // too long for everyone; too short for Leo (formats-hooks-scripts), once the script is written
  const scriptWarn = shortScript ? reelTooLong(scriptWords, reelSeconds) ?? (leo && !isStreaming ? reelTooShort(scriptWords, reelSeconds) : null) : null;
  const storyboardStale = Boolean(storyboard && storyboard.script !== shortScript);
  const storyboardBusy = Boolean(currentDraftId && storyboardFor === currentDraftId);
  const titlesBusy = Boolean(currentDraftId && titlesFor === currentDraftId);
  const titles = savedEntry ? titlesOf(savedEntry) : [];
  const cover = savedEntry ? coverOf(savedEntry) : "";
  // the teleprompter's lines (Leo only): the storyboard's when it was made from this script, else the script's
  const prompterText = leo && view === "prompter" && format === "short-video" && shortScript ? prompterLines({ draft, storyboard: storyboard ?? undefined }) : [];
  // Leo's price chips (business-cost-preview): only his sessions read today's uses, so everyone else's stay null
  const imgRunning = imgJob?.state === "working" || imgJob?.state === "saving";
  const usesLeft = useUsesLeft(!leo || storyboardBusy || imgRunning || titlesBusy || !!scoring);
  const storyboardLeft = usesLeft("storyboard");
  const storyboardWhy = reasonText({ left: storyboardLeft, leo: Boolean(leo) });
  const titlesLeft = usesLeft("video-publish");
  const titlesWhy = reasonText({ left: titlesLeft, leo: Boolean(leo) });
  const scoreLeft = usesLeft("post-score");
  const scoreWhy = reasonText({ left: scoreLeft, leo: Boolean(leo) });
  const imageLeft = usesLeft("ai-image");
  const imageWhy = reasonText({ left: imageLeft, leo: Boolean(leo) });
  // a fix spends from the adviser's cap and the across-everyone one, so the smaller of the two is what's left
  const fixMine = usesLeft("ai-image-fix");
  const fixLeft = fixMine === null ? null : Math.min(fixMine, usesLeft("ai-image-fix-global") ?? fixMine);
  const fixWhy = reasonText({ left: fixLeft, leo: Boolean(leo) });
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

  // Titles and a cover line for the script (Leo only); the run saves them on the draft, wherever Leo goes.
  async function followTitles(draftId: string, run: Promise<unknown>) {
    setTitlesFor(draftId);
    setTitlesError(null);
    try {
      await run;
    } catch (e) {
      if (draftIdRef.current === draftId) setTitlesError(e instanceof Error && e.message ? e.message : TITLES_FAILED);
    } finally {
      setTitlesFor((f) => (f === draftId ? null : f));
    }
  }
  const handleTitles = () => {
    if (!userId || !currentDraftId || titlesBusy) return;
    void followTitles(currentDraftId, writeTitles(userId, currentDraftId, shortScript));
  };
  const titleRow = (text: string) => (
    <div key={text} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background py-1 pl-3 pr-1 text-sm">
      <span className="min-w-0 flex-1">{text}</span>
      <Button variant="ghost" size="sm" className="h-11 shrink-0 gap-1.5 sm:h-9" onClick={() => void navigator.clipboard.writeText(text).then(() => toast({ title: "Copied" }))}>
        <Copy className="h-3.5 w-3.5" /> Copy
      </Button>
    </div>
  );

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
    brandAvoid,
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

      {leo && remixSource && (
        <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
              <Shuffle className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 break-words">{sourceChip(remixSource)}</span>
            </p>
            {/* Opens the Remix sheet on this source (north star): the one way in until the browse cards carry the button */}
            <button
              type="button"
              onClick={() => {
                rememberSource(remixSource, leo.id);
                setSearchParams((prev) => withParam(prev, "remix", remixSource.key));
              }}
              className="ml-auto inline-flex h-8 shrink-0 items-center rounded-lg px-2 font-semibold text-primary hover:bg-background [@media(pointer:coarse)]:h-11"
            >
              Remix
            </button>
            <button
              type="button"
              onClick={removeSource}
              aria-label="Remove the source"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {canCredit(remixSource, savedEntry?.remix?.keep) && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-muted-foreground [@media(pointer:coarse)]:min-h-11">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={remixSource.credit === true}
                onChange={(e) => changeSource({ ...remixSource, credit: e.target.checked })}
              />
              Credit them when I copy
            </label>
          )}
          {repeat && (
            <p className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
              You remixed this on {dayMonth(repeat.at)}.
              {/* A new tab keeps this unsaved remix and what was typed into it. shortcut: the installed app stays
                  in its window (on iPhone a new tab opens the signed-out browser), so there the old draft still
                  replaces the brief; stash the brief under a second key if Leo remixes from the home screen. */}
              <Link
                to={links.generate({ draft: repeat.draftId })}
                target={window.matchMedia?.("(display-mode: standalone)").matches ? undefined : "_blank"}
                className="inline-flex items-center py-1 font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
              >
                Open that draft
              </Link>
              <button
                type="button"
                onClick={() => setRepeatHidden(remixSource.key)}
                className="inline-flex items-center py-1 font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
              >
                Remix it again
              </button>
            </p>
          )}
        </div>
      )}

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
                  aria-current={active ? "step" : undefined}
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
            <AudiencePicker
              saved={savedAudiences}
              picked={audPick?.id ?? null}
              onPick={(a) => {
                setAudId(a.id);
                setAudience(a.lifeStage);
              }}
              chip={(on) =>
                `rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-all [@media(pointer:coarse)]:min-h-11 ${
                  on ? "border-primary/60 bg-primary/5 shadow-sm" : "border-border/70 hover:border-primary/40 hover:bg-muted/40"
                }`
              }
            >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => {
                    setAudience(a.value);
                    setAudId(null);
                  }}
                  className={`rounded-lg border p-2 text-left text-xs transition-all ${
                    !audPick && audience === a.value
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
            </AudiencePicker>
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
            <RealQuestions audience={audPick ? audPick.lifeStage : userId ? loadPositioning(userId)?.audience : undefined} onPick={(q) => setIdeaContext((c) => withQuestion(c, q))} />
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
          {/* a link opens Write on this step, so say what the post is about here, not only two steps back */}
          {pillarDetail.trim() && <p className="text-sm text-muted-foreground">About: {pillarDetail.trim()}</p>}
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
          {leo && userId && (
            <Suspense fallback={null}>
              <LanguageRow value={makeLang} onChange={setPostLang} />
            </Suspense>
          )}
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
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all [@media(pointer:coarse)]:min-h-11 ${
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
            onClick={() => openPanel("shortcuts")}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary sm:inline-flex [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
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
          {/* Write's generation is uncapped, so Leo sees the price only */}
          {!isStreaming && <PriceChip price={WRITE_PRICE} left={null} />}
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
                  <div className="flex flex-col items-end gap-0.5">
                    <Button
                      type="button"
                      onClick={() => void handleGenerate()}
                      disabled={checkingIdea}
                      className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95 [@media(pointer:coarse)]:h-11"
                    >
                      <Sparkles className="h-4 w-4" />
                      {generateButtonLabel}
                    </Button>
                    {/* under the button, so the footer still fits at 390 px */}
                    {!isStreaming && <PriceChip price={WRITE_PRICE} left={null} />}
                  </div>
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
            {leo && (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <div role="group" aria-label="Hooks from" className="flex gap-1">
                  {HOOK_TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={t === (proven ? "proven" : "formulas")}
                      disabled={isStreaming || (t === "proven" && !PROVEN_OPEN)}
                      onClick={() => switchHooks(t)}
                      className={`flex h-11 items-center rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-50 sm:h-9 [@media(pointer:coarse)]:h-11 ${
                        t === (proven ? "proven" : "formulas")
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/70 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "proven" ? "Proven in your niche" : "Formulas"}
                    </button>
                  ))}
                </div>
                {!PROVEN_OPEN && <InfoTip label="About proven hooks">Proven hooks arrive with the weekly refresh.</InfoTip>}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {hookOptions.map((h) => {
              const isPicked = chosenHook && chosenHook === h.text.trim();
              const formula = hookFormula(h.formula);
              // the real line behind a proven hook: shown as evidence, never sent to the writer
              const seen = proven ? PROVEN.find((p) => p.formula.id === h.formula)?.line : undefined;
              const row = (
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
              return seen ? (
                <div key={h.index} className="space-y-0.5">
                  {row}
                  <p className="flex flex-wrap items-center gap-x-2 pl-12 text-[11px] text-muted-foreground">
                    Seen in {seen.from}, {Math.round(seen.ratio * 10) / 10}x their usual
                    {seen.url && (
                      <a href={seen.url} target="_blank" rel="noreferrer" className="-my-3.5 inline-flex items-center gap-1 py-3.5 font-semibold text-primary hover:underline sm:-my-2 sm:py-2">
                        <ExternalLink className="h-3 w-3" aria-hidden /> Open post
                      </a>
                    )}
                  </p>
                </div>
              ) : (
                row
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
              {leo && userId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={keepAllVariants}
                  disabled={isStreaming || !!keptNow || !variants.some((v) => v.complete && v.text.trim())}
                  className="gap-1.5"
                >
                  {keptNow ? <Check className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                  {keptNow ? "Kept" : "Keep all 3"}
                </Button>
              )}
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

      {(draft || compareOn) && (
        <div
          ref={versionsTopRef}
          className={`scroll-mt-20 space-y-3${compareOn ? " lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0" : ""}`}
        >
          {compareOn && userId && compareDraft && (
            <Suspense fallback={null}>
              <RemixCompare userId={userId} draft={compareDraft} draftText={draft} />
            </Suspense>
          )}
          {versions.length > 0 && !draftHidden && (
            <div
              role="tablist"
              aria-label="Platform versions"
              className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-1 lg:hidden"
            >
              {[
                // beside the compare tabs "Original" is the remixed post, so the draft's own tab is just its platform
                { key: "original" as const, label: compareOn ? platformLabel(platform) : `${platformLabel(platform)} (original)`, over: overLimit(draft, platform) },
                ...versions.map((v) => ({ key: v.platform, label: platformLabel(v.platform), over: overLimit(v.text, v.platform) })),
              ].map(({ over, ...t }) => (
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
                  {over && (
                    <>
                      <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle" />
                      <span className="sr-only"> (over the limit)</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
          {draft && (
          <div
            className={
              compareOn
                ? `min-w-0 lg:col-start-2 lg:row-start-1 ${versions.length > 0 ? `${draftHidden ? "hidden lg:grid" : "grid"} items-start gap-4` : draftHidden ? "hidden lg:block" : ""}`
                : versions.length > 0
                  ? "grid items-start gap-4 lg:grid-cols-2"
                  : ""
            }
          >
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
            {saveState === "failed" && (
              <p role="alert" className="mb-3 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Not saved: this browser's storage is full. Copy your post somewhere safe.
                <button type="button" onClick={() => flushSave.current()} className="-my-2 py-2 font-semibold text-primary hover:underline">
                  Retry
                </button>
              </p>
            )}
            {savedEntry?.source && (
              <p className="mb-2 text-xs text-muted-foreground">
                <Link
                  to={links.generate({ draft: savedEntry.id, compare: "original" })}
                  onClick={(e) => {
                    // a plain click opens the Original in place and keeps the rest of the address; the href is for a new tab
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (compareTab === "original") document.getElementById("compare-original")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    else setCompareTab("original");
                  }}
                  className="inline-flex items-center hover:text-foreground hover:underline [@media(pointer:coarse)]:min-h-11"
                >
                  {draftLine(savedEntry.source)}
                </Link>
              </p>
            )}
            {savedEntry && (
              <p className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                <CopyLinkButton path={links.generate({ draft: savedEntry.id })} label="Copy link to this post" className="-my-2 -ml-2 order-last" />
                {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-success" />}
                {savedEntry.status === "posted" ? (
                  "Posted. Edits save to My posts."
                ) : savedEntry.status === "scheduled" && savedEntry.scheduledFor ? (
                  <>
                    Scheduled for {whenLabel(savedEntry.scheduledFor)}.
                    <Link to={links.calendar({ post: savedEntry.id })} className="-my-2 py-2 font-semibold text-primary hover:underline">
                      Open calendar
                    </Link>
                    {!savedEntry.zernio?.postId && socialConnectShown() && (
                      <button type="button" onClick={() => (postOpen ? closePanel() : openPanel("post"))} aria-expanded={postOpen} className="-my-2 py-2 font-semibold text-primary hover:underline">
                        Post it for me
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {saveState === "saving" ? "Saving..." : "Saved to My posts."}
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
            {savedEntry && userId && savedEntry.zernio?.postId && (
              <div className="mb-3">
                <ZernioStatus userId={userId} draft={savedEntry} onDrafts={() => setScheduleTick((n) => n + 1)} />
              </div>
            )}
            {/* Leo's panel is the schedule steps (When included), so it opens on any post not yet out; it reads ?step= and ?network= itself */}
            {postOpen && savedEntry && userId && (leo ? savedEntry.status !== "posted" : savedEntry.status === "scheduled" && savedEntry.scheduledFor) && !savedEntry.zernio?.postId && (
              <div className="mb-3">
                <PostItForMePanel
                  userId={userId}
                  draft={savedEntry}
                  blockReason={mainCopyBlock}
                  onDrafts={() => setScheduleTick((n) => n + 1)}
                  onClose={closePanel}
                />
              </div>
            )}
            {(ctaType === "comment-keyword" || ctaType === "dm-keyword") && socialConnectShown() && (
              <p className="mb-3 text-xs">
                <Link
                  to={`/recruit/auto-dm${ctaKeyword(draft) ? `?keyword=${encodeURIComponent(ctaKeyword(draft))}` : ""}`}
                  className="inline-flex items-center font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                >
                  Set up the auto-DM
                </Link>
              </p>
            )}
            <ComplianceChips flags={visibleFlags} onDismiss={dismissFlag} />
            {leo && savedEntry?.remix?.flags && (
              <RemixFlags flags={savedEntry.remix.flags} text={draft} dismissed={dismissedFlagIds} onDismiss={dismissFlag} besideStrip={compareOn} />
            )}
            {leo && userId && savedEntry && (
              <Suspense fallback={null}>
                <VersionTabs userId={userId} entry={savedEntry} onOpen={openDraft} />
              </Suspense>
            )}

            <div className={`grid gap-4 ${versions.length > 0 || compareOn ? "" : "lg:grid-cols-2"}`}>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </div>
                <Textarea
                  ref={editorRef}
                  value={draft}
                  onFocus={(e) => (caretIn.current = e.currentTarget.value)}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    caretIn.current = e.target.value;
                    pendingSave.current.draft = true;
                    // Undo would throw away what was just typed.
                    if (undoText !== null) setUndoText(null);
                  }}
                  onBlur={() => flushSave.current()}
                  onPaste={(e) => {
                    // a picture on the clipboard is attached; text (even with a picture beside it) pastes as usual
                    const files = [...e.clipboardData.files];
                    if (!files.length || e.clipboardData.getData("text/plain")) return;
                    e.preventDefault();
                    void attachFiles(files);
                  }}
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
                      className={`flex h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50 sm:h-9 [@media(pointer:coarse)]:h-11 ${
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
                    className="flex h-11 items-center gap-1 rounded-full border border-border/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:h-9 [@media(pointer:coarse)]:h-11"
                  >
                    <Eraser className="h-3.5 w-3.5" /> Clean AI tells
                  </button>
                  {leo && userId && (
                    <Suspense fallback={null}>
                      <InsertButton disabled={isStreaming} />
                    </Suspense>
                  )}
                  {leo && userId && savedEntry && !draftLang && (
                    <>
                      <button
                        type="button"
                        disabled={isStreaming}
                        onClick={() => void tryNewHooks()}
                        className="flex h-11 items-center gap-1 rounded-full border border-border/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 sm:h-9 [@media(pointer:coarse)]:h-11"
                      >
                        <Shuffle className="h-3.5 w-3.5" /> Try new hooks
                      </button>
                      {!isStreaming && <PriceChip price={WRITE_PRICE} left={null} />}
                      {isStreaming && streamingMode !== "newHooks" && (
                        <span className="basis-full text-xs text-muted-foreground">Wait for the current writing to finish.</span>
                      )}
                    </>
                  )}
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
                {leo && userId && rewriteHabit && (
                  <p data-testid="rewrite-nudge" className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span>{REWRITE_LEARNINGS[rewriteHabit].nudge}</span>
                    <span className="flex gap-3">
                      <button type="button" onClick={rememberHabit} className="-my-3.5 py-3.5 font-semibold text-primary hover:underline sm:-my-2 sm:py-2">
                        Remember
                      </button>
                      <button type="button" onClick={dismissHabit} className="-my-3.5 py-3.5 font-medium hover:text-foreground hover:underline sm:-my-2 sm:py-2">
                        No thanks
                      </button>
                    </span>
                  </p>
                )}
                {leo && userId && panel === "insert" && !isStreaming && (
                  <Suspense fallback={null}>
                    <InsertPanel
                      userId={userId}
                      draft={draft}
                      platform={platform}
                      ctaType={ctaType}
                      brand={brandKit}
                      caret={() => {
                        const el = editorRef.current;
                        return el && caretIn.current === el.value ? { start: el.selectionStart, end: el.selectionEnd } : undefined;
                      }}
                      onInsert={insertText}
                    />
                  </Suspense>
                )}
                {rewrite && (
                  <div id="rewrite-panel" className="mt-1.5 scroll-mt-24 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {rewrite.status === "streaming" && (
                        <ThinkingOrb state="weaving" size={20} theme="light" aria-hidden />
                      )}
                      {rewriteLabel(rewrite.id, rewrite.fix && labelFor(rewrite.fix.id, scoreFormat))}
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
                {leo && userId && savedEntry && !draftLang && panel === "hooks" && (() => {
                  // the rows belong to the post they were written for; another post's panel starts empty
                  const ours = hookPanel?.draftId === savedEntry.id ? hookPanel : null;
                  const rows = ours ? newHookRows : [];
                  const pickKey = rows.map((r) => r.text.trim()).join("\n");
                  return (
                    <section aria-label="New hooks for this post" className="mt-1.5 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3" aria-live="polite">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          New hooks for this post
                          <InfoTip label="About new hooks">Only the first line changes. The body stays the same.</InfoTip>
                        </p>
                        <button
                          type="button"
                          onClick={closePanel}
                          aria-label="Close new hooks"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {!ours && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" disabled={isStreaming} onClick={() => void tryNewHooks()} className="h-11 gap-1.5 sm:h-9">
                            <Shuffle className="h-3.5 w-3.5" /> Try new hooks
                          </Button>
                          {!isStreaming && <PriceChip price={WRITE_PRICE} left={null} />}
                        </div>
                      )}
                      {ours?.running && (!rows.length || rows.some((r) => !r.complete)) && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> Writing 3 new hooks...
                        </p>
                      )}
                      {rows.map((r) => {
                        const done = r.complete && r.text.trim();
                        const savedId = ours?.saved[r.index];
                        return (
                          <div key={r.index} className="space-y-1.5 border-t border-border/50 pt-2">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              {hookFormula(r.formula) && <span className="text-xs font-semibold text-muted-foreground">{hookFormula(r.formula)!.name}</span>}
                              <span className="min-w-0 flex-1 basis-60 text-sm leading-relaxed text-foreground">
                                {r.text || <span className="text-muted-foreground">{r.halted ? HALT_LABEL[r.halted] : "drafting..."}</span>}
                              </span>
                              {ours?.pick?.key === pickKey && ours.pick.index === r.index && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                  <Star className="h-3 w-3" aria-hidden /> Recommended
                                </span>
                              )}
                            </div>
                            {done && (
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-8" disabled={withOpening(draft, r.text) === draft} onClick={() => pickNewHook(r)}>
                                  <Check className="h-3.5 w-3.5" /> Use this one
                                </Button>
                                <Button size="sm" variant="ghost" className="h-11 gap-1.5 sm:h-8" disabled={Boolean(savedId)} onClick={() => saveHookVersion(r)}>
                                  {savedId ? <Check className="h-3.5 w-3.5 text-success" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                                  {savedId ? "Saved" : "Save as a version"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {ours?.failed && (
                        <p role="alert" className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-destructive">
                          Couldn't write new hooks. Try again.
                          <button
                            type="button"
                            disabled={isStreaming}
                            onClick={() => void tryNewHooks(ours.formulas)}
                            className="-my-3.5 py-3.5 font-semibold text-primary hover:underline sm:-my-2 sm:py-2"
                          >
                            Try again
                          </button>
                        </p>
                      )}
                      {ours && !ours.running && rows.some((r) => r.complete && r.text.trim()) && (
                        <div className="border-t border-border/50 pt-2">
                          <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" disabled={isStreaming || Boolean(ours.testSet)} onClick={saveHookTest}>
                            {ours.testSet ? <Check className="h-3.5 w-3.5 text-success" /> : <Columns3 className="h-3.5 w-3.5" />} Save all as a hook test
                          </Button>
                        </div>
                      )}
                    </section>
                  );
                })()}
              </div>
              <div
                className="space-y-1.5"
                onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
                onDrop={(e) => {
                  if (!e.dataTransfer.files.length) return;
                  e.preventDefault();
                  void attachFiles([...e.dataTransfer.files]);
                }}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> Live preview
                </div>
                <PostPreview text={draft} platform={platform} format={format} disclosure={disclosure} media={attachedMedia.media} source={remixSource ?? undefined} />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {attachedMedia.media.map((m, i) => (
                    <span key={m.key} className="relative">
                      {m.video ? (
                        <video src={m.url} muted playsInline className="h-16 w-16 rounded-md bg-black object-cover" />
                      ) : (
                        <img src={m.url} alt={`Attached picture ${i + 1}`} className="h-16 w-16 rounded-md object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => detach(m.key)}
                        aria-label={m.video ? "Remove the video" : `Remove picture ${i + 1}`}
                        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {!attachedVideo && attachedKeys.length < MAX_PICTURES && (
                    <Button type="button" size="sm" variant="outline" className="h-9 [@media(pointer:coarse)]:h-11" disabled={attaching} onClick={() => attachInput.current?.click()}>
                      {attaching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
                      {attachedKeys.length ? "Add more" : "Add your photo or video"}
                    </Button>
                  )}
                  {!attachedVideo && attachedKeys.length < MAX_PICTURES && !stockOpen && (
                    <Button type="button" size="sm" variant="ghost" className="h-9 [@media(pointer:coarse)]:h-11" onClick={() => setStockOpen(true)}>
                      Free stock photo
                    </Button>
                  )}
                  <input
                    ref={attachInput}
                    type="file"
                    multiple
                    hidden
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mov"
                    onChange={(e) => {
                      void attachFiles([...(e.target.files ?? [])]);
                      e.target.value = "";
                    }}
                  />
                </div>
                {stockOpen && <StockSearch kind="photo" placeholder="Family dinner, office, Singapore skyline" onPick={attachStock} onClose={() => setStockOpen(false)} />}
                {attachedMedia.missing > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {attachedMedia.missing === 1 ? "1 file was" : `${attachedMedia.missing} files were`} attached on another device. Post from there, or add {attachedMedia.missing === 1 ? "it" : "them"} again here.
                  </p>
                )}
                {!attachedKeys.length && format !== "carousel" && NEEDS_MEDIA.includes(platform) && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">{platformLabel(platform)} needs a picture or video to post.</p>
                )}
              </div>
            </div>

            {shortScript && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                    scriptWarn
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {scriptWarn ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                  Script: {scriptWords} words, about {spokenSeconds(scriptWords)}s
                </span>
                <ReelLengthPicker value={reelSeconds} onChange={setReelSeconds} />
                {scriptWarn && (
                  <span role="alert" className="flex basis-full items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {scriptWarn}
                  </span>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              {draftLang !== "zh" ? (
                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-muted-foreground">
                  {svSplit?.script ? "Caption words" : "Words"}: {counters.words}
                </span>
              ) : null}
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
              {tagsOver && (
                <Button variant="outline" size="sm" onClick={cutHashtags} className="h-11 gap-1.5 sm:h-9 [@media(pointer:coarse)]:h-11">
                  <Hash className="h-3.5 w-3.5" />
                  {tagsToKeep ? `Keep the first ${tagsToKeep}` : "Take out the hashtags"}
                </Button>
              )}
              {repeats && (
                <span role="status" className="flex basis-full items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {repeats.percent}% the same words as your post "{repeats.post.hook.length > 40 ? `${repeats.post.hook.slice(0, 40).trim()}...` : repeats.post.hook}",{" "}
                  {repeats.post.status === "posted" && repeats.post.postedAt
                    ? `posted ${keyToDate(postedDay(repeats.post.postedAt)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                    : `scheduled for ${keyToDate((repeats.post.scheduledFor ?? "").slice(0, 10)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
                  . Near copies reach fewer people.
                </span>
              )}
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
              {tagsMovable && (
                <Button variant="outline" size="sm" onClick={moveTagsToComment} className="h-11 gap-1.5 sm:h-9">
                  <Hash className="h-3.5 w-3.5" /> Move hashtags to first comment
                </Button>
              )}
              {leo && firstComment === null && platform !== "tiktok" && (
                <Button variant="outline" size="sm" onClick={() => setFirstComment("")} className="h-11 gap-1.5 sm:h-9">
                  <MessageSquare className="h-3.5 w-3.5" /> Add a first comment
                </Button>
              )}
            </div>

            {(leo ? firstComment !== null : firstComment) && (
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
                {leo ? (
                  // Leo only: typed here, saved with the post as it is typed
                  <Textarea
                    aria-label="First comment"
                    autoFocus={!firstComment}
                    value={firstComment ?? ""}
                    onChange={(e) => {
                      setFirstComment(e.target.value);
                      pendingSave.current.draft = true;
                    }}
                    onBlur={() => flushSave.current()}
                    rows={Math.min(8, Math.max(2, (firstComment ?? "").split("\n").length + 1))}
                    maxLength={1250}
                    className="font-mono text-xs"
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">{commentText}</p>
                )}
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
              {leo && format === "text-post" && savedEntry && (
                <Suspense fallback={null}>
                  {/* the "reads well as a thread" check reads English only: never asked on a version */}
                  <ThreadButton draftId={savedEntry.id} post={draft} ready={!isStreaming && !draftLang} />
                </Suspense>
              )}
            </div>
            {leo && format === "text-post" && savedEntry && userId && panel === "thread" && (
              <Suspense fallback={null}>
                <ThreadPanel
                  key={savedEntry.id}
                  userId={userId}
                  draft={savedEntry}
                  text={forPosting(draft, "threads")}
                  tails={[brandSignOff, withCredit("", remixSource ?? undefined)].filter(Boolean)}
                  samples={voiceSamples}
                  blockReason={mainCopyBlock}
                  onDrafts={() => setScheduleTick((n) => n + 1)}
                />
              </Suspense>
            )}
            {leo && userId && savedEntry && (
              <Suspense fallback={null}>
                <TranslateBar
                  userId={userId}
                  entry={savedEntry}
                  text={draft}
                  auto={autoTranslate}
                  onOpen={openDraft}
                  onReplaced={(text) => {
                    setDraft(text);
                    caretIn.current = null;
                  }}
                />
              </Suspense>
            )}

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
                          disabled={storyboardBusy || storyboardLeft === 0}
                          className="-my-3.5 py-3.5 font-semibold text-primary hover:underline disabled:opacity-60 sm:-my-2 sm:py-2"
                        >
                          {storyboardBusy ? "Redoing it..." : "Redo it"}
                        </button>
                        {!storyboardBusy && <PriceChip feature="storyboard" left={storyboardLeft} />}
                        {storyboardWhy && <span className="basis-full text-destructive">{storyboardWhy}</span>}
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
                      disabled={storyboardBusy || !shortScript || storyboardLeft === 0}
                      // full strength only for the busy orb and today's no-script state; Leo's 0 left looks off
                      className={`h-11 gap-1.5 sm:h-9 ${storyboardLeft === 0 && !storyboardBusy ? "" : "disabled:opacity-100"}`}
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
                    {!storyboardBusy && <PriceChip feature="storyboard" left={storyboardLeft} />}
                    {storyboardWhy && <p className="basis-full text-xs text-destructive">{storyboardWhy}</p>}
                  </div>
                )}
                {storyboardError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {storyboardError}
                  </p>
                )}
              </div>
            )}

            {leo && format === "short-video" && savedEntry && shortScript && (
              <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3" aria-live="polite">
                <div className="flex flex-wrap items-center gap-2">
                  {/* edit-video: the AI panel opened on this post, its script filled (Film it is the button beside it) */}
                  <details className="relative">
                    <Button asChild variant="outline" size="sm" className="h-11 cursor-pointer list-none gap-1.5 sm:h-9 [&::-webkit-details-marker]:hidden">
                      <summary>
                        <Wand2 className="h-3.5 w-3.5" /> Make the video <ChevronDown className="h-3.5 w-3.5" />
                      </summary>
                    </Button>
                    <div className="absolute left-0 top-full z-30 mt-1 w-52 rounded-xl border border-border/70 bg-popover p-1 shadow-elegant">
                      {MAKE_VIDEO.filter((m) => m.kind !== "film").map((m) => (
                        <Link key={m.kind} to={makeVideoHref(m.kind, savedEntry.id)}
                          className="flex h-11 items-center rounded-lg px-3 text-sm hover:bg-accent focus:bg-accent focus:outline-none sm:h-9">{m.label}</Link>
                      ))}
                    </div>
                  </details>
                  <Button variant="outline" size="sm" onClick={() => openView("prompter")} disabled={isStreaming} className="h-11 gap-1.5 sm:h-9">
                    <Video className="h-3.5 w-3.5" /> Film it
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTitles}
                    disabled={titlesBusy || isStreaming || titlesLeft === 0}
                    className={`h-11 gap-1.5 sm:h-9 ${titlesBusy ? "disabled:opacity-100" : ""}`}
                  >
                    {titlesBusy ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <AlignLeft className="h-3.5 w-3.5" />}
                    {titlesBusy ? "Writing titles..." : "Write 3 titles"}
                  </Button>
                  {!titlesBusy && <PriceChip feature="video-publish" left={titlesLeft} />}
                  {titlesWhy && <p className="basis-full text-xs text-destructive">{titlesWhy}</p>}
                </div>
                {titlesError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {titlesError}
                  </p>
                )}
                {titles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Titles</p>
                    {titles.map(titleRow)}
                    {cover && (
                      <>
                        <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cover line</p>
                        {titleRow(cover)}
                      </>
                    )}
                  </div>
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
              <div id={leo ? "score" : undefined} className={`mt-3 rounded-xl border border-border/60 bg-muted/20 p-3${leo ? " scroll-mt-24" : ""}`} aria-live="polite">
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
                      {leo && <span className="text-xs font-semibold text-foreground">{scoreBand(postScore.score)}</span>}
                      <InfoTip label="About the score">Five checks on this draft, weighed out of 10. A guide, not a promise of reach.</InfoTip>
                    </div>
                    {postScore.down.length > 0 ? (
                      <ul className="mt-2 space-y-1.5" aria-label="What pulled it down">
                        {postScore.down.map((id) => {
                          const why = (
                            <>
                              <span className="font-semibold">{labelFor(id, leo ? scoreFormat : "text-post")}:</span>{" "}
                              <span className="text-muted-foreground">{tipFor(id, leo ? scoreFormat : "text-post")}</span>
                            </>
                          );
                          return leo ? (
                            <li key={id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                              <span className="min-w-0 flex-1 basis-56">{why}</span>
                              <span className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-11 gap-1.5 text-xs sm:h-8"
                                  disabled={rewrite?.status === "streaming" || !!scoring}
                                  onClick={() => fixFactor(id)}
                                >
                                  <Wand2 className="h-3.5 w-3.5" /> Fix this
                                </Button>
                                <PriceChip price={WRITE_PRICE} left={null} />
                              </span>
                            </li>
                          ) : (
                            <li key={id} className="text-xs">
                              {why}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Nothing big is holding it back.</p>
                    )}
                    {leo && rewrite?.fix && rewrite.status === "streaming" && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ThinkingOrb state="weaving" size={20} theme="light" aria-hidden /> Fixing the {labelFor(rewrite.fix.id, scoreFormat).toLowerCase()}...
                      </p>
                    )}
                    {leo && fixedFrom?.key === scoreKeyNow && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-foreground">
                        Was {fixedFrom.from.toFixed(1)}, now {postScore.score.toFixed(1)}
                        {postScore.score < fixedFrom.from && ". Discard it to keep the old one."}
                        {postScore.score < fixedFrom.from && undoText !== null && (
                          <button type="button" onClick={undoRewrite} className="-my-3.5 py-3.5 font-semibold text-primary hover:underline sm:-my-2 sm:py-2">
                            Undo
                          </button>
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-9 gap-1.5 ${scoring === scoreKeyNow ? "disabled:opacity-100" : ""}`}
                      onClick={() => void runScore()}
                      disabled={!!scoring || !userId || (leo && (draft.trim().length < 40 || scoreLeft === 0))}
                    >
                      {scoring === scoreKeyNow ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Gauge className="h-3.5 w-3.5" />}
                      {scoring === scoreKeyNow ? "Scoring..." : "Predict engagement"}
                    </Button>
                    {leo && scoring !== scoreKeyNow && <PriceChip feature="post-score" left={scoreLeft} />}
                    {leo && draft.trim().length < 40 && <p className="basis-full text-xs text-muted-foreground">Write a bit more before scoring it.</p>}
                    {scoreWhy && <p className="basis-full text-xs text-destructive">{scoreWhy}</p>}
                    {scoreError?.key === scoreKeyNow && <p className="text-xs text-destructive" role="alert">{scoreError.message}</p>}
                  </div>
                )}
              </div>
            )}
            {/* a version in another language is never scored: Malay passes the score's Latin-letter check */}
            {leo && draftLang && draft.trim() && !isStreaming && (
              <p id="score" className="mt-3 scroll-mt-24 rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                Scores run on the English version.
              </p>
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
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopyImagePrompt}
                        className="h-9 gap-1 text-xs"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                      {!(imgJob?.prompt === imagePrompt && imgJob.state === "done") && (
                        <>
                          <Button
                            size="sm"
                            disabled={imageBusy() || !userId || imageLeft === 0}
                            onClick={() => userId && void makeImage(userId, imagePrompt, (chosenHook || draft.trim().split("\n")[0] || "AI image").slice(0, 80))}
                            className="h-9 gap-1.5 text-xs"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {imgJob?.prompt === imagePrompt && imgJob.state === "failed" ? "Try again" : "Make the image"}
                          </Button>
                          {!imgRunning && <PriceChip feature="ai-image" left={imageLeft} />}
                        </>
                      )}
                    </div>
                  )}
                  {imagePrompt && imageWhy && !imgRunning && !(imgJob?.prompt === imagePrompt && imgJob.state === "done") && <p className="basis-full text-right text-xs text-destructive">{imageWhy}</p>}
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
                            : imgJob.fix
                              ? "Fixing the picture, about 30 seconds. You can keep working."
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
                        {imgJob.token && userId && (
                          <form
                            className="flex w-full flex-wrap items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (fixText.trim().length < 3 || fixLeft === 0) return;
                              void fixImage(userId, fixText);
                              setFixText("");
                            }}
                          >
                            <Input
                              value={fixText}
                              onChange={(e) => setFixText(e.target.value)}
                              maxLength={300}
                              placeholder="What to fix, e.g. remove the text on the sign"
                              aria-label="What to fix in the picture"
                              className="h-11 min-w-0 flex-1 text-xs sm:h-9"
                            />
                            <Button type="submit" size="sm" variant="outline" disabled={fixText.trim().length < 3 || fixLeft === 0} className="h-11 gap-1.5 text-xs sm:h-9">
                              <ImageWandIcon className="h-3.5 w-3.5" /> Fix it
                            </Button>
                            {/* its own line on phones, so the box beside Fix it keeps its width */}
                            {leo && (
                              <span className="basis-full sm:basis-auto">
                                <PriceChip price={sumPrices(priceOf("ai-image-fix"), priceOf("ai-image-fix-global"))} left={fixLeft} />
                              </span>
                            )}
                            {fixWhy && <p className="w-full text-xs text-destructive">{fixWhy}</p>}
                            {imgJob.fixError && <p className="w-full text-xs text-destructive" role="alert">{imgJob.fixError}</p>}
                          </form>
                        )}
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
                      {overLimit(v.text, v.platform) && (
                        <>
                          <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle" />
                          <span className="sr-only"> (over the limit)</span>
                        </>
                      )}
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
                  {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-success" />}
                  {saveState === "saving" ? "Saving..." : "Saved to My posts."}
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
                onChange={(e) => {
                  updateVersion(shownVersion.draftId, { text: e.target.value });
                  pendingSave.current.version = shownVersion.draftId;
                }}
                onBlur={() => flushSave.current()}
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
                source={remixSource ?? undefined}
              />
            </CardContent>
          </Card>
        )}
          </div>
          )}
        </div>
      )}

      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={closePanel}
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
                onClick={closePanel}
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

      {prompterText.length > 0 && savedEntry && userId && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] bg-black" />}>
          <Prompter
            key={savedEntry.id}
            userId={userId}
            draftId={savedEntry.id}
            name={savedEntry.hook || pillarDetail.trim()}
            lines={prompterText}
            caption={svSplit?.script ? svSplit.caption : ""}
            onClose={closeView}
          />
        </Suspense>
      )}
    </div>
  );
}
