// Post it for me (My posts, Calendar, Write): schedule a dated draft on the adviser's own connected
// accounts through Zernio, and the status chip it leaves on the draft (Scheduled, Posted with links,
// Failed with the reason and Retry, Cancel). The server checks every id and field again
// (supabase/functions/social/posts.ts); src/lib/autoPost.ts holds the rules and the upload.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, RotateCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { EdgeError } from "@/lib/edgeFn";
import { hasComplianceErrors, scanCompliance } from "@/lib/compliance";
import { checkLimits, type PlatformId } from "@/lib/platformCounters";
import { activeProfileId } from "@/lib/profiles";
import { isNotEnabled, platformName, socialStatus, type AccountView } from "@/lib/socialConnect";
import { DEFAULT_BRAND, loadBrand, loadCarousels, type SavedCarousel } from "@/lib/carousel";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgToPng } from "@/lib/carouselRender";
import { getFile } from "@/lib/deviceFiles";
import { draftStatus, setDraftStatus, setDraftZernio, type DraftEntry } from "@/lib/draftHistory";
import { scheduleTime } from "@/lib/dueDates";
import {
  CAPTION_MAX,
  MAX_PICTURES,
  MEDIA_TYPES,
  NEEDS_MEDIA,
  YOUTUBE_TITLE_MAX,
  canCancel,
  canRetry,
  chipOf,
  fileProblem,
  fileType,
  isDue,
  linkFromView,
  mediaKind,
  platformProblem,
  postText,
  readPost,
  retryPost,
  cancelPost,
  schedulePost,
  tiktokInfo,
  uploadAll,
  whenLabel,
  zernioTime,
  type CreatorInfo,
  type MediaFile,
  type PostView,
} from "@/lib/autoPost";

const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't go through. Try again in a minute.");
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const pill = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${TOUCH} ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

/** The draft's own carousel slides as PNGs, drawn the way Carousel draws them. */
async function carouselPngs(userId: string, c: SavedCarousel): Promise<MediaFile[]> {
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
  const out: MediaFile[] = [];
  for (const [i, s] of c.slides.entries()) {
    const layout = layoutSlide(
      { title: s.title, body: s.body, index: i, total: c.slides.length, brand, image: s.image ? pictures[s.image] || undefined : undefined, align: c.align, scale: c.scale, font: c.font, paper: c.paper },
      measure,
    );
    out.push({ file: await svgToPng(renderSvg(layout)), name: "slide.png", type: "image/png" });
  }
  return out;
}

/** What Zernio said about the post, onto the draft; a published post marks the draft posted. */
function applyView(userId: string, d: DraftEntry, view: PostView): DraftEntry[] {
  let next = setDraftZernio(userId, d.id, linkFromView(d.zernio!.key, view));
  if (view.status === "published" && draftStatus(d) !== "posted") next = setDraftStatus(userId, d.id, "posted");
  return next;
}

/** A 404 that isn't "not enabled": the post is gone from Zernio (or was never this brand's). */
const gone = (e: unknown) => e instanceof EdgeError && e.status === 404 && !isNotEnabled(e);

/** On page load: asks Zernio about up to 10 posts whose time has come, so My posts and Calendar show what happened. */
export function useZernioRefresh(userId: string | null, drafts: DraftEntry[], onDrafts: (d: DraftEntry[]) => void) {
  const ran = useRef(false);
  useEffect(() => {
    if (!userId || ran.current) return;
    const due = drafts.filter((d) => isDue(d.zernio)).slice(0, 10);
    if (!due.length) return;
    ran.current = true;
    const profileId = activeProfileId(userId);
    void (async () => {
      for (const d of due) {
        try {
          onDrafts(applyView(userId, d, (await readPost(profileId, d.zernio!.postId!)).post));
        } catch (e) {
          if (gone(e)) onDrafts(setDraftZernio(userId, d.id, null));
          else return; // off, offline or over the cap: try on the next visit
        }
      }
    })();
  }, [userId, drafts, onDrafts]);
}

const TONE = {
  wait: "border-primary/40 bg-primary/10 text-primary",
  good: "border-success/40 bg-success/10 text-success",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border/60 bg-muted/40 text-muted-foreground",
} as const;

/** The small chip alone (calendar cards). */
export function ZernioChipLabel({ draft }: { draft: DraftEntry }) {
  const chip = chipOf(draft.zernio);
  if (!chip) return null;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONE[chip.tone]}`}>{chip.label}</span>;
}

/** The chip with its details: each platform's link or reason, Retry and Cancel. */
export function ZernioStatus({ userId, draft, onDrafts }: { userId: string; draft: DraftEntry; onDrafts: (d: DraftEntry[]) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PostView | null>(null);
  const [busy, setBusy] = useState<"read" | "retry" | "cancel" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const link = draft.zernio;
  const chip = chipOf(link);
  if (!chip || !link?.postId) return null;
  const profileId = activeProfileId(userId);

  const run = async (what: "read" | "retry" | "cancel") => {
    if (busy) return;
    setBusy(what);
    setError("");
    try {
      if (what === "cancel") {
        await cancelPost(profileId, link.postId!);
        onDrafts(setDraftZernio(userId, draft.id, null));
        toast({ title: "Cancelled", description: "Zernio won't post it. It stays in My posts." });
        return;
      }
      const { post } = what === "retry" ? await retryPost(profileId, link.postId!) : await readPost(profileId, link.postId!);
      setView(post);
      onDrafts(applyView(userId, draft, post));
      if (what === "retry") toast({ title: post.status === "published" ? "Posted" : "Trying again", description: post.status === "published" ? undefined : "Zernio is posting it again." });
    } catch (e) {
      if (gone(e)) {
        onDrafts(setDraftZernio(userId, draft.id, null));
        toast({ title: "That post is gone from Zernio", description: "It stays in My posts." });
      } else setError(message(e));
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void run("read");
  };
  const lines = view?.platforms ?? [];

  return (
    <div className="w-full">
      <button type="button" onClick={toggle} aria-expanded={open} className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold ${TOUCH} ${TONE[chip.tone]}`}>
        {busy === "read" && <Loader2 className="h-3 w-3 animate-spin" />}
        {chip.label}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs">
          {lines.length ? (
            <ul className="space-y-1.5">
              {lines.map((p, i) => (
                <li key={`${p.accountId}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold text-foreground">{platformName(p.platform)}</span>
                  <span className="text-muted-foreground">{p.status === "published" ? "Posted" : p.status === "failed" ? "Failed" : p.status === "cancelled" ? "Removed" : "Waiting"}</span>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 font-semibold text-primary hover:underline ${TOUCH}`}>
                      View post <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {p.error && <span className="w-full text-destructive">{p.error}</span>}
                </li>
              ))}
            </ul>
          ) : (
            link.links?.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={`mr-3 inline-flex items-center gap-1 font-semibold text-primary hover:underline ${TOUCH}`}>
                {platformName(l.platform)} <ExternalLink className="h-3 w-3" />
              </a>
            ))
          )}
          {!lines.length && link.error && <p className="text-destructive">{link.error}</p>}
          {error && <p className="text-destructive">{error}</p>}
          {(canRetry(link) || canCancel(link)) && (
            <div className="flex flex-wrap gap-2">
              {canRetry(link) && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run("retry")} className={`h-9 gap-1.5 ${TOUCH}`}>
                  {busy === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Retry
                </Button>
              )}
              {canCancel(link) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => (confirm ? void run("cancel") : setConfirm(true))}
                  className={`h-9 gap-1.5 ${confirm ? "text-destructive" : "text-muted-foreground"} ${TOUCH}`}
                >
                  {busy === "cancel" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {confirm ? "Confirm cancel" : "Cancel post"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type MediaMode = "carousel" | "import" | "files" | "none";
type TikTokForm = { privacyLevel: string; allowComment: boolean; allowDuet: boolean; allowStitch: boolean };

/** The panel under a dated draft: accounts, media, time, caption, platform settings, then one Schedule button. */
export function PostItForMePanel({
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
  const profileId = activeProfileId(userId);
  const platform = draft.platform;
  const carousel = useMemo(() => loadCarousels(userId).find((c) => c.draftId === draft.id) ?? null, [userId, draft.id]);
  const importLink = draft.media && mediaKind(draft.media) ? draft.media : null;
  const [state, setState] = useState<"loading" | "off" | "ready" | "error">("loading");
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<MediaMode>(carousel ? "carousel" : importLink ? "import" : "files");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const draftTime = scheduleTime(draft.scheduledFor);
  const [time, setTime] = useState(draftTime ?? "09:00");
  const [now, setNow] = useState(false);
  const [caption, setCaption] = useState(() => postText(draft, loadBrand(userId)));
  const [ytTitle, setYtTitle] = useState("");
  const [info, setInfo] = useState<CreatorInfo | null>(null);
  const [tiktok, setTiktok] = useState<TikTokForm>({ privacyLevel: "", allowComment: false, allowDuet: false, allowStitch: false });
  const [busy, setBusy] = useState<{ upload: number } | "render" | "send" | null>(null);
  const [error, setError] = useState("");
  const uploaded = useRef(new Map<Blob, string>());
  const slides = useRef<MediaFile[] | null>(null);
  const root = useRef<HTMLElement>(null);
  // one key per send: an unanswered earlier try is resent with its own key, so it never posts twice
  const key = useRef(draft.zernio && !draft.zernio.postId ? draft.zernio.key : crypto.randomUUID());

  useEffect(() => {
    // Calendar renders its editor twice (phone and desktop): only the copy on screen asks
    if (root.current && root.current.offsetParent === null) return;
    let live = true;
    socialStatus(profileId)
      .then((s) => {
        if (!live) return;
        const mine = s.accounts.filter((a) => a.platform === platform);
        setAccounts(mine);
        setPicked(mine.filter((a) => !a.needsReconnect).map((a) => a.id));
        setState("ready");
      })
      .catch((e) => live && setState(isNotEnabled(e) ? "off" : "error"));
    return () => {
      live = false;
    };
  }, [profileId, platform]);

  // stand-in links with each file's own ending, so the same platform rules as the server's apply here
  const mediaUrls =
    mode === "carousel" && carousel ? carousel.slides.map((_, i) => `https://upload.local/${i}.png`)
    : mode === "import" && importLink ? [importLink]
    : mode === "files" ? files.map((f, i) => `https://upload.local/${i}.${MEDIA_TYPES[f.type]?.[0] ?? "bin"}`)
    : [];
  const video = mediaUrls.some((u) => mediaKind(u) === "video");
  const tiktokId = platform === "tiktok" ? picked[0] : undefined;

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
    return () => {
      live = false;
    };
  }, [profileId, tiktokId, video]);

  const day = draft.scheduledFor?.slice(0, 10) ?? "";
  const at = zernioTime(draft.scheduledFor, time);
  const passed = !at || Date.parse(at) < Date.now() + 60_000;
  const goesNow = now || passed;
  const flags = scanCompliance(caption);
  const limits = (["linkedin", "instagram", "facebook", "tiktok"] as string[]).includes(platform) ? checkLimits(caption, platform as PlatformId) : null;
  const max = CAPTION_MAX[platform as keyof typeof CAPTION_MAX] ?? 63206;
  const fileIssue = mode === "files" ? files.map((f) => fileProblem({ name: f.name, type: f.type, size: f.file.size })).find(Boolean) : null;
  const tiktokInput = platform === "tiktok" && tiktok.privacyLevel ? tiktok : null;
  const problem = platformProblem(
    { clientKey: key.current, content: caption, captions: {}, mediaUrls, scheduledFor: null, firstComment: "", tiktok: tiktokInput, youtube: null },
    picked.length ? accounts.filter((a) => picked.includes(a.id)).map((a) => a.platform) : [],
  );
  const reason =
    (blockReason ? `Team rule: ${blockReason}` : null) ??
    (state !== "ready" ? "Loading your accounts..." : null) ??
    fileIssue ??
    (mode === "files" && files.length > MAX_PICTURES ? `Pick up to ${MAX_PICTURES} pictures.` : null) ??
    problem ??
    (platform === "tiktok" && info && !info.canPostMore ? "TikTok says this account can't post more right now. Try later." : null) ??
    (hasComplianceErrors(flags) ? "Fix the compliance error in the caption first." : null);

  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setFiles([...list].map((f) => ({ file: f, name: f.name, type: fileType(f) ?? f.type })));
    setError("");
  };

  const send = async () => {
    if (reason || busy) return;
    setError("");
    // the key is on the draft before the call, so an answer lost on the way never sends a second post
    onDrafts(setDraftZernio(userId, draft.id, { key: key.current }));
    try {
      let media: MediaFile[] = mode === "files" ? files : [];
      if (mode === "carousel" && carousel) {
        if (!slides.current) {
          setBusy("render");
          slides.current = await carouselPngs(userId, carousel);
        }
        media = slides.current;
      }
      let mediaUrls = mode === "import" && importLink ? [importLink] : [];
      if (media.length) {
        setBusy({ upload: 0 });
        mediaUrls = await uploadAll(profileId, media, uploaded.current, (p) => setBusy({ upload: p }));
      }
      setBusy("send");
      const { post } = await schedulePost(profileId, {
        accountIds: picked,
        clientKey: key.current,
        content: caption,
        mediaUrls,
        ...(goesNow ? { now: true } : { scheduledFor: at! }),
        ...(draft.firstComment?.trim() ? { firstComment: draft.firstComment.trim() } : {}),
        ...(tiktokInput ? { tiktok: tiktokInput } : {}),
        ...(platform === "youtube" ? { youtube: { title: ytTitle.trim(), visibility: "public" as const } } : {}),
      });
      onDrafts(setDraftZernio(userId, draft.id, linkFromView(key.current, post)));
      toast({
        title: goesNow ? `Posting to ${platformName(platform)}` : `Scheduled on ${platformName(platform)}`,
        description: goesNow ? "It goes out in about a minute." : `${whenLabel(day, time)}. The chip on the post shows when it's up.`,
      });
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const busyLabel = busy === "render" ? "Drawing the slides..." : busy === "send" ? "Scheduling..." : busy ? `Uploading ${busy.upload}%` : null;

  return (
    <section ref={root} aria-label="Post it for me" className="mt-3 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Post it for me</p>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-2 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground sm:h-8 sm:w-8">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {state === "loading" && <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your accounts...</p>}
      {state === "off" && <p className="text-muted-foreground">Social accounts aren't switched on for you yet.</p>}
      {state === "error" && <p className="text-destructive">Couldn't load your accounts. Close this and try again in a minute.</p>}
      {state === "ready" && !accounts.length && (
        <p className="text-muted-foreground">
          Connect your {platformName(platform)} account first.{" "}
          <Link to="/accounts" className={`inline-flex items-center font-semibold text-primary hover:underline ${TOUCH}`}>Social accounts</Link>
        </p>
      )}

      {state === "ready" && accounts.length > 0 && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 font-semibold text-foreground">Post to</legend>
            {accounts.map((a) => (
              <label key={a.id} className={`flex min-h-9 items-center gap-2 ${TOUCH}`}>
                <input
                  type="checkbox"
                  checked={picked.includes(a.id)}
                  disabled={a.needsReconnect}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-foreground">{a.username ? `@${a.username}` : a.name}</span>
                <span className="text-muted-foreground">{platformName(a.platform)}{a.needsReconnect ? ", reconnect it on Social accounts first" : ""}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold text-foreground">With</legend>
            <div className="flex flex-wrap gap-1.5">
              {carousel && <button type="button" aria-pressed={mode === "carousel"} onClick={() => setMode("carousel")} className={pill(mode === "carousel")}>Carousel slides ({carousel.slides.length})</button>}
              {importLink && <button type="button" aria-pressed={mode === "import"} onClick={() => setMode("import")} className={pill(mode === "import")}>Your imported {mediaKind(importLink) === "video" ? "video" : "picture"}</button>}
              <button type="button" aria-pressed={mode === "files"} onClick={() => setMode("files")} className={pill(mode === "files")}>A file</button>
              {!NEEDS_MEDIA.includes(platform) && <button type="button" aria-pressed={mode === "none"} onClick={() => setMode("none")} className={pill(mode === "none")}>Text only</button>}
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
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="mb-1 font-semibold text-foreground">When</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {day && (
                <button type="button" aria-pressed={!goesNow} disabled={passed && !!at} onClick={() => setNow(false)} className={pill(!goesNow)}>
                  {at && !passed ? whenLabel(day, time) : "On its day"}
                </button>
              )}
              <button type="button" aria-pressed={goesNow} onClick={() => setNow(true)} className={pill(goesNow)}>Now</button>
              {!draftTime && !now && (
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  at
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground ${TOUCH}`} />
                </label>
              )}
            </div>
            {passed && at && <p className="text-muted-foreground">Its time has passed, so it goes now.</p>}
          </fieldset>

          <div className="space-y-1">
            <label htmlFor={`caption-${draft.id}`} className="font-semibold text-foreground">Caption</label>
            <Textarea id={`caption-${draft.id}`} value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="text-xs" />
            <p className={caption.length > max ? "text-destructive" : "text-muted-foreground"}>
              {caption.length} / {max}
              {limits?.warnings.length ? `. ${limits.warnings.map((w) => w.message).join(" ")}` : ""}
            </p>
            {flags.map((f) => (
              <p key={f.id} className={f.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-300"}>
                <span className="font-semibold">{f.match}</span>: {f.message}
              </p>
            ))}
          </div>

          {platform === "tiktok" && (
            <fieldset className="space-y-1.5">
              <legend className="mb-1 font-semibold text-foreground">On TikTok</legend>
              {!info && tiktokId && <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your TikTok settings...</p>}
              {info && (
                <>
                  <label className="flex flex-wrap items-center gap-2">
                    Who can see it
                    <select
                      value={tiktok.privacyLevel}
                      onChange={(e) => setTiktok((t) => ({ ...t, privacyLevel: e.target.value }))}
                      className={`h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground ${TOUCH}`}
                    >
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
                </>
              )}
            </fieldset>
          )}

          {platform === "youtube" && (
            <div className="space-y-1">
              <label htmlFor={`yt-${draft.id}`} className="font-semibold text-foreground">YouTube title</label>
              <Input id={`yt-${draft.id}`} value={ytTitle} maxLength={YOUTUBE_TITLE_MAX} onChange={(e) => setYtTitle(e.target.value)} placeholder="The caption's first line" className="h-9 text-xs" />
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void send()} disabled={!!reason || !!busy} className={`h-9 gap-1.5 ${TOUCH}`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {busyLabel ?? (goesNow ? "Post now" : at ? `Schedule for ${whenLabel(day, time)}` : "Schedule")}
        </Button>
        {reason && !busy && state === "ready" && accounts.length > 0 && <span className="text-muted-foreground">{reason}</span>}
        {blockReason && state !== "ready" && <span className="text-muted-foreground">Team rule: {blockReason}</span>}
      </div>
    </section>
  );
}
