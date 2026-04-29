import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import inspirationData from "@/data/inspiration.json";
import { type InspirationEntry } from "@/components/Inspiration";

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
  const [hooksFirst, setHooksFirst] = useState<boolean>(false);
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

  const isStreaming = streamingMode !== "idle";

  const buildBasePayload = (): BasePayload => ({
    pillar,
    pillarDetail: pillarDetail.trim(),
    ideaSource: ideaMeta.label,
    ideaContext: ideaContext.trim() || undefined,
    format,
    platform,
    ctaType,
    styleReference: styleReference ?? undefined,
    audience,
  });

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

  const handlePickVariant = (idx: number) => {
    const v = variants.find((x) => x.index === idx);
    if (!v) return;
    setSelectedVariantIndex(idx);
    setDraft(v.text);
    toast({
      title: "Draft selected",
      description:
        "Edit inline, copy to your platform, or re-roll for new options.",
    });
  };

  const handleCopy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      toast({
        title: "Copied",
        description: "Paste into your platform of choice.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually and copy.",
        variant: "destructive",
      });
    }
  };

  // Suppress unused import warning - navigate may be needed by future flows.
  void navigate;

  const generateButtonLabel = (() => {
    if (isStreaming) return hooksFirst ? "Drafting hooks..." : "Drafting variations...";
    if (draft || variants.length > 0 || hookOptions.length > 0) {
      return hooksFirst ? "Start over: 5 hooks" : "Generate 3 new variations";
    }
    return hooksFirst ? "Generate 5 hooks" : "Generate 3 variations";
  })();

  return (
    <div ref={formAnchorRef} className="space-y-6">
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

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            1. Pick your pillar
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
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            2. Pick your idea source
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

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            3. Pick platform, format, CTA
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
              onClick={handleGenerate}
              className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" />
              {generateButtonLabel}
            </Button>
          )}
        </div>
      </div>

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
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
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
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(28, Math.max(10, draft.split("\n").length + 2))}
              className="font-mono text-sm leading-relaxed"
            />
            <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Edit inline before copying. Reminder from Day 41: every post
                needs Authority + Social + a soft CTA. If the draft missed any,
                rewrite that part.
              </span>
            </div>
          </CardContent>
        </Card>
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
