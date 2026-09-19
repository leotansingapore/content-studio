// Carousel maker (/carousel): turns a finished post into branded Instagram /
// LinkedIn slides and downloads them as 1080x1350 PNGs. Text splitting is in
// src/lib/carousel.ts, drawing in carouselLayout.ts / carouselRender.ts, and
// "Tighten with AI" calls the carousel-copy edge function (carouselCopy.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardPaste,
  Download,
  GalleryHorizontalEnd,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { scanCompliance } from "@/lib/compliance";
import {
  BRAND_PRESETS,
  DEFAULT_BRAND,
  DEFAULT_CTA,
  MAX_HANDLE_CHARS,
  MAX_NAME_CHARS,
  MAX_SLIDES,
  MIN_SLIDES,
  WORDS_PER_SLIDE,
  addSlide,
  applyCopy,
  countWords,
  draftLabel,
  draftsWithText,
  loadBrand,
  moveSlide,
  newSlideId,
  normalizeHandle,
  normalizeHex,
  removeSlide,
  saveBrand,
  slideFileName,
  slideRole,
  splitDraftIntoSlides,
  type CarouselBrand,
  type Slide,
  type SplitResult,
} from "@/lib/carousel";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, downloadBlob, svgDataUrl, svgToPng } from "@/lib/carouselRender";
import { CarouselCopyError, tightenSlides } from "@/lib/carouselCopy";

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const ROLE_LABEL = { cover: "Cover", point: "Point", cta: "Call to action" } as const;

type Source = { kind: "draft"; id: string } | { kind: "paste" };
type AiState =
  | { status: "idle" | "loading" }
  | { status: "error" | "limit" | "unavailable"; message: string };
type SplitInfo = Omit<SplitResult, "slides">;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const WARN_BOX = "border-amber-200 bg-amber-50 text-amber-900";

export default function CarouselPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  /** Posts that are still just a hook (board ideas), which can't make slides. */
  const [ideaOnly, setIdeaOnly] = useState(0);
  const [mode, setMode] = useState<"drafts" | "paste">("drafts");
  const [draftId, setDraftId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Source | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [split, setSplit] = useState<SplitInfo | null>(null);
  const [byHand, setByHand] = useState(false);
  const [edited, setEdited] = useState(false);
  const [fileBase, setFileBase] = useState("carousel");
  const [platform, setPlatform] = useState<"instagram" | "linkedin">("instagram");
  const [brand, setBrand] = useState<CarouselBrand>(DEFAULT_BRAND);
  const [hexInput, setHexInput] = useState(DEFAULT_BRAND.color);
  const [ai, setAi] = useState<AiState>({ status: "idle" });
  const [beforeAi, setBeforeAi] = useState<Slide[] | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const measure = useMemo(() => createCanvasMeasure(), []);
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      const id = user?.id ?? null;
      setUserId(id);
      const all = loadDrafts(id);
      const withText = draftsWithText(all);
      setDrafts(withText);
      setIdeaOnly(all.length - withText.length);
      const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
      const accounts = loadSocialAccounts(id);
      const initial = loadBrand(id) ?? {
        ...DEFAULT_BRAND,
        name: String(meta.full_name ?? meta.name ?? "").slice(0, MAX_NAME_CHARS),
        handle: normalizeHandle(accounts.instagram?.handle ?? accounts.tiktok?.handle ?? ""),
      };
      setBrand(initial);
      setHexInput(initial.color);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const build = (source: Source) => {
    let text = "";
    let hook = "";
    let base = "";
    let nextPlatform: "instagram" | "linkedin" = "instagram";
    const params = new URLSearchParams(searchParams);
    if (source.kind === "draft") {
      const d = drafts.find((x) => x.id === source.id);
      if (!d) return;
      text = d.draft;
      hook = d.hook;
      base = d.hook || d.draft;
      nextPlatform = d.platform === "linkedin" ? "linkedin" : "instagram";
      setDraftId(d.id);
      params.set("draft", d.id);
    } else {
      text = pasteText;
      base = pasteText.split("\n").find((l) => l.trim()) ?? "";
      params.delete("draft");
    }
    if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true });
    const { slides: made, ...info } = splitDraftIntoSlides(text, { hook });
    setSlides(made);
    setSplit(info);
    setByHand(false);
    setEdited(false);
    setPending(null);
    setBeforeAi(null);
    setAi({ status: "idle" });
    setFileBase(base || "carousel");
    setPlatform(nextPlatform);
    setNotice(null);
  };

  const requestSource = (source: Source) => {
    if (edited && slides.length > 0) setPending(source);
    else build(source);
  };

  // /carousel?draft=<id> (from My posts) opens straight onto that post's slides.
  useEffect(() => {
    if (!ready || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const id = searchParams.get("draft");
    if (!id) return;
    if (drafts.some((d) => d.id === id)) {
      build({ kind: "draft", id });
      return;
    }
    const exists = loadDrafts(userId).some((d) => d.id === id);
    setNotice(
      exists
        ? "That post is still just an idea, with no written text to turn into slides. Write it first, or pick another post."
        : "We couldn't find that post. Pick one of your posts below.",
    );
    const params = new URLSearchParams(searchParams);
    params.delete("draft");
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const change = (update: (prev: Slide[]) => Slide[]) => {
    setSlides(update);
    setEdited(true);
  };

  const editSlide = (id: string, patch: Partial<Pick<Slide, "title" | "body">>) =>
    change((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const focusEditor = (id: string) => {
    document.getElementById(`slide-editor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(`slide-title-${id}`)?.focus({ preventScroll: true });
  };

  const addBlankSlide = () => {
    const id = newSlideId();
    change((prev) => addSlide(prev, { id, title: "", body: "" }));
    setTimeout(() => focusEditor(id), 50);
  };

  const startByHand = () => {
    setByHand(true);
    if (slides.length < MIN_SLIDES) {
      setSlides([
        { id: newSlideId(), title: slides[0]?.title ?? "", body: slides[0]?.body ?? "" },
        { id: newSlideId(), ...DEFAULT_CTA },
      ]);
    }
  };

  const updateBrand = (patch: Partial<CarouselBrand>) => {
    const next = { ...brand, ...patch };
    setBrand(next);
    if (userId) saveBrand(userId, next);
  };

  const pickColor = (color: string) => {
    updateBrand({ color });
    setHexInput(color);
  };

  const layouts = useMemo(
    () =>
      slides.map((s, i) =>
        layoutSlide({ title: s.title, body: s.body, index: i, total: slides.length, brand }, measure),
      ),
    [slides, brand, measure],
  );
  const images = useMemo(
    () =>
      layouts.map((layout) => {
        const svg = renderSvg(layout);
        return { svg, url: svgDataUrl(svg) };
      }),
    [layouts],
  );
  const flags = useMemo(() => slides.map((s) => scanCompliance(`${s.title}\n${s.body}`)), [slides]);
  const flagTotal = flags.reduce((n, f) => n + f.length, 0);

  const exportSlides = async (indexes: number[]) => {
    if (exporting || indexes.length === 0) return;
    const jobs = indexes.map((i) => ({ svg: images[i].svg, name: slideFileName(fileBase, i) }));
    setExporting({ done: 0, total: jobs.length });
    try {
      for (let k = 0; k < jobs.length; k++) {
        const blob = await svgToPng(jobs[k].svg);
        downloadBlob(blob, jobs[k].name);
        setExporting({ done: k + 1, total: jobs.length });
        // Browsers drop downloads that all start at the same moment.
        if (k < jobs.length - 1) await pause(400);
      }
      toast({
        title: jobs.length === 1 ? "Slide downloaded" : `${jobs.length} slides downloaded`,
        description: "They're in your Downloads folder, numbered in order.",
      });
    } catch (err) {
      console.error("carousel export failed", err);
      toast({
        title: "Couldn't create the images",
        description: "Try again, or try another browser.",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  const tighten = async () => {
    if (ai.status === "loading" || slides.length < MIN_SLIDES) return;
    const empty = slides.findIndex((s) => !s.title.trim() && !s.body.trim());
    if (empty >= 0) {
      setAi({ status: "error", message: `Slide ${empty + 1} is empty. Add text or delete it first.` });
      return;
    }
    const snapshot = slides;
    setAi({ status: "loading" });
    try {
      const copy = await tightenSlides(snapshot, platform);
      setBeforeAi(snapshot);
      setSlides(applyCopy(snapshot, copy));
      setEdited(true);
      setAi({ status: "idle" });
      toast({
        title: "Slides tightened",
        description: "Read them through before you post. Undo brings your version back.",
      });
    } catch (err) {
      const e =
        err instanceof CarouselCopyError
          ? err
          : new CarouselCopyError("failed", "Couldn't tighten the slides. Try again in a minute.");
      const status = e.code === "daily_limit" ? "limit" : e.code === "unavailable" ? "unavailable" : "error";
      setAi({ status, message: e.message });
    }
  };

  const undoAi = () => {
    if (!beforeAi) return;
    setSlides(beforeAi);
    setBeforeAi(null);
  };

  const busy = ai.status === "loading";
  const exportBusy = exporting !== null;
  const tooShort = split !== null && split.tooShort && !byHand;
  const showEditor = slides.length > 0 && !tooShort;
  const aiMessage = ai.status === "error" || ai.status === "limit" || ai.status === "unavailable" ? ai : null;
  const presetActive = BRAND_PRESETS.some((p) => p.color === brand.color);

  return (
    <div className="space-y-6">
      <SectionTabs tabs={WRITE_TABS} />
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <GalleryHorizontalEnd className="h-6 w-6 shrink-0 text-primary" /> Carousel maker
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Turn a finished post into swipeable slides for Instagram or LinkedIn, with your name and brand
          colour on every slide. Download them as 1080 × 1350 images, ready to upload.
        </p>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Choose a post</CardTitle>
          <CardDescription>
            Your hook becomes the cover, each point gets its own slide, and your call to action closes it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="group"
            aria-label="Where the post comes from"
            className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
          >
            {(
              [
                ["drafts", "From My posts"],
                ["paste", "Paste text"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {notice && (
            <p role="status" className={`rounded-md border px-3 py-2 text-xs ${WARN_BOX}`}>
              {notice}
            </p>
          )}

          {mode === "drafts" ? (
            !ready ? (
              <p className="text-sm text-muted-foreground">Loading your posts…</p>
            ) : drafts.length === 0 ? (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 sm:flex-row sm:items-center">
                <p className="flex-1 text-sm text-muted-foreground">
                  {ideaOnly > 0
                    ? `Your ${ideaOnly === 1 ? "post is" : `${ideaOnly} posts are`} still ${
                        ideaOnly === 1 ? "an idea" : "ideas"
                      } with only a hook, so there's no text to turn into slides yet. Write ${
                        ideaOnly === 1 ? "it" : "one"
                      } out first, or paste a post you already have.`
                    : "You don't have any written posts yet. Write one first, then turn it into a carousel. Or paste a post you already have."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="gap-1.5">
                    <Link to="/generate">
                      <Pencil className="h-3.5 w-3.5" /> Write a post
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMode("paste")} className="gap-1.5">
                    <ClipboardPaste className="h-3.5 w-3.5" /> Paste text
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="carousel-draft">Post</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={draftId} onValueChange={(id) => requestSource({ kind: "draft", id })}>
                    <SelectTrigger id="carousel-draft" className="min-w-0 flex-1">
                      <SelectValue placeholder="Pick one of your posts" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      {drafts.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {draftLabel(d, 60)}
                          {PLATFORM_LABEL[d.platform] ? ` · ${PLATFORM_LABEL[d.platform]}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {draftId && edited && (
                    <Button
                      variant="outline"
                      onClick={() => requestSource({ kind: "draft", id: draftId })}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Start over
                    </Button>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <Label htmlFor="carousel-paste">Post text</Label>
              <Textarea
                id="carousel-paste"
                rows={8}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  'Paste a finished post. Put each point in its own paragraph or bullet.\n\nThe first line becomes the cover, and a closing line like "DM me PLAN" becomes the last slide.'
                }
              />
              <Button
                onClick={() => requestSource({ kind: "paste" })}
                disabled={!pasteText.trim()}
                className="gap-1.5"
              >
                <GalleryHorizontalEnd className="h-4 w-4" /> Make slides
              </Button>
            </div>
          )}

          {pending && (
            <div
              role="alert"
              className={`flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center ${WARN_BOX}`}
            >
              <p className="flex-1">Replace your edited slides with this post? Your edits will be lost.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => build(pending)}>
                  Replace
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPending(null)}>
                  Keep editing
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {tooShort && split && (
        <Card className="border-amber-200 bg-amber-50/60 shadow-card">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5 md:p-5">
            <TriangleAlert className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div className="flex-1 space-y-1" role="status">
              <p className="text-sm font-semibold text-foreground">This post is too short for a carousel</p>
              <p className="text-sm text-muted-foreground">
                A carousel needs at least 2 points after the hook, and we found{" "}
                {split.points === 0 ? "none" : "only 1"}. Pick a longer post, paste more text, or build the
                slides yourself.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={startByHand} className="shrink-0 gap-1.5 bg-background">
              <Pencil className="h-3.5 w-3.5" /> Build it by hand
            </Button>
          </CardContent>
        </Card>
      )}

      {showEditor && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <Card className="border-border/60 shadow-card">
              <CardHeader>
                <CardTitle className="font-serif text-xl">Your brand</CardTitle>
                <CardDescription>Shown on every slide and saved for next time.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label id="carousel-colour-label">Brand colour</Label>
                  <div role="group" aria-labelledby="carousel-colour-label" className="flex flex-wrap items-center gap-2">
                    {BRAND_PRESETS.map((p) => {
                      const active = brand.color === p.color;
                      return (
                        <button
                          key={p.color}
                          type="button"
                          onClick={() => pickColor(p.color)}
                          aria-pressed={active}
                          aria-label={p.name}
                          title={p.name}
                          style={{ backgroundColor: p.color }}
                          className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            active ? "ring-2 ring-foreground" : "hover:scale-105"
                          }`}
                        />
                      );
                    })}
                    <label
                      className={`flex h-8 items-center gap-1.5 rounded-full border px-1.5 text-xs text-muted-foreground ${
                        presetActive ? "border-border" : "border-foreground"
                      }`}
                    >
                      <input
                        type="color"
                        value={brand.color.toLowerCase()}
                        onChange={(e) => pickColor(normalizeHex(e.target.value) ?? brand.color)}
                        aria-label="Custom colour"
                        className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                      />
                      <span className="pr-1">Custom</span>
                    </label>
                    <Input
                      value={hexInput}
                      maxLength={7}
                      aria-label="Colour hex code"
                      onChange={(e) => {
                        setHexInput(e.target.value);
                        const hex = normalizeHex(e.target.value);
                        if (hex && e.target.value.replace("#", "").length === 6) updateBrand({ color: hex });
                      }}
                      onBlur={() => {
                        const hex = normalizeHex(hexInput);
                        if (hex) pickColor(hex);
                        else setHexInput(brand.color);
                      }}
                      className="h-8 w-24 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="carousel-name">Display name</Label>
                    <Input
                      id="carousel-name"
                      value={brand.name}
                      maxLength={MAX_NAME_CHARS}
                      onChange={(e) => updateBrand({ name: e.target.value })}
                      placeholder="Your name"
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="carousel-handle">Handle</Label>
                    <Input
                      id="carousel-handle"
                      value={brand.handle}
                      maxLength={MAX_HANDLE_CHARS}
                      onChange={(e) => updateBrand({ handle: e.target.value })}
                      onBlur={() => {
                        const clean = normalizeHandle(brand.handle);
                        if (clean !== brand.handle) updateBrand({ handle: clean });
                      }}
                      placeholder="@yourhandle"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-card">
              <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle className="font-serif text-xl">Slides</CardTitle>
                  <CardDescription>Edit the words, reorder, or add and remove slides.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {beforeAi && !busy && (
                    <Button size="sm" variant="ghost" onClick={undoAi} className="gap-1.5 text-muted-foreground">
                      <Undo2 className="h-3.5 w-3.5" /> Undo AI changes
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={tighten}
                    disabled={busy || ai.status === "limit"}
                    className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 disabled:opacity-60"
                  >
                    {busy ? (
                      <>
                        <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden /> Tightening…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" /> Tighten with AI
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {busy && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Rewriting your slides to be shorter and MAS-safe. This takes a few seconds.
                  </p>
                )}
                {aiMessage && (
                  <p
                    role="alert"
                    className={`rounded-md border px-3 py-2 text-xs ${
                      aiMessage.status === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : WARN_BOX
                    }`}
                  >
                    {aiMessage.message}
                    {aiMessage.status === "limit" ? " You can still edit the slides by hand." : ""}
                  </p>
                )}
                {split && split.dropped > 0 && (
                  <p className={`rounded-md border px-3 py-2 text-xs ${WARN_BOX}`}>
                    Your post had {split.dropped} more {split.dropped === 1 ? "point" : "points"} than fit in{" "}
                    {MAX_SLIDES} slides, so {split.dropped === 1 ? "it's" : "they're"} left out. Swap{" "}
                    {split.dropped === 1 ? "it" : "them"} in by hand if {split.dropped === 1 ? "it matters" : "they matter"} more.
                  </p>
                )}
                {split && !split.ctaFromDraft && !edited && (
                  <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Your post doesn't end with a call to action, so the last slide has a simple one. Make it yours.
                  </p>
                )}
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                    flagTotal ? WARN_BOX : "border-success/30 bg-success/5 text-foreground"
                  }`}
                >
                  {flagTotal ? (
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                  )}
                  <span>
                    {flagTotal
                      ? `${flagTotal} wording ${flagTotal === 1 ? "flag" : "flags"} against MAS advertising rules. See the marked ${flagTotal === 1 ? "slide" : "slides"} below.`
                      : "No compliance flags in the slide text. Still read it through before you post."}
                  </span>
                </div>

                <ol className="space-y-3">
                  {slides.map((s, i) => {
                    const role = slideRole(i, slides.length);
                    const words = countWords(s.body);
                    const slideFlags = flags[i] ?? [];
                    return (
                      <li
                        key={s.id}
                        id={`slide-editor-${s.id}`}
                        className="space-y-2 rounded-xl border border-border/70 bg-card p-3 sm:p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">Slide {i + 1}</span>
                          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {ROLE_LABEL[role]}
                          </span>
                          {slideFlags.length > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              {slideFlags.length} {slideFlags.length === 1 ? "flag" : "flags"}
                            </span>
                          )}
                          <div className="ml-auto flex items-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => change((prev) => moveSlide(prev, i, -1))}
                              disabled={i === 0 || busy}
                              aria-label={`Move slide ${i + 1} up`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => change((prev) => moveSlide(prev, i, 1))}
                              disabled={i === slides.length - 1 || busy}
                              aria-label={`Move slide ${i + 1} down`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => change((prev) => removeSlide(prev, i))}
                              disabled={slides.length <= MIN_SLIDES || busy}
                              aria-label={`Delete slide ${i + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`slide-title-${s.id}`} className="text-xs text-muted-foreground">
                            {role === "cover" ? "Hook" : "Title"}
                          </Label>
                          <Input
                            id={`slide-title-${s.id}`}
                            value={s.title}
                            onChange={(e) => editSlide(s.id, { title: e.target.value })}
                            disabled={busy}
                            placeholder={role === "cover" ? "The hook that makes people swipe" : "A short title"}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor={`slide-body-${s.id}`} className="text-xs text-muted-foreground">
                              Text
                            </Label>
                            <span
                              className={`text-[11px] tabular-nums ${
                                words > WORDS_PER_SLIDE ? "font-semibold text-amber-800" : "text-muted-foreground"
                              }`}
                            >
                              {words}/{WORDS_PER_SLIDE} words
                            </span>
                          </div>
                          <Textarea
                            id={`slide-body-${s.id}`}
                            autoResize
                            rows={2}
                            value={s.body}
                            onChange={(e) => editSlide(s.id, { body: e.target.value })}
                            disabled={busy}
                            placeholder={
                              role === "cover" ? "Optional line under the hook" : "One point, in a sentence or two"
                            }
                            className="min-h-[64px]"
                          />
                        </div>
                        {layouts[i]?.overflow && (
                          <p className="flex items-start gap-1.5 text-xs text-amber-800">
                            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            Too much text to fit, so the slide cuts it off. Shorten it.
                          </p>
                        )}
                        {slideFlags.length > 0 && (
                          <ul className="space-y-1">
                            {slideFlags.map((f) => (
                              <li
                                key={f.id}
                                className={`rounded-md border px-2 py-1 text-[11px] ${
                                  f.severity === "error"
                                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                                    : WARN_BOX
                                }`}
                              >
                                <span className="font-semibold">"{f.match}"</span>: {f.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addBlankSlide}
                    disabled={slides.length >= MAX_SLIDES || busy}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add a slide
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {slides.length >= MAX_SLIDES
                      ? `${MAX_SLIDES} slides is the most a carousel should have.`
                      : slides.length < 5
                        ? "Carousels do best with 5 to 10 slides."
                        : ""}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 lg:sticky lg:top-6">
            <Card className="border-border/60 shadow-card">
              <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle className="font-serif text-xl">Preview</CardTitle>
                  <CardDescription>
                    {slides.length} slides, 1080 × 1350 PNG each.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => exportSlides(slides.map((_, i) => i))}
                  disabled={exportBusy || busy}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporting && exporting.total > 1
                    ? `Exporting ${Math.min(exporting.done + 1, exporting.total)} of ${exporting.total}…`
                    : "Download all"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {exporting && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Creating slide {Math.min(exporting.done + 1, exporting.total)} of {exporting.total}.
                    {exporting.total > 1 ? " Your browser may ask to allow multiple downloads." : ""}
                  </p>
                )}
                <ul className="grid grid-cols-2 gap-3 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
                  {images.map((img, i) => (
                    <li key={slides[i].id} className="min-w-0 space-y-1">
                      <button
                        type="button"
                        onClick={() => focusEditor(slides[i].id)}
                        aria-label={`Edit slide ${i + 1}`}
                        className="block w-full overflow-hidden rounded-md border border-border/70 shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img
                          src={img.url}
                          alt={`Slide ${i + 1}: ${slides[i].title || slides[i].body}`.slice(0, 140)}
                          width={1080}
                          height={1350}
                          className="block aspect-[4/5] h-auto w-full"
                        />
                      </button>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          {i + 1}/{slides.length}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => exportSlides([i])}
                          disabled={exportBusy || busy}
                          aria-label={`Download slide ${i + 1}`}
                          className="h-7 gap-1 px-2 text-[11px]"
                        >
                          <Download className="h-3 w-3" /> PNG
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
