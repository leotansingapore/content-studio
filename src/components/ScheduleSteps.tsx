// The schedule steps (publish-schedule, publish-tiktok, publish-per-network; Leo only): Post it for me in three steps,
// rendered by PostItForMePanel in place of today's panel. A carousel's slides are drawn first ("Preparing slides n/total"),
// then Where (networks, accounts, the TikTok mode, the media), When (its day, the next open slot, a picked time, now)
// and Caption (a tab per network, the first comment, the score). Nothing posts until the last step's button; its
// receipt is the finished screen and an Activity row. ?step= and ?network= are this component's (replace); the host
// opens and closes it. The server checks every id and field again (supabase/functions/social/posts.ts).
// Telegram (publish-telegram) sits beside the Zernio networks: a row of the brand's connected chats in Where, the
// 9am to 9pm line in When, and on send its files go to the private bucket and the post to the `telegram` queue.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Copy, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PriceChip from "@/components/PriceChip";
import { NetworkCaptions, captionOf, moveHashtags, networkFields, optionsProblem, placementOf, sendCaptions, withCaption, type Media, type Versions } from "@/components/NetworkCaptions";
import { INBOX_HELP, TikTokMode } from "@/components/TikTokMode";
import { useToast } from "@/hooks/use-toast";
import { hasComplianceErrors, scanCompliance } from "@/lib/compliance";
import { activeProfileId } from "@/lib/profiles";
import { SOCIAL_PLATFORMS, connectLink, defaultAccount, isNotEnabled, loadSocialDefaults, platformName, saveConnectReturn, socialStatus, type AccountView, type SocialPlatform } from "@/lib/socialConnect";
import { DEFAULT_BRAND, loadBrand, loadCarousels, slugify, type SavedCarousel } from "@/lib/carousel";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgToJpeg, svgToPng } from "@/lib/carouselRender";
import { SLIDE_SIZES, slideImage } from "@/lib/carouselDesigns";
import { buildPdf } from "@/lib/pdf";
import { getFile } from "@/lib/deviceFiles";
import { draftStatus, loadDrafts, restoreDraft, setDraftStatus, setDraftZernio, type DraftEntry } from "@/lib/draftHistory";
import { applyView } from "@/lib/useZernioOutbox";
import { loadSlideshows } from "@/lib/slideshow";
import { slideshowPngs } from "@/lib/slideshowDraw";
import { localDateKey, scheduleTime } from "@/lib/dueDates";
import { logActivity } from "@/lib/activity";
import { links, SCHEDULE_STEPS } from "@/lib/links";
import { brandRulesLine } from "@/lib/brandRules";
import { writePlatformCaptions, type CaptionPlatform } from "@/lib/platformCaptions";
import { useUsesLeft } from "@/lib/aiUsage";
import { currentScore, scorePost, textKey, type SavedScore } from "@/lib/postScore";
import { nextOpenSlots } from "@/lib/postingSlots";
import { pictureFit, pictureLine, useMediaFacts, videoFit } from "@/lib/mediaFit";
import { isNewTikTok, loadTikTokCare, markWarmed, modeOf, postsStale, saveMode, savePostCount, type TikTokMode as Mode } from "@/lib/tiktokCare";
import { accountPosts } from "@/lib/autoDm";
import {
  HELD_LINE,
  TELEGRAM_TEXT_MAX,
  chatRows,
  readTelegramRows,
  rowDetail,
  saveTelegramChannels,
  scheduleTelegram,
  telegramMediaProblem,
  uploadTelegramFiles,
  willHold,
  type TelegramRow,
} from "@/lib/telegramConnect";
import {
  MAX_PICTURES,
  MEDIA_TYPES,
  NEEDS_MEDIA,
  PDF_TYPE,
  TIKTOK_BUSY,
  YOUTUBE_TITLE_MAX,
  cancelPost,
  fileProblem,
  fileType,
  linkFromView,
  mediaKind,
  postText,
  readPost,
  renderEach,
  schedulePost,
  stepProblem,
  stepToOpen,
  tiktokInfo,
  tiktokReason,
  uploadAll,
  whenLabel,
  wallIn,
  zernioTime,
  type CreatorInfo,
  type MediaFile,
  type PostView,
  type ScheduleRequest,
  type Step,
  type StepForm,
} from "@/lib/autoPost";
import type { ScheduleInput, TikTokInput } from "../../supabase/functions/social/posts.ts";

// ---- Post it for me's media and Activity rows (shared with today's panel in PostItForMe.tsx) ----

/** The draft's own carousel slides as SVGs, drawn the way Carousel draws them, in its design and size. */
export async function carouselSvgs(userId: string, c: SavedCarousel): Promise<string[]> {
  const brand = loadBrand(userId) ?? DEFAULT_BRAND;
  const measure = createCanvasMeasure();
  const pictures: Record<string, string> = {};
  for (const s of c.slides) {
    if (!s.image || pictures[s.image]) continue;
    const blob = await getFile(s.image).catch(() => undefined);
    if (blob) {
      pictures[s.image] = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => resolve("");
        r.readAsDataURL(blob);
      });
    }
  }
  return c.slides.map((s, i) =>
    renderSvg(
      layoutSlide(
        { title: s.title, body: s.body, index: i, total: c.slides.length, brand, image: s.image ? pictures[s.image] || undefined : undefined, align: c.align, scale: c.scale, font: c.font, paper: c.paper, design: c.design, size: c.size },
        measure,
      ),
    ),
  );
}

/** One slide as the PNG Zernio gets (a 4:5 one exactly as before). */
export const slidePng = (c: SavedCarousel, svg: string): Promise<Blob> => (c.size ? slideImage(svg, c.size, "image/png") : svgToPng(svg));

/** The draft's own carousel as one PDF, a LinkedIn document (Leo only). */
export async function carouselPdf(userId: string, c: SavedCarousel): Promise<MediaFile> {
  const { width, height } = SLIDE_SIZES[c.size ?? "4x5"];
  const pages = [];
  for (const svg of await carouselSvgs(userId, c)) {
    const jpeg = c.size ? new Uint8Array(await (await slideImage(svg, c.size, "image/jpeg", 0.92)).arrayBuffer()) : await svgToJpeg(svg);
    pages.push({ jpeg, width, height });
  }
  return { file: new Blob([buildPdf(pages)], { type: PDF_TYPE }), name: `${slugify(c.title)}.pdf`, type: PDF_TYPE };
}

/** One Activity row about the post: Leo's sessions only, since logActivity does nothing until his session turns it on. */
export function logPost(userId: string, d: DraftEntry, title: (name: string) => string, detail?: string) {
  const hook = d.hook.replace(/\s+/g, " ").trim() || "Untitled";
  const name = `"${hook.length > 70 ? `${hook.slice(0, 67).trimEnd()}...` : hook}"`;
  logActivity(userId, { who: "you", kind: "post", title: title(name), ...(detail ? { detail } : {}), link: links.calendar({ post: d.id }) });
}

// ---- the steps ----

const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't go through. Try again in a minute.");
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const pill = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${TOUCH} ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;
const LABEL: Record<Step, string> = { where: "Where", when: "When", caption: "Caption" };
const FIRST_COMMENT_MAX = 1250;

type MediaMode = "carousel" | "pdf" | "slideshow" | "import" | "files" | "none";
const NO_FILES: MediaFile[] = [];
type When = "day" | "slot" | "pick" | "now";
type TikTokForm = { privacyLevel: string; allowComment: boolean; allowDuet: boolean; allowStitch: boolean };
/** What the server takes from Leo's steps on top of today's request (read for listed uids only). */
type StepsRequest = ScheduleRequest & Pick<ScheduleInput, "instagram" | "facebook" | "linkedin"> & { tiktok?: TikTokInput };

/** "LinkedIn", "LinkedIn and Instagram", "LinkedIn, Instagram and TikTok". */
export const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Zernio has the post and hasn't sent it: a send now is read again every WATCH_MS while it is one of these. */
const WAITING = ["scheduled", "publishing"];
const WATCH_MS = 20_000;
/** 5 minutes of social-read uses; after that the chip reads it on the next load of My posts or Calendar. */
const WATCH_TRIES = 15;

/** The finished screen; `watch` is the post id while a send now waits for its network. */
type Done = { title: string; line: string; inbox: boolean; watch?: string };

/** The finished screen for what Zernio says of the post now: a send now reads as handed over until a read shows it out. */
function doneFor(post: PostView, o: { inbox: boolean; now: boolean; names: string; when: string }): Done {
  if (!o.now) return { title: `Scheduled on ${o.names}`, line: `${o.when}. The chip on the post shows when it's up.`, inbox: false };
  const out = post.status === "published";
  const watch = WAITING.includes(post.status) ? post.id : undefined;
  if (o.inbox)
    return out
      ? { title: "Sent to your TikTok inbox", line: "Open TikTok > Inbox > System notifications to finish it.", inbox: true }
      : { title: "Sending to your TikTok inbox", line: "Zernio has it. Waiting for TikTok, which takes about a minute.", inbox: true, watch };
  return out ? { title: `Posted on ${o.names}`, line: "The chip on the post links to it.", inbox: false } : { title: `Posting to ${o.names}`, line: "It goes out in about a minute.", inbox: false, watch };
}

const scoreFormat = (format: string) => (format === "carousel" || format === "short-video" ? format : undefined);
const scoreTone = (v: number) => (v >= 7.5 ? "border-success/40 bg-success/10 text-success" : v >= 5 ? "border-primary/40 bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive");

export function ScheduleSteps({
  userId,
  draft,
  blockReason,
  onDrafts,
  onClose,
}: {
  userId: string;
  draft: DraftEntry;
  /** Team rule "needs approval before posting": why it can't go yet, or null. */
  blockReason: string | null;
  onDrafts: (d: DraftEntry[]) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const profileId = activeProfileId(userId);
  const brand = useMemo(() => loadBrand(userId), [userId]);
  const defaults = useMemo(() => loadSocialDefaults(userId), [userId]);
  const carousel = useMemo(() => loadCarousels(userId).find((c) => c.draftId === draft.id) ?? null, [userId, draft.id]);
  const slideshow = useMemo(() => loadSlideshows(userId).find((s) => s.draftId === draft.id) ?? null, [userId, draft.id]);
  const importLink = draft.media && mediaKind(draft.media) ? draft.media : null;
  const base = useMemo(() => postText(draft, brand), [draft, brand]);
  const urlNet = params.get("network");

  const [state, setState] = useState<"loading" | "off" | "error" | "ready">("loading");
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  // the draft's own network, the networks it has versions for and the one the link names; Default accounts' networks join once loaded
  const [ticked, setTicked] = useState<string[]>(() => [...new Set([draft.platform, ...Object.keys(draft.versions ?? {}), ...(urlNet && (SOCIAL_PLATFORMS as readonly string[]).includes(urlNet) ? [urlNet] : [])])]);
  // accounts picked by hand per network; a network not here takes its Default account, else every working one
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(carousel ? { done: 0, total: carousel.slides.length } : null);
  const [mode, setMode] = useState<MediaMode>(draft.attached?.length ? "files" : carousel ? "carousel" : slideshow ? "slideshow" : importLink ? "import" : "files");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [step, setStepState] = useState<Step | null>(null);
  const [when, setWhen] = useState<When | null>(null);
  const [pickDay, setPickDay] = useState("");
  const [pickTime, setPickTime] = useState("");
  const [versions, setVersionsState] = useState<Versions>(() => draft.versions ?? {});
  const [firstComment, setFirstCommentState] = useState(draft.firstComment ?? "");
  const [moved, setMoved] = useState<{ versions: Versions; comment: string } | null>(null);
  const [ytTitle, setYtTitle] = useState("");
  const [info, setInfo] = useState<CreatorInfo | null>(null);
  const [tiktok, setTiktok] = useState<TikTokForm>({ privacyLevel: "", allowComment: false, allowDuet: false, allowStitch: false });
  const [care, setCare] = useState(() => loadTikTokCare(userId));
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [score, setScore] = useState<SavedScore | null>(() => currentScore(draft));
  const [scoring, setScoring] = useState<"busy" | string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ upload: number } | "render" | "send" | null>(null);
  const [error, setError] = useState("");
  // the last press failed: its button reads Try again
  const [failed, setFailed] = useState(false);
  // a post Zernio made and failed at once: a new try cancels it first and sends with a new key
  const [failedPost, setFailedPost] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // Telegram: the brand's connected chats (null while read) and the ones ticked
  const [tgChats, setTgChats] = useState<TelegramRow[] | null>(null);
  const [tgPicked, setTgPicked] = useState<string[]>([]);
  const tgUploaded = useRef(new Map<Blob, string>());
  const left = useUsesLeft(writing)("video-captions");
  const uploaded = useRef(new Map<Blob, string>());
  const slides = useRef<MediaFile[] | null>(null);
  const prepping = useRef<AbortController | null>(null);
  const pdfFile = useRef<MediaFile | null>(null);
  const showSlides = useRef<MediaFile[] | null>(null);
  const root = useRef<HTMLElement>(null);
  const opened = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the typed work as last set, so a save never writes an older copy
  const typed = useRef({ versions, fc: firstComment });
  // one key per send: an unanswered earlier try is resent with its own key, so it never posts twice
  const key = useRef(draft.zernio && !draft.zernio.postId ? draft.zernio.key : crypto.randomUUID());
  // Calendar renders its editor twice (phone and desktop): only the copy on screen asks or draws
  const hidden = () => !!root.current && root.current.offsetParent === null;

  useEffect(() => {
    if (!carousel || slides.current || hidden()) return;
    const ac = new AbortController();
    prepping.current = ac;
    void (async () => {
      try {
        const svgs = await carouselSvgs(userId, carousel);
        const blobs = await renderEach(svgs, (svg) => slidePng(carousel, svg), (n, total) => setPrep({ done: n, total }), ac.signal);
        slides.current = blobs.map((file) => ({ file, name: "slide.png", type: "image/png" }));
      } catch {
        // cancelled, or drawing failed: a send draws them again
      }
      if (!ac.signal.aborted) setPrep(null);
    })();
    return () => ac.abort();
  }, [userId, carousel]);

  // files attached in Write come first: they were picked for this post
  const attachedSig = (draft.attached ?? []).join(",");
  useEffect(() => {
    let live = true;
    void Promise.all((attachedSig ? attachedSig.split(",") : []).map((k) => getFile(k).catch(() => undefined))).then((blobs) => {
      const got = blobs.flatMap((b, i) => (b ? [{ file: b, name: `attached-${i + 1}.${MEDIA_TYPES[b.type]?.[0] ?? "jpg"}`, type: b.type }] : []));
      if (live && got.length) setFiles(got);
    });
    return () => {
      live = false;
    };
  }, [attachedSig]);
  // the video's length and the pictures' shapes, held to each ticked network's limits (mediaFit)
  const facts = useMediaFacts(mode === "files" ? files : NO_FILES);

  useEffect(() => {
    if (hidden()) return;
    let live = true;
    socialStatus(profileId)
      .then((s) => {
        if (!live) return;
        setAccounts(s.accounts);
        // a network with a working Default account starts ticked (publish-accounts)
        const withDefault = Object.entries(defaults).filter(([p, id]) => s.accounts.some((a) => a.id === id && a.platform === p && !a.needsReconnect)).map(([p]) => p);
        setTicked((t) => [...new Set([...t, ...withDefault])]);
        setState("ready");
      })
      .catch((e) => live && setState(isNotEnabled(e) ? "off" : "error"));
    return () => {
      live = false;
    };
  }, [profileId, defaults]);

  useEffect(() => {
    if (hidden()) return;
    let live = true;
    readTelegramRows(profileId).then(
      (all) => {
        if (!live) return;
        saveTelegramChannels(userId, profileId, all);
        setTgChats(chatRows(all).filter((r) => r.status === "connected"));
      },
      () => live && setTgChats([]),
    );
    return () => {
      live = false;
    };
  }, [profileId, userId]);

  // ---- what the steps hold ----
  const order = [draft.platform, ...SOCIAL_PLATFORMS.filter((p) => p !== draft.platform)];
  const rows = order.filter((p) => ticked.includes(p) || accounts.some((a) => a.platform === p));
  const tabs = rows.filter((p) => ticked.includes(p));
  // the Default account picked on /accounts first (publish-accounts)
  const accountsOf = (p: string) => {
    const first = defaultAccount(accounts, defaults, p);
    return accounts.filter((a) => a.platform === p).sort((a, b) => Number(b.id === first) - Number(a.id === first));
  };
  const picksOf = (p: string) => {
    if (chosen[p]) return chosen[p];
    const ok = accountsOf(p).filter((a) => !a.needsReconnect);
    const d = ok.find((a) => a.id === defaults[p]);
    return (d ? [d] : ok).map((a) => a.id);
  };
  const pickedIds = tabs.flatMap(picksOf);
  const picked = accounts.filter((a) => pickedIds.includes(a.id));
  const pdfOk = !!carousel && tabs.includes("linkedin") && SLIDE_SIZES[carousel.size ?? "4x5"].pdf;

  // stand-in links with each file's own ending, so the same platform rules as the server's apply here
  const mediaUrls =
    mode === "carousel" && carousel ? carousel.slides.map((_, i) => `https://upload.local/${i}.png`)
    : mode === "pdf" && pdfOk ? ["https://upload.local/0.pdf"]
    : mode === "slideshow" && slideshow ? slideshow.slides.map((_, i) => `https://upload.local/${i}.png`)
    : mode === "import" && importLink ? [importLink]
    : mode === "files" ? files.map((f, i) => `https://upload.local/${i}.${MEDIA_TYPES[f.type]?.[0] ?? "bin"}`)
    : [];
  const media: Media = { pictures: mediaUrls.filter((u) => mediaKind(u) === "image").length, videos: mediaUrls.filter((u) => mediaKind(u) === "video").length };
  const video = media.videos > 0;

  const tiktokId = tabs.includes("tiktok") ? picksOf("tiktok")[0] : undefined;
  const tiktokAccount = accounts.find((a) => a.id === tiktokId);
  const ttMode: Mode = tiktokId ? (modes[tiktokId] ?? modeOf(care, tiktokId)) : "inbox";
  useEffect(() => {
    if (!tiktokId) return;
    let live = true;
    setInfo(null);
    tiktokInfo(profileId, tiktokId, video ? "video" : "photo")
      .then((r) => {
        if (!live) return;
        setInfo(r.info);
        // only levels this creator allows; switches they turned off stay off
        setTiktok((t) => ({
          privacyLevel: r.info.privacyLevels.some((l) => l.value === t.privacyLevel) ? t.privacyLevel : "",
          allowComment: r.info.comment && t.allowComment,
          allowDuet: !!r.info.duet && t.allowDuet,
          allowStitch: !!r.info.stitch && t.allowStitch,
        }));
      })
      .catch((e) => live && setError(message(e)));
    // whether the account is new: its post count, read at most once a week (a failed read leaves the line hidden)
    if (postsStale(loadTikTokCare(userId)[tiktokId]))
      accountPosts(profileId, tiktokId)
        .then((r) => {
          if (live && Array.isArray(r?.posts) && savePostCount(userId, tiktokId, r.posts.length)) setCare(loadTikTokCare(userId));
        })
        .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profileId, tiktokId, video, userId]);

  const tiktokInput: TikTokInput | null = !tiktokId
    ? null
    : ttMode === "inbox"
      ? // TikTok's editor sets these on a draft, but Zernio's fields page lists them as required
        info?.privacyLevels[0]
        ? { privacyLevel: info.privacyLevels[0].value, allowComment: true, allowDuet: false, allowStitch: false, mode: "inbox" }
        : null
      : tiktok.privacyLevel
        ? { ...tiktok, mode: "direct" }
        : null;

  const day = draft.scheduledFor?.slice(0, 10) ?? "";
  const dayTime = scheduleTime(draft.scheduledFor) ?? "09:00";
  const dayAt = day ? zernioTime(day, dayTime) : null;
  const slot = useMemo(() => {
    const held = loadDrafts(userId).filter((d) => d.id !== draft.id && draftStatus(d) === "scheduled");
    return nextOpenSlots(brand, tabs[0] ?? draft.platform, held, new Date(), 56)[0] ?? null;
    // read when the steps open and when the first network changes
  }, [userId, draft.id, brand, tabs[0]]);
  const ahead = (at: string | null) => !!at && Date.parse(at) >= Date.now() + 60_000;
  const whenPicked: When = when ?? (ahead(dayAt) ? "day" : slot ? "slot" : "now");
  const at =
    whenPicked === "now" ? null
    : whenPicked === "day" ? (dayAt ?? "")
    : whenPicked === "slot" ? (slot ? zernioTime(slot.date, slot.time)! : "")
    : (zernioTime(pickDay, pickTime) ?? "");
  const whenText = whenPicked === "day" ? whenLabel(day, dayTime) : whenPicked === "slot" && slot ? whenLabel(slot.date, slot.time) : whenPicked === "pick" && at ? whenLabel(pickDay, pickTime) : "";

  const { content, captions } = tabs.length ? sendCaptions(tabs, versions, base) : { content: base, captions: {} };
  // Telegram takes the first network's caption, or the post as written when it goes to Telegram alone
  const tgOn = tgPicked.length > 0;
  const tgOnly = tgOn && tabs.length === 0;
  const tgText = tabs.length ? captionOf(tabs, versions, base, tabs[0]) : base;
  const tooManySlides = (n: number) => (n > 10 ? "Telegram takes up to 10 pictures in a post." : null);
  const tgMedia = !tgOn
    ? null
    : mode === "pdf"
      ? "Telegram takes pictures or a video from here, not a PDF."
      : mode === "import"
        ? "Telegram can't take an imported link yet. Pick a file instead."
        : mode === "carousel" && carousel
          ? tooManySlides(carousel.slides.length)
          : mode === "slideshow" && slideshow
            ? tooManySlides(slideshow.slides.length)
            : mode === "files"
              ? telegramMediaProblem(files.map((f) => ({ name: f.name, type: f.type, size: f.file.size })))
              : null;
  const tgCaption = !tgOn
    ? null
    : tgText.length > TELEGRAM_TEXT_MAX
      ? `The Telegram text is ${tgText.length - TELEGRAM_TEXT_MAX} characters too long.`
      : tgOnly && hasComplianceErrors(scanCompliance(tgText))
        ? "Fix the compliance error in the post first."
        : null;
  const form: StepForm = {
    platforms: tabs,
    accounts: picked.map((a) => ({ platform: a.platform })),
    mediaUrls,
    ...(mode === "files" ? { files: files.map((f) => ({ name: f.name, type: f.type, size: f.file.size })) } : {}),
    scheduledFor: at,
    content,
    captions,
    tiktok: tiktokInput,
  };
  const stories = tabs.filter((p) => (p === "instagram" || p === "facebook") && placementOf(p, versions, media) === "story");
  const seconds = facts.seconds;
  const igShape =
    tabs.includes("instagram") && placementOf("instagram", versions, media) !== "story"
      ? pictureLine(files.flatMap((f, i) => (f.type.startsWith("image/") ? [facts.sizes[i] ? pictureFit(facts.sizes[i]!.width, facts.sizes[i]!.height) : null] : [])))
      : null;
  const fits = [
    ...(seconds === null ? [] : tabs.flatMap((p) => {
      const fit = videoFit(p, seconds, { placement: placementOf(p, versions, media), tiktokMax: p === "tiktok" ? info?.maxVideoSeconds : null });
      return fit ? [{ p, ...fit }] : [];
    })),
    ...(mode === "files" && igShape ? [{ p: "instagram", line: igShape, hard: true }] : []),
  ];
  const tooLong = fits.find((f) => f.hard)?.line ?? null;
  const commentOn = tabs.some((p) => p !== "tiktok");
  const fcFlags = scanCompliance(firstComment);
  const reasons: Record<Step, string | null> = {
    where: state !== "ready" ? "Loading your accounts..." : tgOnly ? tgMedia : (stepProblem("where", form) ?? tooLong ?? tgMedia),
    when: stepProblem("when", form),
    caption:
      (blockReason ? `Team rule: ${blockReason}` : null) ??
      (tiktokId && !info ? "Reading your TikTok settings..." : null) ??
      (tgOnly ? null : stepProblem("caption", form)) ??
      (tgOnly ? null : optionsProblem(tabs, versions, media)) ??
      (tgOnly ? null : tooLong) ??
      tgCaption ??
      (commentOn && firstComment.trim().length > FIRST_COMMENT_MAX ? `Keep the first comment under ${FIRST_COMMENT_MAX + 1} characters.` : null) ??
      (commentOn && hasComplianceErrors(fcFlags) ? "Fix the compliance error in the first comment first." : null) ??
      (commentOn && firstComment.trim() && stories.length ? "Stories post no first comment. Take it off, or post to the feed." : null) ??
      (tiktokId && info && !info.canPostMore ? "TikTok says this account can't post more right now. Try later." : null),
  };

  // ---- the step in the URL (replace; the default and the first tab are left out) ----
  const place = (s: Step, network?: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (s === "where") p.delete("step");
        else p.set("step", s);
        if (network !== undefined) {
          if (network) p.set("network", network);
          else p.delete("network");
        }
        return p;
      },
      { replace: true },
    );
  const go = (s: Step) => {
    setStepState(s);
    place(s);
  };
  useEffect(() => {
    // the link's step, or the first one before it that can't go on, once the accounts and slides are ready
    if (opened.current || state !== "ready" || prep) return;
    opened.current = true;
    const asked = params.get("step");
    go(stepToOpen((SCHEDULE_STEPS as readonly string[]).includes(asked ?? "") ? (asked as Step) : null, form));
  });
  const openTab = urlNet && tabs.includes(urlNet) ? urlNet : tabs[0];

  // ---- typed work rides on the draft (versions, first comment), saved shortly after the last key ----
  const persist = () => {
    const { versions: v, fc } = typed.current;
    const cur = loadDrafts(userId).find((d) => d.id === draft.id);
    if (!cur) return;
    const next = restoreDraft(userId, { ...cur, versions: Object.keys(v).length ? v : undefined, firstComment: fc.trim() ? fc : undefined });
    if (!done) onDrafts(next);
  };
  const later = (change: Partial<{ versions: Versions; fc: string }>) => {
    typed.current = { ...typed.current, ...change };
    if (change.versions) setVersionsState(change.versions);
    if (change.fc !== undefined) setFirstCommentState(change.fc);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      persist();
    }, 400);
  };
  const setVersions = (v: Versions) => {
    setMoved(null);
    later({ versions: v });
  };
  const setFirstComment = (fc: string) => {
    setMoved(null);
    later({ fc });
  };
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const toggleNetwork = (p: string, on: boolean) => setTicked((t) => (on ? [...t, p] : t.filter((x) => x !== p)));
  const toggleAccount = (p: string, id: string, on: boolean) => setChosen((c) => ({ ...c, [p]: on ? [...picksOf(p), id] : picksOf(p).filter((x) => x !== id) }));
  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setFiles([...list].map((f) => ({ file: f, name: f.name, type: fileType(f) ?? f.type })));
    setError("");
  };

  const connect = async (p: string) => {
    if (connecting) return;
    setConnecting(p);
    try {
      // /accounts offers the way back here, to the same post and step (publish-accounts)
      saveConnectReturn(`${window.location.pathname}${window.location.search}`);
      const { authUrl } = await connectLink(profileId, p as SocialPlatform);
      window.location.assign(authUrl);
    } catch (e) {
      setConnecting(null);
      setError(message(e));
    }
  };

  const writeVersions = async () => {
    if (writing) return;
    setWriting(true);
    setWriteError("");
    try {
      const out = await writePlatformCaptions(draft.draft, captionOf(tabs, versions, base, "instagram"), draft.hook, brand ? brandRulesLine(brand) : "");
      // Instagram keeps the shared caption: when it follows the first tab, it keeps today's words as its own first
      let v = tabs.includes("instagram") && tabs[0] !== "instagram" ? withCaption(tabs, versions, base, "instagram", captionOf(tabs, versions, base, "instagram")) : versions;
      for (const p of tabs) if (p !== "instagram" && out[p as CaptionPlatform]) v = withCaption(tabs, v, base, p, out[p as CaptionPlatform]!);
      if (tabs.includes("youtube") && out.youtubeTitle && !ytTitle.trim()) setYtTitle(out.youtubeTitle.slice(0, YOUTUBE_TITLE_MAX));
      setVersions(v);
    } catch {
      setWriteError("Couldn't write the versions. Try again in a minute.");
    } finally {
      setWriting(false);
    }
  };

  const moveTags = () => {
    const moveOut = moveHashtags(captionOf(tabs, versions, base, openTab), firstComment);
    if (!moveOut) return;
    const was = { versions, comment: firstComment };
    later({ versions: withCaption(tabs, versions, base, openTab, moveOut.body), fc: moveOut.comment });
    setMoved(was);
  };
  const undoMove = () => {
    if (!moved) return;
    later({ versions: moved.versions, fc: moved.comment });
    setMoved(null);
  };

  const scoreIt = async () => {
    if (scoring === "busy") return;
    setScoring("busy");
    try {
      const s = await scorePost(draft.draft, draft.platform, scoreFormat(draft.format));
      const saved: SavedScore = { v: s.score, down: s.down, key: textKey(draft.platform, draft.draft), at: new Date().toISOString() };
      setScore(saved);
      setScoring(null);
      const cur = loadDrafts(userId).find((d) => d.id === draft.id);
      if (cur) onDrafts(restoreDraft(userId, { ...cur, score: saved }));
    } catch (e) {
      setScoring(message(e));
    }
  };

  const allInbox = !!tiktokId && tabs.every((p) => p === "tiktok") && ttMode === "inbox";
  const goesNow = whenPicked === "now";
  const names = andList([...tabs.map(platformName), ...(tgOn ? ["Telegram"] : [])]);
  const tgHeld = tgOn && at !== "" && willHold(at);

  const send = async () => {
    if (reasons.where || reasons.when || reasons.caption || busy) return;
    setError("");
    setFailed(false);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      persist();
    }
    try {
      if (failedPost) {
        // Zernio made it and it failed at once: take it off, then send it as a new post
        await cancelPost(profileId, failedPost).catch(() => undefined);
        setDraftZernio(userId, draft.id, null);
        key.current = crypto.randomUUID();
        setFailedPost(null);
      }
      // the key is on the draft before the call, so an answer lost on the way never sends a second post
      if (!tgOnly) onDrafts(setDraftZernio(userId, draft.id, { key: key.current }));
      let list: MediaFile[] = mode === "files" ? files : [];
      if (mode === "carousel" && carousel) {
        if (!slides.current) {
          setBusy("render");
          const svgs = await carouselSvgs(userId, carousel);
          slides.current = [];
          for (const svg of svgs) slides.current.push({ file: await slidePng(carousel, svg), name: "slide.png", type: "image/png" });
        }
        list = slides.current;
      }
      if (mode === "pdf" && carousel && pdfOk) {
        if (!pdfFile.current) {
          setBusy("render");
          pdfFile.current = await carouselPdf(userId, carousel);
        }
        const tooBig = fileProblem({ name: "The PDF", type: PDF_TYPE, size: pdfFile.current.file.size }, { pdf: true });
        if (tooBig) throw new Error(`${tooBig} Post the slides as pictures instead.`);
        list = [pdfFile.current];
      }
      if (mode === "slideshow" && slideshow) {
        if (!showSlides.current) {
          setBusy("render");
          showSlides.current = await slideshowPngs(userId, slideshow);
        }
        list = showSlides.current;
      }
      let post: PostView | null = null;
      if (!tgOnly) {
        let urls = mode === "import" && importLink ? [importLink] : [];
        if (list.length) {
          setBusy({ upload: 0 });
          urls = await uploadAll(profileId, list, uploaded.current, (p) => setBusy({ upload: p }));
        }
        setBusy("send");
        const req: StepsRequest = {
          accountIds: pickedIds,
          clientKey: key.current,
          content,
          ...(Object.keys(captions).length ? { captions } : {}),
          mediaUrls: urls,
          ...(goesNow ? { now: true } : { scheduledFor: at! }),
          ...(commentOn && firstComment.trim() ? { firstComment: firstComment.trim() } : {}),
          ...(tiktokInput ? { tiktok: tiktokInput } : {}),
          ...(tabs.includes("youtube") ? { youtube: { title: ytTitle.trim(), visibility: "public" as const } } : {}),
          ...(mode === "pdf" && pdfOk ? { documentTitle: carousel?.title.trim() || "Carousel" } : {}),
          ...networkFields(tabs, versions, media),
        };
        ({ post } = await schedulePost(profileId, req));
        const failed = post.status === "failed" ? (post.platforms.find((p) => p.error)?.error ?? "Zernio couldn't post it.") : null;
        // on its day at the minute Zernio holds, as the calendar and My posts read a scheduled post; set before the link,
        // so the save that adds the link changes no time and queues no move (a send now comes back with seconds)
        if (!failed) setDraftStatus(userId, draft.id, "scheduled", wallIn(post.scheduledFor || at || new Date().toISOString()));
        // the host hears of the post on Done, so a page that hides the panel once the draft has a post keeps this screen
        setDraftZernio(userId, draft.id, linkFromView(key.current, post));
        if (failed) {
          setFailedPost(post.id);
          throw new Error(tiktokReason(failed));
        }
        if (tiktokId) saveMode(userId, tiktokId, ttMode);
      }
      if (tgOn) {
        // the same key as the networks' post, so a retry never queues a second Telegram post
        setBusy("send");
        const tgFiles = list.length ? await uploadTelegramFiles(profileId, list, tgUploaded.current) : [];
        const tg = await scheduleTelegram(profileId, { chatRows: tgPicked, clientKey: key.current, text: tgText, media: tgFiles, ...(goesNow ? { now: true as const } : { sendAt: at! }) });
        if (tgOnly) setDraftStatus(userId, draft.id, "scheduled", wallIn(tg.sendAt));
      }
      logPost(userId, draft, (n) => `Set ${n} to post on ${names}`, `Goes out ${goesNow ? "now" : whenText}.`);
      const zernio = post && doneFor(post, { inbox: allInbox, now: goesNow, names, when: whenText });
      setDone(
        zernio
          ? tgHeld ? { ...zernio, line: `${zernio.line} Telegram waits until 9am.` } : zernio
          : tgHeld
            ? { title: "Scheduled on Telegram", line: "Held until 9am. Telegram posts go out between 9am and 9pm.", inbox: false }
            : goesNow
              ? { title: "Sending to Telegram", line: "It goes out within a minute.", inbox: false }
              : { title: "Scheduled on Telegram", line: `${whenText}.`, inbox: false },
      );
    } catch (e) {
      logPost(userId, draft, (n) => `${n} could not be posted`, message(e));
      setError(tiktokReason(message(e)));
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  // a send now is read again until it is out or failed, so the finished screen never says more than Zernio has
  // (live-p7a-post D4); the draft takes each read, and the host hears of it on Done
  const watch = done?.watch;
  useEffect(() => {
    if (!watch) return;
    let live = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      timer = setTimeout(() => {
        readPost(profileId, watch).then(
          ({ post }) => {
            if (!live) return;
            const cur = loadDrafts(userId).find((d) => d.id === draft.id);
            if (cur?.zernio?.postId === watch) applyView(userId, cur, post);
            if (WAITING.includes(post.status)) {
              if (++tries < WATCH_TRIES) read();
              return;
            }
            const why = post.platforms.find((p) => p.error)?.error ?? "Zernio couldn't post it.";
            if (post.status === "failed") {
              // back on step 3 with the reason; Try again takes this post off Zernio and sends a new one
              logPost(userId, draft, (n) => `${n} could not be posted`, why);
              setDone(null);
              setFailedPost(post.id);
              setError(tiktokReason(why));
              setFailed(true);
            } else if (post.status === "partial") setDone({ title: "Partly posted", line: tiktokReason(why), inbox: false });
            else if (post.status === "published") setDone(doneFor(post, { inbox: allInbox, now: true, names, when: whenText }));
            else setDone((d) => d && { ...d, watch: undefined });
          },
          () => undefined, // off, offline or over the cap: the chip reads it on the next load
        );
      }, WATCH_MS);
    };
    read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [watch]);

  /** "Send to inbox instead" on TikTok's capacity line: inbox mode, a new key, back to step 1. */
  const toInbox = async () => {
    if (failedPost) await cancelPost(profileId, failedPost).catch(() => undefined);
    setFailedPost(null);
    onDrafts(setDraftZernio(userId, draft.id, null));
    key.current = crypto.randomUUID();
    if (tiktokId) setModes((m) => ({ ...m, [tiktokId]: "inbox" }));
    setError("");
    setFailed(false);
    go("where");
  };

  // the host hears of the post now (its list, its chip), then closes
  const finish = () => {
    if (done) onDrafts(loadDrafts(userId));
    onClose();
  };
  const copyCaption = () =>
    void navigator.clipboard?.writeText(captionOf(tabs, versions, base, "tiktok")).then(
      () => toast({ title: "Caption copied" }),
      () => toast({ title: "Couldn't copy it. Select the caption and copy it yourself." }),
    );

  const busyLabel = busy === "render" ? "Drawing the slides..." : busy === "send" ? "Scheduling..." : busy ? `Uploading ${busy.upload}%` : null;
  const reason = step ? reasons[step] : null;
  const n = step ? SCHEDULE_STEPS.indexOf(step) : 0;

  return (
    <section ref={root} aria-label="Schedule post" className="mt-3 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Schedule post</p>
        <button type="button" onClick={finish} aria-label="Close" className="-m-2 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground sm:h-8 sm:w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {prep ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-foreground">Preparing slides {prep.done}/{prep.total}</span>
          <button
            type="button"
            onClick={() => {
              prepping.current?.abort();
              onClose();
            }}
            className={`ml-auto font-semibold text-primary hover:underline ${TOUCH}`}
          >
            Cancel preparation
          </button>
        </div>
      ) : state === "off" ? (
        <p className="text-muted-foreground">Social accounts aren't switched on for you yet.</p>
      ) : state === "error" ? (
        <p className="text-destructive">Couldn't load your accounts. Close this and try again in a minute.</p>
      ) : done ? (
        <div role="status" className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{done.title}</p>
          <p className="text-muted-foreground">{done.line}</p>
          <div className="flex flex-wrap gap-2">
            {done.inbox ? (
              <Button size="sm" variant="outline" onClick={copyCaption} className={`h-9 gap-1.5 ${TOUCH}`}>
                <Copy className="h-3.5 w-3.5" /> Copy caption
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild className={`h-9 ${TOUCH}`}>
                <Link to={links.calendar({ post: draft.id })} onClick={() => onDrafts(loadDrafts(userId))}>Open in calendar</Link>
              </Button>
            )}
            <Button size="sm" onClick={finish} className={`h-9 ${TOUCH}`}>Done</Button>
          </div>
        </div>
      ) : !step ? (
        <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your accounts...</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1" aria-hidden="true">
              {SCHEDULE_STEPS.map((s, i) => <span key={s} className={`h-1.5 rounded-full ${i <= n ? "bg-primary" : "bg-border"}`} />)}
            </div>
            <p className="font-semibold text-foreground">Step {n + 1} of 3 | {LABEL[step]}</p>
          </div>

          {step === "where" && (
            <>
              <fieldset className="space-y-1.5">
                <legend className="sr-only">Where it goes</legend>
                {rows.map((p) => {
                  const list = accountsOf(p);
                  const on = ticked.includes(p);
                  return (
                    <div key={p} className="space-y-1 rounded-md border border-border/70 bg-background/70 p-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <label className={`flex min-h-9 items-center gap-2 ${TOUCH}`}>
                          <input type="checkbox" checked={on} onChange={(e) => toggleNetwork(p, e.target.checked)} className="h-4 w-4 accent-primary" />
                          <span className="font-semibold text-foreground">{platformName(p)}</span>
                        </label>
                        {!on && list[0] && <span className="text-muted-foreground">{list[0].username ? `@${list[0].username}` : list[0].name}</span>}
                        <button type="button" disabled={!!connecting} onClick={() => void connect(p)} className={`ml-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline disabled:opacity-60 ${TOUCH}`}>
                          {connecting === p && <Loader2 className="h-3 w-3 animate-spin" />}
                          {list.length ? "Add another account" : `Connect ${platformName(p)}`}
                        </button>
                      </div>
                      {on &&
                        list.map((a) => (
                          <label key={a.id} className={`ml-6 flex min-h-9 items-center gap-2 ${TOUCH}`}>
                            <input type="checkbox" checked={picksOf(p).includes(a.id)} disabled={a.needsReconnect} onChange={(e) => toggleAccount(p, a.id, e.target.checked)} className="h-4 w-4 accent-primary" />
                            <span className="text-foreground">{a.username ? `@${a.username}` : a.name}</span>
                            {a.id === defaults[p] && <span className="text-muted-foreground">Default</span>}
                            {a.needsReconnect && <span className="text-muted-foreground">Reconnect it on Social accounts first</span>}
                          </label>
                        ))}
                      {on && p === "tiktok" && tiktokAccount && (
                        <div className="ml-6">
                          <TikTokMode
                            handle={tiktokAccount.username || tiktokAccount.name}
                            mode={ttMode}
                            isNew={isNewTikTok(care[tiktokAccount.id]?.posts)}
                            warmed={!!care[tiktokAccount.id]?.warmedAt}
                            onMode={(m) => setModes((x) => ({ ...x, [tiktokAccount.id]: m }))}
                            onWarmed={() => markWarmed(userId, tiktokAccount.id) && setCare(loadTikTokCare(userId))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {tgChats !== null && (
                  <div className="space-y-1 rounded-md border border-border/70 bg-background/70 p-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`flex min-h-9 items-center font-semibold text-foreground ${TOUCH}`}>Telegram</span>
                      <Link
                        to="/accounts#telegram"
                        onClick={() => saveConnectReturn(`${window.location.pathname}${window.location.search}`)}
                        className={`ml-auto inline-flex min-h-9 items-center font-semibold text-primary hover:underline ${TOUCH}`}
                      >
                        {tgChats.length ? "Add another chat" : "Connect Telegram"}
                      </Link>
                    </div>
                    {tgChats.map((c) => {
                      const d = rowDetail(c);
                      return (
                        <label key={c.id} className={`ml-6 flex min-h-9 flex-wrap items-center gap-x-2 ${TOUCH}`}>
                          <input
                            type="checkbox"
                            checked={tgPicked.includes(c.id)}
                            onChange={(e) => setTgPicked((t) => (e.target.checked ? [...t, c.id] : t.filter((x) => x !== c.id)))}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-foreground">{d.name}</span>
                          <span className="text-muted-foreground">{d.topic ?? d.kind}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-1 font-semibold text-foreground">With</legend>
                <div className="flex flex-wrap gap-1.5">
                  {pdfOk && <button type="button" aria-pressed={mode === "pdf"} onClick={() => setMode("pdf")} className={pill(mode === "pdf")}>PDF document</button>}
                  {carousel && <button type="button" aria-pressed={mode === "carousel"} onClick={() => setMode("carousel")} className={pill(mode === "carousel")}>Carousel slides ({carousel.slides.length})</button>}
                  {slideshow && <button type="button" aria-pressed={mode === "slideshow"} onClick={() => setMode("slideshow")} className={pill(mode === "slideshow")}>Slideshow slides ({slideshow.slides.length})</button>}
                  {importLink && <button type="button" aria-pressed={mode === "import"} onClick={() => setMode("import")} className={pill(mode === "import")}>Your imported {mediaKind(importLink) === "video" ? "video" : "picture"}</button>}
                  <button type="button" aria-pressed={mode === "files"} onClick={() => setMode("files")} className={pill(mode === "files")}>A file</button>
                  {!tabs.some((p) => NEEDS_MEDIA.includes(p)) && <button type="button" aria-pressed={mode === "none"} onClick={() => setMode("none")} className={pill(mode === "none")}>Text only</button>}
                </div>
                {mode === "files" && (
                  <div className="space-y-1">
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mov"
                      aria-label="Pick pictures or a video"
                      onChange={(e) => pickFiles(e.target.files)}
                      className="block min-h-9 w-full text-xs file:mr-2 file:min-h-9 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-xs file:font-semibold [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:file:min-h-11"
                    />
                    {files.map((f, i) => (
                      <p key={i} className="truncate text-muted-foreground">{f.name}, {(f.file.size / 1_000_000).toFixed(1)} MB</p>
                    ))}
                    {files.length > MAX_PICTURES && <p className="text-destructive">Pick up to {MAX_PICTURES} pictures.</p>}
                    {fits.map((f) => (
                      <p key={`${f.p}-${f.line}`} className={`flex flex-wrap items-center gap-x-2 ${f.hard ? "text-destructive" : "text-amber-800 dark:text-amber-300"}`}>
                        {f.line}
                        <button type="button" onClick={() => toggleNetwork(f.p, false)} className={`font-semibold text-primary hover:underline ${TOUCH}`}>
                          Untick {platformName(f.p)}
                        </button>
                      </p>
                    ))}
                  </div>
                )}
              </fieldset>
            </>
          )}

          {step === "when" && (
            <fieldset className="space-y-1.5">
              <legend className="sr-only">When it goes</legend>
              {day && <Option name={`when-${draft.id}`} on={whenPicked === "day"} onPick={() => setWhen("day")} label="On its day" detail={whenLabel(day, dayTime)} />}
              {slot && <Option name={`when-${draft.id}`} on={whenPicked === "slot"} onPick={() => setWhen("slot")} label="Next open slot" detail={whenLabel(slot.date, slot.time)} />}
              <Option name={`when-${draft.id}`} on={whenPicked === "pick"} onPick={() => setWhen("pick")} label="Pick a time" />
              {whenPicked === "pick" && (
                <div className="ml-6 flex flex-wrap gap-2">
                  <Input type="date" aria-label="Day" min={localDateKey()} value={pickDay} onChange={(e) => setPickDay(e.target.value)} className={`h-9 w-auto text-xs ${TOUCH}`} />
                  <Input type="time" aria-label="Time" value={pickTime} onChange={(e) => setPickTime(e.target.value)} className={`h-9 w-auto text-xs ${TOUCH}`} />
                </div>
              )}
              <Option name={`when-${draft.id}`} on={whenPicked === "now"} onPick={() => setWhen("now")} label="Now" />
              {tgHeld && <p className="text-muted-foreground">{HELD_LINE}</p>}
            </fieldset>
          )}

          {step === "caption" && (
            <>
              {tabs.length > 0 && (
              <NetworkCaptions
                tabs={tabs}
                open={openTab}
                onOpen={(p) => place("caption", p === tabs[0] ? null : p)}
                versions={versions}
                base={base}
                onVersions={setVersions}
                media={media}
                write={{
                  busy: writing,
                  error: writeError,
                  disabled: left === 0,
                  run: () => void writeVersions(),
                  chip: <PriceChip feature="video-captions" left={left} />,
                }}
                extra={(p) =>
                  p === "youtube" ? (
                    <div className="space-y-1">
                      <label htmlFor={`yt-${draft.id}`} className="font-semibold text-foreground">YouTube title</label>
                      <Input id={`yt-${draft.id}`} value={ytTitle} maxLength={YOUTUBE_TITLE_MAX} onChange={(e) => setYtTitle(e.target.value)} placeholder="The caption's first line" className="h-9 text-xs" />
                    </div>
                  ) : p === "tiktok" ? (
                    ttMode === "inbox" ? (
                      <p className="text-muted-foreground">{INBOX_HELP}</p>
                    ) : !info ? (
                      <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your TikTok settings...</p>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="flex flex-wrap items-center gap-2">
                          Who can see it
                          <select value={tiktok.privacyLevel} onChange={(e) => setTiktok((t) => ({ ...t, privacyLevel: e.target.value }))} className={`h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground ${TOUCH}`}>
                            <option value="">Pick one</option>
                            {info.privacyLevels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                          </select>
                        </label>
                        {([["allowComment", "Comments", info.comment], ...(video ? [["allowDuet", "Duet", !!info.duet], ["allowStitch", "Stitch", !!info.stitch]] : [])] as [keyof TikTokForm, string, boolean][]).map(([k, label, allowed]) => (
                          <label key={k} className={`flex min-h-9 items-center gap-2 ${TOUCH} ${allowed ? "" : "text-muted-foreground"}`}>
                            <input type="checkbox" disabled={!allowed} checked={tiktok[k] as boolean} onChange={(e) => setTiktok((t) => ({ ...t, [k]: e.target.checked }))} className="h-4 w-4 accent-primary" />
                            Allow {label.toLowerCase()}{allowed ? "" : " (off in your TikTok app)"}
                          </label>
                        ))}
                        <p className="text-muted-foreground">By posting, you agree to TikTok's Music Usage Confirmation.</p>
                      </div>
                    )
                  ) : null
                }
              />
              )}
              {tgOn && (
                <p className={tgText.length > TELEGRAM_TEXT_MAX ? "text-destructive" : "text-muted-foreground"}>
                  {tabs.length ? `Telegram gets the ${platformName(tabs[0])} caption` : "Telegram gets the post as written"}, {tgText.length.toLocaleString("en-US")} / {TELEGRAM_TEXT_MAX.toLocaleString("en-US")} characters.
                </p>
              )}

              {commentOn && (
                <div className="space-y-1">
                  <label htmlFor={`fc-${draft.id}`} className="font-semibold text-foreground">First comment</label>
                  {tabs.includes("tiktok") && <p className="text-muted-foreground">TikTok has no first comment. It goes on the other networks.</p>}
                  <Textarea id={`fc-${draft.id}`} value={firstComment} onChange={(e) => setFirstComment(e.target.value)} rows={2} className="text-xs" />
                  <p className={firstComment.trim().length > FIRST_COMMENT_MAX ? "text-destructive" : "text-muted-foreground"}>{firstComment.trim().length} / {FIRST_COMMENT_MAX}</p>
                  {fcFlags.map((f) => (
                    <p key={f.id} className={f.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-300"}>
                      <span className="font-semibold">{f.match}</span>: {f.message}
                    </p>
                  ))}
                  <div className="flex flex-wrap gap-3">
                    {openTab !== "tiktok" && moveHashtags(captionOf(tabs, versions, base, openTab), firstComment) && (
                      <button type="button" onClick={moveTags} className={`font-semibold text-primary hover:underline ${TOUCH}`}>Move hashtags to first comment</button>
                    )}
                    {moved && <button type="button" onClick={undoMove} className={`font-semibold text-primary hover:underline ${TOUCH}`}>Undo</button>}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {score ? (
                  <Link to={links.generate({ draft: draft.id, section: "score" })} aria-label={`Predicted engagement ${score.v} out of 10`} className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[10px] font-semibold ${TOUCH} ${scoreTone(score.v)}`}>
                    {score.v}/10
                  </Link>
                ) : (
                  <button type="button" onClick={() => void scoreIt()} disabled={scoring === "busy"} className={`inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline ${TOUCH}`}>
                    {scoring === "busy" && <Loader2 className="h-3 w-3 animate-spin" />}
                    Score it first
                  </button>
                )}
                {scoring && scoring !== "busy" && <span className="text-destructive">{scoring}</span>}
              </div>
            </>
          )}

          <div className="space-y-1.5 border-t border-border/60 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              {step === "where" ? (
                <Button size="sm" variant="ghost" onClick={onClose} className={`h-9 ${TOUCH}`}>Cancel</Button>
              ) : (
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => go(SCHEDULE_STEPS[n - 1])} className={`h-9 gap-1.5 ${TOUCH}`}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              {reason && !busy && <span className="text-muted-foreground sm:order-none">{reason}</span>}
              {step !== "caption" ? (
                <Button size="sm" disabled={!!reason} onClick={() => go(SCHEDULE_STEPS[n + 1])} className={`ml-auto h-9 gap-1.5 ${TOUCH}`}>
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" disabled={!!reason || !!busy} onClick={() => void send()} className={`ml-auto h-9 gap-1.5 ${TOUCH}`}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {busyLabel ?? (failed ? "Try again" : goesNow ? (allInbox ? "Send to inbox" : "Post now") : `Schedule for ${whenText}`)}
                </Button>
              )}
            </div>
            {error && (
              <div role="alert" className="flex flex-wrap items-center justify-end gap-2 text-right">
                <p className="text-destructive">{error}</p>
                {error === TIKTOK_BUSY && tiktokId && (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void toInbox()} className={`h-9 ${TOUCH}`}>Send to inbox instead</Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Option({ name, on, onPick, label, detail }: { name: string; on: boolean; onPick: () => void; label: string; detail?: string }) {
  return (
    <label className={`flex min-h-9 flex-wrap items-center gap-x-2 ${TOUCH}`}>
      <input type="radio" name={name} checked={on} onChange={onPick} className="h-4 w-4 accent-primary" />
      <span className="font-semibold text-foreground">{label}</span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
    </label>
  );
}
