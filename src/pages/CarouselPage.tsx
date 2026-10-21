// Carousel maker (/carousel): turns a finished post into branded Instagram /
// LinkedIn slides and downloads them as 1080x1350 PNGs. Text splitting is in
// src/lib/carousel.ts, drawing in carouselLayout.ts / carouselRender.ts, and
// "Tighten with AI" calls the carousel-copy edge function (carouselCopy.ts). Leo also gets one slide at a time
// (?view=one&slide=), Rewrite this slide (SlideFields.tsx), Duplicate, and Undo and Redo for every slide change
// (carouselHistory.ts).

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  FileText,
  GalleryHorizontalEnd,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import CopyLinkButton from "@/components/CopyLinkButton";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { CAROUSEL_DESIGNS, COMPARE_TABS, links, type CarouselDesign } from "@/lib/links";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUsesLeft } from "@/lib/aiUsage";
import PriceChip from "@/components/PriceChip";
import { reasonText } from "@/lib/prices";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { loadDrafts, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { streamOnePost } from "@/lib/batchGenerate";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { stripDashes } from "@/lib/plainText";
import { textPostBetter } from "@/lib/writingJudge";
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
  addSlide,
  applyCopy,
  duplicateSlide,
  draftLabel,
  draftsWithText,
  draftToOpen,
  loadBrand,
  moveSlide,
  newSlideId,
  normalizeHandle,
  normalizeHex,
  recapFits,
  removeSlide,
  restoreSlide,
  saveBrand,
  slideFileName,
  loadCarousels,
  removeCarousel,
  saveCarousel,
  type SavedCarousel,
  SLIDE_IMAGE_KEY,
  slideRole,
  splitDraftIntoSlides,
  withRecap,
  type CarouselBrand,
  type Slide,
  type SplitResult,
  CAROUSEL_SIZES,
  type CarouselSize,
} from "@/lib/carousel";
import { DESIGNS, SLIDE_SIZES, designLook, isDesign, isSize, slideImage } from "@/lib/carouselDesigns";
import { callFn } from "@/lib/edgeFn";
import { SLIDE_FONTS, layoutSlide, renderSvg, type SlideFont, type SlidePaper } from "@/lib/carouselLayout";
import { createCanvasMeasure, downloadBlob, svgDataUrl, svgToJpeg, svgToPng } from "@/lib/carouselRender";
import { buildPdf } from "@/lib/pdf";
import { getFile } from "@/lib/deviceFiles";
import { addMedia, loadMedia, storePicture, type MediaItem } from "@/lib/mediaLibrary";
import { CarouselCopyError, tightenSlides } from "@/lib/carouselCopy";
import SlideFields, { SlideRewrite, WARN_BOX, useRewriting } from "@/components/carousel/SlideFields";
import { emptyHistory, newTypingStep, record, redo, undo } from "@/lib/carouselHistory";

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

type Source = { kind: "draft"; id: string } | { kind: "paste" } | { kind: "ai"; id: string; text: string; title: string; platform: "instagram" | "linkedin" };
type AiState =
  | { status: "idle" | "loading" }
  | { status: "error" | "limit" | "unavailable"; message: string };
type SplitInfo = Omit<SplitResult, "slides">;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The carousel in progress (pasted text, slide edits), kept for this tab so
// leaving the page doesn't lose it. sessionStorage, outside the synced prefix.
const workKey = (userId: string) => `cs-carousel-work-${scoped(userId)}`;

// Where the post comes from: ?tab= (docs/deep-links.md). The editor's own carousel is ?draft= or ?carousel=.
const SOURCE_TABS = ["drafts", "paste", "topic", "saved"] as const;

// A remixed post's original above its slides (Leo only). Lazy: it reads the top posts and ads drops.
const RemixCompare = lazy(() => import("@/components/RemixCompare"));

// The device hint cs-carousel-look: the font, paper, design and size last picked here, which a new carousel starts on.
const LOOK_HINT = "cs-carousel-look";
function readHint(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_HINT) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function saveHint(patch: Record<string, string>) {
  try {
    localStorage.setItem(LOOK_HINT, JSON.stringify({ ...readHint(), ...patch }));
  } catch {
    // storage blocked: the pick still applies to this carousel
  }
}
// URL values for a design and size: the defaults (clean, 4x5) are left out
const designParam = (d: CarouselDesign) => (d === "clean" ? null : d);
const sizeParam = (z: CarouselSize) => (z === "4x5" ? null : z);

// Jev's recommended design per carousel (Leo only): asked once per carousel in this tab, outside the page, and its
// answer kept for the tab (sessionStorage) so leaving and coming back or a reload costs nothing
const PICKS_KEY = "cs-carousel-design-picks";
const designPicks = new Map<string, Promise<CarouselDesign | null>>();
function keptPicks(): Record<string, string | null> {
  try {
    const v = JSON.parse(sessionStorage.getItem(PICKS_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function recommendDesign(id: string, slides: Slide[]): Promise<CarouselDesign | null> {
  const kept = keptPicks();
  if (id in kept) return Promise.resolve(isDesign(kept[id]) ? kept[id] : null);
  let pick = designPicks.get(id);
  if (!pick) {
    pick = callFn<{ pick: string | null }>("writing-judge", { mode: "design", slides: slides.map((s) => ({ title: s.title, body: s.body })) })
      .then((r) => {
        const got = isDesign(r?.pick) ? r.pick : null;
        try {
          sessionStorage.setItem(PICKS_KEY, JSON.stringify({ ...keptPicks(), [id]: got }));
        } catch {
          // storage blocked: asked again on the next visit
        }
        return got;
      })
      // Jev down: no tag, and a later visit may ask again
      .catch(() => (designPicks.delete(id), null));
    designPicks.set(id, pick);
  }
  return pick;
}

export default function CarouselPage() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const updateUrl = useUrlUpdate();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  /** Posts that are still just a hook (board ideas), which can't make slides. */
  const [ideaOnly, setIdeaOnly] = useState(0);
  const [tab, setMode] = useUrlState("tab", "drafts", { allowed: SOURCE_TABS });
  const leo = useLeoUser();
  // ?compare=original|more: the compare tab on phones (RemixCompare reads the same param)
  const [compareTab] = useUrlState("compare", "version", { allowed: COMPARE_TABS });
  // ?design= and ?size= (Leo only): the open carousel's design and size; everyone else keeps clean at 4:5
  const [designUrl] = useUrlState("design", "clean", { allowed: CAROUSEL_DESIGNS });
  const [sizeUrl] = useUrlState("size", "4x5", { allowed: CAROUSEL_SIZES });
  const design: CarouselDesign = leo ? designUrl : "clean";
  const size: CarouselSize = leo ? sizeUrl : "4x5";
  const frame = SLIDE_SIZES[size];
  const [recommended, setRecommended] = useState<{ id: string; pick: CarouselDesign | null } | null>(null);
  const [topic, setTopic] = useState("");
  const [topicPlatform, setTopicPlatform] = useState<"instagram" | "linkedin">("instagram");
  const [writing, setWriting] = useState<AbortController | null>(null);
  // A topic Jev read as one point, not steps: offered as a text post instead (each topic checked once).
  const [onePoint, setOnePoint] = useState<string | null>(null);
  const [checkingTopic, setCheckingTopic] = useState(false);
  const checkedTopics = useRef(new Set<string>());
  const [saved, setSaved] = useState<SavedCarousel[]>([]);
  // the Saved tab goes with the last saved carousel, so a link to it with none shows My posts
  const mode = tab === "saved" && ready && saved.length === 0 ? "drafts" : tab;
  // which saved carousel this is: "d:<draft id>" or "p:<time>" for pasted text
  const [carouselId, setCarouselId] = useState("");
  const [align, setAlign] = useState<"left" | "center">("left");
  const [scale, setScale] = useState(1);
  // the look: new carousels start with the one last picked on this device
  const [look, setLook] = useState<{ font: SlideFont; paper: SlidePaper }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("cs-carousel-look") ?? "{}");
      return { font: v.font in SLIDE_FONTS ? v.font : "classic", paper: ["light", "dark", "tint"].includes(v.paper) ? v.paper : "light" };
    } catch {
      return { font: "classic", paper: "light" };
    }
  });
  const pickLook = (p: Partial<typeof look>) => {
    const next = { ...look, ...p };
    setLook(next);
    setEdited(true);
    // merged, so the design and size picked on this device stay in the hint
    saveHint(next);
  };
  // a design redraws every slide at once and moves the font and paper to its own; both stay changeable
  const pickDesign = (d: CarouselDesign) => {
    const next = designLook(d, look);
    setLook(next);
    setEdited(true);
    saveHint({ ...next, design: d });
    updateUrl({ design: designParam(d) });
  };
  const pickSize = (z: CarouselSize) => {
    setEdited(true);
    saveHint({ size: z });
    updateUrl({ size: sizeParam(z) });
  };
  // slide pictures live on this device; this maps their keys to data URLs for drawing
  const [pictures, setPictures] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [draftId, setDraftId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Source | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  // the slides as last set, so a change made right after another (or after an await) builds on it
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  // Undo and Redo (Leo's buttons and keys): every slide change is a step, in memory for this carousel
  const hist = useRef(emptyHistory<Slide[]>());
  const lastKey = useRef<{ at: number; field: string } | null>(null);
  // which carousel is open, counted up on each new one, so an old delete toast's Undo can't reach the next carousel
  const opened = useRef(0);
  const resetHistory = () => {
    hist.current = emptyHistory();
    lastKey.current = null;
    opened.current++;
  };
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
      setSaved(loadCarousels(id));
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // fromLink: a ?compare= link keeps its tab; any other new source opens on the slides
  const build = (source: Source, fromLink = false) => {
    let text = "";
    let hook = "";
    let base = "";
    let nextPlatform: "instagram" | "linkedin" = "instagram";
    if (source.kind === "draft") {
      // a post made after the page loaded (the Remix sheet's "Open it") is not in the list yet
      const d = drafts.find((x) => x.id === source.id) ?? draftsWithText(loadDrafts(userId)).find((x) => x.id === source.id);
      if (!d) return;
      text = d.draft;
      hook = d.hook;
      base = d.hook || d.draft;
      nextPlatform = d.platform === "linkedin" ? "linkedin" : "instagram";
      setDraftId(d.id);
    } else if (source.kind === "ai") {
      // written from a topic and already saved to My posts
      text = source.text;
      base = source.title;
      nextPlatform = source.platform;
      setDraftId(source.id);
    } else {
      text = pasteText;
      base = pasteText.split("\n").find((l) => l.trim()) ?? "";
    }
    // the address names the post the slides come from (replace: the editor is the page, not a panel over it).
    // Leo's new carousel starts on the design and size last picked here, or the link's own.
    const hint = readHint();
    const linkDesign = fromLink && isDesign(searchParams.get("design"));
    const linkSize = fromLink && isSize(searchParams.get("size"));
    const startOn = leo
      ? {
          ...(linkDesign ? {} : { design: designParam(isDesign(hint.design) ? hint.design : "clean") }),
          ...(linkSize ? {} : { size: sizeParam(isSize(hint.size) ? hint.size : "4x5") }),
        }
      : {};
    updateUrl({ draft: source.kind === "paste" ? null : source.id, carousel: null, ...(fromLink ? {} : { compare: null, slide: null }), ...startOn });
    resetHistory();
    setCarouselId(source.kind === "paste" ? `p:${Date.now().toString(36)}` : `d:${source.id}`);
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
    // ?carousel=<saved id> reopens a kept carousel with its edits; it beats ?draft=, which makes fresh slides
    const savedId = searchParams.get("carousel");
    const kept = savedId ? saved.find((c) => c.id === savedId) : null;
    if (kept) {
      openSaved(kept, true);
      return;
    }
    const id = searchParams.get("draft");
    if (!id) {
      // one address write: two in one pass would keep only the last (urlState.ts)
      const fix: Record<string, string | null> = savedId ? { carousel: null } : {};
      try {
        const work = userId ? JSON.parse(sessionStorage.getItem(workKey(userId)) ?? "null") : null;
        if (work && Array.isArray(work.slides) && typeof work.pasteText === "string") {
          if (!savedId && !searchParams.has("tab")) fix.tab = work.mode === "paste" ? "paste" : null;
          // Leo's unfinished carousel comes back in its design and size, unless the link names its own
          if (isDesign(work.design) && !searchParams.has("design")) fix.design = designParam(work.design);
          if (isSize(work.size) && !searchParams.has("size")) fix.size = sizeParam(work.size);
          setPasteText(work.pasteText);
          setDraftId(typeof work.draftId === "string" ? work.draftId : "");
          setSlides(work.slides);
          setSplit(work.split ?? null);
          setByHand(work.byHand === true);
          setEdited(work.edited === true);
          if (typeof work.fileBase === "string") setFileBase(work.fileBase);
          setPlatform(work.platform === "linkedin" ? "linkedin" : "instagram");
          if (typeof work.carouselId === "string") setCarouselId(work.carouselId);
          if (work.align === "center") setAlign("center");
          if (typeof work.scale === "number") setScale(work.scale);
          if (work.look && work.look.font in SLIDE_FONTS) setLook({ font: work.look.font, paper: ["dark", "tint"].includes(work.look.paper) ? work.look.paper : "light" });
          if (work.slides.length > 0) toast({ title: "Your carousel is back" });
        }
      } catch {
        // corrupt or blocked storage: start fresh
      }
      if (Object.keys(fix).length) updateUrl(fix);
      return;
    }
    if (drafts.some((d) => d.id === id)) {
      build({ kind: "draft", id }, true);
      return;
    }
    const exists = loadDrafts(userId).some((d) => d.id === id);
    setNotice(
      exists
        ? "That post is still just an idea, with no written text to turn into slides. Write it first, or pick another post."
        : "We couldn't find that post. Pick one of your posts below.",
    );
    updateUrl({ draft: null, carousel: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // A link to another post while the page is open (the Remix sheet's "Open it" here) opens its slides, asking first
  // when these have edits, as picking it from the list does. Leo only: other sign-ins keep today's page.
  const urlDraft = searchParams.get("draft");
  useEffect(() => {
    const id = draftToOpen(urlDraft, draftId);
    if (!leo || !id || !deepLinkHandled.current) return;
    setDrafts(draftsWithText(loadDrafts(userId)));
    requestSource({ kind: "draft", id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDraft]);

  useEffect(() => {
    if (!ready || !userId || !deepLinkHandled.current) return;
    try {
      if (!pasteText.trim() && slides.length === 0) {
        sessionStorage.removeItem(workKey(userId));
      } else {
        sessionStorage.setItem(
          workKey(userId),
          JSON.stringify({ mode, pasteText, draftId, slides, split, byHand, edited, fileBase, platform, carouselId, align, scale, look, ...(leo ? { design, size } : {}) }),
        );
      }
    } catch {
      // storage blocked: the work just won't survive a page change
    }
  }, [ready, userId, mode, pasteText, draftId, slides, split, byHand, edited, fileBase, platform, carouselId, align, scale, look, leo, design, size]);

  useEffect(() => {
    const want = slides.map((x) => x.image).filter((k): k is string => !!k && SLIDE_IMAGE_KEY.test(k) && !pictures[k] && !missing.has(k));
    if (!want.length) return;
    let live = true;
    void Promise.all(
      want.map(async (k) => {
        const blob = await getFile(k).catch(() => undefined);
        if (!blob) return [k, ""] as const;
        const url = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => resolve("");
          r.readAsDataURL(blob);
        });
        return [k, url] as const;
      }),
    ).then((got) => {
      if (!live) return;
      setPictures((p) => ({ ...p, ...Object.fromEntries(got.filter(([, u]) => u)) }));
      const gone = got.filter(([, u]) => !u).map(([k]) => k);
      if (gone.length) setMissing((m) => new Set([...m, ...gone]));
    });
    return () => {
      live = false;
    };
  }, [slides, pictures, missing]);

  const addPicture = async (slideId: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ title: "Pick an image file", variant: "destructive" });
    try {
      // the slide shows it 888 x 470, so 1080 wide is plenty; it joins the media library too
      const pic = await storePicture(file);
      if (userId) addMedia(userId, { key: pic.key, name: file.name.replace(/\.[^.]+$/, "").slice(0, 80), folder: "", alt: "", width: pic.width, height: pic.height, addedAt: new Date().toISOString() });
      setPictures((p) => ({ ...p, [pic.key]: pic.url }));
      change((prev) => prev.map((x) => (x.id === slideId ? { ...x, image: pic.key } : x)));
    } catch (e) {
      toast({ title: "Couldn't add that picture", description: (e as Error).message, variant: "destructive" });
    }
  };
  // From media: pick a photo already in the library for a slide
  const [mediaFor, setMediaFor] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const openMedia = (slideId: string) => {
    setMedia(loadMedia(userId));
    setMediaFor((cur) => (cur === slideId ? null : slideId));
  };
  const pickMedia = (slideId: string, key: string) => {
    change((prev) => prev.map((x) => (x.id === slideId ? { ...x, image: key } : x)));
    setMediaFor(null);
  };
  const removePicture = (slideId: string) =>
    change((prev) => prev.map((x) => (x.id === slideId ? { id: x.id, title: x.title, body: x.body, ...(x.recap ? { recap: true as const } : {}) } : x)));

  // a carousel from a topic or a pasted article: one AI call writes the post, it is
  // saved to My posts (so it has a caption and can be scheduled), then split into slides
  const writeFromTopic = async (anyway = false) => {
    const input = topic.trim();
    if (!input || writing || checkingTopic || !userId) return;
    const title = (input.split("\n").find((l) => l.trim()) ?? input).slice(0, 120);
    const isArticle = input.length > 280;
    // a short idea with no steps reads better as a text post; an article is left alone
    if (!anyway && !isArticle && !checkedTopics.current.has(input)) {
      checkedTopics.current.add(input);
      setCheckingTopic(true);
      const better = await textPostBetter(input);
      setCheckingTopic(false);
      if (better) {
        setOnePoint(input);
        return;
      }
    }
    setOnePoint(null);
    const ctrl = new AbortController();
    setWriting(ctrl);
    let text = "";
    let failed = "";
    await streamOnePost(
      {
        pillar: "topic",
        pillarDetail: title,
        ideaSource: isArticle ? "An article I read" : "My own idea",
        ideaContext: isArticle ? `Turn this into carousel slides, using only what it says:\n${input.slice(0, 6000)}` : undefined,
        format: "carousel",
        platform: topicPlatform,
        ctaType: "comment-keyword",
        audience: "general",
        voiceSummary: loadVoiceProfile(userId)?.voiceSummary || undefined,
      },
      {
        onToken: (t) => { text = t; },
        onComplete: (t) => { text = t; },
        onError: (m) => { failed = m; },
      },
      ctrl.signal,
    );
    setWriting(null);
    if (ctrl.signal.aborted) return;
    if (failed || !text.trim()) {
      toast({ title: "The slides didn't come through", description: failed || "Try again in a minute.", variant: "destructive" });
      return;
    }
    const clean = stripDashes(text);
    const id = newDraftId();
    const entry: DraftEntry = {
      id, createdAt: new Date().toISOString(), hook: title, draft: clean, pillar: "topic", pillarDetail: title,
      audience: "general", format: "carousel", platform: topicPlatform, ctaType: "comment-keyword", status: "draft",
    };
    upsertDraft(userId, entry);
    const all = loadDrafts(userId);
    setDrafts(draftsWithText(all));
    build({ kind: "ai", id, text: clean, title, platform: topicPlatform });
    toast({ title: "Slides written", description: "The post is saved in My posts too." });
  };

  // an edited carousel is kept to come back to (per profile, on every device)
  const keep = (list = slides) => {
    if (!userId || list.length < MIN_SLIDES) return;
    const id = carouselId || `p:${Date.now().toString(36)}`;
    if (!carouselId) setCarouselId(id);
    setSaved(saveCarousel(userId, {
      id, title: fileBase || "Carousel", platform, slides: list, draftId: draftId || undefined, align, scale, font: look.font, paper: look.paper,
      ...(leo && design !== "clean" ? { design } : {}),
      ...(leo && size !== "4x5" ? { size } : {}),
    }));
    // once kept, the address reopens it with its edits
    if (searchParams.get("carousel") !== id) updateUrl({ carousel: id, draft: null });
  };
  // the newest keep, so a save 800 ms after an edit writes the address as it is then (a slide or view picked since)
  const keepRef = useRef(keep);
  keepRef.current = keep;
  useEffect(() => {
    if (!edited || slides.length < MIN_SLIDES) return;
    const t = window.setTimeout(() => keepRef.current(), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, edited, platform, align, scale, look, design, size]);

  // the Saved tab goes with the last saved carousel, so don't leave the picker on it
  useEffect(() => {
    if (ready && tab === "saved" && saved.length === 0) setMode("drafts");
  }, [ready, tab, saved.length, setMode]);

  const openSaved = (c: SavedCarousel, fromLink = false) => {
    setSlides(c.slides);
    resetHistory();
    setSplit(null);
    setByHand(true);
    setEdited(false);
    setPending(null);
    setBeforeAi(null);
    setAi({ status: "idle" });
    setFileBase(c.title);
    setPlatform(c.platform);
    setCarouselId(c.id);
    setDraftId(c.draftId ?? "");
    setAlign(c.align ?? "left");
    setScale(c.scale ?? 1);
    setLook({ font: c.font ?? "classic", paper: c.paper ?? "light" });
    setNotice(null);
    // a saved carousel opens in its own design and size, unless the link names others
    const keepDesign = fromLink && isDesign(searchParams.get("design"));
    const keepSize = fromLink && isSize(searchParams.get("size"));
    updateUrl({
      carousel: c.id, draft: null, ...(fromLink ? {} : { compare: null, slide: null }),
      ...(keepDesign ? {} : { design: c.design ? designParam(c.design) : null }),
      ...(keepSize ? {} : { size: c.size ? sizeParam(c.size) : null }),
    });
  };
  const deleteSaved = (c: SavedCarousel) => {
    if (!userId) return;
    setSaved(removeCarousel(userId, c.id));
    toast({
      title: "Carousel deleted",
      action: (
        <ToastAction altText="Undo" onClick={() => setSaved(saveCarousel(userId, c, new Date(c.updatedAt || Date.now())))}>
          Undo
        </ToastAction>
      ),
    });
  };

  // every slide change goes through here and is one Undo step; typing in a field is one step per pause (`field`)
  const change = (update: (prev: Slide[]) => Slide[], field?: string) => {
    const prev = slidesRef.current;
    const next = update(prev);
    const now = Date.now();
    if (next !== prev && (!field || newTypingStep(lastKey.current, now, field))) hist.current = record(hist.current, prev);
    lastKey.current = field ? { at: now, field } : null;
    slidesRef.current = next;
    setSlides(next);
    setEdited(true);
  };
  const step = (dir: "undo" | "redo") => {
    const r = (dir === "undo" ? undo : redo)(hist.current, slidesRef.current);
    if (!r) return;
    hist.current = r.h;
    lastKey.current = null;
    slidesRef.current = r.to;
    setSlides(r.to);
    setEdited(true);
    setBeforeAi(null);
  };

  const editSlide = (id: string, patch: Partial<Pick<Slide, "title" | "body">>) =>
    change((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)), `${id}:${Object.keys(patch)[0]}`);

  // ?view=one|all and ?slide= (Leo only): one slide at a time is the default under lg, the list above it
  const [wide] = useState(() => window.matchMedia?.("(min-width: 1024px)").matches ?? true);
  const viewParam = searchParams.get("view");
  const view: "one" | "all" = !leo ? "all" : viewParam === "one" || viewParam === "all" ? viewParam : wide ? "all" : "one";
  const slideParam = Number(searchParams.get("slide") ?? 1);
  // 1-based in the address; out of range reads as the first
  const at = view === "one" && Number.isInteger(slideParam) && slideParam >= 1 && slideParam <= slides.length ? slideParam - 1 : 0;
  const go = (i: number) => {
    if (i >= 0 && i < slidesRef.current.length) updateUrl({ slide: i ? String(i + 1) : null });
  };
  // the newest go, for the delete toast's Undo pressed after the address has moved on
  const goRef = useRef(go);
  goRef.current = go;
  const pickView = (v: "one" | "all") => updateUrl({ view: v === (wide ? "all" : "one") ? null : v, slide: null });

  const focusEditor = (id: string) => {
    const show = () => {
      document.getElementById(`slide-editor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById(`slide-title-${id}`)?.focus({ preventScroll: true });
    };
    if (view !== "one") return show();
    go(slidesRef.current.findIndex((s) => s.id === id));
    setTimeout(show, 50);
  };

  const addBlankSlide = () => {
    const id = newSlideId();
    change((prev) => addSlide(prev, { id, title: "", body: "" }));
    setTimeout(() => focusEditor(id), 50);
  };

  // Leo: a deleted slide can come back from its toast, in its place with its picture
  const deleteSlide = (i: number) => {
    const gone = slidesRef.current[i];
    change((prev) => removeSlide(prev, i));
    if (!leo || !gone || slidesRef.current.some((s) => s.id === gone.id)) return;
    if (view === "one") go(Math.min(i, slidesRef.current.length - 1));
    const oneView = view === "one";
    const on = opened.current;
    toast({
      title: `Slide ${i + 1} deleted`,
      action: (
        <ToastAction altText="Undo" onClick={() => on === opened.current && (change((prev) => restoreSlide(prev, i, gone)), oneView && goRef.current(i))}>
          Undo
        </ToastAction>
      ),
    });
  };
  const duplicate = (i: number) => {
    change((prev) => duplicateSlide(prev, i));
    if (view === "one") go(i + 1);
  };
  const moveTo = (i: number, delta: -1 | 1) => {
    change((prev) => moveSlide(prev, i, delta));
    if (view === "one") go(i + delta);
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
        layoutSlide(
          { title: s.title, body: s.body, index: i, total: slides.length, brand, image: s.image ? pictures[s.image] : undefined, align, scale, font: look.font, paper: look.paper, design, size },
          measure,
        ),
      ),
    [slides, brand, measure, pictures, align, scale, look, design, size],
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
    keep();
    const jobs = indexes.map((i) => ({ svg: images[i].svg, name: slideFileName(fileBase, i) }));
    setExporting({ done: 0, total: jobs.length });
    try {
      for (let k = 0; k < jobs.length; k++) {
        const blob = size === "4x5" ? await svgToPng(jobs[k].svg) : await slideImage(jobs[k].svg, size, "image/png");
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

  // one PDF of every slide: how LinkedIn takes a carousel (a document post)
  const exportPdf = async () => {
    if (exporting) return;
    keep();
    setExporting({ done: 0, total: images.length });
    try {
      const pages = [];
      for (let k = 0; k < images.length; k++) {
        const jpeg = size === "4x5" ? await svgToJpeg(images[k].svg) : new Uint8Array(await (await slideImage(images[k].svg, size, "image/jpeg", 0.92)).arrayBuffer());
        pages.push({ jpeg, width: frame.width, height: frame.height });
        setExporting({ done: k + 1, total: images.length });
      }
      downloadBlob(new Blob([buildPdf(pages)], { type: "application/pdf" }), `${slideFileName(fileBase, 0).replace(/-01\.png$/, "")}.pdf`);
      toast({ title: "PDF downloaded", description: "Post it on LinkedIn as a document." });
    } catch (err) {
      console.error("carousel pdf failed", err);
      toast({ title: "Couldn't create the PDF", description: "Try again, or try another browser.", variant: "destructive" });
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
    // the recap is rewritten from the other slides each time, so it is not sent
    const base = snapshot.filter((s) => !s.recap);
    const old = snapshot.find((s) => s.recap);
    setAi({ status: "loading" });
    try {
      const { slides: copy, recap } = await tightenSlides(base, platform, recapFits(base), brand.emojiPolicy);
      const next = withRecap(applyCopy(base, copy), recap ? { ...recap, id: old?.id } : old ?? null);
      setBeforeAi(snapshot);
      change(() => next);
      setAi({ status: "idle" });
      const at = next.findIndex((s) => s.recap);
      toast({
        title: "Slides tightened",
        description: `${
          recap && at >= 0
            ? `Slide ${at + 1} is a recap people can screenshot. `
            : base.length >= MAX_SLIDES
              ? `No room for a recap slide in ${MAX_SLIDES}. `
              : ""
        }Read them through before you post. Undo brings your version back.`,
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
    hist.current = record(hist.current, slidesRef.current);
    lastKey.current = null;
    setSlides(beforeAi);
    setBeforeAi(null);
  };

  const busy = ai.status === "loading";
  const rewriting = useRewriting();
  // Leo's price chips on Tighten with AI and Rewrite this slide: only his sessions read today's uses, so everyone
  // else's stay null; read again once a run is done
  const usesLeft = useUsesLeft(busy || rewriting || !leo);
  const tightenLeft = usesLeft("carousel");
  const askLeft = usesLeft("edit-ask");
  const tightenWhy = reasonText({ left: tightenLeft, leo: Boolean(leo) });
  const exportBusy = exporting !== null;
  const tooShort = split !== null && split.tooShort && !byHand;
  const showEditor = slides.length > 0 && !tooShort;
  const aiMessage = ai.status === "error" || ai.status === "limit" || ai.status === "unavailable" ? ai : null;
  // The strip follows the post these slides came from (draftId, which survives ?carousel=d:<id>); pasted slides keep
  // the last post's id, so it also needs the carousel to be that post's own.
  const compareDraft = leo && showEditor && draftId && carouselId === `d:${draftId}` ? (drafts.find((d) => d.id === draftId) ?? null) : null;
  const compareOn = Boolean(compareDraft?.source);
  const presetActive = BRAND_PRESETS.some((p) => p.color === brand.color);

  // Leo's Design row: each design drawn small from this carousel's own cover and first point, in its starting look
  const designPreviews = useMemo(() => {
    if (!leo || slides.length < MIN_SLIDES) return [];
    return CAROUSEL_DESIGNS.map((d) => {
      const own = designLook(d, look);
      const urls = [0, 1].map((i) => {
        const s = slides[i];
        const layout = layoutSlide(
          { title: s.title, body: s.body, index: i, total: slides.length, brand, image: s.image ? pictures[s.image] : undefined, align, scale, font: own.font, paper: own.paper, design: d, size },
          measure,
        );
        return svgDataUrl(renderSvg(layout));
      });
      return { d, urls };
    });
    // only the cover and first point draw here, so edits further down don't redraw the row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leo, slides[0], slides[1], slides.length, brand, pictures, align, scale, look, size, measure]);
  // Jev's pick, once a carousel is made or opened; no tag when Jev is unsure or down
  useEffect(() => {
    if (!leo || !showEditor || !carouselId || slides.length < MIN_SLIDES) return;
    let live = true;
    const id = carouselId;
    void recommendDesign(id, slides).then((pick) => live && setRecommended({ id, pick }));
    return () => {
      live = false;
    };
    // asked for the slides as made: later edits don't ask again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leo, showEditor, carouselId]);
  const recommendedPick = recommended && recommended.id === carouselId ? recommended.pick : null;
  // Leo's keys, when no field has focus: Cmd or Ctrl+Z undoes, with Shift redoes; the arrows move one slide at a time
  useEffect(() => {
    if (!leo || !showEditor) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true'], [role='listbox'], [role='menu']")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (!busy) step(e.shiftKey ? "redo" : "undo");
      } else if (!mod && !e.altKey && !e.shiftKey && view === "one" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        go(at + (e.key === "ArrowLeft" ? -1 : 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const thumbAspect = size === "1x1" ? "aspect-square" : size === "9x16" ? "aspect-[9/16]" : "aspect-[4/5]";
  // one slide's fields, the same in the list and one at a time
  const fieldsFor = (s: Slide, i: number) => {
    const position = slideRole(i, slides.length);
    return {
      slide: s,
      role: s.recap && position === "point" ? ("recap" as const) : position,
      flags: flags[i] ?? [],
      busy,
      overflow: Boolean(layouts[i]?.overflow),
      picture: s.image ? pictures[s.image] : undefined,
      pictureMissing: Boolean(s.image && missing.has(s.image)),
      media: mediaFor === s.id ? media : null,
      onEdit: (patch: Partial<Pick<Slide, "title" | "body">>) => editSlide(s.id, patch),
      onPicture: (f: File | undefined) => void addPicture(s.id, f),
      onMedia: () => openMedia(s.id),
      onPickMedia: (key: string) => pickMedia(s.id, key),
      onRemovePicture: () => removePicture(s.id),
      children: leo ? (
        <SlideRewrite carousel={carouselId} slides={slides} index={i} platform={platform} left={askLeft} busy={busy}
          onUse={(texts) => change((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: texts[0] ?? "", body: texts[1] ?? "" } : x)))} />
      ) : undefined,
    };
  };
  const one = view === "one" ? slides[at] : undefined;
  const SMALL = "h-8 gap-1.5 text-xs [@media(pointer:coarse)]:h-11";

  return (
    <div className="space-y-6">
      <SectionTabs tabs={WRITE_TABS} />
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <GalleryHorizontalEnd className="h-6 w-6 shrink-0 text-primary" /> Carousel maker
        </h1>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle className="font-serif text-xl">Choose a post</CardTitle>
            <InfoTip label="About how slides are made">
              Your hook becomes the cover and your call to action closes it.
            </InfoTip>
          </div>
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
                ["topic", "From a topic"],
                ...(saved.length ? ([["saved", `Saved (${saved.length})`]] as const) : []),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
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

          {mode === "topic" ? (
            <div className="space-y-2">
              <Label htmlFor="carousel-topic">Topic, or paste an article</Label>
              <Textarea
                id="carousel-topic"
                rows={4}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={!!writing}
                placeholder={"3 CPF moves for people in their 30s\n\nOr paste a news article or your notes and the slides will stick to what it says."}
              />
              <div className="flex flex-wrap items-center gap-2">
                {(["instagram", "linkedin"] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={topicPlatform === p} onClick={() => setTopicPlatform(p)} disabled={!!writing}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${topicPlatform === p ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
                    {p === "instagram" ? "Instagram" : "LinkedIn"}
                  </button>
                ))}
                <Button onClick={() => void writeFromTopic()} disabled={!topic.trim() || !!writing || checkingTopic} className={`ml-auto gap-1.5 ${writing || checkingTopic ? "disabled:opacity-100" : ""}`}>
                  {writing || checkingTopic ? <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden /> : <Sparkles className="h-4 w-4" />}
                  {checkingTopic ? "Reading your idea..." : writing ? "Writing the slides..." : "Write slides with AI"}
                </Button>
                {writing && <Button variant="outline" onClick={() => writing.abort()}>Stop</Button>}
              </div>
              {leo && (
                <p className="text-xs text-muted-foreground">
                  Got a link?{" "}
                  <Link to={links.clone()} className="inline-flex items-center font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                    Paste it in Remix a post.
                  </Link>
                </p>
              )}
              {onePoint !== null && onePoint === topic.trim() && !writing && (
                <div role="status" className="space-y-2 rounded-lg border border-warning/50 bg-warning/5 p-3">
                  <p className="flex items-start gap-1.5 text-sm font-medium">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> This is one point, not steps. It would read better as a text post.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className="h-11 gap-1.5 sm:h-9">
                      <Link to={`/generate?pillar=topic&detail=${encodeURIComponent(onePoint.slice(0, 200))}&format=text-post&platform=${topicPlatform}`}>
                        <FileText className="h-3.5 w-3.5" /> Write it as a text post
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={() => void writeFromTopic(true)}>
                      Make the carousel anyway
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : mode === "saved" ? (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {saved.map((c) => (
                <li key={c.id} className={`flex items-center gap-2 px-3 py-2 ${c.id === carouselId ? "bg-primary/5" : ""}`}>
                  <button type="button" onClick={() => openSaved(c)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {c.slides.length} slides, {c.platform === "linkedin" ? "LinkedIn" : "Instagram"}
                      {c.updatedAt ? `, ${new Date(c.updatedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}` : ""}
                    </span>
                  </button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => openSaved(c)}>Open</Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Delete ${c.title}`} onClick={() => deleteSaved(c)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : mode === "drafts" ? (
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
                    <SelectTrigger id="carousel-draft" className="min-w-0 flex-1 [@media(pointer:coarse)]:h-11">
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
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
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

      {compareOn && userId && compareDraft && (
        <Suspense fallback={null}>
          <RemixCompare userId={userId} draft={compareDraft} draftText={compareDraft.draft} layout="top" />
        </Suspense>
      )}
      {showEditor && (
        <div className={`${compareOn && compareTab !== "version" ? "hidden lg:grid" : "grid"} items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
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
                          className={`h-8 w-8 rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            active ? "ring-2 ring-foreground" : "hover:scale-105"
                          }`}
                        />
                      );
                    })}
                    <label
                      className={`flex h-8 items-center gap-1.5 rounded-full border px-1.5 text-xs text-muted-foreground [@media(pointer:coarse)]:min-h-11 ${
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
                <CardTitle className="font-serif text-xl">Slides</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {beforeAi && !busy && (
                    <Button size="sm" variant="ghost" onClick={undoAi} className="gap-1.5 text-muted-foreground">
                      <Undo2 className="h-3.5 w-3.5" /> Undo AI changes
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={tighten}
                    disabled={busy || ai.status === "limit" || tightenLeft === 0}
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
                  {!busy && <PriceChip feature="carousel" left={tightenLeft} />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tightenWhy && !busy && <p className="text-xs text-destructive">{tightenWhy}</p>}
                {busy && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Rewriting your slides to be shorter and MAS-safe{recapFits(slides.filter((s) => !s.recap)) ? ", with a recap" : ""}. This takes a few seconds.
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

                {leo && designPreviews.length > 0 && (
                  <div className="space-y-2 text-xs">
                    <div role="group" aria-labelledby="carousel-design-label" className="space-y-1.5">
                      <span id="carousel-design-label" className="font-medium text-muted-foreground">Design</span>
                      <div className="grid grid-cols-4 gap-2">
                        {designPreviews.map(({ d, urls }) => (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={design === d}
                            onClick={() => pickDesign(d)}
                            className={`min-w-0 space-y-1 rounded-lg border p-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              design === d ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            <span className="flex items-start gap-0.5">
                              {urls.map((u, k) => (
                                <img key={k} src={u} alt="" className={`block w-1/2 min-w-0 rounded-sm border border-border/40 ${thumbAspect}`} />
                              ))}
                            </span>
                            <span className="block font-semibold leading-tight">{DESIGNS[d].label}</span>
                          </button>
                        ))}
                      </div>
                      {recommendedPick && (
                        <p className="text-muted-foreground">
                          <span className="font-semibold text-primary">Recommended:</span> {DESIGNS[recommendedPick].label}
                        </p>
                      )}
                      {design === "photo-cover" && !slides[0]?.image && (
                        <p className="text-amber-800">Add a picture to slide 1 for the photo cover.</p>
                      )}
                    </div>
                    <span role="group" aria-label="Slide size" className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-muted-foreground">Size</span>
                      {CAROUSEL_SIZES.map((z) => (
                        <button key={z} type="button" aria-pressed={size === z} onClick={() => pickSize(z)}
                          className={`rounded-full border px-2.5 py-1 font-semibold [@media(pointer:coarse)]:min-h-11 ${size === z ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
                          {SLIDE_SIZES[z].label}
                        </button>
                      ))}
                      <InfoTip label="About slide sizes">PDF is for LinkedIn, at 4:5 or 1:1.</InfoTip>
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-muted-foreground">Font</span>
                    {(Object.keys(SLIDE_FONTS) as SlideFont[]).map((f) => (
                      <button key={f} type="button" aria-pressed={look.font === f} onClick={() => pickLook({ font: f })}
                        style={{ fontFamily: SLIDE_FONTS[f].title === "serif" ? "Georgia, serif" : "system-ui, sans-serif" }}
                        className={`rounded-full border px-2.5 py-1 font-semibold [@media(pointer:coarse)]:min-h-11 ${look.font === f ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
                        {SLIDE_FONTS[f].label}
                      </button>
                    ))}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-muted-foreground">Background</span>
                    {([["light", "Light"], ["dark", "Dark"], ["tint", "Brand tint"]] as const).map(([p, label]) => (
                      <button key={p} type="button" aria-pressed={look.paper === p} onClick={() => pickLook({ paper: p })}
                        className={`rounded-full border px-2.5 py-1 font-semibold [@media(pointer:coarse)]:min-h-11 ${look.paper === p ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
                        {label}
                      </button>
                    ))}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-muted-foreground">Text</span>
                    {(["left", "center"] as const).map((a) => (
                      <button key={a} type="button" aria-pressed={align === a} onClick={() => { setAlign(a); setEdited(true); }}
                        className={`rounded-full border px-2.5 py-1 font-semibold [@media(pointer:coarse)]:min-h-11 ${align === a ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
                        {a === "left" ? "Left" : "Centre"}
                      </button>
                    ))}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-muted-foreground">{leo ? "Text size" : "Size"}</span>
                    {([[0.85, "Smaller"], [1, "Usual"], [1.15, "Larger"]] as const).map(([v, label]) => (
                      <button key={v} type="button" aria-pressed={scale === v} onClick={() => { setScale(v); setEdited(true); }}
                        className={`rounded-full border px-2.5 py-1 font-semibold [@media(pointer:coarse)]:min-h-11 ${scale === v ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
                {leo && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="group" aria-label="How the slides show" className="flex w-fit rounded-lg border border-border/60 bg-muted/30 p-1">
                      {([["all", "All slides"], ["one", "One at a time"]] as const).map(([v, label]) => (
                        <button key={v} type="button" aria-pressed={view === v} onClick={() => pickView(v)}
                          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => step("undo")} disabled={!hist.current.past.length || busy} className={SMALL}>
                        <Undo2 className="h-3.5 w-3.5" /> Undo
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => step("redo")} disabled={!hist.current.future.length || busy} className={SMALL}>
                        <Redo2 className="h-3.5 w-3.5" /> Redo
                      </Button>
                    </div>
                  </div>
                )}
                {one ? (
                  <div className="space-y-3">
                    <img src={images[at]?.url} alt={`Slide ${at + 1}: ${one.title || one.body}`.slice(0, 140)} width={frame.width} height={frame.height}
                      className={`mx-auto block h-auto w-full max-w-sm rounded-md border border-border/70 shadow-sm ${thumbAspect}`} />
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous slide">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div role="group" aria-label="Slides" className="flex flex-wrap justify-center">
                        {slides.map((x, i) => (
                          <button key={x.id} type="button" onClick={() => go(i)} aria-label={`Slide ${i + 1}`} aria-current={i === at ? "step" : undefined}
                            className="flex h-11 w-5 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <span className={`h-2 w-2 rounded-full ${i === at ? "bg-primary" : "bg-border"}`} />
                          </button>
                        ))}
                      </div>
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => go(at + 1)} disabled={at === slides.length - 1} aria-label="Next slide">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div id={`slide-editor-${one.id}`} className="space-y-2 rounded-xl border border-border/70 bg-card p-3 sm:p-4">
                      <SlideFields label={`Slide ${at + 1} of ${slides.length}`} {...fieldsFor(one, at)} />
                      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                        <Button type="button" size="sm" variant="outline" className={SMALL} onClick={() => duplicate(at)} disabled={slides.length >= MAX_SLIDES || busy}>
                          <Copy className="h-3.5 w-3.5" /> Duplicate
                        </Button>
                        <Button type="button" size="sm" variant="outline" className={SMALL} onClick={() => moveTo(at, -1)} disabled={at === 0 || busy}>
                          <ArrowLeft className="h-3.5 w-3.5" /> Move left
                        </Button>
                        <Button type="button" size="sm" variant="outline" className={SMALL} onClick={() => moveTo(at, 1)} disabled={at === slides.length - 1 || busy}>
                          <ArrowRight className="h-3.5 w-3.5" /> Move right
                        </Button>
                        <Button type="button" size="sm" variant="outline" className={`${SMALL} text-muted-foreground hover:text-destructive`} onClick={() => deleteSlide(at)} disabled={slides.length <= MIN_SLIDES || busy}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                <ol className="space-y-3">
                  {slides.map((s, i) => (
                      <li
                        key={s.id}
                        id={`slide-editor-${s.id}`}
                        className="space-y-2 rounded-xl border border-border/70 bg-card p-3 sm:p-4"
                      >
                        <SlideFields
                          label={`Slide ${i + 1}`}
                          {...fieldsFor(s, i)}
                          actions={
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
                              {leo && (
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicate(i)}
                                  disabled={slides.length >= MAX_SLIDES || busy} aria-label={`Duplicate slide ${i + 1}`}>
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteSlide(i)}
                                disabled={slides.length <= MIN_SLIDES || busy}
                                aria-label={`Delete slide ${i + 1}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          }
                        />
                      </li>
                  ))}
                </ol>
                )}
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
                  <div className="flex items-center gap-1">
                    <CardTitle className="font-serif text-xl">Preview</CardTitle>
                    {(searchParams.has("carousel") || searchParams.has("draft")) && <CopyLinkButton label="Copy link to this carousel" className="-my-2" />}
                  </div>
                  <CardDescription>
                    {slides.length} slides, {frame.width} × {frame.height} PNG each.
                  </CardDescription>
                </div>
                <div className={`flex flex-wrap gap-2 ${platform === "linkedin" ? "flex-row-reverse justify-end" : ""}`}>
                  <Button
                    size="sm"
                    variant={platform === "linkedin" && frame.pdf ? "outline" : "default"}
                    onClick={() => exportSlides(slides.map((_, i) => i))}
                    disabled={exportBusy || busy}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {exporting && exporting.total > 1
                      ? `Exporting ${Math.min(exporting.done + 1, exporting.total)} of ${exporting.total}…`
                      : platform === "linkedin" && frame.pdf ? "PNGs" : "Download all"}
                  </Button>
                  {frame.pdf && (
                    <Button
                      size="sm"
                      variant={platform === "linkedin" ? "default" : "outline"}
                      onClick={exportPdf}
                      disabled={exportBusy || busy}
                      className="gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" /> {platform === "linkedin" ? "Download PDF" : "PDF"}
                    </Button>
                  )}
                </div>
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
                        aria-current={one && i === at ? "step" : undefined}
                        className={`block w-full overflow-hidden rounded-md border ${one && i === at ? "border-primary ring-2 ring-primary/40" : "border-border/70"} shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                      >
                        <img
                          src={img.url}
                          alt={`Slide ${i + 1}: ${slides[i].title || slides[i].body}`.slice(0, 140)}
                          width={frame.width}
                          height={frame.height}
                          className={`block h-auto w-full ${thumbAspect}`}
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
