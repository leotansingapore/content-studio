import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Sparkles,
  Copy,
  Clapperboard,
  RefreshCw,
  Loader2,
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
  MessageSquare,
  HelpCircle,
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
} from "lucide-react";
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
} from "@/lib/voiceProfile";
import {
  getDraftById,
  newDraftId,
  upsertDraft,
  type DraftEntry,
} from "@/lib/draftHistory";
import { readout, type CounterReadout } from "@/lib/platformCounters";
import { splitScriptCaption } from "@/lib/scriptCaption";
import { toPlainText } from "@/lib/plainText";
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
    sub: "30-60 sec script for Reels/Shorts/TikTok",
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

interface VariantState {
  index: number;
  text: string;
  complete: boolean;
}

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const prefillAppliedRef = useRef<boolean>(false);
  // When a scheduled/posted slot is loaded, keep updating that same entry on
  // re-roll/pick (so it stays on the calendar) instead of forking a new draft.
  const preserveIdRef = useRef<string | null>(null);

  // Voice profile + nudge.
  const [userId, setUserId] = useState<string | null>(null);
  const [voiceSummary, setVoiceSummary] = useState<string | null>(null);
  const [voiceProfileUsable, setVoiceProfileUsable] = useState<boolean>(false);
  const [voiceNudgeDismissed, setVoiceNudgeDismissed] = useState<boolean>(false);

  // Draft history.
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  // Compliance flags + dismiss tracking.
  const [dismissedFlagIds, setDismissedFlagIds] = useState<Set<string>>(new Set());

  // Hashtags + image prompt.
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagsLoading, setHashtagsLoading] = useState<boolean>(false);
  const [imagePrompt, setImagePrompt] = useState<string>("");
  const [imagePromptLoading, setImagePromptLoading] = useState<boolean>(false);

  // Keyboard shortcuts dialog visibility.
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);

  // Guided wizard: which of the 4 brief steps is open, and whether the brief
  // editor is expanded. Once a draft exists the brief collapses to a summary so
  // the screen stays focused on the output.
  const [wizardStep, setWizardStep] = useState<number>(0);
  const [briefOpen, setBriefOpen] = useState<boolean>(true);

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
        const hasOverride = ["draft", "platform", "format", "vibe"].some((k) =>
          new URLSearchParams(window.location.search).has(k),
        );
        if (!hasOverride && id) {
          const prefs = JSON.parse(
            localStorage.getItem(`content-studio-writeprefs-${id}`) ?? "null",
          );
          if (prefs?.platform && PLATFORMS.some((p) => p.value === prefs.platform)) {
            setPlatform(prefs.platform as Platform);
          }
          if (prefs?.format && FORMATS.some((f) => f.value === prefs.format)) {
            setFormat(prefs.format as Format);
          }
        }
      } catch {
        // corrupt prefs are ignorable
      }
      const profile = loadVoiceProfile(id);
      const usable = isVoiceProfileUsable(profile);
      setVoiceProfileUsable(usable);
      setVoiceSummary(usable ? (profile?.voiceSummary ?? null) : null);
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
    } else {
      setPillar(entry.pillar as Pillar);
      setPillarDetail(entry.pillarDetail ?? "");
      setAudience((entry.audience as Audience) ?? "general");
      setFormat(entry.format as Format);
      setPlatform(entry.platform as Platform);
      setCtaType(entry.ctaType as CtaType);
      if (entry.hook) setChosenHook(entry.hook);
    }
    setDraft(entry.draft);
    setCurrentDraftId(entry.id);
    preserveIdRef.current =
      entry.status === "scheduled" || entry.status === "posted"
        ? entry.id
        : null;
    setVibeSourceId(entry.vibeSourceId ?? null);
    toast({
      title: isBareIdea ? "Idea loaded" : "Draft restored",
      description: isBareIdea
        ? "Your board idea is set as the topic — pick a format and generate."
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
  // &platform=&cta=&funnel=&idea=&ctx=&ref=  (runs once, then strips params).
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

    const next = new URLSearchParams(searchParams);
    ["pillar", "detail", "audience", "format", "platform", "cta", "funnel", "idea", "ctx", "ref"].forEach(
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

  // Live craft check on the current draft (reuses the Coach engine).
  const craftCheck = useMemo(
    () =>
      draft.trim().length > 30
        ? analyzePosts([{ text: draft, platform: platform as PlatformId }])
        : null,
    [draft, platform],
  );

  const isStreaming = streamingMode !== "idle";

  const buildBasePayload = (): BasePayload => {
    // Fold the funnel-stage directive into the free-text context so the draft is
    // steered for where the reader sits in the funnel (the edge function is
    // prompt-driven, so this is how we shape it without server changes).
    const funnelMeta = funnelStage ? getFunnelStage(funnelStage) : null;
    const ctxParts: string[] = [];
    if (funnelMeta) ctxParts.push(funnelMeta.directive);
    const trimmedCtx = ideaContext.trim();
    if (trimmedCtx) ctxParts.push(trimmedCtx);

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

  const runStream = async (
    payload: BasePayload & {
      mode: "hooks" | "body" | "post";
      n: number;
      chosenHook?: string;
    },
    target: "hooks" | "variants",
    initialCount: number,
  ) => {
    const url = `${SUPABASE_URL}/functions/v1/generate-social-content`;
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token ?? SUPABASE_ANON_KEY;

    const initial: VariantState[] = Array.from(
      { length: initialCount },
      (_, i) => ({ index: i, text: "", complete: false }),
    );
    if (target === "hooks") setHookOptions(initial);
    else setVariants(initial);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreamingMode(target);

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

    const applyEvent = (evt: { type: string; [k: string]: unknown }) => {
      if (evt.type === "token") {
        const idx = evt.variantIndex as number;
        const text = evt.text as string;
        const setter = target === "hooks" ? setHookOptions : setVariants;
        setter((prev) =>
          prev.map((v) =>
            v.index === idx ? { ...v, text: v.text + text } : v,
          ),
        );
      } else if (evt.type === "variant_complete") {
        const idx = evt.variantIndex as number;
        const finalText = evt.text as string;
        const setter = target === "hooks" ? setHookOptions : setVariants;
        setter((prev) =>
          prev.map((v) =>
            v.index === idx ? { ...v, text: finalText, complete: true } : v,
          ),
        );
      } else if (evt.type === "error") {
        const message = (evt.message as string) ?? "Stream error";
        throw new Error(message);
      }
    };

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
            applyEvent(evt);
          } catch (err) {
            console.error("SSE parse error:", err, payloadStr);
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_) {
        // ignore
      }
    }
  };

  const validateForm = (): boolean => {
    if (!pillarDetail.trim()) {
      toast({
        title: "Add a pillar detail",
        description: `Tell the generator what your ${pillarMeta.label.toLowerCase()} is. ${pillarMeta.placeholder}`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!validateForm()) return;
    // Remember the working platform/format as next session's defaults.
    if (userId) {
      try {
        localStorage.setItem(
          `content-studio-writeprefs-${userId}`,
          JSON.stringify({ platform, format }),
        );
      } catch {
        // storage full — defaults just won't stick
      }
    }
    // Collapse the wizard only after validation passes — collapsing first
    // strands the user on a dead brief summary when the topic is missing.
    setBriefOpen(false);
    setSelectedVariantIndex(null);
    setDraft("");
    setChosenHook(null);
    setHookOptions([]);
    setVariants([]);
    const base = buildBasePayload();

    try {
      if (hooksFirst) {
        await runStream({ ...base, mode: "hooks", n: 5 }, "hooks", 5);
      } else {
        await runStream({ ...base, mode: "post", n: 3 }, "variants", 3);
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
    } finally {
      abortControllerRef.current = null;
      setStreamingMode("idle");
    }
  };

  const handlePickHook = async (hookText: string) => {
    if (!hookText.trim()) return;
    setChosenHook(hookText.trim());
    setVariants([]);
    setSelectedVariantIndex(null);
    setDraft("");
    const base = buildBasePayload();
    try {
      await runStream(
        { ...base, mode: "body", n: 3, chosenHook: hookText.trim() },
        "variants",
        3,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      toast({
        title: "Couldn't generate variations",
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      abortControllerRef.current = null;
      setStreamingMode("idle");
    }
  };

  const handleReroll = async () => {
    if (!validateForm()) return;
    setSelectedVariantIndex(null);
    setDraft("");
    const base = buildBasePayload();
    try {
      if (chosenHook) {
        await runStream(
          { ...base, mode: "body", n: 3, chosenHook },
          "variants",
          3,
        );
      } else {
        await runStream({ ...base, mode: "post", n: 3 }, "variants", 3);
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
    } finally {
      abortControllerRef.current = null;
      setStreamingMode("idle");
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
    (text: string, hookText: string) => {
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
      };
      upsertDraft(userId, entry);
      setCurrentDraftId(id);
    },
    [
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
    setDraft(v.text);
    setHashtags([]);
    setImagePrompt("");
    setDismissedFlagIds(new Set());
    // Save to history immediately on selection. Normally each pick forks a
    // fresh entry, but when editing a scheduled/posted slot we keep updating
    // it so it stays put on the calendar.
    if (!preserveIdRef.current) setCurrentDraftId(null);
    persistDraftEntry(v.text, chosenHook ?? "");
    // Fire hashtags + image-prompt in parallel; failures don't block.
    void fetchAuxForDraft(v.text);
    toast({
      title: "Draft selected",
      description:
        "Edit inline, copy to your platform, or re-roll for new options.",
    });
  };

  // Everything copied from here is headed for a social platform, none of which
  // render markdown - strip it so "**hook**" doesn't paste as literal asterisks.
  const copyText = async (text: string, title: string, description: string) => {
    try {
      await navigator.clipboard.writeText(toPlainText(text));
      toast({ title, description });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually and copy.",
        variant: "destructive",
      });
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    await copyText(draft, "Copied", "Paste into your platform of choice.");
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
    if (isStreaming) return hooksFirst ? "Drafting hooks..." : "Drafting variations...";
    if (draft || variants.length > 0 || hookOptions.length > 0) {
      return hooksFirst ? "Start over: 5 hooks" : "Generate 3 new variations";
    }
    return hooksFirst ? "Generate 5 hooks" : "Generate 3 variations";
  })();

  const showVoiceNudge =
    !voiceProfileUsable && !voiceNudgeDismissed && userId !== null;

  const hasOutput =
    hookOptions.length > 0 || variants.length > 0 || draft.trim().length > 0;

  // Labels for the 4 guided steps, in the order the consultant fills them in.
  const STEP_META = [
    { label: "Topic", hint: "What it's about" },
    { label: "Funnel", hint: "Where they are" },
    { label: "Idea", hint: "Your angle" },
    { label: "Format", hint: "Where & how" },
  ];
  const LAST_STEP = STEP_META.length - 1;
  const goNext = () =>
    setWizardStep((s) => Math.min(LAST_STEP, s + 1));
  const goBack = () => setWizardStep((s) => Math.max(0, s - 1));

  return (
    <div ref={formAnchorRef} className="space-y-6">
      <SectionTabs tabs={WRITE_TABS} />
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Write a post
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Answer a few quick questions and the studio drafts a post in your
          voice. Everything has a sensible default, so you can move fast and
          tweak later.{" "}
          <Link to="/generate/batch" className="font-semibold text-primary hover:underline">
            Need one topic across several platforms at once? Try Weekly batch.
          </Link>
        </p>
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
              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-background px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
            >
              <Mic className="h-3 w-3" /> Set voice
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissNudge}
              className="h-7 gap-1 text-xs text-muted-foreground"
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
            <div className="space-y-0.5">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                Voice profile active
              </p>
              <p className="text-muted-foreground">
                Drafts will be steered toward your tone and structure.
              </p>
            </div>
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
              <p className="text-muted-foreground">
                The generator will match this example's pattern. Edit your
                pillar / context below if you want to steer it.
              </p>
              {vibeSourceId && (
                <p className="font-mono text-[10px] text-muted-foreground/80">
                  ref: {vibeSourceId}
                </p>
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
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors ${
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
                  <span className="hidden sm:block">
                    <span
                      className={`block text-xs font-semibold leading-none ${
                        active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-none text-muted-foreground">
                      {s.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {wizardStep === 0 && (
            <div className="space-y-6">
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            What&apos;s your post about?
          </CardTitle>
          <CardDescription>
            What is this post centred on? Social pillars (Interest/Identity)
            humanise you. Authority pillars (Topic/Market) build credibility.
          </CardDescription>
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
            <div className="flex items-center justify-between">
              <Label className="text-sm">Audience / life-stage</Label>
              <span className="text-[11px] text-muted-foreground">
                Tunes voice, examples, pain-points
              </span>
            </div>
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
              className={`mt-1 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
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
            Where is this reader in your funnel? The ABC funnel: Attraction to
            get seen, Building Trust to earn credibility, Conversion to invite
            the next step. Optional — but it sharpens the draft.
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
                    {s.letter} · {s.label} — {s.goal}
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
                    </span>{" "}
                    for this stage — change it in step 3 if you want.
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
          <CardTitle className="font-serif text-xl">
            What&apos;s the spark?
          </CardTitle>
          <CardDescription>
            The 7 idea sources from Day 41. The strongest posts come from
            real conversations and concrete situations.
          </CardDescription>
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
          <CardDescription>
            Match the format to where you're posting and what you want the
            reader to do next.
          </CardDescription>
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            The draft is a starting point - never a final post. Edit for your
            voice. Day 41 is clear: copying generic templates produces generic
            results.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
              hooksFirst
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:border-primary/40"
            }`}
            title="Generate 5 hook options first, pick one, then 3 full drafts off that hook."
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary"
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
              className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" />
              {generateButtonLabel}
            </Button>
          )}
        </div>
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
              className="gap-1.5 text-muted-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <span className="text-xs text-muted-foreground">
              Step {wizardStep + 1} of {STEP_META.length}
            </span>
            {wizardStep < LAST_STEP ? (
              <Button type="button" onClick={goNext} className="gap-1.5">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
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
              Five different angles. Click one and we'll draft three full posts
              that lead with it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {hookOptions.map((h) => {
              const isPicked = chosenHook && chosenHook === h.text.trim();
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
                    <div className="font-mono text-sm leading-relaxed text-foreground">
                      {h.text || (
                        <span className="text-muted-foreground">
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary/60" />{" "}
                          drafting...
                        </span>
                      )}
                    </div>
                    {h.complete && !isPicked && (
                      <span className="text-[11px] text-muted-foreground group-hover:text-primary">
                        Click to use this hook
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
        <Card className="border-border/60 shadow-card">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="font-serif text-xl">
                Three variations
              </CardTitle>
              <CardDescription>
                Different angles on the same brief. Pick the one closest to
                your voice, then edit it. Re-roll for three new takes.
              </CardDescription>
            </div>
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
                      {!v.complete ? (
                        <span className="flex items-center gap-1 text-[10px] text-primary">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />{" "}
                          streaming
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Check className="h-3 w-3" /> ready
                        </span>
                      )}
                    </div>
                    <pre className="min-h-[180px] flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                      {v.text || (
                        <span className="text-muted-foreground">
                          drafting...
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
        <Card className="border-border/60 shadow-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="font-serif text-xl">Your draft</CardTitle>
              <CardDescription>
                Read it, cut 30% of words, edit for your voice, then publish.
                Re-roll for three new variations if needed.
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              {svSplit?.script ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void copyText(
                        svSplit.caption,
                        "Caption copied",
                        "Paste into the post caption.",
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
            {visibleFlags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {visibleFlags.map((flag) => {
                  const isError = flag.severity === "error";
                  return (
                    <div
                      key={flag.id}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                        isError
                          ? "border-destructive/50 bg-destructive/10 text-destructive-foreground"
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
                          {isError ? "Compliance error" : "Compliance warn"}
                          <span className="ml-1.5 rounded bg-background/60 px-1 py-0.5 font-mono text-[10px] normal-case tracking-normal">
                            {flag.match}
                          </span>
                        </div>
                        <div className="text-[11px] leading-snug">{flag.message}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDismissedFlagIds((prev) => {
                            const next = new Set(prev);
                            next.add(flag.id);
                            return next;
                          })
                        }
                        className="ml-1 rounded hover:bg-background/40"
                        aria-label="Dismiss flag"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={handleDraftBlur}
                  rows={Math.min(28, Math.max(12, draft.split("\n").length + 2))}
                  className="h-full font-mono text-sm leading-relaxed"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> Live preview
                </div>
                <PostPreview text={draft} platform={platform} format={format} />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-muted-foreground">
                Words: {counters.words}
              </span>
              <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-muted-foreground">
                Chars: {counters.chars}
              </span>
              <span
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                  counters.status === "good"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : counters.status === "warn"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "border-destructive/50 bg-destructive/10 text-destructive"
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
            </div>

            <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Edit inline before copying. Reminder from Day 41: every post
                needs Authority + Social + a soft CTA. If the draft missed any,
                rewrite that part.
              </span>
            </div>

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
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
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
                    <Loader2 className="h-3 w-3 animate-spin" /> Generating...
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopyImagePrompt}
                      className="h-7 gap-1 text-xs"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  )}
                </div>
                {imagePromptLoading && !imagePrompt ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Generating...
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-foreground">
                    {imagePrompt}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
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
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 sm:hidden">
          <Button
            size="lg"
            variant="outline"
            onClick={stopStreaming}
            className="gap-2 bg-background shadow-lg"
          >
            <StopCircle className="h-4 w-4" />
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Stop
          </Button>
        </div>
      )}
    </div>
  );
}
