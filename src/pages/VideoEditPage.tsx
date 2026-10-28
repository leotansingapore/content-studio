import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EDIT_TABS, links, type EditTab, type PostLang } from "@/lib/links";
import { useScrollToHash, useUrlList, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { Check, ChevronDown, ChevronUp, Download, Eye, Layers, Mic, Music as MusicIcon, RotateCw, Square, Volume2, Film, ImageIcon, Pause, Play, Search, Sparkles, Trash2, Undo2, Upload, Wand2, Languages } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import StockSearch from "@/components/StockSearch";
import YoutubeClips from "@/components/YoutubeClips";
import JoinTakes from "@/components/JoinTakes";
import ClipFinder from "@/components/ClipFinder";
import ClipsPanel from "@/components/ClipsPanel";
import OwnMediaPanel from "@/components/OwnMediaPanel";
import ExportRunning from "@/components/ExportRunning";
import ExportSizes from "@/components/ExportSizes";
import MotionControls from "@/components/MotionControls";
import ChartCards from "@/components/ChartCards";
import BurnedTextOffer from "@/components/BurnedTextOffer";
import AutoBroll from "@/components/AutoBroll";
import BrollLayout from "@/components/BrollLayout";
import HookOptions from "@/components/HookOptions";
import ColdOpenControl from "@/components/ColdOpenControl";
import StylePresets from "@/components/StylePresets";
import ReelStyleCopy from "@/components/ReelStyleCopy";
import PlatformCaptions from "@/components/PlatformCaptions";
import ScriptCard from "@/components/edit/ScriptCard";
import ComplianceChips from "@/components/ComplianceChips";
import { coldLength } from "@/lib/coldOpen";
import { coverTimes, findCoverFrame } from "@/lib/coverFrame";
import { gridWindow, type Band } from "@/lib/igGrid";
import { onBrollApply } from "@/lib/autoBroll";
import { MAX_MUSIC_SECONDS, MOODS, MOOD_IDS, aiMusicOn, dismissMusicJob, musicJob, onMusicApply, onMusicJob, pickMood, startMusic, type Mood } from "@/lib/aiMusic";
import AiVideo from "@/components/AiVideo";
import { montageBusy } from "@/lib/montage";
import { MAX_AVATAR_SECONDS, aiBusy, aiJob, makeVersion, onAiJob, pendingAvatar, resumeAvatar, sliceVoiceover, versionRun, versionWords, type Voiceover } from "@/lib/aiVideo";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import {
  DEFAULT_EMOTION, DUB_LANGS, EMOTIONS, EMOTION_IDS, MAX_SCRIPT, PACES, PACE_IDS, VOICES, VOICE_IDS, audioSeconds, speak, speakDub,
  type Delivery, type DubLang, type VoiceId,
} from "@/lib/textVoice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { streamOnePost } from "@/lib/batchGenerate";
import { splitScriptCaption, withVideoCaption } from "@/lib/scriptCaption";
import { getDraftById, loadDrafts, upsertDraft } from "@/lib/draftHistory";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { scanCompliance } from "@/lib/compliance";
import { stripDashes } from "@/lib/recruit";
import { loadBrand } from "@/lib/carousel";
import { tagLinks, withSignOff } from "@/lib/plainText";
import { checkLimits, strayLinks } from "@/lib/platformCounters";
import { allowedLinks, applyBrandRules, avoidList, brandRulesLine } from "@/lib/brandRules";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { supabase } from "@/lib/supabase";
import { useUsesLeft } from "@/lib/aiUsage";
import { useLeoOnly } from "@/lib/useLeoOnly";
import PriceChip from "@/components/PriceChip";
import { priceOf, priceText, reasonText, sumPrices, type Price, type PriceOpts } from "@/lib/prices";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";
import {
  STYLES,
  STYLE_IDS,
  APP_COVER,
  appCover,
  applyFixes,
  exportIssues,
  applyPatch,
  aspectSize,
  captionCenter,
  captionKey,
  clearOfApp,
  fixFromEdit,
  END_CARD_SECONDS,
  INTRO_CARD_SECONDS,
  introLength,
  FONTS,
  FILTERS,
  animOf,
  captionBoxOf,
  fullLength,
  findPhrase,
  levelFits,
  sanitizeLevel,
  duckSpans,
  musicGainAt,
  sanitizeMusic,
  sanitizeCutaways,
  sanitizePublish,
  editedSentences,
  type Cutaway,
  type PublishIdea,
  MUSIC_LEVEL,
  sanitizeVoiceover,
  voiceAt,
  MAX_BROLL,
  newBroll,
  sanitizeBroll,
  type Broll,
  addRemoved,
  removedAt,
  sanitizeRemoved,
  wordRange,
  MAX_OVERLAYS,
  newOverlay,
  overlayHit,
  sanitizeOverlays,
  blockGrip,
  readSeconds,
  wallSettings,
  type Overlay,
  type OverlayKind,
  OVERLAY_LABELS,
  listCuts,
  platformFit,
  trimToLength,
  exportSize,
  fmtBytes,
  targetOf,
  wideForUpright,
  EXPORT_TARGETS,
  type ExportTarget,
  lookOf,
  sameLook,
  toSrt,
  withLook,
  withKit,
  sentencesOf,
  defaultSettings,
  fmtTime,
  isFiller,
  outAt,
  outIn,
  segAt,
  srcAt,
  speedOf,
  SPEEDS,
  totalLength,
  withStyle,
  type CaptionFix,
  type CoverApp,
  type ExportIssue,
  type EditSettings,
  type StyleId,
  outputCues,
  dubPlacement,
  sanitizeStand,
  standOf,
  brandFixes,
  captionTerms,
  keyLines,
  keyWordOf,
  sanitizeKeyWords,
  styleLabel,
  type Word,
} from "@/lib/videoEdit";
import { CAPTION_LOOKS, captionLookIn, captionsAsDefault, keyCount, keyWordsFrom, keysStale, tapKeyWord, withCaptionLook, type CaptionLook } from "@/lib/captionLooks";
import { MAX_KEYWORD_LINES, keyCandidates } from "../../supabase/functions/video-assist/keywords.ts";
import {
  bufferTrack,
  decodeSound,
  drawEndCard,
  drawFrame,
  drawIntroCard,
  ensureCaptionFonts,
  loadBrandArt,
  measureExport,
  measureLevel,
  wireVoice,
  exportAll,
  exportJob,
  exportQueue,
  makeCover,
  thumbOf,
  currentJoin,
  endJoin,
  onJoinJob,
  type JoinJob,
  audioPeaks,
  layDub,
  waveThumb,
  extractWav,
  getFile,
  layoutBlock,
  loadVideo,
  onExportJob,
  planFor,
  putFile,
  startExport,
  stills,
  syncBroll,
  syncBackdrop,
  type BrandArt,
  type ExportJob,
  type FileCheck,
  type Frame,
  type JoinExtra,
  pickupPlan,
  type PickupPath,
  layOver,
  monoPcm,
  onOutputClock,
  startSlides,
} from "@/lib/videoMedia";
import type { VersionPlan } from "@/lib/exportVersions";
import { blackStretches, frameTimes, lookAtFrames, pictureAndClipIssues } from "@/lib/exportCheck";
import { FAST, isFast } from "@/lib/fastPauses";
import { DENOISE_RATE, denoiseNode } from "@/lib/denoise";
import { MAX_WATCH_SECONDS, WATCH_LABELS, onWatchJob, startWatch, watchJob, type WatchJob } from "@/lib/watchCut";
import { aiChips, fileKey, suggestCutaways, loadFixes, loadProjects, pickKeyWords, publishIdeas, removeProject, saveFixes, saveProject, swapSource, swapped, transcribe, translateCaptions, vibeEdit, type VideoProject } from "@/lib/videoProjects";
import { findFaceTrack, loadEffects, paintEffects, sanitizeBackdrop } from "@/lib/faceVision";
import { cutTimes, dropGain, motionOf, previewSfx } from "@/lib/videoMotion";
import { cropShare, lookSpans, sanitizeTrack, trackCovers } from "@/lib/faceFollow";
import { pairShare, slidesCaptionY } from "@/lib/stacked";
import { defaultSkill, loadSkills, newSkillId, removeSkill, saveSkill, suggestName, type VideoSkill } from "@/lib/videoSkills";
import LongCaptions, { CaptionJobStatus } from "@/components/LongCaptions";
import SubtitleImport from "@/components/SubtitleImport";
import { onCaptionJob, startCaptions } from "@/lib/captionJob";
import { scriptWords } from "@/lib/subtitleImport";
import { onClipFind, runClipAsk, setClipAsk, startLook, type ClipAsk } from "@/lib/clipAsk";
import { FEW_WORDS, LEO_PANELS, NO_SOUND, START_PANELS, footageWords, readsLonger, withPanel, type StartPanel } from "@/lib/ownMedia";
import { MAX_LONG_BYTES, MAX_LONG_SECONDS, PART_SECONDS, hoursMinutes, isLong } from "@/lib/longCaptions";
import { RATE, mediaLength, openSound } from "@/lib/longAudio";
import { peaksFrom } from "@/lib/videoEdit";
import { registerEditTarget, settingWords, type EditTarget } from "@/lib/editTarget";
import { PLANS_CHANGED, addVersion, compilePlan, loadPlans, versionId, type CutawayClip, type EditPlan, type PlanEntry, type Version } from "@/lib/editPlan";
import { callFn } from "@/lib/edgeFn";
import { faceFor, textsFromSpans, wordsIn, PARTS_GONE } from "@/lib/avatarScript";
import { MAS_FLAG } from "@/lib/presenter";
import { requestMake, tooLongLine, type Flags } from "@/lib/remix";
import { brandPack, loadRemixPrefs, offerNames } from "@/lib/remixBrand";
import type { RemixSource } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";
import { FILM_LINE, NO_STOCK, PRESENTER_GONE, PRESENTER_LINE, VOICE_FAILED, WRITE_FAILED, cutawayScenes, draftOf, editBrief, findCutaways, spoken, versionOf } from "@/lib/sameEditJob";
import { makeBody } from "@/lib/slideshowJob";
import { aiMark, speakerFace, speakerOf, speakers, useSpeakers } from "@/lib/talkingHead";
import { LANG_NAMES } from "@/lib/translate";
import { otherFormulas } from "@/lib/variants";
import { pickHook } from "@/lib/writingJudge";
import type { AiPart } from "@/lib/videoEdit";
import type { AiMark } from "@/lib/videoProjects";
import type { EditResult } from "../../supabase/functions/remix/logic.ts";

// Linkable state (docs/deep-links.md): ?p= the open project (push; opening one starts the editor's params afresh),
// then ?tab= ?mode= ?sticker= ?broll= ?guide= ?view= inside it, and ?panel= ?kind= ?template= on the start screen.
type Tab = EditTab;
// The start panels are START_PANELS for everyone; Words over a video, Your own video or pictures and Long video into
// clips are north-star work for Leo's sign-ins only (LEO_PANELS, src/lib/ownMedia.ts; docs/north-star/README.md, "The gate").
const WALL_ERROR = "That video couldn't be opened. Try an MP4 or MOV.";
// stickers with no words; every other kind gets a text field in the sticker editor
const SHAPES: OverlayKind[] = ["arrow", "circle", "underline"];
// the AI panel's params (docs/deep-links.md), dropped when it closes
const AI_PARAMS_GONE = Object.fromEntries(["kind", "template", "talk", "offer", "look", "from", "topic", "link", "draft", "secs", "visuals", "face", "voice", "product", "set"].map((k) => [k, null]));
// the clips panel's (about is read once and gone already), dropped when it or the own panel's closes or own opens
const CLIPS_PARAMS_GONE = { about: null, len: null, yt: null };
// An upload is captioned in one use only while it is one part (captionPlan: up to 1.2 x PART_SECONDS), so its price is a ceiling.
const UPLOAD_CAPTIONS: Price = { ...(priceOf("video-transcribe", { minutes: (PART_SECONDS * 1.2) / 60 }) as Price), kind: "upTo" };

/** A same edit version opened as a project here: its plan remembers which project holds it (Version.project). */
function markVersion(userId: string, at: { id: string; version: string }, project: string) {
  const v = loadPlans(userId).find((e) => e.plan.id === at.id)?.versions.find((x) => x.id === at.version);
  if (v && v.project !== project) addVersion(userId, at.id, { ...v, project });
}

export default function VideoEditPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [busy, setBusy] = useState<string>("");
  const leo = useLeoOnly();
  const pid = params.get("p");
  const project = projects.find((p) => p.id === pid) ?? null;

  useEffect(() => {
    document.title = "Edit video - Postmosis";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setProjects(loadProjects(id));
    });
  }, []);
  // a long recording's captions land in the saved project while this page may be open
  useEffect(() => {
    const off = onCaptionJob((j) => { if (j?.state === "done") void supabase.auth.getUser().then(({ data }) => setProjects(loadProjects(data.user?.id ?? null))); });
    return () => { off(); };
  }, []);
  // a find saves its clips as projects (clipAsk.ts, outside React), whichever screen is open
  useEffect(() => (userId ? onClipFind(() => setProjects(loadProjects(userId))) : undefined), [userId]);

  /**
   * `ask` is what a start panel wants beyond a hand-off's extra: the look a recording starts with (else today's default
   * skill), the clips to find by itself once its words land (clipAsk.ts), and words on screen for footage that turns
   * out to have little or no speech (ownMedia.ts). A recording from a panel captions itself.
   */
  const upload = async (file: File, extra?: JoinExtra, ask?: { look?: string; clips?: ClipAsk; own?: { about: string } }) => {
    // A file picked before the sign-in check finished must not be dropped.
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return toast({ title: "Sign in again to edit videos", variant: "destructive" });
    const sound = file.type.startsWith("audio/");
    if (!file.type.startsWith("video/") && !sound) return toast({ title: "That isn't a video or sound file", variant: "destructive" });
    if (file.size > MAX_LONG_BYTES) return toast({ title: "That file is over 4 GB", description: "Trim it or export a smaller copy first.", variant: "destructive" });
    const id = `v${Date.now().toString(36)}`;
    const look = startLook(loadSkills(uid), ask?.look ?? "");
    const pending = look.skill?.prompt ? { pendingSkill: look.skill.id } : {};
    // the own panel's words on screen for footage with little or no speech; a failure keeps the video as it is
    const withOwnWords = async (p: VideoProject, about: string): Promise<VideoProject> => {
      setBusy("Writing the words...");
      try {
        const w = await footageWords(uid, about, p.duration);
        const next = { ...p, settings: { ...p.settings, hook: w.hook, overlays: [...(p.settings.overlays ?? []), ...w.overlays] } };
        setProjects(saveProject(uid, next));
        return next;
      } catch (e) {
        toast({ title: "Couldn't write the words", description: (e as Error).message, variant: "destructive" });
        return p;
      }
    };
    try {
      setBusy("Reading your video...");
      const read = await mediaLength(file);
      // a WebM recording (Firefox, Chrome before 126) reads as Infinity; a wall's block already spans the joined length
      const length = Number.isFinite(read) && read > 0 ? read : (extra?.settings?.wall ? extra.settings.overlays?.find((o) => o.kind === "block")?.to : undefined) ?? read;
      // what a format's hand-off asks for (toast, caption, source, draft, tab), the same on every path below
      const open = (path: PickupPath, quiet = false) => {
        const plan = pickupPlan(extra, path);
        // a same edit version's plan learns which project holds it (on this device)
        if (plan.keep.plan) markVersion(uid, plan.keep.plan, id);
        setParams({ p: id, ...(plan.tab ? { tab: plan.tab } : {}) });
        if (plan.toast && !quiet) toast(plan.toast);
        return plan;
      };
      if (extra?.settings?.wall) {
        // words over a video: a stock clip often has no sound track, so nothing is decoded and nothing captioned
        const opened = !sound && Number.isFinite(length) && length > 0;
        const thumb = opened ? await stills(file, [0.3], 240).then((t) => t[0], () => null) : null;
        if (thumb === null) return toast({ title: WALL_ERROR, variant: "destructive" });
        setBusy("Saving it on this device...");
        await putFile(id, file);
        // the words block spans the whole clip, however long the caller guessed
        const overlays = extra.settings.overlays?.map((o) => (o.kind === "block" ? { ...o, to: length } : o));
        const named = overlays?.find((o) => o.kind === "block")?.text.split("\n")[0].trim().slice(0, 40);
        setProjects(saveProject(uid, {
          id, name: named || file.name.replace(/\.[^.]+$/, ""), createdAt: new Date().toISOString(), updatedAt: "", duration: length, size: file.size,
          words: [], settings: { ...withKit(withLook(defaultSettings("bold"), defaultSkill(loadSkills(uid))?.look), loadBrand(uid), leo), ...extra.settings, overlays }, thumb,
          // a wall of text made on /make/wall-of-text brings its caption and the post it remixed
          ...pickupPlan(extra, "wall").keep,
        }));
        // a format's video says it is ready; only the start panel's own upload is done with the words typed there
        if (!open("wall").toast) {
          try { sessionStorage.removeItem(WALL_DRAFT); } catch { /* nothing kept */ }
        }
        return;
      }
      if (isLong(length, file.size)) {
        // a long recording: saved first, then captioned in parts once the adviser has seen how many
        if (!Number.isFinite(length)) throw new Error("This browser can't open that video. Try an MP4 or MOV.");
        if (length > MAX_LONG_SECONDS) return toast({ title: `That recording runs ${hoursMinutes(length)}`, description: "The editor takes up to about 2 hours. Trim it first.", variant: "destructive" });
        const thumb = sound ? waveThumb(peaksFrom(await (await openSound(file, length)).read(0, 120), RATE)) : (await stills(file, [0.3], 240))[0];
        setBusy("Saving it on this device...");
        await putFile(id, file);
        const long: VideoProject = {
          id, name: file.name.replace(/\.[^.]+$/, ""), createdAt: new Date().toISOString(), updatedAt: "", duration: length, size: file.size,
          words: [], settings: { ...withKit(look.settings, loadBrand(uid), leo), ...extra?.settings }, thumb, ...pending,
          ...pickupPlan(extra, "long").keep,
        };
        setProjects(saveProject(uid, long));
        open("long");
        if (ask?.clips) setClipAsk(id, ask.clips);
        // a panel's recording captions itself, with no "Caption it in N parts" press (formats-clips)
        // shortcut: a long video from the own panel gets captions only; words for footage over 12 minutes with no speech wait for a real case
        if (ask) void startCaptions(uid, long, file).catch((e) => toast({ title: "Captions didn't start", description: (e as Error).message, variant: "destructive" }));
        return;
      }
      await putFile(id, file);
      const thumb = sound ? waveThumb(await audioPeaks(file)) : (await stills(file, [0.3], 240))[0];
      // a video with no sound track at all, sent by the own panel, is silent footage: words on screen, nothing to caption
      const heard = await extractWav(file).catch((e) => {
        if (ask?.own && Number.isFinite(length) && length > 0) return null;
        throw e;
      });
      const duration = heard?.duration ?? length;
      let p: VideoProject = {
        id, name: file.name.replace(/\.[^.]+$/, ""), createdAt: new Date().toISOString(), updatedAt: "", duration, size: file.size,
        words: [], settings: { ...withKit(look.settings, loadBrand(uid), leo), ...extra?.settings }, thumb, ...pending,
        ...pickupPlan(extra, extra?.settings?.captions === false ? "no-captions" : "captions").keep,
      };
      setProjects(saveProject(uid, p));
      if (ask?.clips) setClipAsk(id, ask.clips);
      // a montage has no speech to caption; it opens with its look, words and music, and says what stood in for a clip
      if (extra?.settings?.captions === false || !heard) {
        if (ask?.own) await withOwnWords(p, ask.own.about);
        open("no-captions");
        return;
      }
      // an AI video says its script word for word: its captions are timed from it and nothing is transcribed (live-p5dog D8);
      // a same edit version brings its voice's own word times, which its cutaways and labels were laid on
      const { said, words: timed } = pickupPlan(extra, "captions");
      if (!said && !timed) setBusy(`Writing the captions (about ${Math.max(10, Math.round(duration / 4))} seconds)...`);
      let landed = false;
      let silent = false;
      try {
        if (timed || said) {
          const words = timed ?? scriptWords(said!, duration);
          const planned = pickupPlan(extra, "captions").keep.plan;
          // a plan's cutaways and labels come laid on the words' clock; the editor draws them on the finished video's
          p = { ...p, words, ...(planned ? { settings: onOutputClock(p.settings, words, duration, planned.id) } : {}) };
          setProjects(saveProject(uid, p));
          landed = true;
        } else {
          // Leo's sign-ins also fix the brand kit's name as the captions mishear it ("Activity Tracker"), and ask Whisper to spell their fixed words
          const mine = [...loadFixes(uid), ...(leo ? brandFixes(loadBrand(uid)?.name) : [])];
          const t = await transcribe(heard.wav, undefined, leo ? captionTerms(mine) : undefined);
          const fixed = applyFixes(t.words, mine);
          p = { ...p, words: fixed.words };
          setProjects(saveProject(uid, p));
          landed = true;
          if (fixed.count) toast({ title: `Fixed ${fixed.count} ${fixed.count === 1 ? "word" : "words"} from your list` });
        }
      } catch (e) {
        silent = (e as Error).message === NO_SOUND;
        // footage from the own panel with no sound gets words on screen below instead
        if (!(ask?.own && silent)) toast({ title: "Captions didn't come through", description: `${(e as Error).message} Your video is saved; press Caption it to retry.`, variant: "destructive" });
      }
      if (ask?.clips && landed) runClipAsk(id, p.words);
      if (ask?.own && (landed ? p.words.length < FEW_WORDS : silent)) {
        p = await withOwnWords(p, ask.own.about);
      }
      // a format's toast once the captions land; a failure keeps the failure's words on screen
      open("captions", !landed);
    } catch (e) {
      toast({ title: "Couldn't open that video", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  // takes joined into one video (videoMedia, outside React): the file goes through upload once it is ready
  const [join, setJoin] = useState<JoinJob | null>(currentJoin());
  useEffect(() => { const off = onJoinJob(setJoin); return () => { off(); }; }, []);
  useEffect(() => {
    if (!join || join.state === "running") return;
    const j = endJoin();
    if (j?.file) void upload(j.file, j.extra);
    else if (j?.error) toast({ title: j.label ? "Couldn't put the video together" : "Couldn't join the takes", description: j.error, variant: "destructive" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [join?.state]);
  const joining = join?.state === "running" ? `${join.label ?? "Joining your takes"}${join.waiting ? `: ${join.waiting}` : `, ${Math.round(join.progress * 100)}%...`}` : "";

  return (
    <div className="space-y-5">
      {project && userId ? (
        <Editor
          key={project.id}
          userId={userId}
          leo={leo}
          project={project}
          onSave={(p) => setProjects(saveProject(userId, p))}
          onBack={() => setParams({}, { replace: true })}
        />
      ) : (
        <Start userId={userId} leo={leo} busy={busy || joining} projects={projects} onUpload={upload} onOpen={(id) => setParams({ p: id })}
          onRemove={(id) => userId && setProjects(removeProject(userId, id))} />
      )}
    </div>
  );
}

export function Start({ userId, leo, busy, projects, onUpload, onOpen, onRemove }: {
  userId: string | null;
  leo: boolean;
  busy: string;
  projects: VideoProject[];
  onUpload: (f: File, extra?: JoinExtra, ask?: { look?: string; clips?: ClipAsk; own?: { about: string } }) => Promise<unknown> | void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [panels] = useUrlList("panel", { allowed: leo ? LEO_PANELS : START_PANELS });
  const updateUrl = useUrlUpdate();
  // reopened while a video is being made, or to show why the last one failed
  const [aiAuto, setAiAuto] = useState(() => aiBusy() || montageBusy() || !!pendingAvatar() || aiJob()?.state === "failed");
  const joinOpen = panels.includes("join");
  const aiOpen = aiAuto || panels.includes("ai");
  const wallOpen = panels.includes("wall");
  const ownOpen = panels.includes("own");
  const clipsOpen = panels.includes("clips");
  // opening pushes, so Back closes it; own and clips open one at a time; closing a panel drops the params it reads too
  const gone = (k: StartPanel) => (k === "ai" ? AI_PARAMS_GONE : k === "clips" || k === "own" ? CLIPS_PARAMS_GONE : {});
  const openPanel = (k: StartPanel) => updateUrl({ panel: withPanel(panels, k).join(","), ...(k === "own" ? CLIPS_PARAMS_GONE : {}) }, { push: true });
  const closePanel = (k: StartPanel) => {
    if (k === "ai") setAiAuto(false);
    updateUrl({ panel: panels.filter((x) => x !== k).join(","), ...gone(k) });
  };
  const left = useUsesLeft(!!busy);
  const captions = left("video-transcribe");
  // Leo, same edit: ?plan=&version= is the upload screen for a version's filmed take, captioned as any upload
  const [sp] = useSearchParams();
  const takeAt = leo && userId && /^ep-/.test(sp.get("plan") ?? "") && /^ev-/.test(sp.get("version") ?? "") ? { id: sp.get("plan")!, version: sp.get("version")! } : null;
  const take = takeAt ? loadPlans(userId!).find((e) => e.plan.id === takeAt.id)?.versions.find((v) => v.id === takeAt.version) ?? null : null;
  const up = (f: File) => onUpload(f, take ? { plan: takeAt! } : undefined);
  return (
    <>
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Edit a video</h1>
        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="What it does">
          {["Auto captions", "Cuts um and long pauses", "Hook on screen", "9:16 reframe that follows your face", "Blur or swap your background", "Skin and eye touch-up", "Find clips in a long video", "Podcast audio to video", "Vibe edit by chat", "MP4 export"].map((t) => (
            <li key={t} className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{t}</li>
          ))}
        </ul>
      </header>
      {takeAt && (
        <section className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3" aria-label="Your take">
          <h2 className="text-sm font-semibold">{take ? FILM_LINE : "That edit isn't on this device yet. It shows here once it syncs."}</h2>
          {take && <ol className="list-decimal space-y-1 pl-5 text-sm">{take.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>}
        </section>
      )}
      {/* the own and clips panels have their own drop zone and show the busy line themselves */}
      {!ownOpen && !clipsOpen && <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) up(f); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          over ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50"
        } ${busy ? "pointer-events-none" : ""}`}
      >
        {busy ? (
          <>
            <ThinkingOrb state="working" size={64} theme="light" aria-hidden />
            <span className="text-sm font-semibold" aria-live="polite">{busy}</span>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elegant">
              <Upload className="h-6 w-6" />
            </span>
            <span className="text-base font-semibold">Upload a video of you talking</span>
            <span className="text-xs text-muted-foreground">A video, or a podcast or voice clip (MP3, M4A, WAV). Up to 4 GB and about 2 hours. It stays on this device.</span>
            <Left n={captions} what="Captioning" price={UPLOAD_CAPTIONS} quiet />
          </>
        )}
        <input type="file" accept="video/*,audio/*" className="sr-only" disabled={!!busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) up(f); }} />
      </label>}
      {ownOpen && <OwnMediaPanel userId={userId} busy={busy} onUpload={onUpload} onJoin={() => openPanel("join")} onClose={() => closePanel("own")} />}
      {clipsOpen && <ClipsPanel userId={userId} busy={busy} onStart={(f, ask) => onUpload(f, undefined, ask)} onClose={() => closePanel("clips")} />}
      {wallOpen && <WallStart busy={busy} onMake={(f, text) => onUpload(f, { settings: wallSettings(text, readSeconds(text)) })} onClose={() => closePanel("wall")} />}
      {joinOpen && <JoinTakes onClose={() => closePanel("join")} />}
      {aiOpen && <AiVideo onClose={() => closePanel("ai")} />}
      {!busy && (!joinOpen || !aiOpen || (leo && (!wallOpen || !ownOpen || !clipsOpen))) && (
        <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
          {leo && !wallOpen && <Button variant="outline" className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => openPanel("wall")}>Words over a video</Button>}
          {leo && !ownOpen && <Button variant="outline" className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => openPanel("own")}>Your own video or pictures</Button>}
          {leo && !clipsOpen && <Button variant="outline" className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => openPanel("clips")}>Long video into clips</Button>}
          {!joinOpen && <Button variant="outline" className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => openPanel("join")}>Join several takes into one video</Button>}
          {!aiOpen && <Button variant="outline" className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => openPanel("ai")}>Make a video without filming</Button>}
        </div>
      )}
      <CaptionJobStatus onOpen={onOpen} />
      {projects.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Recent</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {projects.map((p) => (
              <li key={p.id} className="group relative">
                {/* a real link to the video, so a new tab and a long-press Copy link work */}
                <Link to={links.edit({ p: p.id })} className="block w-full text-left">
                  <span className="block aspect-[9/16] overflow-hidden rounded-xl bg-black">
                    {p.thumb && <img src={p.thumb} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="mt-1 block truncate text-xs font-semibold">{p.name}</span>
                  {/* the length it plays: a clip keeps its recording's duration, with the clip in its trims */}
                  <span className="block text-[11px] text-muted-foreground">{fmtTime(p.duration - (p.settings?.trimStart || 0) - (p.settings?.trimEnd || 0))}</span>
                </Link>
                <button type="button" aria-label={`Delete ${p.name}`} onClick={() => window.confirm(`Delete ${p.name}?`) && onRemove(p.id)}
                  className="absolute right-1.5 top-1.5 rounded-md bg-background/85 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:p-[15px] [@media(pointer:coarse)]:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Leo finds YouTube moments inside Long video into clips */}
      {!leo && <YoutubeClips userId={userId} />}
    </>
  );
}

const WALL_DRAFT = "cs-edit-wall-words";

/** The "Words over a video" start panel: a clip (yours or a stock one) and the words, made into a muted 9:16 project. */
function WallStart({ busy, onMake, onClose }: { busy: string; onMake: (file: File, text: string) => void; onClose: () => void }) {
  const [clip, setClip] = useState<File | null>(null);
  const [stock, setStock] = useState(false);
  // typed words survive a closed panel or a clip that won't open (this tab only)
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(WALL_DRAFT) ?? ""; } catch { return ""; } });
  const write = (t: string) => {
    setText(t);
    try { sessionStorage.setItem(WALL_DRAFT, t); } catch { /* kept on screen */ }
  };
  const ready = !!clip && !!text.trim();
  const pickBtn = "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 [@media(pointer:coarse)]:min-h-11";
  return (
    <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3" aria-label="Words over a video">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Words over a video</h2>
        <Button size="sm" variant="ghost" className="h-9 [@media(pointer:coarse)]:min-h-11" onClick={onClose}>Close</Button>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold">Pick a clip</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className={pickBtn}>
            <Upload className="h-3.5 w-3.5" /> Upload
            <input type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setClip(f); setStock(false); } }} />
          </label>
          <button type="button" className={pickBtn} onClick={() => setStock(true)} aria-expanded={stock}><Film className="h-3.5 w-3.5" /> Stock clip</button>
          {clip && <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 shrink-0 text-success" /><span className="truncate">{clip.name}</span></span>}
        </div>
        {stock && (
          <StockSearch kind="video" orientation="portrait" placeholder="City at night, coffee on a desk, rain on a window"
            onPick={async (it, q) => {
              const blob = await downloadStock(it.src);
              setClip(new File([blob], `${q.trim().replace(/[^\w-]+/g, "-").slice(0, 40) || "stock-clip"}.mp4`, { type: blob.type || "video/mp4" }));
              setStock(false);
            }}
            onClose={() => setStock(false)} />
        )}
      </div>
      <label className="block space-y-1 text-xs font-semibold">
        <span className="block">Your words</span>
        <Textarea rows={4} maxLength={400} value={text} onChange={(e) => write(e.target.value)}
          placeholder="POV: it's year-end and you finally check what your CPF is doing" className="text-sm font-normal" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-10 [@media(pointer:coarse)]:min-h-11" disabled={!ready || !!busy} onClick={() => clip && onMake(clip, text.trim())}>Make it</Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">{busy || (ready ? "" : "Add a clip and your words first.")}</span>
      </div>
    </section>
  );
}

/**
 * The open video for the agent to change (edit-by-chat, Leo only): propose asks vibe edit and changes nothing; apply
 * puts the same patch on the settings as they are then, one Undo step; its undo puts back only the keys it changed.
 */
export function videoTarget(io: {
  title: () => string;
  settings: () => EditSettings;
  vibe: (instruction: string, settings: EditSettings) => Promise<{ patch: Record<string, unknown>; reply: string }>;
  /** One step on the editor's own Undo. */
  set: (next: EditSettings) => void;
  /** False once this video is closed. */
  open: () => boolean;
}): EditTarget {
  return {
    kind: "video",
    get title() {
      return io.title();
    },
    async propose(ask) {
      const { patch, reply } = await io.vibe(ask, io.settings());
      const { next, changed } = applyPatch(io.settings(), patch);
      // a change the editor can't make comes back empty: the agent answers with the writer's reply
      const shown = changed.filter((k) => next[k as keyof EditSettings] !== undefined);
      // in words on the agent's card, not the raw settings (replay D14)
      const preview = changed.length ? settingWords(shown.length ? shown : changed, next as unknown as Record<string, unknown>) : "";
      return {
        reply,
        preview,
        flags: [],
        apply() {
          if (!io.open()) throw new Error("That video is no longer open.");
          const cur = io.settings();
          const after = applyPatch(cur, patch).next;
          const keys = [...new Set([...Object.keys(cur), ...Object.keys(after)])].filter((k) => after[k as keyof EditSettings] !== cur[k as keyof EditSettings]);
          const before = Object.fromEntries(keys.map((k) => [k, cur[k as keyof EditSettings]])) as Partial<EditSettings>;
          io.set(after);
          return {
            done: `Done. "${io.title()}" changed. Undo here or on the page.`,
            undo: () => {
              if (!io.open()) throw new Error("That video is no longer open.");
              io.set({ ...io.settings(), ...before });
            },
          };
        },
      };
    },
  };
}

export function Editor({ userId, leo, project, onSave, onBack }: {
  userId: string;
  leo: boolean;
  project: VideoProject;
  onSave: (p: VideoProject) => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [file, setFile] = useState<Blob | null | undefined>(undefined);
  const [settings, setSettings] = useState<EditSettings>(() => ({
    ...project.settings,
    overlays: sanitizeOverlays(project.settings.overlays),
    removed: sanitizeRemoved(project.settings.removed),
    voiceover: sanitizeVoiceover(project.settings.voiceover),
    level: sanitizeLevel(project.settings.level),
    broll: sanitizeBroll(project.settings.broll),
    music: sanitizeMusic(project.settings.music),
    faceTrack: sanitizeTrack(project.settings.faceTrack),
    backdrop: sanitizeBackdrop(project.settings.backdrop),
    stand: sanitizeStand(project.settings.stand),
    keyWords: sanitizeKeyWords(project.settings.keyWords),
  }));
  // Words tab: fix spelling, or cut a stretch by tapping its first and last word; Leo's key words: light a word by tapping it
  const [wordMode, setWordMode] = useUrlState("mode", "fix", { allowed: leo && settings.keyWordsOn ? ["fix", "cut", "key"] : ["fix", "cut"] });
  // words the captions always get wrong, fixed in every video; offer = a hand fix not saved yet
  const [fixes, setFixes] = useState<CaptionFix[]>(() => loadFixes(userId));
  const [offer, setOffer] = useState<CaptionFix | null>(null);
  const [heard, setHeard] = useState("");
  const [should, setShould] = useState("");
  const [cutStart, setCutStart] = useState<number | null>(null);
  // the selected sticker and B-roll clip, by id (a stale id selects nothing)
  const [selected, setSticker] = useUrlState("sticker", "");
  const setSelected = (id: string | null) => setSticker(id ?? "");
  const updateUrl = useUrlUpdate();
  const [words, setWords] = useState(project.words);
  const [subs, setSubs] = useState<Record<string, Record<string, string>>>(project.subs ?? {});
  const [caption, setCaption] = useState(project.caption ?? "");
  // suggested callouts and cutaways, read from what is said; the person picks which to add
  const [cutaways, setCutaways] = useState<Cutaway[]>(() => sanitizeCutaways(project.cutaways));
  const [suggesting, setSuggesting] = useState(false);
  // post titles and the cover text, with the moment to take the cover from
  const [publish, setPublish] = useState<PublishIdea | undefined>(() => sanitizePublish(project.publish));
  const [ideating, setIdeating] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  // the cover last made (its size, for the grid view's shading), and the small copy kept as the video's thumbnail
  const [coverShot, setCoverShot] = useState<{ url: string; w: number; h: number } | null>(null);
  const [gridView, setGridView] = useState(true);
  const [thumb, setThumb] = useState(project.thumb);
  const [writingCaption, setWritingCaption] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [translating, setTranslating] = useState<string | null>(null);
  const [history, setHistory] = useState<EditSettings[]>([]);
  const [tab, setTab] = useUrlState<Tab>("tab", "style", { allowed: EDIT_TABS });
  // a words-over-video project shows its short panel; view=all brings back every tab (Leo only, like making one)
  const [view, setView] = useUrlState<"all" | "">("view", "", { allowed: ["all"] });
  const wallMode = leo && !!settings.wall;
  const short = wallMode && view !== "all";
  const [swapping, setSwapping] = useState(false);
  const [swapStock, setSwapStock] = useState(false);
  // measures a words block for its hit box, handles and the too-tall check (the same layout drawing uses)
  const measure = useMemo(() => (typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d")), []);
  const [, setFontsReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [outT, setOutT] = useState(0);
  const [ask, setAsk] = useState("");
  const [log, setLog] = useState<{ me: string; it: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [job, setJob] = useState<ExportJob | null>(exportJob());
  // a guide over the 9:16 preview: where Instagram or TikTok's own buttons and caption sit
  const [guide, setGuide] = useUrlState<CoverApp | "">("guide", "", { allowed: ["instagram", "tiktok"] });
  const coverApp = guide || null;
  const setCoverApp = (a: CoverApp | null) => setGuide(a ?? "");
  // B-roll: each cutaway's clip from this device, a muted <video> per cutaway kept in step with the preview
  const [brollUrls, setBrollUrls] = useState<Record<string, string>>({});
  const brollEls = useRef(new Map<string, HTMLVideoElement>());
  const [brollSearch, setBrollSearch] = useState(false);
  const [selBroll, setBrollParam] = useUrlState("broll", "");
  const setSelBroll = (id: string | null) => setBrollParam(id ?? "");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // the source's size, once it has loaded: what a crop to the frame leaves out
  const [dims, setDims] = useState<[number, number]>([0, 0]);
  // looking for the face across the video (share done), for the crop to follow it
  const [finding, setFinding] = useState<number | null>(null);
  // behind you: the picture or video (from this device) and the model that finds who is in front, loaded on first use
  const pictureKey = settings.backdrop?.kind === "picture" ? settings.backdrop.key : "";
  const [backdropImg, setBackdropImg] = useState<HTMLImageElement | null | undefined>(undefined);
  const pictureInput = useRef<HTMLInputElement>(null);
  // a video behind you plays muted and loops in a hidden <video>, kept in step with the preview (syncBackdrop)
  const backdropVideoKey = settings.backdrop?.kind === "video" ? settings.backdrop.key : "";
  const [backdropVideo, setBackdropVideo] = useState<{ url: string; file: Blob } | null | undefined>(undefined);
  const backdropEl = useRef<HTMLVideoElement>(null);
  const backdropVideoInput = useRef<HTMLInputElement>(null);
  const [fxState, setFxState] = useState<"" | "loading" | "failed">("");
  // which models the edit needs: the person finder for the backdrop, the face finder for the touch-up
  const wantFx = `${settings.backdrop ? "b" : ""}${settings.touchUp ? "t" : ""}`;
  const segIdx = useRef(0);
  // grip: a picked words block's side (its width) or corner (its size), from size0 at d0 from its centre
  const drag = useRef<{ startX: number; startY: number; moved: boolean; overlay?: string; grip?: "side" | "corner"; size0?: number; d0?: number } | null>(null);
  // the brand kit (logo, end card, name tag); endAt is the time into the end card while it shows
  const brandKit = useMemo(() => loadBrand(userId), [userId]);
  const [art, setArt] = useState<BrandArt | null>(null);
  // editing skills: this adviser's saved ways of editing (videoSkills.ts)
  const [skills, setSkills] = useState<VideoSkill[]>(() => loadSkills(userId));
  const [skillForm, setSkillForm] = useState<{ name: string; prompt: string; isDefault: boolean } | null>(null);
  const [managing, setManaging] = useState(false);
  const pendingSkill = useRef(project.pendingSkill);
  const endAt = useRef<number | null>(null);
  // the same for the intro card (Leo only), and its time as state so the position slider follows it
  const introAt = useRef<number | null>(null);
  const [introT, setIntroT] = useState<number | null>(null);
  // voiceover: the take on this device, an <audio> kept in step with the preview, and a recording in progress
  const [voiceBlob, setVoiceBlob] = useState<Blob | null | undefined>(undefined);
  const voiceUrl = useMemo(() => (voiceBlob ? URL.createObjectURL(voiceBlob) : ""), [voiceBlob]);
  useEffect(() => () => { if (voiceUrl) URL.revokeObjectURL(voiceUrl); }, [voiceUrl]);
  const voiceEl = useRef<HTMLAudioElement>(null);
  const [recording, setRecording] = useState<{ rec: MediaRecorder; stream: MediaStream; start: number; t0: number } | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  // the preview's sound goes through the noise removal, the voice polish and the loudness lift once any has been switched on
  const audio = useRef<{ ctx: AudioContext; src: MediaElementAudioSourceNode; unwire: () => void; dn?: Promise<AudioNode | null> } | null>(null);
  const polish = !!settings.voicePolish;
  const denoise = !!settings.denoise;
  const [denoiseState, setDenoiseState] = useState<"" | "loading" | "failed">("");
  const level = settings.loudness && levelFits(settings.level, polish) ? settings.level : null;
  useEffect(() => {
    const v = video.current;
    if (!v || (!audio.current && !polish && !level && !denoise)) return;
    // 48 kHz, which the noise removal needs; the browser plays it at the device's own rate
    if (!audio.current) {
      const ctx = new AudioContext({ sampleRate: DENOISE_RATE });
      audio.current = { ctx, src: ctx.createMediaElementSource(v), unwire: () => {} };
    }
    const a = audio.current;
    const wire = (dn: AudioNode | null) => {
      a.unwire();
      a.unwire = wireVoice(a.ctx, a.src, a.ctx.destination, polish, level, dn);
    };
    let live = true;
    // the sound keeps playing without it while the noise removal loads (once per page)
    wire(null);
    setDenoiseState(denoise ? "loading" : "");
    if (denoise) {
      a.dn ??= denoiseNode(a.ctx);
      void a.dn.then((dn) => {
        if (!dn) a.dn = undefined;
        if (!live) return;
        setDenoiseState(dn ? "" : "failed");
        if (dn) wire(dn);
      });
    }
    void a.ctx.resume().catch(() => {});
    return () => { live = false; };
  }, [polish, level, denoise, file]);
  // even out loudness: measured from the sound this edit keeps whenever it is on and the last measurement no longer fits
  const [measuring, setMeasuring] = useState<"" | "busy" | "none">("");
  const keptRef = useRef<{ from: number; dur: number }[]>([]);
  useEffect(() => {
    if (!settings.loudness || !file || levelFits(settings.level, polish)) return;
    let live = true;
    setMeasuring("busy");
    measureLevel(file, polish, { parts: keptRef.current, duration })
      .then((l) => {
        if (!live) return;
        setMeasuring(l ? "" : "none");
        if (l) setSettings((s) => (s.loudness && !!s.voicePolish === l.polish ? { ...s, level: l } : s));
      })
      .catch(() => live && setMeasuring("none"));
    return () => { live = false; };
  }, [settings.loudness, settings.level, polish, file]);
  useEffect(() => () => void audio.current?.ctx.close(), []);
  useEffect(() => {
    void loadBrandArt(brandKit).then(setArt);
  }, [brandKit]);

  useEffect(() => { const off = onExportJob(setJob); return () => { off(); }; }, []);
  useEffect(() => {
    void ensureCaptionFonts().then(() => { setFontsReady(true); paintRef.current?.(); });
  }, []);
  // load the file once per file: every save hands back a new project object, and
  // reloading on that sent the preview back to 0:00 after each edit
  const fk = fileKey(project);
  useEffect(() => {
    getFile(fk).then((f) => setFile(f ?? null)).catch(() => setFile(null));
  }, [fk]);
  // a podcast or voice clip: its loudness, drawn as a moving waveform where the picture would be
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    if (!file?.type.startsWith("audio/")) return setPeaks(null);
    let live = true;
    audioPeaks(file).then((p) => live && setPeaks(p)).catch(() => live && setPeaks(null));
    return () => { live = false; };
  }, [file]);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  const voiceKey = settings.voiceover?.key;
  useEffect(() => {
    if (!voiceKey) return setVoiceBlob(undefined);
    getFile(voiceKey).then((b) => setVoiceBlob(b ?? null)).catch(() => setVoiceBlob(null));
  }, [voiceKey]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const brollKeys = (settings.broll ?? []).map((b) => b.key).join(",");
  useEffect(() => {
    const want = brollKeys.split(",").filter((k) => k && !(k in brollUrls));
    if (!want.length) return;
    void Promise.all(want.map(async (k) => [k, await getFile(k).catch(() => undefined)] as const)).then((got) =>
      setBrollUrls((u) => ({ ...u, ...Object.fromEntries(got.map(([k, b]) => [k, b ? URL.createObjectURL(b) : ""])) })));
  }, [brollKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const brollUrlsRef = useRef(brollUrls);
  brollUrlsRef.current = brollUrls;
  useEffect(() => () => Object.values(brollUrlsRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);
  // background music: the track on this device, decoded once, played through its own audio context (made on the first Play)
  const musicKey = settings.music?.key;
  const [musicBlob, setMusicBlob] = useState<Blob | null | undefined>(undefined);
  const [musicBusy, setMusicBusy] = useState(false);
  const musicInput = useRef<HTMLInputElement>(null);
  const musicBuf = useRef<AudioBuffer | null>(null);
  const musicOut = useRef<{ ctx: AudioContext; gain: GainNode; buf?: AudioBuffer; track?: ReturnType<typeof bufferTrack> } | null>(null);
  useEffect(() => {
    if (!musicKey) return setMusicBlob(undefined);
    getFile(musicKey).then((b) => setMusicBlob(b ?? null)).catch(() => setMusicBlob(null));
  }, [musicKey]);
  useEffect(() => {
    musicBuf.current = null;
    if (!musicBlob) return;
    let live = true;
    void decodeSound(musicBlob).then((b) => { if (live) musicBuf.current = b; });
    return () => { live = false; };
  }, [musicBlob]);
  useEffect(() => () => void musicOut.current?.ctx.close(), []);
  // sound effects on cards, zooms, cuts and stickers, made as the preview plays past them
  const sfx = useRef(previewSfx());
  useEffect(() => () => sfx.current.close(), []);
  useEffect(() => {
    if (!pictureKey) return setBackdropImg(undefined);
    let live = true;
    let src = "";
    getFile(pictureKey)
      .then((b) => {
        if (!live) return;
        if (!b) return setBackdropImg(null);
        const img = new Image();
        img.onload = () => live && setBackdropImg(img);
        img.onerror = () => live && setBackdropImg(null);
        img.src = src = URL.createObjectURL(b);
      })
      .catch(() => live && setBackdropImg(null));
    return () => { live = false; if (src) URL.revokeObjectURL(src); };
  }, [pictureKey]);
  useEffect(() => {
    if (!backdropVideoKey) return setBackdropVideo(undefined);
    let live = true;
    let url = "";
    getFile(backdropVideoKey)
      .then((b) => {
        if (!live) return;
        if (!b) return setBackdropVideo(null);
        setBackdropVideo({ url: (url = URL.createObjectURL(b)), file: b });
      })
      .catch(() => live && setBackdropVideo(null));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [backdropVideoKey]);
  const loadFx = useCallback(() => {
    setFxState("loading");
    return loadEffects(settingsRef.current)
      .then(() => { setFxState(""); paintRef.current?.(); })
      .catch(() => setFxState("failed"));
  }, []);
  useEffect(() => {
    if (wantFx) void loadFx();
    else setFxState("");
  }, [wantFx, loadFx]);
  // a video behind you: the frame whoever draws hands in (preview, exports), else the one the hidden video shows (the cover)
  const fx = useMemo<Frame["fx"]>(
    () => (settings.backdrop || settings.touchUp
      ? (g, r, _out, behind) => paintEffects(g, r, settings, settings.backdrop?.kind === "video" ? (behind === undefined ? backdropEl.current : behind) : backdropImg)
      : null),
    [settings, backdropImg],
  );

  // save the edit a moment after the last change; the newest project, so a save due as a video is swapped can't put the old file back
  const live = useRef(project);
  live.current = project;
  useEffect(() => {
    const t = window.setTimeout(() => onSave({ ...live.current, pendingSkill: pendingSkill.current, settings, words, subs, caption, cutaways, publish, thumb }), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, words, subs, caption, cutaways, publish, thumb]);

  const duration = project.duration;
  // /edit?p=<id>#clips lands on the clip list once it can show (ClipFinder: 45 s or more, with words)
  useScrollToHash(!!file && words.length > 0 && duration >= 45);
  const plan = useMemo(() => planFor(words, duration, settings), [words, duration, settings]);
  keptRef.current = plan.segs.map((g) => ({ from: g.start, dur: g.end - g.start }));
  const speed = speedOf(settings);
  const duck = useMemo(() => duckSpans(words, plan.segs, settings), [words, plan, settings]);
  useEffect(() => {
    const v = video.current;
    if (v) v.defaultPlaybackRate = v.playbackRate = speed; // pitch is kept; the default survives a reload
  }, [speed, file]);
  const volume = settings.volume ?? 1;
  useEffect(() => {
    if (video.current) video.current.volume = volume;
  }, [volume, file]);
  const exportLabel = settings.exportAs === "audio" ? "Export sound" : "Export MP4";
  const [W, H] = useMemo(() => {
    const v = video.current;
    const [w, h] = aspectSize(settings.aspect, v?.videoWidth || 1080, v?.videoHeight || 1920);
    return [Math.round(w / 2), Math.round(h / 2)];
  }, [settings.aspect, file]);

  const paintRef = useRef<(() => void) | null>(null);
  const intro = introLength(settings, art);
  const paint = useCallback(() => {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c) return;
    if (endAt.current !== null && art) {
      drawEndCard(c.getContext("2d")!, art, endAt.current);
      setOutT(plan.total + endAt.current);
      setIntroT(null);
      return;
    }
    if (introAt.current !== null && intro && art) {
      drawIntroCard(c.getContext("2d")!, art, introAt.current);
      setOutT(0);
      setIntroT(introAt.current);
      return;
    }
    const out = outIn(plan.segs, segIdx.current, v.currentTime, speed) ?? outT;
    const broll = syncBroll(brollEls.current, settings.broll, out, playing);
    const backdrop = settings.backdrop?.kind === "video" ? syncBackdrop(backdropEl.current, out, playing) : undefined;
    drawFrame(c.getContext("2d")!, { video: v, settings, ...plan, src: v.currentTime, out, subs: settings.subLang ? subs[settings.subLang] : undefined, brand: art, still: !playing, broll, fx, peaks, backdrop });
    setOutT(out);
    setIntroT(null);
  }, [plan, settings, outT, subs, art, playing, speed, fx, peaks, intro]);
  // the timeline runs intro card, edit, end card; the edit and its end card keep their own clock (outT, editEnd)
  const total = fullLength(plan.total, settings, !!art, intro);
  const editEnd = total - intro;
  // what Export will make for the platform picked: its frame, and about how big the file comes out
  const size = useMemo(
    () => exportSize(settings, settings.exportAs === "audio" ? plan.total : total, video.current?.videoWidth || 1080, video.current?.videoHeight || 1920),
    [settings, plan.total, total, file], // eslint-disable-line react-hooks/exhaustive-deps
  );
  paintRef.current = paint;

  // playback that skips the cuts
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let endStart = 0;
    let introStart = 0;
    const finish = () => {
      const v = video.current;
      v?.pause();
      // then the end card, if it is on, for its length in real time
      if (editEnd > plan.total) {
        endStart = performance.now() - (endAt.current ?? 0) * 1000;
        endAt.current = endAt.current ?? 0;
        raf = requestAnimationFrame(endLoop);
      } else setPlaying(false);
    };
    const endLoop = () => {
      const t = (performance.now() - endStart) / 1000;
      if (t >= editEnd - plan.total) { setPlaying(false); return; }
      endAt.current = t;
      paint();
      syncMusic(plan.total + t);
      raf = requestAnimationFrame(endLoop);
    };
    // the intro card first, for its length in real time over silence, then the first part from its start
    const introLoop = () => {
      const t = (performance.now() - introStart) / 1000;
      if (t >= intro) {
        seekOut(0);
        void video.current?.play().catch(() => {});
        raf = requestAnimationFrame(loop);
        return;
      }
      introAt.current = t;
      paint();
      raf = requestAnimationFrame(introLoop);
    };
    const loop = () => {
      const v = video.current;
      if (!v) return;
      if (introAt.current !== null && intro) {
        // also when dragged back into the card while playing: the edit waits, silent, until the card ends
        v.pause();
        syncVoice(null);
        musicOut.current?.track?.stop();
        introStart = performance.now() - introAt.current * 1000;
        return introLoop();
      }
      if (endAt.current !== null) return finish();
      const seg = plan.segs[segIdx.current];
      if (!seg) return finish();
      if (v.currentTime >= seg.end - 0.03 || v.currentTime < seg.start - 0.2) {
        segIdx.current++;
        const next = plan.segs[segIdx.current];
        if (!next) return finish();
        v.currentTime = next.start;
      }
      // a pause played fast: 4x with the sound out, back to speed a frame early so the next word starts at speed
      const fast = plan.segs[segIdx.current] && isFast(plan.segs[segIdx.current], v.currentTime, (speed * FAST) / 60);
      if (v.playbackRate !== speed * (fast ? FAST : 1)) {
        v.playbackRate = speed * (fast ? FAST : 1);
        v.volume = fast ? 0 : volume;
      }
      paint();
      const out = outIn(plan.segs, segIdx.current, v.currentTime, speed);
      syncVoice(out);
      syncMusic(out);
      sfx.current.sync(motionOf(settings, plan.segs, plan.caps, plan.total).cues, out);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan, paint, total, intro, editEnd]);
  // (this effect re-runs every frame as the playhead moves, so the voiceover pauses only when playback stops)
  useEffect(() => {
    if (!playing) {
      if (video.current) {
        video.current.playbackRate = speed;
        video.current.volume = volume;
      }
      voiceEl.current?.pause();
      brollEls.current.forEach((el) => el.pause());
      backdropEl.current?.pause();
      musicOut.current?.track?.stop();
      sfx.current.sync([], null);
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!playing) paint(); }, [settings, plan, backdropImg, backdropVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncVoice = (out: number | null) => {
    const el = voiceEl.current;
    if (!el || !voiceUrl || recording) return;
    const rel = out === null ? null : voiceAt(settings.voiceover, out);
    if (rel === null || rel >= (el.duration || Infinity)) {
      if (!el.paused) el.pause();
      return;
    }
    el.volume = Math.min(1, settings.voiceover?.gain ?? 1);
    if (Math.abs(el.currentTime - rel) > 0.15) el.currentTime = rel;
    if (el.paused) void el.play().catch(() => {});
  };

  // the music follows the edit's clock, so a cut never restarts it; it drops while someone talks
  const syncMusic = (out: number | null) => {
    const o = musicOut.current;
    if (!o) return;
    const buf = settings.music && !recording ? musicBuf.current : null;
    if ((o.buf ?? null) !== buf) {
      o.track?.stop();
      o.buf = buf ?? undefined;
      o.track = buf ? bufferTrack(o.ctx, buf, o.gain, true, 0.5) : undefined;
    }
    if (!o.track || out === null) return;
    o.track.sync(out);
    o.gain.gain.setTargetAtTime(musicGainAt(duck, out, settings.music!.level, editEnd) * dropGain(motionOf(settings, plan.segs, plan.caps, plan.total).drop, out), o.ctx.currentTime, 0.03);
  };

  // `also` rides along in the same change (Swap sound turns the filmed sound off)
  const addMusic = async (f: File, also?: Partial<EditSettings>) => {
    if (f.size > 20 * 1024 * 1024) return toast({ title: "That track is over 20 MB", variant: "destructive" });
    setMusicBusy(true);
    try {
      if (!(await decodeSound(f))) return toast({ title: "Couldn't read that sound file", description: "Try an MP3, M4A or WAV.", variant: "destructive" });
      const key = `mu-${project.id}-${Date.now().toString(36)}`;
      await putFile(key, f);
      // the previous track's file stays, so Undo can bring it back (ponytail: tracks accumulate per video, like voiceover takes)
      change({ ...settings, ...also, music: { key, name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Music", level: settings.music?.level ?? MUSIC_LEVEL } });
    } catch (e) {
      toast({ title: "Couldn't keep the track", description: (e as Error).message, variant: "destructive" });
    } finally {
      setMusicBusy(false);
    }
  };

  // "Music for me": Jev presets the mood from what is said, the adviser can change it; the job
  // runs outside React (aiMusic.ts), so the track still lands if they leave the editor meanwhile
  const [aiMusicOpen, setAiMusicOpen] = useState(false);
  const [mood, setMood] = useState<Mood | null>(null);
  const [aiMusic, setAiMusic] = useState(musicJob);
  useEffect(() => onMusicJob(setAiMusic), []);
  const musicMaking = aiMusic?.state === "working" && aiMusic.projectId === project.id;
  useEffect(() => onMusicApply(project.id, (m) => {
    const cur = settingsRef.current;
    setHistory((h) => [...h.slice(-19), cur]);
    setSettings({ ...cur, music: { ...m, level: cur.music?.level ?? m.level } });
    setAiMusicOpen(false);
    toast({ title: "Music added", description: `${m.name}. Undo takes it off.` });
  }), [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (aiMusic?.state !== "failed" || aiMusic.projectId !== project.id) return;
    toast({ title: "Couldn't make the music", description: aiMusic.error, variant: "destructive" });
    dismissMusicJob();
  }, [aiMusic, project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const openAiMusic = () => {
    setAiMusicOpen((o) => !o);
    if (mood === null) void pickMood(transcript).then((m) => setMood((cur) => cur ?? m));
  };
  const trackSecs = Math.max(3, Math.round(Math.min(total, MAX_MUSIC_SECONDS)));
  const makeMusic = () => {
    if (!mood) return;
    startMusic(userId, project.id, mood, total).catch((e) => toast({ title: "Couldn't make the music", description: (e as Error).message, variant: "destructive" }));
  };

  const startVoice = async () => {
    const v = video.current;
    if (!v || playing) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return toast({ title: "No microphone", description: "Allow the microphone for this site in the browser, then try again.", variant: "destructive" });
    }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const start = Math.min(outT, Math.max(0, plan.total - 0.5));
    const t0 = performance.now();
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      v.muted = false;
      const length = Math.min((performance.now() - t0) / 1000, plan.total - start);
      if (length < 0.5) return;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const key = `vo-${project.id}-${Date.now().toString(36)}`;
      try {
        await putFile(key, blob);
        // the previous take's file stays, so Undo can bring it back (ponytail: takes accumulate per video; prune on project delete if storage ever matters)
        change({ ...settings, voiceover: { key, start, length, ...(settings.voiceover?.gain !== undefined ? { gain: settings.voiceover.gain } : {}) } });
        toast({ title: "Voiceover added", description: "Turn the original sound down under it if you need to." });
      } catch (e) {
        toast({ title: "Couldn't keep the recording", description: (e as Error).message, variant: "destructive" });
      }
    };
    // the edit plays muted from the playhead while you talk over it
    v.muted = true;
    seekOut(start);
    rec.start(500);
    setRecording({ rec, stream, start, t0 });
    setRecSeconds(0);
    await v.play().catch(() => {});
    setPlaying(true);
  };
  const stopVoice = () => {
    const r = recording;
    if (!r) return;
    setRecording(null);
    if (r.rec.state !== "inactive") r.rec.stop();
    video.current?.pause();
    setPlaying(false);
  };
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecSeconds((performance.now() - recording.t0) / 1000), 250);
    return () => window.clearInterval(t);
  }, [recording]);
  // the edit reached its end while recording: stop there
  useEffect(() => {
    if (recording && !playing) stopVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  // voiceover from text: a script (the kept words by default) spoken by an AI voice, placed like a recording
  const [ttsOpen, setTtsOpen] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState<VoiceId>("alice");
  const [ttsHow, setTtsHow] = useState<Delivery>({ emotion: DEFAULT_EMOTION, pace: "normal" });
  const [ttsBusy, setTtsBusy] = useState(false);
  const openTts = () => {
    setTtsText((t) => t || transcript.slice(0, MAX_SCRIPT));
    setTtsOpen((o) => !o);
  };
  const makeTts = async () => {
    setTtsBusy(true);
    try {
      const blob = await speak(ttsText, ttsVoice, ttsHow);
      const secs = await audioSeconds(blob).catch(() => 0);
      const start = Math.min(outT, Math.max(0, plan.total - 0.5));
      const length = Math.min(secs, plan.total - start);
      if (length < 0.3) throw new Error("The voiceover came back silent. Try again.");
      const key = `vo-${project.id}-${Date.now().toString(36)}`;
      await putFile(key, blob);
      // the latest settings: changes made while it was being made must stay
      const cur = settingsRef.current;
      setHistory((h) => [...h.slice(-19), cur]);
      setSettings({ ...cur, voiceover: { key, start, length, ...(cur.voiceover?.gain !== undefined ? { gain: cur.voiceover.gain } : {}) } });
      setTtsOpen(false);
      toast({
        title: `Voiceover added from ${fmtTime(start)}`,
        description: secs > length + 0.5 ? `It runs ${fmtTime(secs)}; the video ends first, so the end is cut.` : undefined,
        action: (cur.volume ?? 1) > 0 ? (
          <ToastAction altText="Mute the filmed sound" onClick={() => { setHistory((h) => [...h.slice(-19), settingsRef.current]); setSettings((x) => ({ ...x, volume: 0 })); }}>
            Mute filmed sound
          </ToastAction>
        ) : undefined,
      });
    } catch (e) {
      toast({ title: "Couldn't make the voiceover", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTtsBusy(false);
    }
  };
  // dub: the kept lines translated, spoken by an AI voice in one call, each line laid where the original was said
  const [dubOpen, setDubOpen] = useState(false);
  const [dubLang, setDubLang] = useState<DubLang>("zh");
  const [dubBusy, setDubBusy] = useState("");
  const makeDub = async () => {
    setDubBusy("Translating...");
    try {
      const cues = outputCues(words, plan.segs, settings.removeFillers, speed);
      if (!cues.length) throw new Error("Caption the video first.");
      const lines = await translateCaptions(dubLang, cues.map((c) => c.text));
      setDubBusy("Making the voice...");
      const { audio, spans } = await speakDub(lines, ttsVoice, dubLang, ttsHow);
      const place = dubPlacement(spans, cues, plan.total);
      if (!place.length) throw new Error("The dub came back silent. Try again.");
      const key = `vo-${project.id}-${Date.now().toString(36)}`;
      await putFile(key, await layDub(audio, place, plan.total));
      const cur = settingsRef.current;
      setHistory((h) => [...h.slice(-19), cur]);
      setSettings({ ...cur, voiceover: { key, start: 0, length: plan.total }, volume: 0 });
      setDubOpen(false);
      // what didn't fit: the dub voice runs past the end of the video
      const cut = spans.reduce((n, sp) => n + (sp ? sp.e - sp.s : 0), 0) - place.reduce((n, p) => n + p.dur, 0);
      toast({
        title: `Dubbed into ${DUB_LANGS[dubLang]}`,
        description: cut > 0.5
          ? `The filmed sound is muted. The ${DUB_LANGS[dubLang]} voice runs ${Math.round(cut)}s longer than the video, so the end is cut.`
          : "The filmed sound is muted. Undo brings it back.",
      });
    } catch (e) {
      toast({ title: "Couldn't dub the video", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDubBusy("");
    }
  };
  const removeVoice = () => {
    if (!settings.voiceover) return;
    change({ ...settings, voiceover: undefined }); // the file stays until Undo is out of reach; it is small
  };

  // follow the face, or stack two speakers: the faces are found once on this device (a second or two
  // a minute of video), then either goes on or off at once
  const crop = cropShare(settings.aspect, dims[0], dims[1]);
  const canFollow = ["fill", "stacked"].includes(settings.fit ?? "fill") && crop < 0.95;
  // `use` makes the next settings from these with the faces found (null = no change but the faces)
  const withFaces = async (use: (s: EditSettings) => EditSettings | null, need?: "pairs" | "me") => {
    // looked for over the kept parts only; found again when the trims have moved past what was looked
    // at, or for a layout, when the track is from before its faces were looked for
    const spans = lookSpans(plan.segs);
    if (trackCovers(settings.faceTrack, spans) && (!need || settings.faceTrack?.[need] !== undefined)) {
      const next = use(settings);
      return void (next && change(next));
    }
    if (!file || finding !== null) return;
    setFinding(0);
    let v: HTMLVideoElement | null = null;
    try {
      v = await loadVideo(file);
      // the crop re-centres once the face drifts 12% of the frame's width from its middle
      // progress in 5% steps: redrawing the editor on every look slowed the search down
      const track = await findFaceTrack(v, spans, crop * 0.12, (p) => setFinding((f) => (f === null || p - f >= 0.05 || p === 1 ? p : f)), words);
      if (!track) return toast({ title: "No face found in this video", description: "Move the crop by hand under Hook and frame.", variant: "destructive" });
      // the latest settings: changes made while it looked must stay
      const cur = { ...settingsRef.current, faceTrack: track };
      setHistory((h) => [...h.slice(-19), settingsRef.current]);
      setSettings(use(cur) ?? cur);
    } catch (e) {
      toast({ title: "Couldn't look for your face", description: (e as Error).message, variant: "destructive" });
    } finally {
      if (v) URL.revokeObjectURL(v.src);
      setFinding(null);
    }
  };

  const setFollow = (on: boolean) => (on ? withFaces((s) => ({ ...s, followFace: true })) : patch({ followFace: false }));
  // two speakers stacked, with the captions on the seam: offered for a landscape video, used when two
  // people share the shot for at least half of the edit
  const canStack = crop < 0.95 || settings.fit === "stacked" || settings.fit === "slides";
  const setStacked = () =>
    withFaces((s) => {
      // a shot with one person in it crops to fill, on their face
      if (pairShare(s.faceTrack?.pairs, lookSpans(plan.segs)) >= 0.5) return { ...s, fit: "stacked", captionY: 0.5, followFace: true };
      toast({ title: "Two people aren't in the same shot for most of this video", variant: "destructive" });
      return null;
    }, "pairs");
  // slides and me: the whole screen on top, the face from the camera in the corner below
  const setSlides = () =>
    withFaces((s) => {
      if (s.faceTrack?.me) return { ...s, fit: "slides", captionY: slidesCaptionY(dims[0], dims[1], ...aspectSize(s.aspect, dims[0], dims[1])) };
      toast({ title: "Your face isn't in most of this video", variant: "destructive" });
      return null;
    }, "me");

  const seekOut = (t: number) => {
    const v = video.current;
    if (!v) return;
    introAt.current = null;
    if (t > plan.total && editEnd > plan.total) {
      endAt.current = Math.min(t - plan.total, editEnd - plan.total);
      paint();
      return;
    }
    endAt.current = null;
    const src = srcAt(plan.segs, t, speed);
    // by place in the edit, not source time: a cold open plays one part twice
    segIdx.current = segAt(plan.segs, t * speed);
    v.currentTime = src;
  };

  // a place on the whole timeline (the slider): inside the intro card shows it, anything after is the edit's own clock
  const seekPos = (p: number) => {
    if (p >= intro) return seekOut(p - intro);
    seekOut(0);
    introAt.current = p;
    paint();
  };

  const toggle = async () => {
    const v = video.current;
    if (!v) return;
    if (recording) return stopVoice();
    if (playing) { v.pause(); voiceEl.current?.pause(); setPlaying(false); return; }
    void audio.current?.ctx.resume().catch(() => {});
    if (settings.music && !musicOut.current) {
      const ctx = new AudioContext();
      const gain = new GainNode(ctx, { gain: 0 });
      gain.connect(ctx.destination);
      musicOut.current = { ctx, gain };
    }
    void musicOut.current?.ctx.resume().catch(() => {});
    if (intro + outT >= total - 0.1) seekPos(0);
    else if (introAt.current === null) seekOut(outT);
    // during the intro card the video waits; the play loop starts it when the card ends
    if (introAt.current === null) await v.play().catch(() => {});
    setPlaying(true);
  };

  const change = (next: EditSettings) => {
    setHistory((h) => [...h.slice(-19), settings]);
    setSettings(next);
  };
  const patch = (p: Partial<EditSettings>) => change({ ...settings, ...p });
  // the Versions card lays a plan over this take as one Undo step; a stable callback keeps that card from redrawing while playing
  const changeRef = useRef(change);
  changeRef.current = change;
  const layEdit = useCallback((next: EditSettings) => changeRef.current(next), []);
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setSettings(prev);
  };

  // Only what survives the trims and cuts: a clip's caption is about the clip, not the whole video.
  const transcript = useMemo(
    () => words.filter((w) => plan.segs.some((g) => w.s >= g.start - 0.05 && w.e <= g.end + 0.05)).map((w) => w.w).join(" "),
    [words, plan],
  );

  const runVibe = async (frames?: string[], preset?: string, label?: string) => {
    const instruction = preset ?? ask.trim();
    if (!instruction && !frames) return;
    setThinking(true);
    try {
      const res = await vibeEdit({ instruction, settings, transcript, duration, frames }, userId);
      const { next, changed } = applyPatch(settings, res.patch);
      if (changed.length) change(next);
      setLog((l) => [...l, { me: label ?? (preset ? "Suggest a hook" : instruction || "Match my reference video"), it: changed.length ? res.reply : `${res.reply} (nothing changed)` }]);
      if (!preset) setAsk("");
    } catch (e) {
      toast({ title: "That change didn't go through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setThinking(false);
    }
  };

  // skills: apply a saved look at once, then run its instructions on this video's words
  const applySkill = (sk: VideoSkill) => {
    change(withLook(settings, sk.look));
    if (sk.prompt && words.length) void runVibe(undefined, sk.prompt, `Skill: ${sk.name}`);
    else toast({ title: `${sk.name} applied` });
  };
  const openSkillForm = () => {
    const asks = log.map((m) => m.me).filter((m) => !/^Skill: |^Suggest a hook$|^Match my reference video$/.test(m));
    setSkillForm({ name: suggestName(asks, skills), prompt: "", isDefault: skills.length === 0 });
  };
  const keepSkill = () => {
    if (!skillForm?.name.trim()) return;
    const id = newSkillId();
    setSkills(saveSkill(userId, { id, name: skillForm.name, look: lookOf(settings), prompt: skillForm.prompt, isDefault: skillForm.isDefault }));
    setSkillForm(null);
    toast({ title: `Saved ${skillForm.name.trim()}`, description: skillForm.isDefault ? "New videos start with it." : "Tap it on any video to use it." });
  };
  const dropSkill = (sk: VideoSkill) => {
    setSkills(removeSkill(userId, sk.id));
    toast({
      title: `${sk.name} deleted`,
      action: (
        <ToastAction altText="Undo" onClick={() => setSkills(saveSkill(userId, sk))}>
          Undo
        </ToastAction>
      ),
    });
  };
  // the default skill's instructions run once, as soon as a new video has its captions
  useEffect(() => {
    if (!pendingSkill.current || !words.length || thinking) return;
    const sk = skills.find((x) => x.id === pendingSkill.current);
    pendingSkill.current = undefined;
    if (sk?.prompt) void runVibe(undefined, sk.prompt, `Skill: ${sk.name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.length]);

  const matchReference = async (f: File) => {
    try {
      setThinking(true);
      await runVibe(await stills(f));
    } catch (e) {
      setThinking(false);
      toast({ title: "Couldn't read that reference", description: (e as Error).message, variant: "destructive" });
    }
  };

  const recaption = async (src: Blob | null | undefined = file) => {
    if (!src) return;
    setCaptioning(true);
    try {
      const { wav } = await extractWav(src);
      const mine = [...fixes, ...(leo ? brandFixes(brandKit?.name) : [])];
      const t = await transcribe(wav, undefined, leo ? captionTerms(mine) : undefined);
      const fixed = applyFixes(t.words, mine);
      setWords(fixed.words);
      if (fixed.count) toast({ title: `Fixed ${fixed.count} ${fixed.count === 1 ? "word" : "words"} from your list` });
    } catch (e) {
      toast({ title: "Captions didn't come through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCaptioning(false);
    }
  };

  // Watch it like a viewer, on the finished export; it carries on off this page, like the export
  const [watch, setWatch] = useState<WatchJob | null>(watchJob());
  useEffect(() => { const off = onWatchJob(setWatch); return () => { off(); }; }, []);
  const watching = watch?.state === "running";

  // uses left today beside each AI button, read again after every run
  const left = useUsesLeft(thinking || ideating || suggesting || !!translating || ttsBusy || !!dubBusy || captioning || musicMaking || watching || keyBusy);
  const none = (f: Parameters<typeof left>[0]) => left(f) === 0;

  // key words (edit-captions, Leo only): Jev's word per caption line, picked once per video (one "caption-keywords" use,
  // an emoji asked in the same run unless the brand kit says none) and kept on the edit by each word's source time
  const emojiRule = brandKit?.emojiPolicy;
  const capLines = useMemo(() => (leo && settings.keyWordsOn ? keyLines(words, plan.segs, speed) : []), [leo, settings.keyWordsOn, words, plan.segs, speed]);
  const keyRun = useRef(false);
  const pickKeys = async () => {
    if (keyRun.current) return;
    keyRun.current = true;
    const lines = keyLines(words, plan.segs, speed).slice(0, MAX_KEYWORD_LINES);
    setKeyBusy(true);
    setKeyError("");
    try {
      const picks = await pickKeyWords(lines.map((l) => ({ text: l.text, words: keyCandidates(l.words.map((w) => w.w)), s: l.s })), emojiRule === "none" ? false : emojiRule === "one" ? "one" : true);
      // kept like a measured fact, with no Undo step of its own: Undo goes back past the switch, never to "on, not picked",
      // which would pick (and spend) again by itself
      setSettings((x) => ({ ...x, keyWords: keyWordsFrom(lines, picks) }));
    } catch (e) {
      // nothing lit: the switch goes back off and says why (the server gave the use back if Jev never answered)
      setSettings((x) => ({ ...x, keyWordsOn: false }));
      setKeyError((e as Error).message);
    } finally {
      keyRun.current = false;
      setKeyBusy(false);
    }
  };
  // switched on (or a look or new video with them on) and never picked for this video: pick once the words are there
  useEffect(() => {
    if (leo && settings.keyWordsOn && settings.keyWords === undefined && words.length && !keyError && left("caption-keywords") !== 0) void pickKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leo, settings.keyWordsOn, settings.keyWords, words.length]);
  // a brand kit that says no emoji keeps them off
  useEffect(() => {
    if (leo && emojiRule === "none" && settings.captionEmoji) setSettings((x) => ({ ...x, captionEmoji: false }));
  }, [leo, emojiRule, settings.captionEmoji]);
  const lookOn = leo ? captionLookIn(settings) : null;
  // the captions alone become the default skill's (or a new default's), with Undo
  const captionsForNew = () => {
    const before = defaultSkill(skills);
    const next = captionsAsDefault(before, settings, newSkillId());
    setSkills(saveSkill(userId, next));
    toast({
      title: "New videos will start with these captions.",
      action: <ToastAction altText="Undo" onClick={() => setSkills(before ? saveSkill(userId, before) : removeSkill(userId, next.id))}>Undo</ToastAction>,
    });
  };
  // the cover from the frame on screen, or from a moment on the edit (a cover idea's), with the cover text set large
  const saveCover = async (at?: number | null, note?: string, face?: Band) => {
    const v = video.current;
    if (!v) return;
    try {
      if (typeof at === "number") {
        if (playing) { v.pause(); setPlaying(false); }
        seekOut(at);
        await new Promise<void>((done) => {
          if (!v.seeking) return done();
          v.addEventListener("seeked", () => done(), { once: true });
          window.setTimeout(done, 2000);
        });
      }
      const blob = await makeCover(v, settings, publish?.cover.trim() || settings.hook || project.name, fx, face, publish?.line2);
      const [w, h] = aspectSize(settings.aspect, v.videoWidth, v.videoHeight);
      setCoverShot((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { url: URL.createObjectURL(blob), w, h };
      });
      // the Instagram grid page and the video list show this cover from now on
      setThumb(await thumbOf(blob).catch(() => thumb));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.name.replace(/[^\w-]+/g, "-").slice(0, 60) || "video"}-cover.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      toast({ title: "Cover saved", description: note ?? "Made from the frame on screen. Scrub to another moment for a different one." });
    } catch (e) {
      toast({ title: "Couldn't make the cover", description: (e as Error).message, variant: "destructive" });
    }
  };

  // the cover idea's line: the frame around it with the biggest, sharpest face (coverFrame.ts)
  const saveBestCover = async (at: number) => {
    if (!file) return;
    setCoverBusy(true);
    try {
      const best = await findCoverFrame(file, coverTimes(at, plan.total), (t) => srcAt(plan.segs, t, speed), (settings.fit ?? "fill") === "fill" ? [W, H] : undefined).catch(() => null);
      await saveCover(best?.t ?? at, best ? `The ${best.face ? "sharpest frame with your face biggest" : "sharpest frame"} near the line, at ${fmtTime(best.t)}.` : undefined, best?.face ?? undefined);
    } finally {
      setCoverBusy(false);
    }
  };

  const suggestPublish = async () => {
    setIdeating(true);
    try {
      const idea = sanitizePublish(await publishIdeas(userId, editedSentences(words, plan.segs, speed), plan.total));
      if (!idea) throw new Error("The titles came back incomplete. Try again.");
      setPublish({ ...idea, ...(publish?.line2 ? { line2: publish.line2 } : {}) });
    } catch (e) {
      toast({ title: "Couldn't write titles", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIdeating(false);
    }
  };
  const copyTitle = (t: string) => navigator.clipboard.writeText(t).then(() => toast({ title: "Title copied" }));

  // a language with at least 80% of its lines translated is picked again for free
  const subsReady = (lang: string, keys = [...new Set(plan.caps.map(captionKey))]) => {
    const have = subs[lang] ?? {};
    return keys.length > 0 && keys.filter((k) => have[k]).length / keys.length >= 0.8;
  };
  // Leo only: with no translations left today, the languages not translated yet can't be picked
  const noTranslate = leo && left("video-translate") === 0;
  const pickSubLang = async (lang: EditSettings["subLang"]) => {
    if (!lang) return patch({ subLang: "" });
    const keys = [...new Set(plan.caps.map(captionKey))];
    if (subsReady(lang, keys)) return patch({ subLang: lang });
    setTranslating(lang);
    try {
      const lines = await translateCaptions(lang, keys);
      setSubs((prev) => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), ...Object.fromEntries(keys.map((k, i) => [k, lines[i]])) } }));
      patch({ subLang: lang });
    } catch (e) {
      toast({ title: "Couldn't translate the captions", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTranslating(null);
    }
  };

  // The post caption for this video, written from what is said in it (the clip's words only).
  const writeCaption = async () => {
    if (!transcript.trim()) return toast({ title: "Caption the video first", variant: "destructive" });
    setWritingCaption(true);
    setSavedDraft(false);
    let text = "";
    await streamOnePost(
      {
        pillar: "topic",
        pillarDetail: project.name,
        ideaSource: "A reel I already filmed",
        ideaContext: [`Write ONLY the post caption for this reel, not a script. What I say in it: ${transcript.slice(0, 1800)}\nShape: a strong first line, 2 to 4 short lines, a soft call to action or question, then 3 to 5 relevant hashtags. Use only facts that are in what I say.`, brandRulesLine(brandKit, "instagram")].filter(Boolean).join("\n\n"),
        format: "short-video",
        platform: "instagram",
        ctaType: "save-share",
        audience: "general",
        voiceSummary: loadVoiceProfile(userId)?.voiceSummary || undefined,
      },
      {
        onToken: (t) => { text = t; },
        onComplete: (t) => { text = t; },
        onError: (m) => toast({ title: "The caption didn't come through", description: m, variant: "destructive" }),
      },
    );
    if (text) setCaption(applyBrandRules(stripDashes(splitScriptCaption(text).caption), brandKit, "instagram"));
    setWritingCaption(false);
  };
  const captionFlags = useMemo(() => scanCompliance(caption), [caption]);
  // what gets pasted: the caption plus the brand kit sign-off
  const postText = useMemo(() => {
    const out = withSignOff(caption, brandKit?.signOff);
    return brandKit?.tagLinks ? tagLinks(out, { source: "instagram", campaign: project.name }) : out;
  }, [caption, brandKit, project.name]);
  const copyCaption = () =>
    navigator.clipboard.writeText(postText).then(() => toast({ title: brandKit?.signOff?.trim() ? "Caption copied with your sign-off" : "Caption copied" }));
  const brandLinks = useMemo(() => allowedLinks(brandKit, loadSocialAccounts(userId)), [brandKit, userId]);
  const kitWarnings = useMemo(() => (caption ? checkLimits(postText, "instagram", brandLinks, avoidList(brandKit)).warnings : []), [caption, postText, brandLinks, brandKit]);
  // a video made from a post saves back to it (Leo only); read again after a save, in case it was the fallback
  const ownPost = useMemo(() => (leo && project.draftId ? getDraftById(userId, project.draftId) : null), [leo, userId, project.draftId, savedDraft]);
  const saveLabel = ownPost ? (savedDraft ? "Saved to your post" : "Save to your post") : savedDraft ? "Saved to My posts" : "Save to My posts";
  const saveToPosts = () => {
    // a words-over-video project with no caption written posts its words
    const text = caption.trim() || !wallMode ? caption : (settings.overlays ?? []).find((o) => o.kind === "block")?.text ?? "";
    const post = leo && project.draftId ? getDraftById(userId, project.draftId) : null;
    if (post) {
      upsertDraft(userId, withVideoCaption(post, text));
      setSavedDraft(true);
      return void toast({ title: "Saved to your post", action: <ToastAction altText="Open it" onClick={() => navigate(links.generate({ draft: post.id }))}>Open it</ToastAction> });
    }
    upsertDraft(userId, {
      id: `video-${project.id}`,
      createdAt: new Date().toISOString(),
      hook: text.trim().split("\n")[0].slice(0, 160),
      draft: text,
      pillar: "topic",
      pillarDetail: project.name,
      audience: "general",
      format: "short-video",
      platform: "instagram",
      ctaType: "save-share",
      status: "draft",
      ...(project.source ? { source: project.source } : {}),
    });
    setSavedDraft(true);
    toast(leo && project.draftId ? { title: "That post is gone, so this saved as a new one." } : { title: "Saved to My posts", description: "Schedule it from Pipeline when the video is exported." });
  };

  // the B-roll files from this device, with the face and background effects loaded; null when the effects couldn't load (said already)
  const exportFiles = async () => {
    const brollFiles: Record<string, Blob> = {};
    for (const b of settings.broll ?? []) {
      const f = await getFile(b.key).catch(() => undefined);
      if (f) brollFiles[b.key] = f;
    }
    if (settings.backdrop || settings.touchUp) {
      try {
        await loadEffects(settings);
      } catch {
        toast({ title: "Couldn't load the face and background effects", description: "Check the connection, then export again.", variant: "destructive" });
        return null;
      }
    }
    return brollFiles;
  };
  const runExport = (s: EditSettings, name: string, brollFiles: Record<string, Blob>) =>
    startExport(name, file!, words, s, s.subLang ? subs[s.subLang] : undefined, art, s.voiceover ? voiceBlob : null, brollFiles, s.music ? musicBlob : null, fx, s.backdrop?.kind === "video" ? backdropVideo?.file : null);
  const doExport = async () => {
    if (!file) return;
    const brollFiles = await exportFiles();
    if (brollFiles) void runExport(settings, project.name, brollFiles).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
  };

  // an exported file read back for what would spoil the post
  const checkFile = (j: ExportJob): Promise<FileCheck> => {
    const want = { seconds: j.seconds ?? total, kind: j.kind ?? "video", captions: settings.captions, hasWords: words.length > 0, sound: (settings.volume ?? 1) > 0 || !!settings.voiceover || !!settings.music,
      size: j.bytes && j.cap ? { bytes: j.bytes, cap: j.cap, label: j.label ?? "" } : undefined };
    // the picture is looked at too, up to the end card; a sound-only source has none of its own
    const looks = j.kind !== "audio" && !peaks ? lookAtFrames(j.url!, frameTimes(plan.total, settings.transition ? cutTimes(plan.segs, speed) : []).map((t) => intro + t)) : Promise.resolve(null);
    return Promise.all([measureExport(j.url!), looks]).then(([m, l]) =>
      ({ issues: [...exportIssues(m ?? { seconds: null, level: null, gap: null }, want), ...pictureAndClipIssues(m?.clip ?? null, blackStretches(l ?? []))], read: !!m }));
  };
  // one check per export, null while it runs
  const [fileCheck, setFileCheck] = useState<{ id: string; issues: ExportIssue[] | null; read: boolean } | null>(null);
  useEffect(() => {
    if (job?.state !== "done" || !job.url || job.name !== project.name || fileCheck?.id === job.id) return;
    const id = job.id;
    setFileCheck({ id, issues: null, read: false });
    void checkFile(job).then((c) => setFileCheck({ id, ...c }));
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  // the same edit in several sizes, one after another in the export queue, each file checked
  const [sizesOpen, setSizesOpen] = useState<boolean | null>(null);
  const showSizes = sizesOpen ?? !!exportQueue()?.ids.some((id) => id.startsWith(`${project.id}/`));
  const exportSizes = async (list: VersionPlan[]) => {
    if (!file) return;
    const brollFiles = await exportFiles();
    if (!brollFiles) return;
    exportAll(list.map((p) => ({ id: `${project.id}/${p.id}`, run: () => runExport(p.settings, p.name, brollFiles), check: checkFile })))
      .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
  };

  // find a word or phrase in what was said, and jump the video to it
  const [find, setFind] = useState("");
  const [hit, setHit] = useState(0);
  const hits = useMemo(() => findPhrase(words, find), [words, find]);
  const hitSet = useMemo(() => {
    const n = find.trim().split(/\s+/).filter(Boolean).length;
    return new Set(hits.flatMap((i) => Array.from({ length: n }, (_, j) => i + j)));
  }, [hits, find]);
  const jumpTo = (k: number) => {
    if (!hits.length) return;
    const i = ((k % hits.length) + hits.length) % hits.length;
    setHit(i);
    const w = words[hits[i]];
    const t = outAt(plan.segs, w.s, speed);
    const v = video.current;
    if (t !== null) seekOut(t);
    else if (v) v.currentTime = w.s; // a cut word: show the moment anyway
    document.getElementById(`word-${hits[i]}`)?.scrollIntoView({ block: "nearest" });
  };

  // key words mode: light the tapped word in its line, or turn a lit one off
  const tapKey = (w: Word) => patch({ keyWords: tapKeyWord(capLines, settings.keyWords, w) });
  const tapWord = (i: number) => {
    const inCut = removedAt(settings.removed, words[i]);
    if (inCut) {
      // a cut word: put its whole stretch back
      change({ ...settings, removed: (settings.removed ?? []).filter((r) => r !== inCut) });
      setCutStart(null);
      return;
    }
    if (cutStart === null) return setCutStart(i);
    change({ ...settings, removed: addRemoved(settings.removed, wordRange(words, cutStart, i)) });
    setCutStart(null);
  };
  const remember = (fix: CaptionFix) => {
    setFixes(saveFixes(userId, [...fixes.filter((f) => f.from.toLowerCase() !== fix.from.toLowerCase()), fix]));
    setOffer(null);
    const r = applyFixes(words, [fix]);
    if (r.count) setWords(r.words);
    toast({ title: `New videos fix "${fix.from}" to "${fix.to}"`, description: r.count ? `${r.count} more fixed in this one.` : undefined });
  };
  const cutWordCount = useMemo(() => words.filter((w) => removedAt(settings.removed, w)).length, [words, settings.removed]);

  const downloadSrt = () => {
    const blob = new Blob([toSrt(words, plan.segs, settings.removeFillers, speed)], { type: "application/x-subrip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^\w-]+/g, "-").slice(0, 60) || "video"}.srt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  // every filler, long pause and retake being cut, for review; kept ones stay in the list
  const cuts = useMemo(() => listCuts(words, duration, settings), [words, duration, settings]);
  const retakes = useMemo(() => listCuts(words, duration, { ...settings, removeRetakes: true }).filter((c) => c.kind === "retake").length, [words, duration, settings]);
  const keptCuts = new Set(settings.keepCuts ?? []);
  const toggleCut = (id: string) =>
    change({ ...settings, keepCuts: keptCuts.has(id) ? [...keptCuts].filter((k) => k !== id) : [...keptCuts, id] });
  const listen = (from: number, to: number) => {
    // the original moment, a second either side, so you hear exactly what goes
    const v = video.current;
    if (!v || playing) return;
    v.currentTime = Math.max(0, from - 1);
    void v.play().catch(() => {});
    window.setTimeout(() => v.pause(), (to - from + 2) * 1000);
  };

  // stickers
  const overlays = settings.overlays ?? [];
  const sel = overlays.find((o) => o.id === selected) ?? null;
  const addOverlay = (kind: OverlayKind) => {
    if (overlays.length >= MAX_OVERLAYS) return toast({ title: `Up to ${MAX_OVERLAYS} stickers on a video`, variant: "destructive" });
    const o = newOverlay(kind, Math.min(outT, Math.max(0, plan.total - 0.5)), settings.activeColor);
    change({ ...settings, overlays: [...overlays, o] });
    setSelected(o.id);
  };
  const suggest = async () => {
    setSuggesting(true);
    try {
      setCutaways(await suggestCutaways(userId, editedSentences(words, plan.segs, speed), plan.total));
    } catch (e) {
      toast({ title: "Couldn't suggest callouts", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };
  const calloutOf = (c: Cutaway) => overlays.find((o) => o.kind === "text" && o.text === c.callout && Math.abs(o.from - Math.floor(c.at * 10) / 10) < 0.05);
  const addCallout = (c: Cutaway) => {
    if (overlays.length >= MAX_OVERLAYS) return toast({ title: `Up to ${MAX_OVERLAYS} stickers on a video`, variant: "destructive" });
    const o = { ...newOverlay("text", c.at, settings.activeColor), text: c.callout };
    change({ ...settings, overlays: [...overlays, o] });
    setSelected(o.id);
    seekOut(o.from + 0.2);
  };
  const editOverlay = (id: string, p: Partial<Overlay>) => patch({ overlays: overlays.map((o) => (o.id === id ? { ...o, ...p } : o)) });
  // words over a video: the one words block, laid out as it draws (its box for hits and handles, its height for the warning)
  const block = overlays.find((o) => o.kind === "block") ?? null;
  const boxOf = (o: Overlay) => (measure ? layoutBlock(measure, o, W, H).rect : null);
  const editBlock = (p: Partial<Overlay>) =>
    block ? editOverlay(block.id, p) : change({ ...settings, overlays: [...overlays, { ...newOverlay("block", 0, "#FFFFFF", plan.total), ...p }] });
  const blockBox = block ? boxOf(block) : null;
  const blockWords = block ? block.text.split(/\s+/).filter(Boolean).length : 0;
  const readS = block ? readSeconds(block.text) : 0;
  const wallFlags = short && block ? scanCompliance(block.text) : [];
  const pickBtn = "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 [@media(pointer:coarse)]:min-h-11";
  const selBox = sel?.kind === "block" && !playing ? boxOf(sel) : null;
  // a new video under the same edit: the old one stays on the device so the toast's Undo can put it back.
  // It throws, so a stock pick shows the failure on its tile; Upload toasts it.
  const swappingRef = useRef(false);
  const swapVideo = async (load: () => Promise<File>) => {
    // a ref, not state: a stock clip still downloading must block an Upload swap started meanwhile
    if (swappingRef.current) throw new Error("Wait for the other video to finish swapping.");
    swappingRef.current = true;
    video.current?.pause();
    setPlaying(false);
    setSwapping(true);
    try {
      const f = await load();
      const before: VideoProject = { ...live.current, settings: settingsRef.current, words, thumb };
      const next = await swapSource(userId, project.id, f);
      // edits made while it saved stay
      const fin = swapped({ ...before, settings: settingsRef.current }, { fileId: fileKey(next), duration: next.duration, size: next.size, thumb: next.thumb });
      const put = (p: VideoProject) => {
        live.current = p;
        onSave(p);
        segIdx.current = 0;
        endAt.current = null;
        setWords(p.words);
        setSettings(p.settings);
        // older Undo steps hold the other clip's lengths; the toast's Undo is the way back across a swap
        setHistory([]);
        setThumb(p.thumb);
      };
      put(fin);
      setSwapStock(false);
      toast({
        title: "Video swapped",
        action: <ToastAction altText="Undo the swap" onClick={() => put(before)}>Undo</ToastAction>,
      });
      if (fin.settings.captions) void recaption(f);
    } catch (e) {
      throw new Error((e as Error).message || WALL_ERROR);
    } finally {
      swappingRef.current = false;
      setSwapping(false);
    }
  };
  const uploadSwap = (f: File) => void swapVideo(async () => f).catch((e: Error) => toast({ title: e.message, variant: "destructive" }));
  // B-roll: a stock clip over the edit from the playhead, the speaker's sound carrying on under it
  const brolls = settings.broll ?? [];
  const selB = brolls.find((b) => b.id === selBroll) ?? null;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // "Add B-roll for me" (autoBroll.ts) hands its clips in here while this video is open: one change, one Undo
  useEffect(() => onBrollApply(project.id, (added) => {
    const cur = settingsRef.current;
    setHistory((h) => [...h.slice(-19), cur]);
    setSettings({ ...cur, broll: [...(cur.broll ?? []), ...added.broll].slice(0, MAX_BROLL), overlays: [...(cur.overlays ?? []), ...added.overlays].slice(0, MAX_OVERLAYS) });
  }), [project.id]);
  // edit-by-chat (Leo only): the agent changes this video through vibe edit, and only on its Use this; not while the
  // video is on another device, where the editor and its Undo don't show
  const vibeIn = useRef({ transcript, name: project.name });
  vibeIn.current = { transcript, name: project.name };
  const shown = file !== null;
  useEffect(() => {
    if (!leo || !shown) return;
    let live = true;
    const off = registerEditTarget(videoTarget({
      title: () => vibeIn.current.name,
      settings: () => settingsRef.current,
      vibe: (instruction, cur) => vibeEdit({ instruction, settings: cur, transcript: vibeIn.current.transcript, duration }, userId),
      set: (next) => {
        const cur = settingsRef.current;
        setHistory((h) => [...h.slice(-19), cur]);
        settingsRef.current = next;
        setSettings(next);
      },
      open: () => live,
    }));
    return () => {
      live = false;
      off();
    };
  }, [leo, shown, duration]);
  // ?ask= from a link (Leo only): fills the vibe box, read once; nothing runs until Change it
  const [params] = useSearchParams();
  const linkAsk = leo ? params.get("ask") : null;
  useEffect(() => {
    if (linkAsk === null) return;
    setAsk(linkAsk.trim().slice(0, 300));
    updateUrl({ ask: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkAsk]);
  const addBroll = async (it: StockItem) => {
    if (brolls.length >= MAX_BROLL) throw new Error(`Up to ${MAX_BROLL} on a video`);
    const blob = await downloadStock(it.src);
    const probe = await loadVideo(blob).catch(() => null);
    const length = probe && Number.isFinite(probe.duration) ? probe.duration : it.duration ?? 4;
    if (probe) URL.revokeObjectURL(probe.src);
    const key = `br-${it.id}-${Date.now().toString(36)}`;
    await putFile(key, blob);
    const b = newBroll(key, outT, length, plan.total, { thumb: it.thumb, by: it.by, byUrl: it.byUrl, url: it.url });
    // the latest settings: other changes made while the clip downloaded must stay
    const cur = settingsRef.current;
    setHistory((h) => [...h.slice(-19), cur]);
    setSettings({ ...cur, broll: [...(cur.broll ?? []), b] });
    setBrollUrls((u) => ({ ...u, [key]: URL.createObjectURL(blob) }));
    setSelBroll(b.id);
    setBrollSearch(false);
    toast({ title: `B-roll added at ${fmtTime(b.from)}` });
  };
  const editBroll = (id: string, p: Partial<Broll>) => patch({ broll: brolls.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  const addPicture = async (f: File, kind: "picture" | "video" = "picture") => {
    const noun = kind === "video" ? "video" : "picture";
    if (!f.type.startsWith(kind === "video" ? "video/" : "image/")) return toast({ title: `That isn't a ${noun}`, variant: "destructive" });
    const max = kind === "video" ? 200 : 15;
    if (f.size > max * 1024 * 1024) return toast({ title: `That ${noun} is over ${max} MB`, variant: "destructive" });
    try {
      const key = `bd-${project.id}-${Date.now().toString(36)}`;
      await putFile(key, f);
      // the previous picture's file stays, so Undo can bring it back (ponytail: pictures accumulate per video, like voiceover takes)
      const cur = settingsRef.current;
      setHistory((h) => [...h.slice(-19), cur]);
      setSettings({ ...cur, backdrop: { kind, key } });
    } catch (e) {
      toast({ title: `Couldn't keep the ${noun}`, description: (e as Error).message, variant: "destructive" });
    }
  };

  const stickerColours = [...new Set(["#FFFFFF", "#FFD92B", settings.activeColor, art?.color ?? "#2563EB", "#EF4444", "#111827"].map((c) => c.toUpperCase()))];
  // the picked sticker's settings: in the Stickers tab, and under On top in a words-over-video project's short panel
  const stickerEditor = (sel: Overlay) => (
    <div className="space-y-3 rounded-lg border border-primary/25 p-3">
      {sel.kind !== "block" && !SHAPES.includes(sel.kind) && (
        <input value={sel.text} maxLength={60} onChange={(e) => editOverlay(sel.id, { text: e.target.value })} aria-label="Sticker text"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm [@media(pointer:coarse)]:h-11" />
      )}
      {sel.kind === "block" && (
        <Textarea rows={4} maxLength={400} value={sel.text} onChange={(e) => { editOverlay(sel.id, { text: e.target.value }); setSavedDraft(false); }} aria-label="Your words" className="text-sm" />
      )}
      <Row label="Colour">
        {stickerColours.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={sel.color === c} onClick={() => editOverlay(sel.id, { color: c })}
            className={`h-7 w-7 rounded-full border border-border ${sel.color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`} style={{ backgroundColor: c }} />
        ))}
      </Row>
      <Row label={`Size ${sel.size.toFixed(1)}x`}><input type="range" min={0.5} max={2.5} step={0.1} value={sel.size} onChange={(e) => editOverlay(sel.id, { size: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
      {sel.kind !== "block" && <Row label={`Shows for ${(sel.to - sel.from).toFixed(1)}s from ${fmtTime(sel.from)}`}>
        <input type="range" min={0.5} max={10} step={0.5} value={sel.to - sel.from} onChange={(e) => editOverlay(sel.id, { to: sel.from + Number(e.target.value) })} aria-label="How long it shows" className="w-32 accent-primary" />
      </Row>}
      <div className="flex flex-wrap gap-2">
        {sel.kind !== "block" && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => editOverlay(sel.id, { from: Math.floor(outT * 10) / 10, to: Math.floor(outT * 10) / 10 + (sel.to - sel.from) })}>Start at {fmtTime(outT)}</Button>}
        {(sel.kind === "arrow" || sel.kind === "underline") && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => editOverlay(sel.id, { turn: (sel.turn + 1) % 4 })}><RotateCw className="h-3.5 w-3.5" /> Turn</Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => { change({ ...settings, overlays: overlays.filter((o) => o.id !== sel.id) }); setSelected(null); }}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );

  // a cold open heard again adds its length back, so it is not counted against the cuts
  const cutSeconds = Math.max(0, duration - totalLength(plan.segs) + (settings.coldOpen?.repeat ? coldLength(plan.segs, settings.coldOpen) : 0));
  // platforms this length is too long for, shortest limit first
  const lengthIssues = useMemo(() => platformFit(plan.total).filter((p) => p.fit !== "ok").sort((a, b) => a.limit - b.limit), [plan.total]);
  const fillers = words.filter((w) => isFiller(w.w)).length;
  const zone = coverApp && settings.aspect === "9:16" ? APP_COVER[coverApp] : null;
  const covered = coverApp ? appCover(settings, coverApp) : null;

  const chips = leo ? aiChips(project.ai) : [];

  if (file === null) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>Back to videos</Button>
        <p className="rounded-xl border border-border/70 p-4 text-sm">
          The video for {project.name} is on the device you uploaded it from. Your edit is saved; open it there to export.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="[@media(pointer:coarse)]:min-h-11">All videos</Button>
        <h1 className={`${chips.length ? "" : "mr-auto "}truncate font-serif text-xl font-semibold`}>{project.name}</h1>
        {chips.length > 0 && (
          // people-ai-labels, Leo only: what the studio's AI made in this video (live-p5dog D2)
          <span className="mr-auto flex items-center gap-1">
            {chips.map((chip) => <span key={chip} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">{chip}</span>)}
            <InfoTip label="About the AI label">{"Made by the Postmosis AI. Posts from it get the AI label."}</InfoTip>
          </span>
        )}
        <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} className="gap-1.5 [@media(pointer:coarse)]:min-h-11"><Undo2 className="h-3.5 w-3.5" /> Undo</Button>
        <Button variant="outline" size="sm" onClick={() => void saveCover()} disabled={!file} className="gap-1.5 [@media(pointer:coarse)]:min-h-11"><ImageIcon className="h-3.5 w-3.5" /> Make cover</Button>
        {settings.exportAs !== "audio" && settings.exportAs !== "small" && (
          <Button variant="outline" size="sm" onClick={() => setSizesOpen(!showSizes)} aria-expanded={showSizes} className="gap-1.5 [@media(pointer:coarse)]:min-h-11"><Layers className="h-3.5 w-3.5" /> More sizes</Button>
        )}
        <Button size="sm" onClick={doExport} disabled={!file || job?.state === "running"} className="gap-1.5 bg-gradient-primary text-primary-foreground disabled:opacity-60 [@media(pointer:coarse)]:min-h-11">
          <Download className="h-3.5 w-3.5" /> {job?.state === "running" ? `Exporting ${Math.round(job.progress * 100)}%` : <>{exportLabel} <span className="font-normal opacity-80">{fmtBytes(size.bytes)}</span></>}
        </Button>
      </div>
      {wideForUpright(size) && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs" role="status">
          <span className="mr-auto">Wide video: {size.label} shows it small, with black bars above and below.</span>
          <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => patch({ aspect: "9:16", fit: "fill" })}>Crop to 9:16</Button>
          <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => patch({ aspect: "9:16", fit: "blur" })}>9:16, blurred behind</Button>
        </p>
      )}
      {showSizes && settings.exportAs !== "audio" && settings.exportAs !== "small" && (
        <ExportSizes projectId={project.id} name={project.name} settings={settings} seconds={total} srcW={video.current?.videoWidth || 1080} srcH={video.current?.videoHeight || 1920} onExport={(list) => void exportSizes(list)} />
      )}
      <ClipFinder userId={userId} project={project} words={words} settings={settings} duration={duration} />
      {!words.length && isLong(duration, project.size) && <LongCaptions userId={userId} project={project} file={file} onWords={setWords} />}
      {/* Leo: an AI video of your face or a presenter, one line fixed or made in another language (?script, ?lang); a fix or its Undo puts the project under the edit as a swap does */}
      {leo && project.ai && (
        <ScriptCard userId={userId} project={project}
          onPut={(p) => { live.current = p; onSave(p); segIdx.current = 0; endAt.current = null; setWords(p.words); setSettings(p.settings); setHistory([]); setThumb(p.thumb); }} />
      )}
      {/* Leo: a video made from an edit plan (same edit) makes versions of it, one change each (?versions=1) */}
      {leo && project.plan && <VersionsCard userId={userId} project={project} settings={settings} onLay={layEdit} />}
      {job?.state === "running" && job.name === project.name && <ExportRunning job={job} total={total} />}
      {job?.state === "done" && job.url && job.name === project.name && (
        <section className="space-y-2 rounded-xl border border-success/40 bg-success/5 p-3" aria-label="Ready to post">
          <p className="text-sm font-semibold">Ready to post</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="h-9 gap-1.5"><a href={job.url} download={`${project.name}-${job.kind === "audio" ? "audio" : "edited"}.${job.ext}`}><Download className="h-3.5 w-3.5" /> {job.kind === "audio" ? "Sound" : "Video"}{job.bytes ? `, ${fmtBytes(job.bytes)}` : ""}</a></Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void saveCover()}><ImageIcon className="h-3.5 w-3.5" /> Cover</Button>
            {words.length > 0 && <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={downloadSrt}><Download className="h-3.5 w-3.5" /> Subtitles</Button>}
            {caption ? (
              <Button size="sm" className="h-9 [@media(pointer:coarse)]:min-h-11" onClick={copyCaption}>Copy caption</Button>
            ) : (
              <Button size="sm" className="h-9 gap-1.5 [@media(pointer:coarse)]:min-h-11" onClick={writeCaption} disabled={writingCaption || !words.length}>
                {writingCaption ? <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />} {writingCaption ? "Writing..." : "Write the caption"}
              </Button>
            )}
          </div>
          {kitWarnings.map((w) => <p key={w.message} className={`text-xs ${w.level === "over" ? "text-destructive" : ""}`}>{w.message}</p>)}
          {fileCheck?.id === job.id && (
            fileCheck.issues === null ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">Checking the file...</p>
            ) : fileCheck.issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs" role="status">
                {fileCheck.read ? <><Check className="h-3.5 w-3.5 text-success" /> File checked: the right length, and the sound comes through.</> : "Couldn't read the file back to check it."}
              </p>
            ) : (
              <ul className="space-y-1.5" aria-label="Before you post">
                {fileCheck.issues.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs">
                    <span className="mr-auto">{i.text}</span>
                    {i.id === "quiet" && !settings.loudness && <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => { patch({ loudness: true }); setTab("cuts"); }}>Even out loudness</Button>}
                    {i.id === "silent" && <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => setTab("cuts")}>Open Cuts</Button>}
                    {i.id === "clipped" && !settings.loudness && <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => { patch({ loudness: true }); setTab("cuts"); }}>Even out loudness</Button>}
                    {(i.id === "clipped" || i.id === "black") && i.at !== undefined && <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => seekOut(i.at!)}>Show me</Button>}
                    {i.id === "gap" && i.at !== undefined && <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => seekOut(i.at!)}>Show me</Button>}
                    {i.id === "size" && <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => setTab("frame")}>Open Hook and frame</Button>}
                    {i.id === "captions" && <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => setTab("words")}>Caption it</Button>}
                  </li>
                ))}
              </ul>
            )
          )}
          {job.kind !== "audio" && ((job.seconds ?? total) > MAX_WATCH_SECONDS ? (
            <p className="border-t border-success/30 pt-2 text-xs text-muted-foreground">Watch it like a viewer takes videos up to {MAX_WATCH_SECONDS} seconds.</p>
          ) : (
            <div className="space-y-1.5 border-t border-success/30 pt-2">
              <span className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className={`h-11 gap-1.5 sm:h-9 ${watching ? "disabled:opacity-100" : ""}`} disabled={watching || none("video-watch")}
                  onClick={() => void startWatch(job.id, job.url!, job.seconds ?? total)}>
                  {watching ? <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> : <Eye className="h-3.5 w-3.5" />}
                  {watching ? "Watching it, 1-2 minutes..." : watch?.exportId === job.id && watch.state === "done" ? "Watch it again" : "Watch it like a viewer"}
                </Button>
                <Left n={left("video-watch")} feature="video-watch" busy={watching} />
              </span>
              {watch?.exportId === job.id && watch.state === "failed" && <p className="text-xs text-destructive" role="alert">{watch.error}</p>}
              {watch?.exportId === job.id && watch.state === "done" && watch.findings && (
                watch.findings.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-xs" role="status"><Check className="h-3.5 w-3.5 text-success" /> Watched it: nothing a viewer would trip on.</p>
                ) : (
                  <ul className="space-y-1.5" aria-label="What a viewer would trip on">
                    {watch.findings.map((f) => (
                      <li key={`${f.kind}-${f.start}`} className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs">
                        <span className="min-w-0 flex-1"><span className="font-semibold">{fmtTime(f.start)} {WATCH_LABELS[f.kind]}:</span> {f.what}{f.fix && <span className="block text-muted-foreground">Fix: {f.fix}</span>}</span>
                        <Button size="sm" variant="outline" className="h-11 text-xs sm:h-7" onClick={() => seekOut(f.start)}>Show me</Button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          ))}
        </section>
      )}
      {job?.state === "failed" && <p className="text-xs text-destructive">Export failed: {job.error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          <div className="relative mx-auto w-full max-w-[360px]">
            <canvas
              ref={canvas}
              width={W}
              height={H}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;
                const y = (e.clientY - r.top) / r.height;
                // a press on a sticker or the captions starts a drag; anywhere else is a tap to play or pause
                // (a picked words block's handles first: 44 px across, whatever the preview's size)
                const grip = selBox && sel ? blockGrip(selBox, x, y, 22 / r.width, 22 / r.height) : null;
                const hit = playing ? null : overlayHit(settings.overlays, outT, x, y, r.width / r.height, boxOf);
                if (grip && sel) {
                  drag.current = { startX: x, startY: y, moved: false, overlay: sel.id, grip, size0: sel.size, d0: Math.max(0.02, Math.hypot((x - sel.x) * (r.width / r.height), y - sel.y)) };
                } else if (hit) {
                  drag.current = { startX: x, startY: y, moved: false, overlay: hit.id };
                  // one write: two setters in a row would keep only the second; the short panel has no tabs
                  if (short) { if (hit.id !== selected) updateUrl({ sticker: hit.id }); }
                  else if (hit.id !== selected || tab !== "stickers") updateUrl({ sticker: hit.id, tab: "stickers" });
                } else {
                  drag.current = settings.captions && Math.abs(y - captionCenter(settings)) < 0.09 ? { startX: x, startY: y, moved: false } : null;
                }
                if (drag.current) e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const r = e.currentTarget.getBoundingClientRect();
                const x = Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width));
                const y = (e.clientY - r.top) / r.height;
                if (Math.hypot(x - d.startX, y - d.startY) > 0.01) d.moved = true;
                if (!d.moved) return;
                if (d.overlay) {
                  const oy = Math.min(0.97, Math.max(0.03, y));
                  const aspect = r.width / r.height;
                  const to = (o: Overlay): Overlay =>
                    d.grip === "side" ? { ...o, w: Math.round(Math.min(0.95, Math.max(0.5, 2 * Math.abs(x - o.x))) * 100) / 100 }
                    : d.grip === "corner" ? { ...o, size: Math.round(Math.min(2.5, Math.max(0.5, (d.size0! * Math.hypot((x - o.x) * aspect, y - o.y)) / d.d0!)) * 20) / 20 }
                    : { ...o, x, y: oy };
                  setSettings((s) => ({ ...s, overlays: (s.overlays ?? []).map((o) => (o.id === d.overlay ? to(o) : o)) }));
                } else setSettings((s) => ({ ...s, captionY: Math.min(0.92, Math.max(0.08, y)) }));
              }}
              onPointerUp={() => {
                const d = drag.current;
                drag.current = null;
                if (d?.moved) {
                  setHistory((h) => [...h.slice(-19), settings]);
                  return;
                }
                if (d?.overlay) return; // a tap on a sticker selects it
                void toggle();
              }}
              style={{ touchAction: "none" }}
              className="w-full cursor-pointer rounded-xl bg-black shadow-card"
              aria-label="Preview: tap to play or pause, drag the captions or a sticker to move it"
            />
            {selBox && (
              // the picked words block: drag inside to move it, a side to change its width, a corner to change its size
              <div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-primary"
                style={{ left: `${(selBox.x - selBox.w / 2) * 100}%`, top: `${(selBox.y - selBox.h / 2) * 100}%`, width: `${selBox.w * 100}%`, height: `${selBox.h * 100}%` }}>
                {["left-0 top-1/2", "left-full top-1/2", "left-0 top-0", "left-full top-0", "left-0 top-full", "left-full top-full"].map((at) => (
                  <span key={at} className={`absolute ${at} h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-background`} />
                ))}
              </div>
            )}
            {swapping && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-sm font-semibold text-white" aria-live="polite">Swapping the video...</div>
            )}
            {zone && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl text-[10px] font-semibold text-white">
                <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: `${zone.top * 100}%` }} />
                <div className="absolute right-0 bg-black/40" style={{ top: `${zone.top * 100}%`, bottom: `${zone.bottom * 100}%`, width: `${zone.right * 100}%` }} />
                <div className="absolute inset-x-0 bottom-0 bg-black/55 pt-1 text-center" style={{ height: `${zone.bottom * 100}%` }}>{zone.label} covers this</div>
              </div>
            )}
          </div>
          {file === undefined && <p className="text-xs text-muted-foreground">Loading the video...</p>}
          {voiceUrl && <audio ref={voiceEl} src={voiceUrl} preload="auto" className="hidden" />}
          {backdropVideo && (
            <video ref={backdropEl} src={backdropVideo.url} muted loop playsInline preload="auto" aria-hidden className="pointer-events-none absolute h-px w-px opacity-0"
              onLoadedData={() => paintRef.current?.()} onSeeked={() => { if (!playing) paintRef.current?.(); }} />
          )}
          {brolls.map((b) => (
            <video key={b.id} src={brollUrls[b.key] || undefined} muted playsInline preload="auto" aria-hidden className="pointer-events-none absolute h-px w-px opacity-0"
              ref={(el) => { if (el) brollEls.current.set(b.id, el); else brollEls.current.delete(b.id); }}
              onLoadedData={() => !playing && paint()} onSeeked={() => !playing && paint()} />
          ))}
          <video ref={video} src={url} playsInline preload="auto" className="pointer-events-none absolute h-px w-px opacity-0"
            onLoadedMetadata={(e) => setDims([e.currentTarget.videoWidth, e.currentTarget.videoHeight])}
            onLoadedData={() => paint()} onSeeked={() => paint()} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="h-9 w-9 p-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <input type="range" min={0} max={total || 1} step={0.05} value={Math.min(introT ?? intro + outT, total)} aria-label="Position"
              onChange={(e) => seekPos(Number(e.target.value))} className="flex-1 accent-primary" />
            <span className="w-24 text-right font-mono text-[11px] text-muted-foreground">{fmtTime(introT ?? intro + outT)} / {fmtTime(total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {fmtTime(duration)} filmed, {fmtTime(plan.total)} after cuts{cutSeconds > 0.5 ? ` (${cutSeconds.toFixed(1)}s cut)` : ""}{speed > 1 ? ` at ${speed}x` : ""}.
          </p>
          {lengthIssues.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]" role="status">
              {lengthIssues.map((p) => (
                <span key={p.id} className={`rounded-full border px-2 py-0.5 font-medium ${p.fit === "over" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/50 bg-warning/10"}`}>
                  {p.fit === "over" ? `Too long for ${p.label} (max ${fmtTime(p.limit).replace(/\.0$/, "")})` : `${p.label} past ${fmtTime(p.limit).replace(/\.0$/, "")} reaches fewer new people`}
                </span>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-xs [@media(pointer:coarse)]:min-h-11" onClick={() => patch({ trimEnd: trimToLength(plan.segs, duration, lengthIssues[0].limit, settings) })}>
                Trim to {fmtTime(lengthIssues[0].limit).replace(/\.0$/, "")}
              </Button>
            </div>
          )}
          {canFollow && !short && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
              <Row label="Follow my face">
                {finding !== null ? (
                  <span className="text-xs text-muted-foreground" aria-live="polite">Finding your face {Math.round(finding * 100)}%</span>
                ) : (
                  <InfoTip label="About follow my face">The crop moves with you, or to whoever is talking.</InfoTip>
                )}
                <Toggle on={!!settings.followFace} disabled={finding !== null || !file} set={(v) => void setFollow(v)} />
              </Row>
            </div>
          )}
          {!short && <BurnedTextOffer settings={settings} segs={plan.segs} file={file}
            apply={(p) => { const cur = settingsRef.current; setHistory((h) => [...h.slice(-19), cur]); setSettings({ ...cur, ...p }); }}
            note={(p) => setSettings((cur) => ({ ...cur, ...p }))} />}
          {settings.aspect === "9:16" && (
            <div className="space-y-1.5">
              <Row label="Show the app's buttons">
                <Chip on={!coverApp} onClick={() => setCoverApp(null)}>Off</Chip>
                {(Object.keys(APP_COVER) as CoverApp[]).map((a) => <Chip key={a} on={coverApp === a} onClick={() => setCoverApp(a)}>{APP_COVER[a].label}</Chip>)}
              </Row>
              {zone && covered?.captions && (
                <p className="flex flex-wrap items-center gap-2 text-[11px]" role="status">
                  Captions sit under {zone.label}&apos;s {captionCenter(settings) > 0.5 ? "caption area" : "top bar"}.
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch({ captionY: clearOfApp(captionCenter(settings), coverApp!) })}>Move captions clear</Button>
                </p>
              )}
              {zone && !!covered?.stickers && (
                <p className="text-[11px]" role="status">
                  {covered.stickers} {covered.stickers === 1 ? "sticker sits" : "stickers sit"} under {zone.label}&apos;s buttons. Drag {covered.stickers === 1 ? "it" : "them"} clear on the preview.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Vibe edit
              <InfoTip label="About vibe edit">Say the change in plain words; Undo puts it back.</InfoTip></p>
            <StylePresets settings={settings} words={words} segs={plan.segs} total={plan.total} speed={speed} disabled={thinking}
              apply={(p) => { const cur = settingsRef.current; setHistory((h) => [...h.slice(-19), cur]); setSettings({ ...cur, ...p }); }} />
            <ReelStyleCopy projectId={project.id} settings={settings} words={words} segs={plan.segs} total={plan.total} speed={speed} disabled={thinking}
              apply={(next) => { setHistory((h) => [...h.slice(-19), settingsRef.current]); setSettings(next); }}
              onSaveSkill={(name) => setSkillForm({ name: name.slice(0, 40), prompt: "", isDefault: false })} />
            {skills.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Your editing skills">
                {skills.map((sk) => (
                  <button key={sk.id} type="button" onClick={() => applySkill(sk)} disabled={thinking}
                    aria-pressed={sameLook(settings, sk.look)}
                    title={sk.prompt ? `${sk.name}: ${sk.prompt}` : sk.name}
                    className={`min-h-8 rounded-full border px-3 text-xs font-semibold ${sameLook(settings, sk.look) ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 bg-background text-foreground hover:border-primary"}`}>
                    {sk.name}{sk.isDefault ? " (default)" : ""}
                  </button>
                ))}
                <button type="button" onClick={() => setManaging((m) => !m)} aria-expanded={managing}
                  className="min-h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">{managing ? "Done" : "Manage"}</button>
              </div>
            )}
            {managing && (
              <ul className="space-y-1 rounded-lg border border-border/60 bg-background p-2">
                {skills.map((sk) => (
                  <li key={sk.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="mr-auto font-semibold">{sk.name}</span>
                    <label className="flex min-h-8 items-center gap-1.5">
                      <input type="radio" name="default-skill" checked={!!sk.isDefault} onChange={() => setSkills(saveSkill(userId, { ...sk, isDefault: true }))} className="accent-primary" />
                      New videos
                    </label>
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={() => dropSkill(sk)}>Delete</Button>
                  </li>
                ))}
              </ul>
            )}
            {log.slice(-3).map((m, i) => (
              <p key={i} className="text-xs"><span className="text-muted-foreground">{m.me}</span><br />{m.it}</p>
            ))}
            <Textarea rows={2} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Bigger yellow captions at the top, cut the pauses tighter, hook: 3 CPF mistakes"
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), runVibe())} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => runVibe()} disabled={thinking || !ask.trim() || none("vibe-edit")} className={`gap-1.5 [@media(pointer:coarse)]:min-h-11 ${thinking ? "disabled:opacity-100" : ""}`}>
                {thinking ? <ThinkingOrb state="working" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />} {thinking ? "Editing..." : "Change it"}
              </Button>
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold hover:border-primary/40 [@media(pointer:coarse)]:min-h-11 ${thinking || none("vibe-edit") ? "pointer-events-none opacity-60" : ""}`}>
                <Film className="h-3.5 w-3.5" /> Match a reference video
                <input type="file" accept="video/*" className="sr-only" disabled={none("vibe-edit")} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void matchReference(f); }} />
              </label>
              <Left n={left("vibe-edit")} feature="vibe-edit" busy={thinking} />
              {!skillForm && (
                <button type="button" onClick={openSkillForm} className="min-h-8 px-1 text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">Save as a skill</button>
              )}
            </div>
            {skillForm && (
              <form className="space-y-2 rounded-lg border border-border/60 bg-background p-3" onSubmit={(e) => { e.preventDefault(); keepSkill(); }}>
                <label className="block space-y-1 text-xs font-semibold">
                  Skill name
                  <input value={skillForm.name} maxLength={40} autoFocus onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal [@media(pointer:coarse)]:h-11" />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Also do this on each video (optional)
                  <Textarea rows={2} value={skillForm.prompt} maxLength={500} onChange={(e) => setSkillForm({ ...skillForm, prompt: e.target.value })}
                    placeholder="Hook: the most surprising number I mention. Cut the pauses tight." className="text-sm font-normal" />
                </label>
                <label className="flex min-h-8 items-center gap-2 text-xs [@media(pointer:coarse)]:min-h-11">
                  <input type="checkbox" checked={skillForm.isDefault} onChange={(e) => setSkillForm({ ...skillForm, isDefault: e.target.checked })} className="h-4 w-4 accent-primary" />
                  Start new videos with it
                </label>
                <div className="flex gap-2">
                  <Button size="sm" type="submit" disabled={!skillForm.name.trim()}>Save skill</Button>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setSkillForm(null)}>Cancel</Button>
                </div>
              </form>
            )}
          </section>

          {!short && <section className="space-y-2 rounded-xl border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Post caption</p>
              <Button size="sm" variant="outline" onClick={writeCaption} disabled={writingCaption || !words.length} className={`gap-1.5 [@media(pointer:coarse)]:min-h-11 ${writingCaption ? "disabled:opacity-100" : ""}`}>
                {writingCaption ? <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />}
                {writingCaption ? "Writing..." : caption ? "Write it again" : "Write the caption"}
              </Button>
            </div>
            {caption && (
              <>
                <Textarea rows={6} value={caption} onChange={(e) => { setCaption(e.target.value); setSavedDraft(false); }} aria-label="Post caption" className="text-sm" />
                {captionFlags.length > 0 && (
                  <ul className="space-y-1 text-[11px]">
                    {captionFlags.map((f) => (
                      <li key={f.id} className={`rounded-md border px-2 py-1 ${f.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>
                        <span className="font-semibold">&ldquo;{f.match}&rdquo;</span> {f.message}
                      </li>
                    ))}
                  </ul>
                )}
                {brandLinks.length > 0 && strayLinks(caption, brandLinks).map((l) => <p key={l} className="break-all text-[11px] font-medium text-warning">Not one of your offer links: {l}</p>)}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={saveToPosts} disabled={savedDraft}>{saveLabel}</Button>
                  <Button size="sm" variant="ghost" onClick={copyCaption}>Copy</Button>
                  {savedDraft && <Link to="/calendar" className="self-center text-xs font-semibold text-primary hover:underline">Schedule it</Link>}
                </div>
              </>
            )}
            <PlatformCaptions userId={userId} projectId={project.id} transcript={transcript} instagram={caption} title={project.name} brand={brandKit} onInstagram={(t) => { setCaption(t); setSavedDraft(false); }} />
            <div className="space-y-2 border-t border-border/60 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="mr-auto text-sm font-semibold">Title and cover</p>
                <span className={leo ? "flex flex-wrap items-center justify-end gap-2 text-right" : "flex items-center gap-2"}>
                  <Left n={left("video-publish")} feature="video-publish" busy={ideating} />
                  <Button size="sm" variant="outline" onClick={suggestPublish} disabled={ideating || !words.length || none("video-publish")} className={`h-11 gap-1.5 sm:h-9 ${ideating ? "disabled:opacity-100" : ""}`}>
                    {ideating ? <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" />}
                    {ideating ? "Writing..." : publish ? "Write again" : "Suggest from what I say"}
                  </Button>
                </span>
              </div>
              {publish && (
                <>
                  <ul className="divide-y divide-border/60" aria-label="Titles">
                    {publish.titles.map((t) => (
                      <li key={t} className="flex items-center gap-2 py-1 text-sm">
                        <span className="min-w-0 flex-1">{t}</span>
                        <Button size="sm" variant="ghost" className="h-11 shrink-0 text-xs sm:h-8" onClick={() => copyTitle(t)} aria-label={`Copy ${t}`}>Copy</Button>
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
                    <label className="block space-y-1 text-xs font-semibold">
                      Cover text
                      <input value={publish.cover} maxLength={60} onChange={(e) => setPublish({ ...publish, cover: e.target.value })}
                        className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm font-normal sm:h-9 [@media(pointer:coarse)]:h-11" />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold">
                      Second line (optional)
                      <input value={publish.line2 ?? ""} maxLength={30} onChange={(e) => setPublish({ ...publish, line2: e.target.value })}
                        className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm font-normal sm:h-9 [@media(pointer:coarse)]:h-11" />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className={`h-11 gap-1.5 sm:h-9 ${coverBusy ? "disabled:opacity-100" : ""}`} onClick={() => void (publish.at !== null ? saveBestCover(publish.at) : saveCover())} disabled={!file || !publish.cover.trim() || coverBusy}>
                      {coverBusy ? <ThinkingOrb state="working" size={20} theme="dark" aria-hidden /> : <ImageIcon className="h-3.5 w-3.5" />}
                      {coverBusy ? "Finding the best frame..." : publish.at !== null ? `Make the cover near ${fmtTime(publish.at)}` : "Make the cover from this frame"}
                    </Button>
                    {publish.at !== null && <Button size="sm" variant="ghost" className="h-11 text-xs sm:h-8" onClick={() => seekOut(publish.at!)}>Show me</Button>}
                  </div>
                </>
              )}
              {coverShot && <CoverShot shot={coverShot} grid={gridView} setGrid={setGridView} />}
            </div>
          </section>}

          {short ? (
            <div className="space-y-4" aria-label="Words over a video">
              <section className="space-y-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Words</h2>
                <Textarea rows={5} maxLength={400} value={block?.text ?? ""} onChange={(e) => { editBlock({ text: e.target.value }); setSavedDraft(false); }} aria-label="Your words" className="text-sm" />
                <p className="text-[11px] text-muted-foreground" aria-live="polite">
                  {blockWords} {blockWords === 1 ? "word" : "words"}, about {readS} s to read
                </p>
                {readsLonger(readS, plan.total) !== null && (
                  <p className="rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs" role="status">
                    People need about {readS} s to read this. The video is {readsLonger(readS, plan.total)} s. Cut words or use a longer clip.
                  </p>
                )}
                {!!blockBox && blockBox.h > 0.7 && (
                  <p className="rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs" role="status">Too many words for the frame. Cut some or make the text smaller.</p>
                )}
                {wallFlags.length > 0 && (
                  <ul className="space-y-1 text-[11px]">
                    {wallFlags.map((f) => (
                      <li key={f.id} className={`rounded-md border px-2 py-1 ${f.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>
                        <span className="font-semibold">&ldquo;{f.match}&rdquo;</span> {f.message}
                      </li>
                    ))}
                  </ul>
                )}
                <Row label="Font">
                  {(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((id) => (
                    <Chip key={id} on={(block?.font ?? "heavy") === id} onClick={() => editBlock({ font: id })}>
                      <span style={{ fontFamily: FONTS[id].css.replace(/^\d+ \{px\}px /, "") }}>{FONTS[id].label}</span>
                    </Chip>
                  ))}
                </Row>
                <Row label={`Size ${(block?.size ?? 1).toFixed(1)}x`}>
                  <input type="range" min={0.5} max={2.5} step={0.05} value={block?.size ?? 1} aria-label="Size of the words" onChange={(e) => editBlock({ size: Number(e.target.value) })} className="h-11 w-40 accent-primary sm:h-auto" />
                </Row>
                <Row label="Colour">
                  <input type="color" aria-label="Colour of the words" value={block?.color ?? "#FFFFFF"} onChange={(e) => editBlock({ color: e.target.value.toUpperCase() })} className="h-8 w-10 rounded [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-12" />
                </Row>
                <Row label="Background">
                  {([["none", "None"], ["white", "White"], ["bar", "Dark bar"]] as const).map(([id, label]) => (
                    <Chip key={id} on={(block?.box ?? "none") === id} onClick={() => editBlock({ box: id })}>{label}</Chip>
                  ))}
                </Row>
              </section>
              <section className="space-y-2.5 border-t border-border/60 pt-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sound</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" role="group" aria-label="Filmed sound">
                    {([[0, "Sound off"], [1, "Sound on"]] as const).map(([v, label]) => (
                      <button key={v} type="button" aria-pressed={(volume > 0 ? 1 : 0) === v} onClick={() => patch({ volume: v ? undefined : 0 })}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold [@media(pointer:coarse)]:min-h-11 ${(volume > 0 ? 1 : 0) === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{label}</button>
                    ))}
                  </div>
                  <label className={`${pickBtn} ${musicBusy ? "pointer-events-none opacity-60" : ""}`}>
                    <MusicIcon className="h-3.5 w-3.5" /> {musicBusy ? "Reading..." : "Swap sound"}
                    <input type="file" accept="audio/*" className="sr-only" disabled={musicBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addMusic(f, { volume: 0 }); }} />
                  </label>
                </div>
                {settings.music && (
                  <Row label={`Music level ${Math.round(settings.music.level * 100)}%`}>
                    <input type="range" min={0} max={1} step={0.05} value={settings.music.level} aria-label="Music volume"
                      onChange={(e) => patch({ music: { ...settings.music!, level: Number(e.target.value) } })} className="h-11 w-32 accent-primary sm:h-auto" />
                  </Row>
                )}
              </section>
              <section className="space-y-2.5 border-t border-border/60 pt-3">
                <h2 className="flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video
                  <InfoTip label="About the video">Use your own clip, a stock clip or a made one, never someone else&apos;s.</InfoTip></h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Swap video</span>
                  <label className={`${pickBtn} ${swapping ? "pointer-events-none opacity-60" : ""}`}>
                    <Upload className="h-3.5 w-3.5" /> Upload
                    <input type="file" accept="video/*" className="sr-only" disabled={swapping} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadSwap(f); }} />
                  </label>
                  <button type="button" className={`${pickBtn} disabled:pointer-events-none disabled:opacity-60`} disabled={swapping} onClick={() => setSwapStock(true)} aria-expanded={swapStock}>
                    <Film className="h-3.5 w-3.5" /> Stock clip
                  </button>
                </div>
                {swapStock && (
                  <StockSearch kind="video" orientation={settings.aspect === "16:9" ? "landscape" : settings.aspect === "1:1" ? "square" : "portrait"}
                    placeholder="City at night, coffee on a desk, rain on a window"
                    onPick={(it, q) => swapVideo(async () => {
                      const blob = await downloadStock(it.src);
                      return new File([blob], `${q.trim().replace(/[^\w-]+/g, "-").slice(0, 40) || "stock-clip"}.mp4`, { type: blob.type || "video/mp4" });
                    })}
                    onClose={() => setSwapStock(false)} />
                )}
              </section>
              <section className="space-y-2.5 border-t border-border/60 pt-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On top</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Add</span>
                  {([["text", "Text sticker"], ["arrow", "Arrow"], ["circle", "Circle"], ["underline", "Underline"]] as const).map(([k, label]) => (
                    <Button key={k} size="sm" variant="outline" className="h-9 [@media(pointer:coarse)]:min-h-11" onClick={() => addOverlay(k)}>{label}</Button>
                  ))}
                  {art?.logo ? (
                    <Chip on={!!settings.logo} onClick={() => patch({ logo: !settings.logo })}>Your logo</Chip>
                  ) : (
                    <Link to={links.brand({ section: "logo" })} className="text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">Your logo</Link>
                  )}
                </div>
                {sel && sel.kind !== "block" && stickerEditor(sel)}
              </section>
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                <Button size="sm" onClick={saveToPosts} disabled={savedDraft || !block?.text.trim()} className="[@media(pointer:coarse)]:min-h-11">{saveLabel}</Button>
                {savedDraft && <Link to="/calendar" className="text-xs font-semibold text-primary hover:underline">Schedule it</Link>}
                <Button size="sm" variant="ghost" className="ml-auto [@media(pointer:coarse)]:min-h-11" onClick={() => setView("all")}>All editing tools</Button>
              </div>
            </div>
          ) : (<>
          {wallMode && <Button size="sm" variant="ghost" className="[@media(pointer:coarse)]:min-h-11" onClick={() => setView("")}>Fewer tools</Button>}
          <nav className="flex w-fit flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" aria-label="Edit">
            {([["style", "Captions"], ["cuts", "Cuts"], ["frame", "Hook and frame"], ["face", "Face and background"], ["stickers", "Stickers and charts"], ["broll", "B-roll"], ["words", "Words"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold [@media(pointer:coarse)]:min-h-11 ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{label}</button>
            ))}
          </nav>

          {tab === "style" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {STYLE_IDS.map((id) => (
                  <button key={id} type="button" onClick={() => change(withStyle(settings, id as StyleId))} aria-pressed={settings.style === id && !lookOn}
                    className={`rounded-xl border p-2 text-left text-xs font-semibold ${settings.style === id && !lookOn ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/70 hover:border-primary/40"}`}>
                    <span className="mb-1 block h-8 rounded-md bg-neutral-900 px-1.5 text-center leading-8"
                      style={{ color: STYLES[id].base, fontFamily: STYLES[id].font.includes("Fraunces") ? "Georgia, serif" : undefined, fontWeight: STYLES[id].weight }}>
                      {STYLES[id].uppercase ? "MOST PEOPLE" : "Most people"}
                    </span>
                    {styleLabel(id, leo)}
                  </button>
                ))}
                {leo && CAPTION_LOOKS.map((l) => (
                  <button key={l.id} type="button" onClick={() => { setKeyError(""); change(withCaptionLook(settings, l)); }} aria-pressed={lookOn?.id === l.id}
                    className={`rounded-xl border p-2 text-left text-xs font-semibold ${lookOn?.id === l.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/70 hover:border-primary/40"}`}>
                    <LookSample look={l} />
                    {l.label}
                  </button>
                ))}
              </div>
              <Row label="Captions"><Toggle on={settings.captions} set={(v) => patch({ captions: v })} /></Row>
              <Row label="Position">
                {(["top", "middle", "bottom"] as const).map((p) => <Chip key={p} on={settings.captionY === undefined && settings.position === p} onClick={() => patch({ position: p, captionY: undefined })}>{p[0].toUpperCase() + p.slice(1)}</Chip>)}
              </Row>
              <Row label={`Size ${settings.size.toFixed(1)}x`}><input type="range" min={0.6} max={1.6} step={0.1} value={settings.size} onChange={(e) => patch({ size: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              {STYLES[settings.style].mode === "words" && (
                <Row label={`Words at once: ${settings.wordsPerCaption}`}><input type="range" min={1} max={6} step={1} value={settings.wordsPerCaption} onChange={(e) => patch({ wordsPerCaption: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              )}
              <Row label="Background">
                <Chip on={captionBoxOf(settings) === "none"} onClick={() => patch({ captionBox: "none" })}>None</Chip>
                <Chip on={captionBoxOf(settings) === "pill"} onClick={() => patch({ captionBox: "pill" })}>Dark box</Chip>
                {STYLES[settings.style].mode === "words" && <Chip on={captionBoxOf(settings) === "word"} onClick={() => patch({ captionBox: "word" })}>Highlight word</Chip>}
              </Row>
              <Row label="Animation">
                {([["pop", "Pop"], ["slide", "Slide up"], ["type", "Typewriter"], ["none", "None"]] as const).map(([id, label]) => (
                  <Chip key={id} on={animOf(settings) === id} onClick={() => patch({ captionAnim: id })}>{label}</Chip>
                ))}
              </Row>
              <Row label="Font">
                {(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((id) => (
                  <Chip key={id} on={(settings.font ?? (STYLES[settings.style].font === FONTS[id].css ? id : "")) === id} onClick={() => patch({ font: id })}>
                    <span style={{ fontFamily: FONTS[id].css.replace(/^\d+ \{px\}px /, "") }}>{FONTS[id].label}</span>
                  </Chip>
                ))}
              </Row>
              <Row label="Colours">
                <input type="color" aria-label="Caption colour" value={settings.baseColor} onChange={(e) => patch({ baseColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-12" />
                {(STYLES[settings.style].mode === "words" || (leo && settings.keyWordsOn)) && <input type="color" aria-label="Spoken word colour" value={settings.activeColor} onChange={(e) => patch({ activeColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-12" />}
              </Row>
              {leo && (
                <>
                  <Row label="Light up key words">
                    {keyBusy ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite"><ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Picking key words...</span>
                    ) : <Left n={left("caption-keywords")} what="Key words" feature="caption-keywords" />}
                    <Toggle label="Light up key words" on={!!settings.keyWordsOn} disabled={keyBusy || !words.length || (!settings.keyWordsOn && settings.keyWords === undefined && none("caption-keywords"))}
                      set={(v) => { setKeyError(""); patch({ keyWordsOn: v }); }} />
                  </Row>
                  {keyError && <p className="text-right text-xs text-destructive" role="alert">{keyError}</p>}
                  {settings.keyWordsOn && settings.keyWords && !keyBusy && (
                    <p className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground" role="status">
                      {(({ n, m }) => `${n} of ${m} lines have a key word.`)(keyCount(capLines, settings.keyWords))}
                      {keysStale(capLines, settings.keyWords) && (
                        <Button size="sm" variant="outline" className="h-8 text-xs [@media(pointer:coarse)]:min-h-11" disabled={none("caption-keywords")} onClick={() => void pickKeys()}>Pick again</Button>
                      )}
                    </p>
                  )}
                  {settings.keyWordsOn && (emojiRule === "none"
                    ? <p className="text-right text-xs text-muted-foreground">Your brand kit says no emoji.</p>
                    : <Row label="Emoji on key words"><Toggle label="Emoji on key words" on={!!settings.captionEmoji} set={(v) => patch({ captionEmoji: v })} /></Row>)}
                </>
              )}
              <Row label="Second language">
                {([["", "Off"], ["zh", "\u4e2d\u6587"], ["ms", "Melayu"], ["ta", "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"]] as const).map(([id, label]) => {
                  const off = noTranslate && !!id && !subsReady(id);
                  return (
                    <Chip key={id || "off"} on={(settings.subLang ?? "") === id} onClick={() => void pickSubLang(id)} disabled={off} className={off ? "opacity-60" : ""}>
                      {translating === id ? "Translating..." : label}
                    </Chip>
                  );
                })}
                <Left n={left("video-translate")} feature="video-translate" quiet busy={!!translating} />
              </Row>
              {noTranslate && <p className="text-right text-xs text-destructive">{reasonText({ left: 0, leo })}</p>}
              <Row label="ALL CAPS"><Toggle on={settings.uppercase} set={(v) => patch({ uppercase: v })} /></Row>
              <Row label="Numbers in the highlight colour"><Toggle on={settings.highlightNumbers} set={(v) => patch({ highlightNumbers: v })} /></Row>
              {leo && (
                // pb-12: the button scrolls clear of the floating Ask button
                <div className="flex justify-end border-t border-border/60 pb-12 pt-3">
                  <Button size="sm" variant="outline" className="[@media(pointer:coarse)]:min-h-11" onClick={captionsForNew}>Use for every new video</Button>
                </div>
              )}
            </div>
          )}

          {tab === "cuts" && (
            <div className="space-y-3">
              <Row label={`Cut um and uh${fillers ? ` (${fillers} found)` : ""}`}><Toggle on={settings.removeFillers} set={(v) => patch({ removeFillers: v })} /></Row>
              <Row label={`Cut retakes${retakes ? ` (${retakes} found)` : ""}`}>
                <InfoTip label="About retakes">A line said again within 20 s keeps only the last take.</InfoTip>
                <Toggle on={!!settings.removeRetakes} set={(v) => patch({ removeRetakes: v })} />
              </Row>
              <Row label={settings.maxPause ? `Shorten pauses over ${settings.maxPause.toFixed(1)}s` : "Keep every pause"}>
                <input type="range" min={0} max={2} step={0.1} value={settings.maxPause} onChange={(e) => patch({ maxPause: Number(e.target.value) })} className="w-40 accent-primary" />
              </Row>
              {settings.maxPause > 0 && <Row label={`Speed them up ${FAST}x instead of cutting`}><Toggle on={!!settings.pauseFast} set={(v) => patch({ pauseFast: v })} /></Row>}
              <Row label={`Trim start ${settings.trimStart.toFixed(1)}s`}><input type="range" min={0} max={Math.min(30, duration / 2)} step={0.1} value={settings.trimStart} onChange={(e) => patch({ trimStart: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              <Row label={`Trim end ${settings.trimEnd.toFixed(1)}s`}><input type="range" min={0} max={Math.min(30, duration / 2)} step={0.1} value={settings.trimEnd} onChange={(e) => patch({ trimEnd: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              <Row label="Punch in on cuts"><Toggle on={settings.punchIn} set={(v) => patch({ punchIn: v })} /></Row>
              <Row label={`Original sound ${Math.round(volume * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume of the filmed sound"
                  onChange={(e) => patch({ volume: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} className="w-40 accent-primary" />
              </Row>
              <Row label="Speed">
                {SPEEDS.map((x) => <Chip key={x} on={speed === x} onClick={() => patch({ speed: x === 1 ? undefined : x })}>{x}x</Chip>)}
              </Row>
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm font-medium">Voiceover
                    <InfoTip label="About voiceover">The edit plays muted from the playhead while you talk over it.</InfoTip></span>
                  {recording ? (
                    <Button size="sm" variant="destructive" className="h-9 gap-1.5" onClick={stopVoice}>
                      <Square className="h-3.5 w-3.5" /> Stop {fmtTime(recSeconds).replace(/\.\d$/, "")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={startVoice} disabled={!file || playing}>
                      <Mic className="h-3.5 w-3.5" /> {settings.voiceover ? "Record again" : "Record from the mic"}
                    </Button>
                  )}
                  {!recording && (
                    <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={openTts} disabled={!file || playing} aria-expanded={ttsOpen}>
                      <Sparkles className="h-3.5 w-3.5" /> Voiceover from text
                    </Button>
                  )}
                  {!recording && (
                    <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setDubOpen((o) => !o)} disabled={!file || playing || !words.length} aria-expanded={dubOpen}>
                      <Languages className="h-3.5 w-3.5" /> Dub it
                    </Button>
                  )}
                </div>
                {dubOpen && !recording && (
                  <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dub into">
                      {(Object.keys(DUB_LANGS) as DubLang[]).map((l) => <Chip key={l} on={dubLang === l} onClick={() => setDubLang(l)}>{DUB_LANGS[l]}</Chip>)}
                    </div>
                    <VoicePicker voice={ttsVoice} how={ttsHow} onVoice={setTtsVoice} onHow={setTtsHow} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" className={`h-9 gap-1.5 ${dubBusy ? "disabled:opacity-100" : ""}`} onClick={() => void makeDub()} disabled={!!dubBusy || none("ai-voice") || none("video-translate")}>
                        {dubBusy ? <ThinkingOrb state="working" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />}
                        {dubBusy || `Dub into ${DUB_LANGS[dubLang]}`}
                      </Button>
                      {/* the translation and the new voice: two caps, so the smaller of the two is what's left */}
                      <Left n={left("ai-voice")} price={sumPrices(priceOf("ai-voice"), priceOf("video-translate"))} least={smaller(left("ai-voice"), left("video-translate"))} busy={!!dubBusy} />
                    </div>
                  </div>
                )}
                {ttsOpen && !recording && (
                  <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-2.5">
                    <Textarea rows={4} value={ttsText} maxLength={MAX_SCRIPT} onChange={(e) => setTtsText(e.target.value)} aria-label="Voiceover script"
                      placeholder="What the voice says" className="text-sm" />
                    <VoicePicker voice={ttsVoice} how={ttsHow} onVoice={setTtsVoice} onHow={setTtsHow} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" className={`h-9 gap-1.5 ${ttsBusy ? "disabled:opacity-100" : ""}`} onClick={() => void makeTts()} disabled={ttsBusy || ttsText.trim().length < 5 || none("ai-voice")}>
                        {ttsBusy ? <ThinkingOrb state="working" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />}
                        {ttsBusy ? "Making the voiceover..." : `Make it from ${fmtTime(Math.min(outT, Math.max(0, plan.total - 0.5)))}`}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{ttsText.length.toLocaleString("en-US")} / {MAX_SCRIPT.toLocaleString("en-US")}</span>
                      <Left n={left("ai-voice")} feature="ai-voice" busy={ttsBusy} />
                    </div>
                  </div>
                )}
                {settings.voiceover && !recording && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(settings.voiceover.length)} from {fmtTime(settings.voiceover.start)}
                      {voiceBlob === null ? ". The recording is on the device you made it on." : ""}
                    </p>
                    <Row label={`Voiceover ${Math.round((settings.voiceover.gain ?? 1) * 100)}%`}>
                      <input type="range" min={0} max={1.5} step={0.05} value={settings.voiceover.gain ?? 1} aria-label="Voiceover volume"
                        onChange={(e) => patch({ voiceover: { ...settings.voiceover!, gain: Number(e.target.value) } })} className="w-32 accent-primary" />
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={removeVoice}>Remove</Button>
                    </Row>
                  </>
                )}
              </div>
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm font-medium">Background music
                    <InfoTip label="About background music">{aiMusicOn() ? "Yours or one made for you, looped." : "Your own track, looped."} It drops while you talk.</InfoTip></span>
                  {aiMusicOn() && (
                    <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={openAiMusic} aria-expanded={aiMusicOpen || musicMaking}>
                      <Sparkles className="h-3.5 w-3.5" /> Music for me
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={() => musicInput.current?.click()} disabled={musicBusy}>
                    <MusicIcon className="h-3.5 w-3.5" /> {musicBusy ? "Reading..." : settings.music ? "Change track" : "Add a track"}
                  </Button>
                  <input ref={musicInput} type="file" accept="audio/*" className="sr-only" tabIndex={-1} aria-hidden
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addMusic(f); }} />
                </div>
                {(aiMusicOpen || musicMaking) && (
                  <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mood">
                      {MOOD_IDS.map((m) => <Chip key={m} on={mood === m} onClick={() => setMood(m)}>{MOODS[m].label}</Chip>)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" className={`h-11 gap-1.5 sm:h-9 ${musicMaking ? "disabled:opacity-100" : ""}`} onClick={makeMusic} disabled={musicMaking || !mood || none("ai-music")}>
                        {musicMaking || !mood ? <ThinkingOrb state="working" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />}
                        {musicMaking ? "Making the track..." : !mood ? "Picking a mood..." : `Make a ${Math.floor(trackSecs / 60)}:${String(trackSecs % 60).padStart(2, "0")} track`}
                      </Button>
                      <Left n={left("ai-music")} feature="ai-music" opts={{ minutes: trackSecs / 60 }} busy={musicMaking} />
                    </div>
                  </div>
                )}
                {settings.music && (
                  <>
                    <p className="truncate text-xs text-muted-foreground">
                      {settings.music.name}{musicBlob === null ? ". The track is on the device you added it on." : ""}
                    </p>
                    <Row label={`Music ${Math.round(settings.music.level * 100)}%`}>
                      <input type="range" min={0} max={1} step={0.05} value={settings.music.level} aria-label="Music volume"
                        onChange={(e) => patch({ music: { ...settings.music!, level: Number(e.target.value) } })} className="h-11 w-32 accent-primary sm:h-auto" />
                      <Button size="sm" variant="ghost" className="h-11 text-xs text-muted-foreground sm:h-8" onClick={() => patch({ music: undefined })}>Remove</Button>
                    </Row>
                  </>
                )}
              </div>
              <Row label="Voice polish">
                <InfoTip label="About voice polish">Cuts rumble and hum, lifts clarity and evens out loud and quiet bits.</InfoTip>
                <Toggle on={!!settings.voicePolish} set={(v) => patch({ voicePolish: v })} />
              </Row>
              <Row label="Remove background noise">
                <InfoTip label="About noise removal">Takes out aircon hum, traffic and fans, on this device.</InfoTip>
                <Toggle on={denoise} set={(v) => patch({ denoise: v })} />
              </Row>
              {denoise && denoiseState && (
                <p className={`text-xs ${denoiseState === "failed" ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
                  {denoiseState === "loading" ? "Loading noise removal..." : "Noise removal didn't load, so the sound plays as filmed. Switch it off and on to try again."}
                </p>
              )}
              <Row label="Even out loudness">
                <InfoTip label="About loudness">Instagram and TikTok play videos at about -14 LUFS.</InfoTip>
                <Toggle on={!!settings.loudness} set={(v) => patch({ loudness: v })} />
              </Row>
              {settings.loudness && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {measuring === "busy" ? "Measuring the sound..." : measuring === "none" ? "Couldn't measure the sound in this video." : level ? `${Math.round(level.before)} LUFS -> ${Math.round(level.after)} LUFS, peak ${level.peak.toFixed(1)} dB` : ""}
                </p>
              )}
              {cuts.length > 0 && (
                <details className="rounded-lg border border-border/60">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                    Review {cuts.length} {cuts.length === 1 ? "cut" : "cuts"}{keptCuts.size ? ` (${cuts.filter((c) => keptCuts.has(c.id)).length} kept)` : ""}
                  </summary>
                  <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto border-t border-border/60">
                    {cuts.map((c) => {
                      const kept = keptCuts.has(c.id);
                      return (
                        <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                          <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">{fmtTime(c.start)}</span>
                          <span className={`min-w-0 flex-1 ${c.kind === "retake" ? "line-clamp-2 break-words" : "truncate"} ${kept ? "text-muted-foreground" : ""}`}>
                            {c.kind === "retake" ? <>Said again at {fmtTime(c.again ?? 0)}: <mark className="rounded bg-warning/30 px-1 text-foreground">{c.word}</mark></>
                              : <>{c.before} <mark className="rounded bg-warning/30 px-1 text-foreground">{c.kind === "filler" ? c.word : `${(c.end - c.start).toFixed(1)}s pause`}</mark> {c.after}</>}
                          </span>
                          <Button size="sm" variant="ghost" className="h-11 w-11 shrink-0 p-0 sm:h-8 sm:w-8" aria-label={`Listen to ${c.kind === "filler" ? c.word : c.kind === "retake" ? "the first take" : "the pause"} at ${fmtTime(c.start)}`} onClick={() => listen(c.start, c.end)}>
                            <Volume2 className="h-3.5 w-3.5" />
                          </Button>
                          <Chip on={!kept} onClick={() => toggleCut(c.id)} className="min-h-11 sm:min-h-0 [@media(pointer:coarse)]:min-h-11">{kept ? "Kept" : c.kind === "pause" && settings.pauseFast ? `${FAST}x` : "Cut"}</Chip>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
              {!words.length && !isLong(duration, project.size) && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void recaption()} disabled={captioning || none("video-transcribe")} className="gap-1.5">
                    {captioning ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : null} {captioning ? "Captioning..." : "Caption it"}
                  </Button>
                  <Left n={left("video-transcribe")} feature="video-transcribe" opts={{ minutes: duration / 60 }} busy={captioning} />
                  {!captioning && <SubtitleImport userId={userId} duration={duration} onWords={setWords} />}
                </div>
              )}
            </div>
          )}

          {tab === "frame" && (
            <div className="space-y-3">
              <label className="block space-y-1 text-xs font-semibold">
                Hook on screen
                <input value={settings.hook} maxLength={90} onChange={(e) => patch({ hook: e.target.value })} placeholder="3 CPF mistakes I see every week"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal [@media(pointer:coarse)]:h-11" />
              </label>
              <HookOptions userId={userId} projectId={project.id} words={words} segs={plan.segs} total={plan.total} speed={speed} hook={settings.hook}
                onUse={(hook) => { const cur = settingsRef.current; if (cur.hook === hook) return; setHistory((h) => [...h.slice(-19), cur]); setSettings({ ...cur, hook }); }} />
              <ColdOpenControl settings={settings} words={words} duration={duration} segs={plan.segs} speed={speed} seek={seekOut}
                apply={(p) => { const cur = settingsRef.current; setHistory((h) => [...h.slice(-19), cur]); setSettings({ ...cur, ...p }); }} />
              <Row label={`Hook shows for ${settings.hookSeconds}s`}><input type="range" min={1} max={10} step={0.5} value={settings.hookSeconds} onChange={(e) => patch({ hookSeconds: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1 text-xs font-semibold">
                  Name tag
                  <input value={settings.nameTag ?? ""} maxLength={40} onChange={(e) => patch({ nameTag: e.target.value })} placeholder="Your name"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal [@media(pointer:coarse)]:h-11" />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Role
                  <input value={settings.roleTag ?? ""} maxLength={50} onChange={(e) => patch({ roleTag: e.target.value })} placeholder="Financial adviser"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal [@media(pointer:coarse)]:h-11" />
                </label>
              </div>
              {!settings.nameTag?.trim() && brandKit?.name?.trim() && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => patch({ nameTag: brandKit.name.trim().slice(0, 40), roleTag: (brandKit.role ?? "").trim().slice(0, 50) })}>
                  Use {brandKit.name.trim()}{brandKit.role?.trim() ? `, ${brandKit.role.trim()}` : ""}
                </Button>
              )}
              {art ? (
                <>
                  <Row label="Logo in the corner">
                    {art.logo ? <Toggle on={!!settings.logo} set={(v) => patch({ logo: v })} /> : <Link to={links.brand({ section: "logo" })} className="text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">Add a logo</Link>}
                  </Row>
                  {art.intro && (
                    <Row label={`Intro card (${INTRO_CARD_SECONDS}s)`}><Toggle on={!!settings.introCard} set={(v) => { introAt.current = v ? 0.6 : null; endAt.current = null; patch({ introCard: v }); }} /></Row>
                  )}
                  <Row label={`End card (${END_CARD_SECONDS}s)`}><Toggle on={!!settings.endCard} set={(v) => { endAt.current = v ? 0.6 : null; introAt.current = null; patch({ endCard: v }); }} /></Row>
                </>
              ) : (
                <p className="text-xs"><Link to="/brand" className="font-semibold text-primary hover:underline">Set up your brand kit</Link> for a logo and an end card.</p>
              )}
              <Row label="Shape">
                {(["9:16", "4:5", "1:1", "16:9", "original"] as const).map((a) => <Chip key={a} on={settings.aspect === a} onClick={() => patch({ aspect: a })}>{a === "original" ? "Original" : a}</Chip>)}
              </Row>
              <Row label="Fit">
                {/* five choices: they wrap onto a second line on a phone instead of squeezing their words */}
                <span className="flex flex-wrap justify-end gap-1.5 [&>button]:min-h-11 [&>button]:whitespace-nowrap sm:[&>button]:min-h-0 [@media(pointer:coarse)]:[&>button]:min-h-11">
                <Chip on={(settings.fit ?? "fill") === "fill"} onClick={() => patch({ fit: "fill" })}>Crop to fill</Chip>
                <Chip on={settings.fit === "blur"} onClick={() => patch({ fit: "blur" })}>Whole video, blurred behind</Chip>
                <Chip on={settings.fit === "framed"} onClick={() => patch({ fit: "framed", ...(settings.captionY === undefined ? { captionY: 0.68 } : {}) })}>Framed window</Chip>
                {canStack && (
                  <>
                    <Chip on={settings.fit === "stacked"} onClick={() => finding === null && settings.fit !== "stacked" && void setStacked()}>Two speakers stacked</Chip>
                    <Chip on={settings.fit === "slides"} onClick={() => finding === null && settings.fit !== "slides" && void setSlides()}>Slides and me</Chip>
                    {finding !== null && <span className="self-center text-xs text-muted-foreground" aria-live="polite">Finding faces {Math.round(finding * 100)}%</span>}
                  </>
                )}
                </span>
              </Row>
              {["fill", "stacked"].includes(settings.fit ?? "fill") && (
                <Row label="Framing">
                  {settings.followFace ? (
                    <>
                      <span className="text-xs text-muted-foreground">Follows your face</span>
                      <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => patch({ followFace: false })}>Set by hand</Button>
                    </>
                  ) : (
                    <input type="range" min={0} max={1} step={0.01} value={settings.focusX} onChange={(e) => patch({ focusX: Number(e.target.value) })} aria-label="Move the crop left or right" className="w-40 accent-primary" />
                  )}
                </Row>
              )}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Export for</p>
                <div className="flex flex-wrap gap-1.5 [&>button]:min-h-11 sm:[&>button]:min-h-0 [@media(pointer:coarse)]:[&>button]:min-h-11">
                  {(Object.keys(EXPORT_TARGETS) as ExportTarget[]).map((id) => (
                    <Chip key={id} on={settings.exportAs !== "audio" && targetOf(settings) === id}
                      onClick={() => patch({ exportAs: id === "whatsapp" ? "small" : undefined, exportFor: id === "reels" || id === "whatsapp" ? undefined : id })}>
                      {EXPORT_TARGETS[id].label}
                    </Chip>
                  ))}
                  <Chip on={settings.exportAs === "audio"} onClick={() => patch({ exportAs: "audio" })}>Sound only</Chip>
                </div>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {settings.exportAs === "audio"
                    ? `About ${fmtBytes(size.bytes)}`
                    : `About ${fmtBytes(size.bytes)} at ${size.w} x ${size.h}${size.capBytes && size.fits ? `, under the ${fmtBytes(size.capBytes)} ${size.label} takes` : ""}`}
                </p>
                {!size.fits && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="status">
                    Too long for {size.label}&apos;s {fmtBytes(size.capBytes)} at a clear picture.
                    <Button size="sm" variant="outline" className="h-11 text-xs text-foreground sm:h-7"
                      onClick={() => patch({ trimEnd: trimToLength(plan.segs, duration, size.maxSeconds - (total - plan.total), settings) })}>
                      Trim to {fmtTime(size.maxSeconds - (total - plan.total)).replace(/\.0$/, "")}
                    </Button>
                  </p>
                )}
              </div>
              <Row label="Progress bar"><Toggle on={settings.progressBar} set={(v) => patch({ progressBar: v })} /></Row>
              <Row label="Colour grade"><Toggle on={settings.grade} set={(v) => patch({ grade: v })} /></Row>
              {settings.grade && (
                <Row label="Look">
                  <Chip on={!settings.filter} onClick={() => patch({ filter: undefined })}>Style&apos;s own</Chip>
                  {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((id) => (
                    <Chip key={id} on={settings.filter === id} onClick={() => patch({ filter: id })}>{FILTERS[id].label}</Chip>
                  ))}
                </Row>
              )}
              <Row label="Between cuts">
                <Chip on={!settings.transition} onClick={() => patch({ transition: undefined })}>Hard cut</Chip>
                <Chip on={settings.transition === "soft"} onClick={() => patch({ transition: "soft" })}>Soft dip</Chip>
                <Chip on={settings.transition === "flash"} onClick={() => patch({ transition: "flash" })}>Flash</Chip>
              </Row>
              <MotionControls settings={settings} words={words} segs={plan.segs} caps={plan.caps} total={plan.total} speed={speed} file={file}
                apply={(p) => { const cur = settingsRef.current; setHistory((h) => [...h.slice(-19), cur]); setSettings({ ...cur, ...p }); }}
                note={(p) => setSettings((cur) => ({ ...cur, ...p }))} />
            </div>
          )}

          {tab === "face" && (
            <div className="space-y-3">
              <div className="space-y-1.5 [@media(pointer:coarse)]:space-y-2.5">
                <p className="flex items-center text-sm font-medium">Behind you
                  <InfoTip label="About behind you">Found on this device, frame by frame. Best with one person.</InfoTip></p>
                <div className="flex flex-wrap gap-1.5 [&>button]:min-h-11 sm:[&>button]:min-h-0 [@media(pointer:coarse)]:[&>button]:min-h-11" role="group" aria-label="Behind you">
                  <Chip on={!settings.backdrop} onClick={() => patch({ backdrop: undefined })}>As filmed</Chip>
                  <Chip on={settings.backdrop?.kind === "blur"} onClick={() => patch({ backdrop: { kind: "blur", amount: 0.6 } })}>Blur</Chip>
                  <Chip on={settings.backdrop?.kind === "colour"} onClick={() => patch({ backdrop: { kind: "colour", color: (art?.color ?? "#111827").toUpperCase() } })}>Colour</Chip>
                  <Chip on={settings.backdrop?.kind === "picture"} onClick={() => pictureInput.current?.click()}>Picture</Chip>
                  {/* a video behind you and where you stand are north-star work for Leo's sign-ins (formats-green-screen) */}
                  {leo && <Chip on={settings.backdrop?.kind === "video"} onClick={() => backdropVideoInput.current?.click()}>Video</Chip>}
                </div>
                <input ref={pictureInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPicture(f); }} />
                <input ref={backdropVideoInput} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPicture(f, "video"); }} />
              </div>
              {settings.backdrop?.kind === "blur" && (
                <Row label={`Blur ${Math.round(settings.backdrop.amount * 100)}%`}>
                  <input type="range" min={0} max={1} step={0.05} value={settings.backdrop.amount} aria-label="How much to blur behind you"
                    onChange={(e) => patch({ backdrop: { kind: "blur", amount: Number(e.target.value) } })} className="h-11 w-40 accent-primary sm:h-auto" />
                </Row>
              )}
              {settings.backdrop?.kind === "colour" && (
                <Row label="Colour">
                  <input type="color" aria-label="Colour behind you" value={settings.backdrop.color}
                    onChange={(e) => patch({ backdrop: { kind: "colour", color: e.target.value.toUpperCase() } })} className="h-11 w-14 rounded sm:h-8 [@media(pointer:coarse)]:h-11 sm:w-10 [@media(pointer:coarse)]:w-14" />
                </Row>
              )}
              {settings.backdrop?.kind === "picture" && (
                <div className="flex flex-wrap items-center gap-2">
                  {backdropImg === null && <span className="text-xs text-muted-foreground">The picture is on the device you added it on.</span>}
                  <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={() => pictureInput.current?.click()}>
                    <ImageIcon className="h-3.5 w-3.5" /> Change picture
                  </Button>
                </div>
              )}
              {settings.backdrop?.kind === "video" && (
                <div className="flex flex-wrap items-center gap-2">
                  {backdropVideo === null && <span className="text-xs text-muted-foreground">The video is on the device you added it on.</span>}
                  <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={() => backdropVideoInput.current?.click()}>
                    <Film className="h-3.5 w-3.5" /> Change video
                  </Button>
                </div>
              )}
              {leo && settings.backdrop && settings.backdrop.kind !== "blur" && (
                <Row label="Where you stand">
                  <Chip on={!standOf(settings)} onClick={() => patch({ stand: undefined })}>Full</Chip>
                  <Chip on={settings.stand === "bottom"} onClick={() => patch({ stand: "bottom" })}>Bottom</Chip>
                  <Chip on={settings.stand === "corner"} onClick={() => patch({ stand: "corner" })}>Corner</Chip>
                </Row>
              )}
              <Row label={settings.touchUp ? `Touch-up ${Math.round(settings.touchUp * 100)}%` : "Touch-up off"}>
                <InfoTip label="About touch-up">Smooths skin a little and brightens eyes. Face shape never changes.</InfoTip>
                <input type="range" min={0} max={1} step={0.05} value={settings.touchUp ?? 0} aria-label="Touch-up strength"
                  onChange={(e) => patch({ touchUp: Number(e.target.value) || undefined })} className="h-11 w-40 accent-primary sm:h-auto" />
              </Row>
              {fxState === "loading" && <p className="text-xs text-muted-foreground" aria-live="polite">Loading the effect (the first time takes a few seconds)...</p>}
              {fxState === "failed" && (
                <p className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="status">
                  Couldn&apos;t load the effect. Check the connection.
                  <Button size="sm" variant="outline" className="h-11 text-xs text-foreground sm:h-7" onClick={() => void loadFx()}>Try again</Button>
                </p>
              )}
            </div>
          )}

          {tab === "stickers" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {([["text", "Text"], ["arrow", "Arrow"], ["circle", "Circle"], ["underline", "Underline"]] as const).map(([k, label]) => (
                  <Button key={k} size="sm" variant="outline" className="h-9" onClick={() => addOverlay(k)}>Add {label.toLowerCase()}</Button>
                ))}
                <InfoTip label="About stickers">Added at the playhead for 3 seconds. Drag one on the preview to move it.</InfoTip>
              </div>
              <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm font-medium">Callouts and cutaways
                    <InfoTip label="About callouts">Read from what you say. Add the ones you want.</InfoTip></span>
                  <span className={leo ? "flex flex-wrap items-center justify-end gap-2 text-right" : "flex items-center gap-2"}>
                    <Left n={left("video-cutaways")} feature="video-cutaways" busy={suggesting} />
                    <Button size="sm" variant="outline" className={`h-11 gap-1.5 sm:h-9 ${suggesting ? "disabled:opacity-100" : ""}`} onClick={suggest} disabled={suggesting || !words.length || none("video-cutaways")}>
                      {suggesting ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" />}
                      {suggesting ? "Reading..." : cutaways.length ? "Suggest again" : "Suggest from what I say"}
                    </Button>
                  </span>
                </div>
                {cutaways.length > 0 && (
                  <ul className="divide-y divide-border/60" aria-label="Suggested callouts">
                    {cutaways.map((c) => {
                      const added = !!calloutOf(c);
                      return (
                        <li key={`${c.at}-${c.callout}`} className="flex items-center gap-2 py-2 text-xs">
                          <button type="button" onClick={() => seekOut(c.at)} aria-label={`Go to ${fmtTime(c.at)}`}
                            className="min-h-11 w-12 shrink-0 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground sm:min-h-0 [@media(pointer:coarse)]:min-h-11">{fmtTime(c.at)}</button>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{c.callout}</span>
                            {c.show && <span className="block text-muted-foreground">Show: {c.show}</span>}
                          </span>
                          <Button size="sm" variant={added ? "ghost" : "outline"} className="h-11 shrink-0 gap-1 text-xs sm:h-8" disabled={added} onClick={() => addCallout(c)}>
                            {added ? <><Check className="h-3.5 w-3.5" /> Added</> : "Add"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {overlays.length > 0 && (
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {overlays.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => { setSelected(o.id); seekOut(o.from + 0.2); }} aria-pressed={o.id === selected}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${o.id === selected ? "bg-primary/5" : ""}`}>
                        <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: o.color }} />
                        <span className="min-w-0 flex-1 truncate font-medium">{o.text.trim().split("\n")[0].slice(0, 40) || OVERLAY_LABELS[o.kind]}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(o.from)}-{fmtTime(o.to)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sel && stickerEditor(sel)}
              <ChartCards settings={settings} caps={plan.caps} segs={plan.segs} speed={speed} total={plan.total} outT={outT} file={file} seekOut={seekOut}
                apply={(p) => { const cur = settingsRef.current; setHistory((h) => [...h.slice(-19), cur]); setSettings({ ...cur, ...p }); }}
                note={(p) => setSettings((cur) => ({ ...cur, ...p }))} />
            </div>
          )}

          {tab === "broll" && (
            <div className="space-y-3">
              {brollSearch ? (
                <StockSearch kind="video" orientation={settings.aspect === "16:9" ? "landscape" : settings.aspect === "1:1" ? "square" : "portrait"}
                  placeholder="Singapore skyline, family at home, hospital" onPick={addBroll} onClose={() => setBrollSearch(false)} />
              ) : (
                <>
                <AutoBroll userId={userId} projectId={project.id} settings={settings} words={words} segs={plan.segs} total={plan.total} speed={speed} seek={seekOut}
                  apply={(p) => { const cur = settingsRef.current; setHistory((h) => [...h.slice(-19), cur]); setSettings({ ...cur, ...p }); }} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setBrollSearch(true)} disabled={brolls.length >= MAX_BROLL}>
                    <Film className="h-3.5 w-3.5" /> Add B-roll at {fmtTime(Math.min(outT, plan.total))}
                  </Button>
                  <InfoTip label="About B-roll">A free stock clip over your video from the playhead. Your voice carries on under it.</InfoTip>
                </div>
                </>
              )}
              {brolls.length > 0 && <BrollLayout value={settings.brollLayout} onChange={(v) => patch({ brollLayout: v })} />}
              {brolls.length > 0 && (
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {brolls.map((b) => (
                    <li key={b.id}>
                      <button type="button" onClick={() => { setSelBroll(b.id); seekOut(b.from + 0.05); }} aria-pressed={b.id === selBroll}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${b.id === selBroll ? "bg-primary/5" : ""}`}>
                        <span className="h-10 w-8 shrink-0 overflow-hidden rounded bg-muted">{b.thumb && <img src={b.thumb} alt="" className="h-full w-full object-cover" />}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{b.by ? `Clip by ${b.by}` : "Clip"}{brollUrls[b.key] === "" ? " (on another device)" : ""}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(b.from)}-{fmtTime(b.to)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selB && (
                <div className="space-y-3 rounded-lg border border-primary/25 p-3">
                  <Row label={`Shows for ${(selB.to - selB.from).toFixed(1)}s from ${fmtTime(selB.from)}`}>
                    <input type="range" min={0.5} max={10} step={0.5} value={selB.to - selB.from} aria-label="How long the B-roll shows"
                      onChange={(e) => editBroll(selB.id, { to: selB.from + Number(e.target.value) })} className="w-32 accent-primary" />
                  </Row>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { const from = Math.floor(Math.min(outT, plan.total) * 10) / 10; editBroll(selB.id, { from, to: from + (selB.to - selB.from) }); }}>Start at {fmtTime(Math.min(outT, plan.total))}</Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => { change({ ...settings, broll: brolls.filter((b) => b.id !== selB.id) }); setSelBroll(null); }}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                  {selB.by && (
                    <p className="text-[11px] text-muted-foreground">
                      Video by {selB.byUrl ? <a href={selB.byUrl} target="_blank" rel="noreferrer" className="hover:underline">{selB.by}</a> : selB.by} on{" "}
                      {selB.url ? <a href={selB.url} target="_blank" rel="noreferrer" className="hover:underline">Pexels</a> : "Pexels"}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "words" && (
            <div className="space-y-2">
              {!words.length ? (
                isLong(duration, project.size) ? null : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void recaption()} disabled={captioning || none("video-transcribe")}>{captioning ? "Captioning..." : "Caption it"}</Button>
                  <Left n={left("video-transcribe")} feature="video-transcribe" opts={{ minutes: duration / 60 }} busy={captioning} />
                  {!captioning && <SubtitleImport userId={userId} duration={duration} onWords={setWords} />}
                </div>
                )
              ) : (
                <>
                <div className="flex items-center gap-1.5">
                  <label className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input value={find} onChange={(e) => { setFind(e.target.value); setHit(0); }} placeholder="Find a word or phrase" aria-label="Find in what you said"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); jumpTo(hit + (e.shiftKey ? -1 : 1)); } }}
                      className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm [@media(pointer:coarse)]:h-11" />
                  </label>
                  {find.trim() && <span className="w-14 text-center text-[11px] text-muted-foreground" aria-live="polite">{hits.length ? `${hit + 1} of ${hits.length}` : "None"}</span>}
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" aria-label="Previous match" disabled={!hits.length} onClick={() => jumpTo(hit - 1)}><ChevronUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" aria-label="Next match" disabled={!hits.length} onClick={() => jumpTo(hit + 1)}><ChevronDown className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" role="group" aria-label="What a tap on a word does">
                    {([["fix", "Fix spelling"], ["cut", "Cut words"], ...(leo && settings.keyWordsOn ? [["key", "Key words"] as const] : [])] as const).map(([m, label]) => (
                      <button key={m} type="button" aria-pressed={wordMode === m} onClick={() => { setWordMode(m); setCutStart(null); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold [@media(pointer:coarse)]:min-h-11 ${wordMode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{label}</button>
                    ))}
                  </div>
                  {wordMode === "cut" && (
                    <span className="text-[11px] text-muted-foreground" aria-live="polite">
                      {cutStart === null ? "Tap the first word to cut, then the last. Tap a cut word to bring it back." : "Now tap the last word."}
                    </span>
                  )}
                  {wordMode === "key" && <span className="text-[11px] text-muted-foreground">Tap a word to light it in its line. Tap a lit word to turn it off.</span>}
                  {cutWordCount > 0 && <span className="ml-auto text-[11px] font-medium">{cutWordCount} {cutWordCount === 1 ? "word" : "words"} cut</span>}
                </div>
                <p className="max-h-80 overflow-y-auto rounded-lg border border-border/60 p-3 text-sm leading-7">
                  {words.map((w, i) => (
                    <span
                      key={i}
                      id={`word-${i}`}
                      contentEditable={wordMode === "fix"}
                      role={wordMode === "cut" || wordMode === "key" ? "button" : undefined}
                      tabIndex={wordMode === "cut" || wordMode === "key" ? 0 : undefined}
                      aria-pressed={wordMode === "key" ? !!keyWordOf(settings, w) : undefined}
                      onClick={wordMode === "cut" ? () => tapWord(i) : wordMode === "key" ? () => tapKey(w) : undefined}
                      onKeyDown={wordMode === "cut" || wordMode === "key" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (wordMode === "key") tapKey(w); else tapWord(i); } } : undefined}
                      suppressContentEditableWarning
                      onFocus={() => { const v = video.current; if (v) { v.currentTime = w.s; segIdx.current = 0; } }}
                      onBlur={(e) => {
                        const t = e.currentTarget.textContent?.trim() ?? "";
                        if (!t || t === w.w) return;
                        setWords((ws) => ws.map((x, j) => (j === i ? { ...x, w: t } : x)));
                        const fix = fixFromEdit(w.w, t);
                        if (fix && !fixes.some((f) => f.from.toLowerCase() === fix.from.toLowerCase() && f.to === fix.to)) setOffer(fix);
                      }}
                      className={`rounded px-0.5 outline-none focus:bg-primary/10 ${wordMode === "cut" || wordMode === "key" ? "cursor-pointer" : ""} ${leo && keyWordOf(settings, w) ? "font-semibold text-primary underline decoration-2 underline-offset-4" : ""} ${removedAt(settings.removed, w) ? "bg-destructive/10 text-muted-foreground line-through" : ""} ${cutStart === i ? "ring-2 ring-primary" : ""} ${settings.removeFillers && isFiller(w.w) ? "text-muted-foreground line-through" : ""} ${hitSet.has(i) ? (hits[hit] !== undefined && i >= hits[hit] && i < hits[hit] + (find.trim().split(/\s+/).length) ? "bg-warning/50" : "bg-warning/20") : ""}`}
                    >{w.w}</span>
                  )).reduce<React.ReactNode[]>((a, el, i) => (i ? [...a, " ", el] : [el]), [])}
                </p>
                {offer && (
                  <p className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs" role="status">
                    <span className="mr-auto">Fix &ldquo;{offer.from}&rdquo; to &ldquo;{offer.to}&rdquo; in every video?</span>
                    <span className="flex gap-1">
                      <Button size="sm" className="h-8 text-xs" onClick={() => remember(offer)}>Always fix</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOffer(null)}>Just this once</Button>
                    </span>
                  </p>
                )}
                </>
              )}
              <details className="rounded-lg border border-border/60">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium [@media(pointer:coarse)]:py-3">Words to fix in every video ({fixes.length})</summary>
                <div className="space-y-2 border-t border-border/60 p-3">
                  {fixes.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {fixes.map((f) => (
                        <li key={f.from} className="flex items-center gap-1 rounded-full border border-border/70 py-0.5 pl-2.5 pr-1 text-xs">
                          <span className="text-muted-foreground line-through">{f.from}</span> {f.to}
                          <button type="button" aria-label={`Stop fixing ${f.from}`} onClick={() => setFixes(saveFixes(userId, fixes.filter((x) => x !== f)))}
                            className="rounded-full p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form className="flex flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const fix = fixFromEdit(heard, should); if (fix) { remember(fix); setHeard(""); setShould(""); } }}>
                    <input value={heard} maxLength={40} onChange={(e) => setHeard(e.target.value)} placeholder="Heard as: medi shield" aria-label="What the captions write"
                      className="h-9 min-w-0 flex-1 basis-32 rounded-md border border-input bg-background px-2 text-sm" />
                    <input value={should} maxLength={40} onChange={(e) => setShould(e.target.value)} placeholder="Should be: MediShield" aria-label="What it should say"
                      className="h-9 min-w-0 flex-1 basis-32 rounded-md border border-input bg-background px-2 text-sm" />
                    <Button type="submit" size="sm" variant="outline" className="h-9" disabled={!fixFromEdit(heard, should)}>Add</Button>
                  </form>
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{wordMode === "fix" ? "Click a word to fix its spelling in the captions." : ""}</p>
                {words.length > 0 && <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={downloadSrt}><Download className="h-3.5 w-3.5" /> Subtitles (.srt)</Button>}
              </div>
            </div>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}

const smaller = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.min(a, b));

/**
 * Uses left today beside an AI button; nothing until today's count has been read. Leo sees the price and what is left
 * after this run instead (PriceChip), after `what` when given and hidden while `busy`, with the reason on its own line when
 * the button can't run (`quiet` leaves it out where nothing is disabled). `least` is the smallest left when a button spends
 * from several caps.
 */
function Left({ n, what, least = n, quiet, busy, ...chip }: {
  n: number | null;
  what?: string;
  least?: number | null;
  quiet?: boolean;
  busy?: boolean;
  feature?: UsageFeature;
  opts?: PriceOpts;
  price?: Price | "pick" | null;
}) {
  const leo = useLeoOnly();
  const why = reasonText({ left: least, leo });
  const text = n ? `${n} left today` : "None left today";
  const today = n === null ? null : <span className={`text-[11px] ${n ? "text-muted-foreground" : "font-medium text-destructive"}`}>{what ? `${what}: ${text.toLowerCase()}` : text}</span>;
  return (
    <>
      {leo && busy ? null : leo && what ? <span className="text-[11px] text-muted-foreground">{what}: <PriceChip {...chip} left={least} /></span> : <PriceChip {...chip} left={least} fallback={today} />}
      {why && !quiet && <span className="order-last block basis-full text-xs text-destructive">{why}</span>}
    </>
  );
}

/** The cover last made, with the grid view: the parts the Instagram and TikTok profile grids crop off, shaded. */
function CoverShot({ shot, grid, setGrid }: { shot: { url: string; w: number; h: number }; grid: boolean; setGrid: (v: boolean) => void }) {
  const win = gridWindow(shot.w, shot.h);
  const pc = (n: number, of: number) => `${(n / of) * 100}%`;
  return (
    <div className="flex items-end gap-3">
      <div className="relative w-28 shrink-0 overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
        <img src={shot.url} alt="Your cover" className="h-full w-full object-cover" />
        {win && grid && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-black/65" style={{ height: pc(win.y0, shot.h) }} />
            <div className="absolute inset-x-0 bottom-0 bg-black/65" style={{ height: pc(shot.h - win.y1, shot.h) }} />
            <div className="absolute left-0 bg-black/65" style={{ top: pc(win.y0, shot.h), bottom: pc(shot.h - win.y1, shot.h), width: pc(win.x0, shot.w) }} />
            <div className="absolute right-0 bg-black/65" style={{ top: pc(win.y0, shot.h), bottom: pc(shot.h - win.y1, shot.h), width: pc(shot.w - win.x1, shot.w) }} />
          </div>
        )}
      </div>
      {win && (
        <div className="min-w-0 flex-1 pb-1">
          <Row label="Grid view">
            <InfoTip label="About grid view">Your profile grid shows only the unshaded part.</InfoTip>
            <Toggle on={grid} set={setGrid} />
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm [@media(pointer:coarse)]:min-h-11">
      <span className="font-medium">{label}</span>
      {/* on touch an info mark's 44px halo ends where the toggle beside it starts */}
      <span className="flex items-center gap-1.5 [@media(pointer:coarse)]:gap-2.5">{children}</span>
    </div>
  );
}

/** A caption look's tile picture: "Most people" in its style, showing what the look adds. */
function LookSample({ look }: { look: CaptionLook }) {
  const st = STYLES[look.look.style];
  const hi = STYLES.bold.active;
  const people = look.id === "boxed-word" ? <span className="rounded px-0.5 text-neutral-900" style={{ background: hi }}>people</span>
    : look.id === "key-word" ? <span className="text-[1.2em] underline decoration-2 underline-offset-2" style={{ textDecorationColor: hi }}>people</span>
    : look.id === "typewriter" ? "peo" : "PEOPLE";
  return (
    <span className="mb-1 block h-8 rounded-md bg-neutral-900 px-1.5 text-center leading-8" style={{ color: st.base, fontWeight: look.id === "boxed-word" ? 600 : st.weight }}>
      {look.id === "two-words" ? "MOST" : "Most"} {people}
    </span>
  );
}

function Chip({ on, onClick, children, className = "", disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 ${on ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"} ${className}`}>{children}</button>
  );
}

/** The AI voice for a voiceover or a dub: who speaks, the tone and the pace. */
function VoicePicker({ voice, how, onVoice, onHow }: { voice: VoiceId; how: Delivery; onVoice: (v: VoiceId) => void; onHow: (h: Delivery) => void }) {
  const row = "flex flex-wrap items-center gap-1.5";
  const tag = "w-10 shrink-0 text-[11px] text-muted-foreground";
  return (
    <>
      <div className={row} role="group" aria-label="Voice">
        <span className={tag} aria-hidden>Voice</span>
        {VOICE_IDS.map((v) => <Chip key={v} on={voice === v} onClick={() => onVoice(v)}>{VOICES[v].label}, {VOICES[v].note}</Chip>)}
      </div>
      <div className={row} role="group" aria-label="Tone">
        <span className={tag} aria-hidden>Tone</span>
        {EMOTION_IDS.map((e) => <Chip key={e} on={how.emotion === e} onClick={() => onHow({ ...how, emotion: e })}>{EMOTIONS[e].label}</Chip>)}
      </div>
      <div className={row} role="group" aria-label="Pace">
        <span className={tag} aria-hidden>Pace</span>
        {PACE_IDS.map((p) => <Chip key={p} on={how.pace === p} onClick={() => onHow({ ...how, pace: p })}>{PACES[p].label}</Chip>)}
      </div>
    </>
  );
}

function Toggle({ on, set, disabled, label }: { on: boolean; set: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} disabled={disabled}
      className={`relative h-6 w-11 rounded-full transition-colors after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] disabled:opacity-50 ${on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// ---------- Versions of a same edit (remix-format-clone, Leo only) ----------
// A project made from an edit plan (project.plan) makes versions of it, one change each: a new hook (3 written per
// press, Jev's pick marked), another offer from the brand kit, another face, or Chinese, Malay or Tamil. ?versions=1
// opens the panel (push). Each version is saved in the plan and in My posts (the plan's set) before anything is paid
// for, then made one after another outside React: on a face, only the Speak parts its change covers (aiVideo
// makeVersion, on edit-version); with no face, a new voice over the same stock cutaways; on a filmed take, the script
// to film. A paid Speak run resumes after a reload like any avatar video; versions not yet started wait for a press.

type VersionAsk =
  | { change: "hook"; hook: WrittenHook }
  | { change: "offer"; offer: string }
  | { change: "host"; who: string }
  | { change: "lang"; lang: PostLang };
/** A hook written for this edit: the writer's whole answer (only its hook beat is used) and its flags. */
interface WrittenHook { formula: string; r: Pick<Version, "lines" | "marks" | "texts" | "searches">; flags?: Flags }
/** The panel's typed work on this device, per plan: the hooks written, Jev's pick and the reviewed translations. */
interface VersionsDraft { hooks: WrittenHook[]; rec: number | null; langs: Partial<Record<PostLang, { lines: string[]; texts: Version["texts"]; caption?: string }>> }
interface VersionsJob { planId: string; state: "working" | "done" | "failed"; step: string; made: number; total: number; error?: string; flags: Flags[]; missed: number }
/** What a version is made from: the plan, the version this project is, the project and its settings now. */
interface VersionBase { plan: EditPlan; base: Version; project: VideoProject; settings: EditSettings; source: RemixSource | null }

export const MAX_VERSIONS_A_PRESS = 6;
const VLANGS: PostLang[] = ["zh", "ms", "ta"];
const VDRAFT = (planId: string) => `cs-edit-versions-${planId}`;
const VDRAFT_CHANGED = "cs-edit-versions-changed";
const FACE_GONE = "The face in this video isn't saved any more, so it can't be made again.";
const SOURCE_GONE = "The reel this edit was read from isn't on this device any more, so new words can't be written.";
export const OTHER_DEVICE = "This video is on another device. Open it there to make versions.";
const NO_PARTS = "This video's parts weren't kept on this device, so versions can't be made from it.";
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function loadVersionsDraft(planId: string): VersionsDraft {
  try {
    const d = JSON.parse(localStorage.getItem(VDRAFT(planId)) ?? "null");
    const hooks = Array.isArray(d?.hooks) ? d.hooks.filter((h: WrittenHook) => typeof h?.formula === "string" && Array.isArray(h.r?.lines) && Array.isArray(h.r.marks)) : [];
    return { hooks, rec: Number.isInteger(d?.rec) && d.rec < hooks.length ? d.rec : null, langs: d?.langs && typeof d.langs === "object" ? d.langs : {} };
  } catch {
    return { hooks: [], rec: null, langs: {} };
  }
}
function saveVersionsDraft(planId: string, d: VersionsDraft) {
  try {
    localStorage.setItem(VDRAFT(planId), JSON.stringify(d));
  } catch {
    // storage full: the panel still shows it until the page closes
  }
  window.dispatchEvent(new Event(VDRAFT_CHANGED));
}

// one store for the panel's runs, so leaving /edit never stops one
let vstate: { writing?: string; translating?: string; job?: VersionsJob; error?: string } = {};
const vlisteners = new Set<() => void>();
const setV = (patch: Partial<typeof vstate>) => {
  vstate = { ...vstate, ...patch };
  vlisteners.forEach((l) => l());
};
const jobPatch = (patch: Partial<VersionsJob>) => vstate.job && setV({ job: { ...vstate.job, ...patch } });
function useVersionsState() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    vlisteners.add(l);
    return () => void vlisteners.delete(l);
  }, []);
  return vstate;
}

const baseKind = (v: Pick<Version, "host">) => (v.host.kind === "none" ? "none" : v.host.kind === "film" ? "film" : "face");
/** The base video's Speak parts, each with its words (from the project's word times when the mark kept none). */
const partsOf = (p: VideoProject): AiPart[] => {
  const s = p.ai?.slices ?? [];
  const heard = wordsIn(p.words, s);
  return s.map((x, i) => ({ ...x, text: x.text || heard[i] || "" }));
};
/** The beats a change rewrites: the hook, or the product and ask beats (the last beat when the plan has neither). */
const beatsOf = (plan: EditPlan, change: "hook" | "offer") => {
  if (change === "hook") return new Set([0]);
  const b = plan.beats.flatMap((x, i) => (x.role === "product" || x.role === "ask" ? [i] : []));
  return new Set(b.length ? b : [plan.beats.length - 1]);
};
/** The base with a written answer's lines, marks, on-screen texts and searches in those beats only. */
export function withBeats(plan: EditPlan, base: Version, r: WrittenHook["r"], beats: Set<number>): Pick<Version, "lines" | "marks" | "texts" | "searches"> {
  const ks = new Set(plan.events.flatMap((e, k) => (beats.has(e.place.b) ? [k] : [])));
  return {
    lines: base.lines.map((l, b) => (beats.has(b) ? r.lines[b] ?? l : l)),
    marks: [...base.marks.filter((m) => !beats.has(m.line)), ...r.marks.filter((m) => beats.has(m.line))],
    texts: [...base.texts.filter((t) => !ks.has(t.k)), ...r.texts.filter((t) => ks.has(t.k))],
    searches: [...base.searches.filter((t) => !ks.has(t.k)), ...r.searches.filter((t) => ks.has(t.k))],
  };
}
/** A translated line's markers, moved to the same share of the way through it. */
const scaledMarks = (base: Version, lines: string[]) =>
  base.marks.map((m) => {
    const was = countWords(base.lines[m.line] ?? "");
    const now = countWords(lines[m.line] ?? "");
    return { ...m, word: was ? Math.min(now, Math.round((m.word * now) / was)) : 0 };
  });
/** The base video's cutaways the plan laid, by event: a version keeps them where its words move them. */
const clipsOf = (planId: string, s: EditSettings): Record<number, CutawayClip> =>
  Object.fromEntries((s.broll ?? []).flatMap(({ id, from: _f, to: _t, ...clip }) => {
    const k = id.startsWith(`b-${planId}-`) ? Number(id.slice(planId.length + 3)) : NaN;
    return Number.isInteger(k) ? [[k, clip]] : [];
  }));
/** Each line's words spread over the span the dub says it in (a Chinese line is one word). */
const spanWords = (lines: string[], spans: ({ s: number; e: number } | null)[]): Word[] =>
  lines.flatMap((l, i) => {
    const sp = spans[i];
    return sp && l.trim() ? scriptWords(l, sp.e - sp.s).map((w) => ({ ...w, s: w.s + sp.s, e: w.e + sp.s })) : [];
  });
const changeName = (v: Pick<Version, "change" | "lang">) =>
  v.change === "hook" ? "new hook" : v.change === "offer" ? "new offer" : v.change === "host" ? "new face" : v.change === "lang" ? LANG_NAMES[v.lang as PostLang] : "first version";

/** The edit laid over a take or a version's words: its cutaways found or kept, its labels, zooms and look. */
async function laidPlan(userId: string, plan: EditPlan, v: Version, words: Word[], seconds: number, clips?: Record<number, CutawayClip>) {
  const found = clips ? { clips, missed: 0 } : await findCutaways(plan, v);
  const facts = brandPack(userId, { platform: "tiktok", mention: true, offer: null }).facts;
  return { laid: compilePlan(plan, v, words, seconds, { clips: found.clips, facts, color: loadBrand(userId)?.color }), missed: found.missed };
}

/** The writer's answer for this edit (remix make as "edit"), on a formula for a hook or the brand kit's offer. */
async function writeEdit(userId: string, b: VersionBase, o: { formula?: string; offer?: string }): Promise<{ r: WrittenHook["r"]; flags: Flags }> {
  if (!b.source) throw new Error(SOURCE_GONE);
  const speaker = loadRemixPrefs(userId).speaker;
  const res = await requestMake({
    ...makeBody(userId, { source: b.source, topic: "", note: "", mention: true, size: "9x16" }, "speaking"),
    ...(o.offer ? { brand: brandPack(userId, { platform: "tiktok", mention: true, offer: o.offer, speaker }) } : {}),
    ...(o.formula ? { formula: o.formula } : {}),
    as: "edit" as const,
    close: "balanced" as const,
    edit: editBrief(b.plan, Math.max(5, Math.round(b.project.duration)), b.project.ai?.voiceId ?? b.base.voice),
  });
  const r = res?.result as unknown as EditResult | undefined;
  if (r?.as !== "edit" || !Array.isArray(r.lines)) throw new Error(WRITE_FAILED);
  const v = versionOf(r, { who: "none", voice: b.base.voice });
  return { r: { lines: v.lines, marks: v.marks, texts: v.texts, searches: v.searches }, flags: res.flags };
}

/** The line when fewer hooks came back than were asked for; a refused one kept its use, so it is said. */
export const hooksShort = (asked: number, got: number) => (got < asked ? `${asked - got} of the ${asked} hooks didn't fit the edit, so ${got} came back.` : null);

/** "Write 3 hooks": three makes, each on the next hook formula, then Jev's pick over every hook written. */
async function writeHooks(userId: string, b: VersionBase): Promise<void> {
  if (vstate.writing) return;
  setV({ writing: b.plan.id, error: undefined });
  try {
    const d = loadVersionsDraft(b.plan.id);
    const formulas = otherFormulas(d.hooks.at(-1)?.formula);
    const got = (await Promise.allSettled(formulas.map(async (formula) => ({ formula, ...(await writeEdit(userId, b, { formula })) }))))
      .flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
    if (!got.length) throw new Error(WRITE_FAILED);
    const hooks = [...d.hooks, ...got];
    const pick = await pickHook(hooks.map((h) => h.r.lines[0] ?? ""), brandPack(userId, { platform: "tiktok", mention: true, offer: null }).audience, b.source?.title ?? "", "tiktok");
    saveVersionsDraft(b.plan.id, { ...loadVersionsDraft(b.plan.id), hooks, rec: pick });
    // live-p7a D15: 2 of 3 came back and nothing said why
    const short = hooksShort(formulas.length, got.length);
    if (short) setV({ error: short });
  } catch (e) {
    setV({ error: (e as Error).message || WRITE_FAILED });
  } finally {
    setV({ writing: undefined });
  }
}

/** The caption's paragraphs, each as its sentences; a run of hashtags stays as it is. */
const captionParts = (caption: string) => caption.split("\n").map((p) => p.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean));
const tagsOnly = (x: string) => /^(#\S+\s*)+$/.test(x);
/** What a language version's one translate call takes: the lines, the on-screen texts, then the post caption a sentence a line (a line stops at 300 characters). */
export const toTranslate = (b: Pick<Version, "lines" | "texts" | "caption">) =>
  [...b.lines, ...b.texts.map((t) => t.text), ...captionParts(b.caption).flat().filter((x) => !tagsOnly(x))];
/** The call's answer laid back on the version, the English kept wherever a line came back empty (live-p7a D21: the caption stayed English). */
export function fromTranslated(b: Pick<Version, "lines" | "texts" | "caption">, out: string[]): { lines: string[]; texts: Version["texts"]; caption: string } {
  let at = b.lines.length + b.texts.length;
  return {
    lines: b.lines.map((l, i) => out[i] || l),
    texts: b.texts.map((t, i) => ({ k: t.k, text: out[b.lines.length + i] || t.text })),
    caption: captionParts(b.caption).map((p) => p.map((x) => (tagsOnly(x) ? x : out[at++] || x)).join(" ")).join("\n"),
  };
}

/** A language's lines, on-screen texts and caption translated in one call, for review before anything is paid. */
async function translateVersion(b: VersionBase, lang: PostLang): Promise<void> {
  if (vstate.translating) return;
  setV({ translating: `${b.plan.id}:${lang}`, error: undefined });
  try {
    const out = await translateCaptions(lang, toTranslate(b.base));
    const d = loadVersionsDraft(b.plan.id);
    saveVersionsDraft(b.plan.id, { ...d, langs: { ...d.langs, [lang]: fromTranslated(b.base, out) } });
  } catch (e) {
    setV({ error: (e as Error).message || "Couldn't translate it. Try again in a minute." });
  } finally {
    setV({ translating: undefined });
  }
}

/** The new voice with its word times: the dub for a language (times spread over each line's span), else text-voice. */
async function versionVoice(next: Version, voice: VoiceId, text: string): Promise<{ mp3: Blob; said: Word[]; spans?: ({ s: number; e: number } | null)[] }> {
  if (next.change === "lang" && next.lang !== "en") {
    const { audio, spans } = await speakDub(next.lines, voice, next.lang);
    return { mp3: audio, said: spanWords(next.lines, spans), spans };
  }
  const r = await callFn<{ audio?: string; words?: Word[] } | Blob>("text-voice", { text, voice, timestamps: true }, VOICE_FAILED);
  if (r instanceof Blob) return { mp3: r, said: [] };
  const bytes = Uint8Array.from(atob(r?.audio ?? ""), (c) => c.charCodeAt(0));
  if (bytes.length < 1000) throw new Error("The voiceover came back empty. Try again.");
  return { mp3: new Blob([bytes], { type: "audio/mpeg" }), said: Array.isArray(r?.words) ? r.words : [] };
}

/** The base's settings for a version on new words: what was cut, trimmed or measured on the old take is dropped. */
const freshSettings = (s: EditSettings, sameClock: boolean): EditSettings => {
  const { faceTrack: _f, ...rest } = s;
  return sameClock ? rest : { ...rest, removed: undefined, coldOpen: undefined, trimStart: 0, trimEnd: 0 };
};

/** The editor's hand-off for a version, as the first version's (sameEditJob handOff), toast aside. */
const versionExtra = (b: VersionBase, v: Version, settings: EditSettings, words: Word[], ai: AiMark): JoinExtra => ({
  toast: `Your ${changeName(v)} version is ready.`,
  ...(v.caption ? { caption: v.caption } : {}),
  said: spoken(v),
  ...(words.length ? { words } : {}),
  settings,
  ...(b.source ? { source: { ...b.source, remixedAt: new Date().toISOString() } } : {}),
  ai,
  ...(v.draft ? { draftId: v.draft } : {}),
  plan: { id: b.plan.id, version: v.id },
});

/** Waits on the avatar job makeVersion started until its video is joined; its steps go to `step`. */
function followAvatar(start: () => void, step: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = onAiJob((j) => {
      if (j?.kind !== "avatar") return;
      if (j.state === "working") return step(j.step.split(". ")[0].replace(/\.+$/, "").replace(/^\w/, (c) => c.toLowerCase()));
      off();
      if (j.state === "done") resolve();
      else reject(new Error(j.error || "Couldn't make that version. Try again."));
    });
    start();
    const j = aiJob();
    if (j?.kind !== "avatar" || j.state !== "working") {
      off();
      reject(new Error("Your last AI video isn't finished yet. Open it in the editor to finish it."));
    }
  });
}

/** A version on a face: the parts its change covers made again on the same face (a new host: every part, voice kept). */
async function faceVersion(userId: string, b: VersionBase, next: Version, a: VersionAsk, step: (s: string) => void): Promise<number> {
  const parts = partsOf(b.project);
  const ai = b.project.ai!;
  const sp = a.change === "host" ? speakerOf(speakers(userId), a.who) : null;
  const photo = a.change === "host" ? (sp ? await speakerFace(sp).catch(() => null) : null) : faceFor(userId, ai);
  if (!photo) throw new Error(a.change === "host" ? PRESENTER_GONE : FACE_GONE);
  const voiceId = ai.voiceId ?? b.base.voice;
  const name = `${b.project.name} (${changeName(next)})`.slice(0, 80);
  let run: { from: number; to: number };
  let vo: Voiceover;
  let clock: { words: Word[]; seconds: number };
  let settings: EditSettings;
  let mark: AiMark;
  if (a.change === "host") {
    // the voice is kept: the base video's own sound, cut where its parts were cut
    step("cutting the voice from your video");
    const file = await getFile(fileKey(b.project)).catch(() => undefined);
    if (!file) throw new Error(PARTS_GONE);
    const { pcm, duration } = await monoPcm(file, 24000);
    run = { from: 0, to: parts.length };
    vo = { pcm, seconds: duration, slices: parts.map((p) => ({ start: p.start, end: Math.min(p.end, duration), text: p.text })) };
    clock = { words: b.project.words, seconds: b.project.duration };
    // laid again on the same words, so the hand-off is on the words' clock like every version's
    settings = layOver(freshSettings(b.settings, true), (await laidPlan(userId, b.plan, next, clock.words, clock.seconds, clipsOf(b.plan.id, b.settings))).laid, b.plan.id);
    mark = { ...aiMark("avatar", sp, voiceId), ...(ai.lang ? { lang: ai.lang } : {}) };
  } else {
    const r = versionRun(b.base, next, parts);
    // a written line the same as the video's would pay for a remake that changes nothing
    if (!r) throw new Error("That version says the same as this video. Pick another.");
    run = r;
    step("making the voiceover");
    const v = await versionVoice(next, voiceId, r.text);
    const cut = await sliceVoiceover(v.mp3);
    const said = v.said.length ? v.said : scriptWords(r.text, cut.seconds);
    const texts = v.spans ? textsFromSpans(v.spans, next.lines, cut.slices, next.lang) : wordsIn(said, cut.slices);
    vo = { ...cut, slices: cut.slices.map((s, i) => ({ ...s, text: texts[i] ?? "" })) };
    clock = versionWords(parts, r, b.project.words, said, cut.seconds);
    if (clock.seconds > MAX_AVATAR_SECONDS + 0.5) throw new Error(tooLongLine(clock.seconds));
    const { laid } = await laidPlan(userId, b.plan, next, clock.words, clock.seconds, clipsOf(b.plan.id, b.settings));
    settings = layOver(freshSettings(b.settings, false), laid, b.plan.id);
    const { slices: _s, ...rest } = ai;
    mark = { ...rest, madeAt: new Date().toISOString(), ...(next.lang !== "en" ? { lang: next.lang } : {}) };
  }
  step("sending to Speak");
  await followAvatar(() => void makeVersion(name, photo, parts, run, vo, versionExtra(b, next, settings, clock.words, mark), { plan: b.plan.id, of: b.base.id }), step);
  return 0;
}

/** A version with no face: a new voice, and the same cutaways found again and cut at its marked words. */
async function noFaceVersion(userId: string, b: VersionBase, next: Version, step: (s: string) => void): Promise<number> {
  const voiceId = b.project.ai?.voiceId ?? b.base.voice;
  step("making the voiceover");
  const v = await versionVoice(next, voiceId, spoken(next));
  const seconds = await audioSeconds(v.mp3).catch(() => v.said.at(-1)?.e ?? b.project.duration);
  const said = v.said.length ? v.said : scriptWords(spoken(next), seconds);
  step("finding the cutaways");
  const { laid, missed } = await laidPlan(userId, b.plan, next, said, seconds);
  const scenes = cutawayScenes(laid.broll ?? [], seconds);
  const files = await Promise.all(scenes.map((x) => getFile(x.key).catch(() => undefined)));
  if (!scenes.length || files.some((f) => !f)) throw new Error(NO_STOCK);
  // the cutaways are the footage here, so they aren't laid over it a second time
  const settings = layOver(freshSettings(b.settings, false), { ...laid, broll: undefined, brollLayout: undefined }, b.plan.id);
  const mark = { ...aiMark("voiceover", null, voiceId), ...(next.lang !== "en" ? { lang: next.lang } : {}) };
  step("putting it together");
  while (currentJoin()?.state === "running") await sleepMs(1000);
  await startSlides(`${b.project.name} (${changeName(next)})`.slice(0, 80), scenes.map((x, i) => ({ video: files[i]!, seconds: x.seconds })), v.mp3, "Putting your version together", {
    extra: versionExtra(b, next, settings, said, mark),
  });
  if (currentJoin()?.state === "failed") throw new Error(currentJoin()?.error || "Couldn't put the video together. Try again.");
  return missed;
}

/** "Make N versions": each saved before anything is paid for, then made in turn; one failing stops the rest. */
async function makeVersions(userId: string, b: VersionBase, asks: VersionAsk[]): Promise<void> {
  if (vstate.job?.state === "working" || !asks.length) return;
  const total = asks.length;
  setV({ job: { planId: b.plan.id, state: "working", step: "Writing your versions...", made: 0, total, flags: [], missed: 0 }, error: undefined });
  const kind = baseKind(b.base);
  const langs = loadVersionsDraft(b.plan.id).langs;
  try {
    for (const [i, a] of asks.entries()) {
      const step = (s: string) => jobPatch({ step: `Version ${i + 1} of ${total}: ${s}...` });
      step("writing");
      let fields: Partial<Version>;
      let flags: Flags | undefined;
      if (a.change === "hook") {
        fields = withBeats(b.plan, b.base, a.hook.r, beatsOf(b.plan, "hook"));
        flags = a.hook.flags;
      } else if (a.change === "offer") {
        const w = await writeEdit(userId, b, { offer: a.offer });
        fields = { ...withBeats(b.plan, b.base, w.r, beatsOf(b.plan, "offer")), offer: a.offer };
        flags = w.flags;
      } else if (a.change === "host") {
        fields = { host: a.who === "mine" ? { kind: "mine" } : { kind: "presenter", id: a.who } };
      } else {
        const t = langs[a.lang];
        if (!t) throw new Error(`Translate it to ${LANG_NAMES[a.lang]} first.`);
        fields = { lang: a.lang, lines: t.lines, texts: t.texts, marks: scaledMarks(b.base, t.lines), ...(t.caption ? { caption: t.caption } : {}) };
      }
      const now = new Date();
      let next: Version = { ...b.base, ...fields, id: versionId(now, i), of: b.base.id, change: a.change, at: now.toISOString(), project: undefined, draft: undefined };
      // saved before anything else is paid for: a reload keeps the script, in the plan and in My posts
      const draft = draftOf(b.plan, next, b.source, now);
      upsertDraft(userId, draft);
      next = { ...next, draft: draft.id };
      const full = addVersion(userId, b.plan.id, next);
      if (full) throw new Error(full);
      if (flags) jobPatch({ flags: [...(vstate.job?.flags ?? []), flags] });
      const missed = kind === "film" ? 0 : kind === "face" ? await faceVersion(userId, b, next, a, step) : await noFaceVersion(userId, b, next, step);
      jobPatch({ made: i + 1, missed: (vstate.job?.missed ?? 0) + missed });
    }
    jobPatch({ state: "done", step: "" });
  } catch (e) {
    jobPatch({ state: "failed", step: "", error: (e as Error).message || "That version didn't go through. Try again." });
  }
}

/** What one ticked box costs before the press: the writing, the voice and the Speak parts it remakes. */
export function versionPrice(b: Pick<VersionBase, "plan" | "base" | "project">, a: VersionAsk): Price | "pick" | null {
  const kind = baseKind(b.base);
  const write = a.change === "offer" ? priceOf("remix-make") : null;
  if (kind === "film") return write;
  const voice = a.change === "host" ? null : priceOf("ai-voice");
  if (kind === "none") return sumPrices(write, voice);
  const parts = partsOf(b.project);
  // the offer's lines are unknown until written: any change to its beats picks the same parts
  const next: Version =
    a.change === "hook" ? { ...b.base, ...withBeats(b.plan, b.base, a.hook.r, beatsOf(b.plan, "hook")) }
    : a.change === "offer" ? { ...b.base, lines: b.base.lines.map((l, i) => (beatsOf(b.plan, "offer").has(i) ? `${l} offer` : l)) }
    : { ...b.base, change: a.change };
  const run = versionRun(b.base, next, parts) ?? { from: 0, to: parts.length };
  return sumPrices(write, voice, priceOf("edit-version", { slices: parts.slice(run.from, run.to).map((p) => p.end - p.start) }));
}

/** The caps a press spends, with how many uses each. */
export function versionUses(kind: "face" | "none" | "film", asks: VersionAsk[]): Partial<Record<UsageFeature, number>> {
  const offers = asks.filter((a) => a.change === "offer").length;
  const voices = kind === "film" ? 0 : asks.filter((a) => a.change !== "host").length;
  return { ...(kind === "face" ? { "edit-version": asks.length } : {}), ...(voices ? { "ai-voice": voices } : {}), ...(offers ? { "remix-make": offers } : {}) };
}

function usePlanEntries(userId: string): PlanEntry[] {
  const [list, setList] = useState(() => loadPlans(userId));
  useEffect(() => {
    const read = () => setList(loadPlans(userId));
    window.addEventListener(PLANS_CHANGED, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PLANS_CHANGED, read);
      window.removeEventListener("storage", read);
    };
  }, [userId]);
  return list;
}

/** The Versions card on a project made from an edit plan (Leo only); ?versions=1 opens it. Memo: the editor redraws while playing. */
const VersionsCard = memo(function VersionsCard({ userId, project, settings, onLay }: {
  userId: string;
  project: VideoProject;
  settings: EditSettings;
  /** Lays the plan over this take, one Undo step. */
  onLay: (next: EditSettings) => void;
}) {
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const vs = useVersionsState();
  const plans = usePlanEntries(userId);
  const people = useSpeakers(userId);
  const entry = plans.find((e) => e.plan.id === project.plan?.id) ?? null;
  const base = entry?.versions.find((v) => v.id === project.plan?.version) ?? null;
  const open = !!entry && !!base && params.get("versions") === "1";
  const planId = entry?.plan.id ?? "";
  const [draft, setDraft] = useState<VersionsDraft>(() => loadVersionsDraft(planId));
  const [ticks, setTicks] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [here, setHere] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [laying, setLaying] = useState(false);
  const { toast } = useToast();
  const job = vs.job?.planId === planId ? vs.job : null;
  const working = vs.job?.state === "working";
  const left = useUsesLeft(working || !!vs.writing || !!vs.translating);
  useEffect(() => {
    const read = () => setDraft(loadVersionsDraft(planId));
    read();
    window.addEventListener(VDRAFT_CHANGED, read);
    return () => window.removeEventListener(VDRAFT_CHANGED, read);
  }, [planId]);
  // a face version needs the base video's parts, which stay on the device that made it
  const clipKeys = [fileKey(project), ...(project.ai?.slices ?? []).map((s) => s.clip)].join(",");
  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all(clipKeys.split(",").map((k) => getFile(k).then((f) => !!f, () => false))).then((ok) => live && setHere(ok.every(Boolean)));
    return () => void (live = false);
  }, [open, clipKeys]);
  // a version paid for before a reload is put together at no cost
  useEffect(() => {
    if (open && pendingAvatar()?.extra?.plan?.id === planId) resumeAvatar();
  }, [open, planId]);

  if (!entry || !base) return null;
  const b: VersionBase = { plan: entry.plan, base, project, settings, source: project.source ?? resolveSource(entry.plan.source, userId) };
  const kind = baseKind(base);
  const made = [...entry.versions].sort((x, y) => x.at.localeCompare(y.at));
  const projects = loadProjects(userId);
  const offers = offerNames(userId);
  const otherOffers = offers.filter((o) => o !== base.offer);
  const hosts = kind === "face" ? [...(people?.face && project.ai?.person !== "mine" ? [{ id: "mine", label: "You" }] : []), ...(people?.presenters ?? []).filter((p) => p.id !== project.ai?.who).map((p) => ({ id: p.id, label: `${p.name} (AI)` }))] : [];
  const asks: VersionAsk[] = ticks.flatMap((t): VersionAsk[] => {
    const [c, v] = [t.slice(0, t.indexOf(":")), t.slice(t.indexOf(":") + 1)];
    if (c === "hook") return draft.hooks[Number(v)] ? [{ change: "hook", hook: draft.hooks[Number(v)] }] : [];
    if (c === "offer") return otherOffers.includes(v) ? [{ change: "offer", offer: v }] : [];
    if (c === "host") return hosts.some((h) => h.id === v) ? [{ change: "host", who: v }] : [];
    return VLANGS.includes(v as PostLang) ? [{ change: "lang", lang: v as PostLang }] : [];
  });
  const n = asks.length;
  const price = sumPrices(...asks.map((a) => versionPrice(b, a)));
  const uses = versionUses(kind, asks);
  const cap: UsageFeature = kind === "face" ? "edit-version" : kind === "none" ? "ai-voice" : "remix-make";
  const reason =
    (Object.entries(uses) as [UsageFeature, number][]).map(([f, u]) => reasonText({ left: left(f), uses: u, leo: true })).find(Boolean)
    ?? (asks.some((a) => a.change === "lang" && !draft.langs[a.lang]) ? "Translate each language first." : null)
    ?? (kind === "face" && here === false ? OTHER_DEVICE : null)
    ?? (kind === "face" && !project.ai?.slices?.length ? NO_PARTS : null)
    ?? (kind === "face" && aiBusy() && !working ? "Your last AI video isn't finished yet. Open it in the editor to finish it." : null);
  const tick = (t: string) => {
    setAsking(false);
    setTicks((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < MAX_VERSIONS_A_PRESS ? [...cur, t] : cur));
  };
  const make = () => {
    // the press asks first, as the first version's does
    if (!asking) return setAsking(true);
    setAsking(false);
    setTicks([]);
    void makeVersions(userId, b, asks);
  };
  const box = (t: string, label: ReactNode, extra?: ReactNode, below?: ReactNode) => (
    <li key={t}>
      <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={ticks.includes(t)} disabled={working || (!ticks.includes(t) && ticks.length >= MAX_VERSIONS_A_PRESS)} onChange={() => tick(t)} />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{label}</span>
        {extra}
      </label>
      {below && <div className="pb-1.5 pl-6">{below}</div>}
    </li>
  );
  const flagsOf = (f: Flags | undefined, text: string) => [...(f?.mas ? [MAS_FLAG] : []), ...scanCompliance(text)].filter((x) => !dismissed.includes(x.id));
  const dismiss = (id: string) => setDismissed((d) => [...d, id]);
  const row = (title: string, children: ReactNode) => (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
  const btn = "h-11 sm:h-9";
  // a filmed take, captioned: the edit goes over it on one press (the cutaways found again by the script's searches)
  const canLay = kind === "film" && project.words.length > 0 && ![...(settings.broll ?? []), ...(settings.overlays ?? [])].some((x) => x.id.startsWith(`b-${planId}-`) || x.id.startsWith(`o-${planId}-`)) && !settings.motion?.lines?.length;
  // shortcut: the lay runs in this card, so leaving the page mid-lay drops it (it is free and takes a few seconds)
  const lay = async () => {
    setLaying(true);
    try {
      const { laid, missed } = await laidPlan(userId, entry.plan, base, project.words, project.duration);
      onLay(onOutputClock(layOver(settings, laid, planId), project.words, project.duration, planId));
      toast({ title: "The edit is on your take. Undo takes it off.", ...(missed ? { description: `${missed} ${missed === 1 ? "cutaway" : "cutaways"} had no stock clip. Add ${missed === 1 ? "it" : "them"} in B-roll.` } : {}) });
    } catch (e) {
      toast({ title: "Couldn't lay the edit", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLaying(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border/70 p-3" aria-label="Versions">
      {canLay && (
        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-11 sm:h-10" disabled={laying} onClick={() => void lay()}>{laying ? "Laying the edit..." : "Lay the edit over this take"}</Button>
          <PriceChip feature="stock-search" left={left("stock-search")} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Versions of this edit</h2>
        {made.length > 1 && <span className="text-xs text-muted-foreground">{made.length - 1} made</span>}
        {open ? (
          <Button size="sm" variant="ghost" className={btn} onClick={() => update({ versions: null })}>Close</Button>
        ) : (
          <Button size="sm" variant="outline" className={btn} onClick={() => update({ versions: "1" }, { push: true })}>Versions</Button>
        )}
      </div>
      {job?.state === "working" && (
        <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite"><ThinkingOrb state="working" size={20} theme="light" aria-hidden /> {job.step}</p>
      )}
      {open && (
        <div className="space-y-4">
          {kind === "face" && here === false ? (
            <p className="text-sm text-muted-foreground">{OTHER_DEVICE}</p>
          ) : (
            <>
              {row("New hook", (
                <>
                  <ul className="divide-y divide-border/60">
                    {draft.hooks.map((h, i) => box(`hook:${i}`, `"${h.r.lines[0] ?? ""}"`,
                      draft.rec === i ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Recommended</span> : null,
                      flagsOf(h.flags, h.r.lines[0] ?? "").length ? <ComplianceChips flags={flagsOf(h.flags, h.r.lines[0] ?? "")} onDismiss={dismiss} /> : null))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className={btn} disabled={!!vs.writing || working || !b.source} onClick={() => void writeHooks(userId, b)}>
                      {vs.writing === planId ? "Writing..." : draft.hooks.length ? "Write 3 more" : "Write 3 hooks"}
                    </Button>
                    <PriceChip feature="remix-make" left={left("remix-make")} uses={3} />
                  </div>
                  {!b.source && <p className="text-xs text-muted-foreground">{SOURCE_GONE}</p>}
                </>
              ))}
              {offers.length > 1 && row("Your offer", <ul className="flex flex-wrap gap-x-4">{otherOffers.map((o) => box(`offer:${o}`, o))}</ul>)}
              {hosts.length > 0 && row("Who's on it", (
                <>
                  <ul className="flex flex-wrap gap-x-4">{hosts.map((h) => box(`host:${h.id}`, h.label))}</ul>
                  {ticks.some((t) => t.startsWith("host:pr-")) && <p className="text-xs text-muted-foreground">{PRESENTER_LINE}</p>}
                </>
              ))}
              {kind !== "film" && row("Language", (
                <>
                  <ul className="flex flex-wrap gap-x-4">{VLANGS.map((l) => box(`lang:${l}`, LANG_NAMES[l]))}</ul>
                  {VLANGS.filter((l) => ticks.includes(`lang:${l}`)).map((l) => {
                    const t = draft.langs[l];
                    if (!t) return (
                      <div key={l} className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" className={btn} disabled={!!vs.translating || working} onClick={() => void translateVersion(b, l)}>
                          {vs.translating === `${planId}:${l}` ? "Translating..." : `Translate to ${LANG_NAMES[l]}`}
                        </Button>
                        <PriceChip feature="video-translate" left={left("video-translate")} />
                      </div>
                    );
                    const edit = (i: number, text: string) => saveVersionsDraft(planId, { ...draft, langs: { ...draft.langs, [l]: { ...t, lines: t.lines.map((x, j) => (j === i ? text : x)) } } });
                    return (
                      <ol key={l} className="space-y-2" aria-label={`${LANG_NAMES[l]} with its English meaning`}>
                        {base.lines.map((en, i) => (
                          <li key={i} className="grid gap-1.5 sm:grid-cols-2">
                            <p className="text-sm text-muted-foreground">{en}</p>
                            <Textarea rows={2} lang={l} maxLength={300} value={t.lines[i] ?? ""} disabled={working} aria-label={`${LANG_NAMES[l]}, line ${i + 1} of ${base.lines.length}`} onChange={(e) => edit(i, e.target.value)} />
                          </li>
                        ))}
                      </ol>
                    );
                  })}
                </>
              ))}
              {vs.error && <p className="text-xs text-destructive" role="alert">{vs.error}</p>}
              <div className="space-y-2 border-t border-border/60 pt-3">
                {asking ? (
                  <div className="space-y-2" role="status">
                    <p className="text-sm text-muted-foreground">
                      This makes {n} {n === 1 ? "version" : "versions"} and uses {price && price !== "pick" ? priceText(price).replace(/^\w/, (c) => c.toLowerCase()) : "a little"}{kind === "face" ? " of video credit" : ""}. Make it?
                    </p>
                    <div className="flex items-center gap-2">
                      <Button className="h-11 sm:h-10" onClick={make}>Make it</Button>
                      <Button variant="ghost" className="h-11 text-muted-foreground sm:h-10" onClick={() => setAsking(false)}>Not now</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    {n > 0 && <span className="text-sm">{n} {n === 1 ? "version" : "versions"},</span>}
                    {n > 0 && <PriceChip price={price} left={left(cap)} uses={uses[cap] ?? n} />}
                    <Button className="h-11 sm:ml-auto sm:h-10" disabled={!n || working || !!reason} onClick={make}>
                      {working && job ? "Making..." : n === 1 ? "Make 1 version" : n ? `Make ${n} versions` : "Make versions"}
                    </Button>
                  </div>
                )}
                {(n > 0 ? reason : "Tick a box for each version you want.") && <p className="text-xs text-muted-foreground">{n > 0 ? reason : "Tick a box for each version you want."}</p>}
                {n >= MAX_VERSIONS_A_PRESS && <p className="text-xs text-muted-foreground">At most {MAX_VERSIONS_A_PRESS} versions a press.</p>}
              </div>
            </>
          )}
        </div>
      )}
      {job?.state === "failed" && <p className="text-sm text-destructive" role="alert">{job.error}</p>}
      {job?.state === "done" && job.missed > 0 && <p className="text-xs text-muted-foreground">{job.missed} {job.missed === 1 ? "cutaway" : "cutaways"} had no stock clip. Add {job.missed === 1 ? "it" : "them"} in B-roll.</p>}
      {job && job.flags.some((f) => f.mas) && !dismissed.includes(MAS_FLAG.id) && <ComplianceChips flags={[MAS_FLAG]} onDismiss={dismiss} />}
      {made.length > 1 && (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60" aria-label="Versions made">
          {made.map((v, i) => {
            const there = !!v.project && projects.some((p) => p.id === v.project);
            return (
              <li key={v.id} className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                <span className="mr-auto">Version {i + 1}: {changeName(v)}</span>
                {v.project === project.id ? <span className="text-xs text-muted-foreground">Open now</span>
                  : there ? <Button size="sm" variant="ghost" asChild className={btn}><Link to={links.edit({ p: v.project! })}>Open</Link></Button>
                  : v.host.kind === "film" ? <Button size="sm" variant="ghost" asChild className={btn}><Link to={links.edit({ plan: planId, version: v.id })}>Upload the take</Link></Button>
                  : <span className="text-xs text-muted-foreground">{v.project ? "On another device" : "Not made yet"}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {made.length > 1 && (
        <Button size="sm" variant="outline" className={btn} onClick={() => {
          for (const d of loadDrafts(userId)) if (d.set?.id === planId && d.set.kind !== "hook-test") upsertDraft(userId, { ...d, set: { ...d.set, kind: "hook-test" } });
        }} asChild>
          <Link to={links.drafts({ set: planId })}>Make it a hook test</Link>
        </Button>
      )}
    </section>
  );
});
