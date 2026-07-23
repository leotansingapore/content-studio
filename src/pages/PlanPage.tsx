import { useEffect, useMemo, useState } from "react";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import QuickTip from "@/components/QuickTip";
import CompetitorReference, {
  customInstagramRef,
  findCompetitorByHandle,
  parseInstagramInput,
  type CompetitorRef,
} from "@/components/CompetitorReference";
import {
  FUNNEL_STAGES,
  getFunnelStage,
  TRUST_DIMENSIONS,
  type FunnelStageId,
} from "@/data/funnelFramework";
import {
  EMPTY_POSITIONING,
  CADENCE_OPTIONS,
  loadPositioning,
  savePositioning,
  isPositioningUsable,
  parseTopics,
  type Positioning,
  type PlanAudience,
  type PlanPlatform,
} from "@/lib/positioning";
import {
  generatePlan,
  loadPlan,
  savePlan,
  clearPlan,
  planItemToGenerateUrl,
  planItemDate,
  upcomingMonday,
  type ContentPlan,
  type PlanItem,
} from "@/lib/contentPlan";
import {
  Target,
  Sparkles,
  Shuffle,
  Pencil,
  CheckCircle2,
  Circle,
  ArrowRight,
  Trash2,
  Calendar,
  Compass,
  ChevronDown,
} from "lucide-react";

const AUDIENCE_LABEL: Record<PlanAudience, string> = {
  "young-adult": "Young adult (21-27)",
  "working-adult": "Working adult (28-40)",
  parent: "Parent",
  "pre-retiree": "Pre-retiree (50-62)",
  general: "General",
};

const PLATFORM_LABEL: Record<PlanPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const PILLAR_LABEL: Record<string, string> = {
  interest: "Interest",
  identity: "Identity",
  topic: "Topic",
  market: "Market",
};

const FORMAT_LABEL: Record<string, string> = {
  carousel: "Carousel",
  "short-video": "Short video",
  "text-post": "Text post",
  story: "Story",
};

const CTA_LABEL: Record<string, string> = {
  "dm-keyword": "DM keyword",
  "comment-keyword": "Comment keyword",
  "save-share": "Save / share",
  "book-call": "15-min call",
  "open-question": "Open question",
};

const WEEK_OPTIONS = [1, 2, 4];

export default function PlanPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [positioning, setPositioning] = useState<Positioning>(EMPTY_POSITIONING);
  const [topicsRaw, setTopicsRaw] = useState("");
  const [fadsPaste, setFadsPaste] = useState("");
  const [competitors, setCompetitors] = useState<CompetitorRef[]>([]);
  const [weeks, setWeeks] = useState(2);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [editing, setEditing] = useState(true);

  // Load user + saved positioning + saved plan once.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      const savedPositioning = loadPositioning(id);
      if (savedPositioning) {
        setPositioning(savedPositioning);
        setTopicsRaw(savedPositioning.topics.join("\n"));
      }
      const savedPlan = loadPlan(id);
      if (savedPlan) {
        setPlan(savedPlan);
        setEditing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const usable = useMemo(
    () => isPositioningUsable({ ...positioning, topics: parseTopics(topicsRaw) }),
    [positioning, topicsRaw],
  );

  const prefillFromFads = () => {
    const text = fadsPaste.trim();
    if (!text) return;
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const next = { ...positioning };
    let nextTopics = topicsRaw;
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        (lower.startsWith("i help") || lower.includes("positioning")) &&
        !next.oneLiner
      ) {
        next.oneLiner = line.replace(/^positioning[:\-]?\s*/i, "");
      } else if (
        (lower.startsWith("topic") ||
          lower.startsWith("niche") ||
          line.includes(",")) &&
        !nextTopics
      ) {
        nextTopics = parseTopics(line.replace(/^(topics?|niche)[:\-]?\s*/i, "")).join(
          "\n",
        );
      } else if ((lower.startsWith("edge") || lower.startsWith("differ")) && !next.edge) {
        next.edge = line.replace(/^(edge|differentiation)[:\-]?\s*/i, "");
      } else if ((lower.startsWith("who") || lower.startsWith("audience")) && !next.audienceDetail) {
        next.audienceDetail = line.replace(/^(who|audience)[:\-]?\s*/i, "");
      }
    }
    if (!next.oneLiner && lines[0]) next.oneLiner = lines[0];
    setPositioning(next);
    if (nextTopics) setTopicsRaw(nextTopics);
    toast({
      title: "Prefilled from F.A.D.S.",
      description: "Review the fields below and adjust before generating.",
    });
  };

  const handleGenerate = () => {
    if (!userId) return;
    const topics = parseTopics(topicsRaw);
    const merged: Positioning = { ...positioning, topics };
    if (!isPositioningUsable(merged)) {
      toast({
        title: "Add a bit more positioning",
        description:
          "At least one topic and a one-liner or audience description so the plan isn't generic.",
        variant: "destructive",
      });
      return;
    }
    savePositioning(userId, merged);
    setPositioning(merged);
    const salt = plan ? plan.salt : 0;
    const newPlan = generatePlan(merged, {
      weeks,
      salt,
      competitors: competitors.map((c) => ({
        name: c.name,
        handle: c.handle,
        styleNotes: c.styleNotes,
      })),
    });
    savePlan(userId, newPlan);
    setPlan(newPlan);
    setEditing(false);
    toast({
      title: "Content plan ready",
      description: `${newPlan.items.length} posts mapped across the funnel. Draft them one at a time.`,
    });
  };

  const handleReshuffle = () => {
    if (!userId || !plan) return;
    const topics = parseTopics(topicsRaw);
    const merged: Positioning = { ...positioning, topics };
    const newPlan = generatePlan(merged, {
      weeks: plan.weeks,
      salt: plan.salt + 1,
      competitors: competitors.map((c) => ({
        name: c.name,
        handle: c.handle,
        styleNotes: c.styleNotes,
      })),
    });
    savePlan(userId, newPlan);
    setPlan(newPlan);
    toast({
      title: "Fresh angles",
      description: "Same positioning, new ideas. Posted ticks were reset.",
    });
  };

  const togglePosted = (itemId: string) => {
    if (!userId || !plan) return;
    const next: ContentPlan = {
      ...plan,
      items: plan.items.map((it) =>
        it.id === itemId ? { ...it, posted: !it.posted } : it,
      ),
    };
    savePlan(userId, next);
    setPlan(next);
  };

  const handleDeletePlan = () => {
    if (!userId) return;
    if (
      !window.confirm(
        "Delete this content plan? Your positioning stays; the mapped posts and posted ticks are removed.",
      )
    )
      return;
    clearPlan(userId);
    setPlan(null);
    setEditing(true);
  };

  // Push every plan slot onto the calendar as a scheduled post (dated from the
  // upcoming Monday). Re-running updates the same slots instead of duplicating.
  const handleAddToCalendar = () => {
    if (!userId || !plan) return;
    const week1 = upcomingMonday(new Date());
    let count = 0;
    for (const item of plan.items) {
      const date = planItemDate(item, week1);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const entry: DraftEntry = {
        id: `plan_${item.id}`,
        createdAt: new Date().toISOString(),
        hook: item.hook || item.angle,
        draft: "",
        pillar: item.pillar,
        pillarDetail: item.pillarDetail,
        audience: item.audience,
        format: item.format,
        platform: item.platform,
        ctaType: item.ctaType,
        vibeSourceId: item.seedId,
        status: "scheduled",
        scheduledFor: iso,
      };
      upsertDraft(userId, entry);
      count++;
    }
    toast({
      title: `${count} posts added to your calendar`,
      description: "Open one to write it — it stays on its scheduled day.",
    });
    navigate("/calendar");
  };

  const addCompetitor = (ref: CompetitorRef | null) => {
    if (!ref) return;
    setCompetitors((prev) =>
      prev.some((c) => c.id === ref.id) || prev.length >= 3
        ? prev
        : [...prev, ref],
    );
  };

  // ?competitor=<advisor id or handle> — arrives from "Use as competitor in
  // my plan" on the Analytics creator lookup. Consumed once, then stripped.
  useEffect(() => {
    const param = searchParams.get("competitor");
    if (!param) return;
    // Curated creators match by id/handle; anything else that parses as an
    // IG handle (live-analyzed accounts) becomes a custom reference.
    let found = findCompetitorByHandle(param);
    if (!found) {
      const ig = parseInstagramInput(param);
      if (ig) found = customInstagramRef(ig.handle, ig.url);
    }
    if (found) {
      addCompetitor(found);
      setEditing(true);
      toast({
        title: `Referencing ${found.name}`,
        description: "They're set as a competitor for your next plan build.",
      });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("competitor");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("competitor")]);

  const postedCount = plan ? plan.items.filter((i) => i.posted).length : 0;
  const totalCount = plan ? plan.items.length : 0;
  const pct = totalCount > 0 ? Math.round((postedCount / totalCount) * 100) : 0;

  const itemsByWeek = useMemo(() => {
    if (!plan) return [] as { week: number; items: PlanItem[] }[];
    const map = new Map<number, PlanItem[]>();
    for (const it of plan.items) {
      if (!map.has(it.week)) map.set(it.week, []);
      map.get(it.week)!.push(it);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, items]) => ({ week, items }));
  }, [plan]);

  // ---------- Setup view (F.A.D.S. positioning) ----------
  if (editing || !plan) {
    return (
      <div className="space-y-6">
        <SectionTabs tabs={PIPELINE_TABS} />
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="bg-gradient-hero px-5 py-5 text-primary-foreground sm:px-6">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-90">
              <Compass className="h-3.5 w-3.5" /> Content system
            </div>
            <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight">
              Turn your positioning into a week of posts
            </h2>
            <p className="mt-1 max-w-2xl text-sm opacity-90">
              Start with your F.A.D.S. output — who you serve and your edge. The
              studio builds a funnel-balanced plan: Attraction to get seen,
              Building Trust to earn credibility, Conversion to invite the next
              step.
            </p>
          </div>
        </Card>

        <QuickTip context="plan" />

        <details className="group rounded-xl border border-border/60 bg-card shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="font-serif text-lg font-semibold text-foreground">
                The two frameworks behind your plan
              </p>
              <p className="text-xs text-muted-foreground">
                Optional background — how the plan balances trust and funnel
                stage. Skip it and just build.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-5 pb-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {TRUST_DIMENSIONS.map((d) => (
                <div
                  key={d.id}
                  className={`rounded-xl border p-3 ${d.accent}`}
                >
                  <p className="text-sm font-semibold">
                    {d.label} — {d.heading}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.blurb}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.blocks.map((b) => (
                      <span
                        key={b}
                        className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {FUNNEL_STAGES.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-2.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${s.accent.badge}`}
                    >
                      {s.letter}
                    </span>
                    <span className="text-xs font-semibold">{s.label}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {s.tagline}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </details>

        {usable ? (
          // Positioning is already set — keep the shortcut one line tall.
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
            <p className="text-foreground/90">
              <span className="font-semibold text-success">Positioning set.</span>{" "}
              Tweak the fields below, or refine it in the{" "}
              <Link to="/fads" className="font-semibold text-primary hover:underline">
                F.A.D.S. tool
              </Link>{" "}
              and hit Send to Plan again.
            </p>
          </div>
        ) : (
        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Paste your F.A.D.S. output
            </CardTitle>
            <CardDescription>
              Optional shortcut. Paste the audience / edge / positioning you
              wrote in the F.A.D.S. tool and we'll prefill the fields. Or just
              fill them in below. Don't have it yet?{" "}
              <Link
                to="/fads"
                className="font-semibold text-primary hover:underline"
              >
                Build it in the F.A.D.S. tool →
              </Link>{" "}
              It's built into the studio now — "Send to Plan" on its output tab
              fills these fields for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={fadsPaste}
              onChange={(e) => setFadsPaste(e.target.value)}
              placeholder={
                "e.g.\nI help young families with kids under 7 protect their income without overpaying.\nTopics: critical illness, hospital plans, CPF for parents, term vs whole life\nEdge: ex-nurse turned FC — I've seen what underinsurance does up close"
              }
              rows={4}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={prefillFromFads}
              disabled={!fadsPaste.trim()}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" /> Prefill from this
            </Button>
          </CardContent>
        </Card>
        )}

        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Your positioning
            </CardTitle>
            <CardDescription>
              A clear niche is what makes every idea concrete instead of generic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="one-liner">One-line positioning</Label>
              <Textarea
                id="one-liner"
                value={positioning.oneLiner}
                onChange={(e) =>
                  setPositioning((p) => ({ ...p, oneLiner: e.target.value }))
                }
                placeholder="I help [who] do [what] so they can [outcome]."
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Audience / life-stage</Label>
                <Select
                  value={positioning.audience}
                  onValueChange={(v) =>
                    setPositioning((p) => ({ ...p, audience: v as PlanAudience }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIENCE_LABEL) as PlanAudience[]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUDIENCE_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aud-detail">Who exactly (one line)</Label>
                <Input
                  id="aud-detail"
                  value={positioning.audienceDetail}
                  onChange={(e) =>
                    setPositioning((p) => ({
                      ...p,
                      audienceDetail: e.target.value,
                    }))
                  }
                  placeholder="e.g. fresh grads earning $3.5-4.5K"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topics">
                Topics you teach{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (one per line or comma-separated)
                </span>
              </Label>
              <Textarea
                id="topics"
                value={topicsRaw}
                onChange={(e) => setTopicsRaw(e.target.value)}
                placeholder={"CPF SA top-ups\ncritical illness\nhospital plans\nretirement income"}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edge">Your edge / differentiation</Label>
              <Textarea
                id="edge"
                value={positioning.edge}
                onChange={(e) =>
                  setPositioning((p) => ({ ...p, edge: e.target.value }))
                }
                placeholder="Why you, not the next advisor? A background, a result, a way of working."
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Primary platform</Label>
                <Select
                  value={positioning.platform}
                  onValueChange={(v) =>
                    setPositioning((p) => ({ ...p, platform: v as PlanPlatform }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLATFORM_LABEL) as PlanPlatform[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Posts per week</Label>
                <Select
                  value={String(positioning.cadence)}
                  onValueChange={(v) =>
                    setPositioning((p) => ({ ...p, cadence: Number(v) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CADENCE_OPTIONS.map((c) => (
                      <SelectItem key={c} value={String(c)}>
                        {c} posts / week
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Reference competitors{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (optional)
              </span>
            </CardTitle>
            <CardDescription>
              Pick up to 3 creators whose angles you want to learn from. The plan
              will borrow their structure — in your voice, never copied.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {competitors.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {competitors.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary"
                  >
                    {c.name}
                    {c.name !== c.handle && (
                      <span className="font-mono text-muted-foreground">
                        {c.handle}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setCompetitors((prev) =>
                          prev.filter((x) => x.id !== c.id),
                        )
                      }
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${c.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {competitors.length < 3 && (
              <CompetitorReference selectedId={null} onSelect={addCompetitor} />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm">Plan length</Label>
            <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_OPTIONS.map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {w} week{w > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            {plan && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setEditing(false)}
                className="gap-1.5"
              >
                Back to plan
              </Button>
            )}
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={!usable || !userId}
              className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" />
              Build my content plan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Plan view ----------
  return (
    <div className="space-y-6">
      <SectionTabs tabs={PIPELINE_TABS} />
      {/* Accountability header */}
      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="bg-gradient-hero px-5 py-5 text-primary-foreground sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-90">
                <Target className="h-3.5 w-3.5" /> Your content plan
              </div>
              <h2 className="font-serif text-2xl font-semibold leading-tight">
                {plan.cadence} posts / week · {plan.weeks} week
                {plan.weeks > 1 ? "s" : ""}
              </h2>
              {plan.oneLiner && (
                <p className="max-w-2xl text-sm opacity-90">{plan.oneLiner}</p>
              )}
            </div>
            <div className="text-right">
              <div className="font-serif text-3xl font-semibold leading-none">
                {postedCount}
                <span className="text-lg opacity-70">/{totalCount}</span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.14em] opacity-90">
                posted
              </div>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-primary-foreground/20">
            <div
              className="h-full rounded-full bg-primary-foreground transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] opacity-90">
            {pct === 100
              ? "Every slot posted. That's a full funnel shipped — reshuffle for next week."
              : `${pct}% shipped. Draft the next one and check it off when it's live.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap gap-3">
            {FUNNEL_STAGES.map((s) => {
              const n = plan.items.filter((i) => i.stage === s.id).length;
              return (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
                >
                  <span className={`h-2 w-2 rounded-full ${s.accent.dot}`} />
                  {s.letter} · {s.label}
                  <span className="text-muted-foreground/70">({n})</span>
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleAddToCalendar}
              className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95"
            >
              <Calendar className="h-3.5 w-3.5" /> Add week to calendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReshuffle}
              className="gap-1.5"
            >
              <Shuffle className="h-3.5 w-3.5" /> Reshuffle
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit positioning
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeletePlan}
              className="gap-1.5 text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      <QuickTip context="plan" />

      {itemsByWeek.map(({ week, items }) => {
        const weekPosted = items.filter((i) => i.posted).length;
        return (
          <div key={week} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-serif text-lg font-semibold">Week {week}</h3>
              <span className="text-xs text-muted-foreground">
                {weekPosted}/{items.length} posted
              </span>
            </div>
            <div className="grid gap-3">
              {items.map((item) => {
                const stage = getFunnelStage(item.stage as FunnelStageId);
                return (
                  <Card
                    key={item.id}
                    className={`border-border/60 shadow-card transition-all ${
                      item.posted ? "opacity-70" : "hover:border-primary/40"
                    }`}
                  >
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                      <button
                        type="button"
                        onClick={() => togglePosted(item.id)}
                        className="mt-0.5 shrink-0 self-start text-primary"
                        aria-label={item.posted ? "Mark not posted" : "Mark posted"}
                        title={item.posted ? "Posted" : "Mark posted"}
                      >
                        {item.posted ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/50 hover:text-primary" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${stage.accent.badge}`}
                          >
                            {stage.letter} · {stage.label}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {item.dayLabel}
                          </span>
                          <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                            {FORMAT_LABEL[item.format] ?? item.format}
                          </span>
                          <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                            {PLATFORM_LABEL[item.platform as PlanPlatform] ??
                              item.platform}
                          </span>
                          <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                            {PILLAR_LABEL[item.pillar] ?? item.pillar}
                          </span>
                        </div>

                        <p
                          className={`text-sm font-medium leading-snug ${
                            item.posted
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }`}
                        >
                          {item.angle}
                        </p>
                        <p className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-[11px] italic leading-snug text-muted-foreground">
                          Hook idea: {item.hook}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          <span>
                            CTA:{" "}
                            <span className="font-medium text-foreground/80">
                              {CTA_LABEL[item.ctaType] ?? item.ctaType}
                            </span>
                          </span>
                          {item.competitorHandle && (
                            <span>
                              Angle ref:{" "}
                              <span className="font-mono text-foreground/80">
                                {item.competitorHandle}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 self-stretch sm:self-center">
                        <Button
                          asChild
                          size="sm"
                          variant={item.posted ? "outline" : "default"}
                          className={`w-full gap-1.5 sm:w-auto ${
                            item.posted
                              ? ""
                              : "bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
                          }`}
                        >
                          <Link to={planItemToGenerateUrl(item)}>
                            Draft in Studio
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
