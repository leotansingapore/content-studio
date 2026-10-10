import { useEffect, useMemo, useRef, useState } from "react";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { streamOnePost } from "@/lib/batchGenerate";
import { stripDashes, tagLinks, toPlainText, withSignOff } from "@/lib/plainText";
import { loadBrand } from "@/lib/carousel";
import { allowedLinks, applyBrandRules, brandRulesLine } from "@/lib/brandRules";
import { strayLinks } from "@/lib/platformCounters";
import {
  upsertDraft,
  newDraftId,
  type DraftEntry,
} from "@/lib/draftHistory";
import { loadVoiceProfile, isVoiceProfileUsable } from "@/lib/voiceProfile";
import {
  Layers,
  Check,
  Copy,
  Save,
  RotateCcw,
  Linkedin,
  Instagram,
  Facebook,
  Video,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";

type Pillar = "interest" | "identity" | "topic" | "market";
type Audience = "general" | "young-adult" | "working-adult" | "parent" | "pre-retiree";

interface BatchTarget {
  key: string;
  platform: string;
  format: string;
  label: string;
  icon: typeof Linkedin;
  defaultOn: boolean;
}

const TARGETS: BatchTarget[] = [
  { key: "li", platform: "linkedin", format: "text-post", label: "LinkedIn post", icon: Linkedin, defaultOn: true },
  { key: "ig-carousel", platform: "instagram", format: "carousel", label: "Instagram carousel", icon: Instagram, defaultOn: true },
  { key: "tiktok", platform: "tiktok", format: "short-video", label: "TikTok script", icon: Video, defaultOn: true },
  { key: "fb", platform: "facebook", format: "text-post", label: "Facebook post", icon: Facebook, defaultOn: false },
  { key: "ig-reel", platform: "instagram", format: "short-video", label: "Instagram Reel", icon: Instagram, defaultOn: false },
];

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "general", label: "General" },
  { value: "young-adult", label: "Young adult" },
  { value: "working-adult", label: "Working adult" },
  { value: "parent", label: "Parent" },
  { value: "pre-retiree", label: "Pre-retiree" },
];

const PILLARS: { value: Pillar; label: string }[] = [
  { value: "topic", label: "Topic (authority)" },
  { value: "market", label: "Market (authority)" },
  { value: "identity", label: "Identity (social)" },
  { value: "interest", label: "Interest (social)" },
];

// The batch in progress, kept for this tab so leaving the page doesn't throw
// away drafts not yet saved to My posts. sessionStorage, outside the synced prefix.
const workKey = (userId: string) => `cs-batch-work-${scoped(userId)}`;

type CardState = {
  status: "idle" | "streaming" | "done" | "error" | "saved";
  text: string;
  error?: string;
};

export default function BatchPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState<Pillar>("topic");
  const [audience, setAudience] = useState<Audience>("general");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(TARGETS.filter((t) => t.defaultOn).map((t) => t.key)),
  );
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [running, setRunning] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const offerLinks = useMemo(() => allowedLinks(loadBrand(userId)), [userId]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      try {
        const work = id ? JSON.parse(sessionStorage.getItem(workKey(id)) ?? "null") : null;
        if (work && typeof work.topic === "string") {
          setTopic(work.topic);
          if (PILLARS.some((p) => p.value === work.pillar)) setPillar(work.pillar);
          if (AUDIENCES.some((a) => a.value === work.audience)) setAudience(work.audience);
          if (Array.isArray(work.selected)) setSelected(new Set(work.selected));
          if (work.cards && typeof work.cards === "object" && Object.keys(work.cards).length > 0) {
            setCards(work.cards);
            toast({ title: "Your batch is back" });
          }
        }
      } catch {
        // corrupt or blocked storage: start fresh
      }
      setUserId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  // Saved between runs, not on every streamed token.
  useEffect(() => {
    if (!userId || running) return;
    try {
      if (!topic.trim() && Object.keys(cards).length === 0) {
        sessionStorage.removeItem(workKey(userId));
      } else {
        sessionStorage.setItem(
          workKey(userId),
          JSON.stringify({ topic, pillar, audience, selected: [...selected], cards }),
        );
      }
    } catch {
      // storage blocked: the batch just won't survive a page change
    }
  }, [userId, running, topic, pillar, audience, selected, cards]);

  const activeTargets = useMemo(
    () => TARGETS.filter((t) => selected.has(t.key)),
    [selected],
  );

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runBatch = async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      document.getElementById("batch-topic")?.focus();
      toast({
        title: "Add a topic",
        description: "One topic, angle, or client scenario is enough to seed the whole batch.",
        variant: "destructive",
      });
      return;
    }
    if (activeTargets.length === 0) {
      toast({
        title: "Pick at least one platform",
        variant: "destructive",
      });
      return;
    }
    setRunning(true);
    const initial: Record<string, CardState> = {};
    for (const t of activeTargets) initial[t.key] = { status: "streaming", text: "" };
    setCards(initial);
    // On a phone the drafts stream in a screen below the button.
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    const { data } = await supabase.auth.getUser();
    const voiceProfile = loadVoiceProfile(data.user?.id ?? null);
    const kit = loadBrand(data.user?.id);
    const usableVoice = isVoiceProfileUsable(voiceProfile)
      ? voiceProfile?.voiceSummary
      : undefined;

    await Promise.all(
      activeTargets.map(async (t) => {
        try {
          await streamOnePost(
            {
              pillar,
              pillarDetail: trimmed,
              ideaSource: "A concrete angle for this week",
              format: t.format,
              platform: t.platform,
              ctaType: "comment-keyword",
              audience,
              voiceSummary: usableVoice,
              ideaContext: brandRulesLine(kit) || undefined,
            },
            {
              onToken: (text) =>
                setCards((prev) => ({ ...prev, [t.key]: { status: "streaming", text } })),
              onComplete: (text) =>
                setCards((prev) => ({ ...prev, [t.key]: { status: "done", text: applyBrandRules(stripDashes(text), kit) } })),
              onError: (message) =>
                setCards((prev) => ({
                  ...prev,
                  [t.key]: { status: "error", text: "", error: message },
                })),
            },
          );
        } catch (err) {
          setCards((prev) => ({
            ...prev,
            [t.key]: {
              status: "error",
              text: "",
              error: err instanceof Error ? err.message : "Generation failed",
            },
          }));
        }
      }),
    );
    setRunning(false);
  };

  const entryFor = (t: BatchTarget, card: CardState): DraftEntry => ({
    id: newDraftId(),
    createdAt: new Date().toISOString(),
    hook: card.text.split("\n")[0]?.slice(0, 120) ?? "",
    draft: card.text,
    pillar,
    pillarDetail: topic.trim(),
    audience,
    format: t.format,
    platform: t.platform,
    ctaType: "comment-keyword",
  });

  const handleSave = (t: BatchTarget) => {
    const card = cards[t.key];
    if (!userId || !card || card.status !== "done") return;
    upsertDraft(userId, entryFor(t, card));
    setCards((prev) => ({ ...prev, [t.key]: { ...card, status: "saved" } }));
    toast({ title: "Saved to My posts", description: t.label });
  };

  const unsaved = activeTargets.filter((t) => cards[t.key]?.status === "done");

  const handleSaveAll = () => {
    if (!userId || unsaved.length === 0) return;
    // Newest first in My posts, so save from the last card back to keep this order.
    for (const t of [...unsaved].reverse()) upsertDraft(userId, entryFor(t, cards[t.key]));
    setCards((prev) => {
      const next = { ...prev };
      for (const t of unsaved) next[t.key] = { ...prev[t.key], status: "saved" };
      return next;
    });
    toast({ title: `Saved ${unsaved.length} drafts to My posts` });
  };

  const handleCopy = async (text: string, plat: string, campaign: string) => {
    try {
      const { data } = await supabase.auth.getUser();
      const kit = loadBrand(data.user?.id);
      const sign = kit?.signOff?.trim();
      const out = sign ? withSignOff(toPlainText(text), sign) : toPlainText(text);
      await navigator.clipboard.writeText(kit?.tagLinks ? tagLinks(out, { source: plat, campaign }) : out);
      toast({ title: sign ? "Copied with your sign-off" : "Copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const hasResults = Object.keys(cards).length > 0;

  return (
    <div className="space-y-6">
      <SectionTabs tabs={WRITE_TABS} />
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Layers className="h-6 w-6 text-primary" /> Weekly batch
        </h1>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="batch-topic">Topic or angle</Label>
            <Textarea
              id="batch-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Why topping up your CPF SA before 35 matters more than people think"
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pillar</Label>
              <div className="flex flex-wrap gap-1.5">
                {PILLARS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPillar(p.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
                      pillar === p.value
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setAudience(a.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
                      audience === a.value
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Generate for</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TARGETS.map((t) => {
                const Icon = t.icon;
                const active = selected.has(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => toggle(t.key)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all [@media(pointer:coarse)]:min-h-11 ${
                      active
                        ? "border-primary/60 bg-primary/5 text-foreground shadow-sm"
                        : "border-border/70 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={runBatch}
            disabled={running}
            size="lg"
            className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95 disabled:opacity-100 sm:w-auto"
          >
            {running ? (
              <>
                <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden /> Generating {activeTargets.length}...
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" /> Generate {activeTargets.length || ""} draft
                {activeTargets.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {hasResults && !running && unsaved.length > 1 && (
        <div className="flex justify-end">
          <Button onClick={handleSaveAll} className="w-full gap-1.5 sm:w-auto">
            <Save className="h-4 w-4" /> Save all {unsaved.length} to My posts
          </Button>
        </div>
      )}

      {hasResults && (
        <div ref={resultsRef} className="grid scroll-mt-20 gap-4 lg:grid-cols-2">
          {activeTargets.map((t) => {
            const card = cards[t.key];
            if (!card) return null;
            const Icon = t.icon;
            return (
              <Card key={t.key} className="border-border/60 shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 font-serif text-base">
                    <Icon className="h-4 w-4 text-primary" /> {t.label}
                  </CardTitle>
                  {card.status === "streaming" && (
                    <ThinkingOrb state="composing" size={20} theme="light" aria-label={`Generating ${t.label} draft`} />
                  )}
                  {card.status === "saved" && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-success">
                      <Check className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {card.status === "error" ? (
                    <p className="text-sm text-destructive">{card.error}</p>
                  ) : (
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/85">
                      {card.text || "..."}
                    </p>
                  )}
                  {card.status !== "streaming" && offerLinks.length > 0 &&
                    strayLinks(card.text, offerLinks).map((l) => (
                      <p key={l} className="break-all text-xs font-medium text-warning">Not one of your offer links: {l}</p>
                    ))}
                  {card.status === "done" || card.status === "saved" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSave(t)}
                        disabled={card.status === "saved"}
                        className="gap-1.5"
                      >
                        <Save className="h-3.5 w-3.5" />{" "}
                        {card.status === "saved" ? "Saved" : "Save to My posts"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(card.text, t.platform, topic)}
                        className="gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasResults && !running && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const unsaved = Object.values(cards).filter((c) => c.status === "done").length;
            if (
              unsaved > 0 &&
              !window.confirm(
                `Start over? ${unsaved} draft${unsaved === 1 ? " isn't" : "s aren't"} saved to My posts yet and will be lost.`,
              )
            )
              return;
            setCards({});
            navigate("/generate/batch", { replace: true });
          }}
          className="gap-1.5 text-muted-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start a new batch
        </Button>
      )}
    </div>
  );
}
