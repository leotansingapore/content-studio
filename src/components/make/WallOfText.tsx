// /make/wall-of-text (docs/north-star/items/formats-wall-of-text.md): bold words over a video, written from a topic
// or remixed from a post that did well, over a stock clip Jev picks or the adviser's own video. Never the post's own
// footage or sound. The run is src/lib/wallJob.ts (outside React, so leaving the page keeps it going); the video
// opens in the editor (/edit), which this page pushes once the words and the clip are ready.
//
// URL (docs/deep-links.md): source=<RemixSource key> (MakeFormatPage resolves it), from=topic|remix, mention=no,
// bg=mine|stock and pick=open replace; making on arrival comes only from navigation state { go: true } (the Remix
// sheet's Also make link), never from a URL param. Device hints: cs-make-wall (the typed words) and cs-make-wall-bg
// (the last background picked).
//
// With `scene` it is /make/text-over-clip (TextOverClip.tsx, docs/north-star/items/formats-text-over-clip.md): the
// background is a clip ai-video makes (scene=kitchen|walk|interview and quality=480p|720p replace, defaults left out),
// the press asks first because it costs over US$1, it never makes on arrival, and a clip paid for and waiting on this
// device is picked up on arrival at no cost. Its typed words are kept in cs-make-text-over-clip.

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import FormatShell from "@/components/make/FormatShell";
import PickList, { metaOf } from "@/components/make/PickList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBySlug } from "@/data/formats";
import { onAiJob, pendingAvatar, type ClipQuality } from "@/lib/aiVideo";
import { loadFollowing } from "@/lib/following";
import { links } from "@/lib/links";
import { priceOf, priceText, sumPrices } from "@/lib/prices";
import { brandName } from "@/lib/remixBrand";
import { fromFollowPost, fromTopPost, fromTrend, noteKey, rememberSource, type RemixSource } from "@/lib/remixSource";
import { engagementScore, getAllTopPosts } from "@/lib/topPosts";
import { TRENDS } from "@/lib/trends";
import { useUrlFlag, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { currentJoin, onJoinJob, type JoinJob } from "@/lib/videoMedia";
import { loadProjects } from "@/lib/videoProjects";
import {
  MINE_SECONDS, SCENE_SECONDS, finishAgain, onWallJob, pendingScene, resumeScene, sceneBlock, startFrom, startWall, stepText, wallBusy, wallJob,
  type WallAsk, type WallBg, type WallFrom, type WallJob, type WallScene, type WallSlot,
} from "@/lib/wallJob";

const WORDS_KEY = "cs-make-wall";
const SCENE_WORDS_KEY = "cs-make-text-over-clip";
const BG_KEY = "cs-make-wall-bg";
/** One heading style for every option on the setup cards. */
const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";

const SCENES: [WallScene, string][] = [["kitchen", "Kitchen counter"], ["walk", "Walking selfie"], ["interview", "Interview"]];
const QUALITIES: ClipQuality[] = ["480p", "720p"];
const AI_LINE = "The person in it is made by AI.";
const SCENE_WAITING = "Your last video is paid for and waiting. Finish it at no cost first.";

function useJob(slot: WallSlot): WallJob | null {
  const [job, setJob] = useState(() => wallJob(slot));
  useEffect(() => onWallJob(setJob, slot), [slot]);
  return job;
}

/** A scene page redraws when any AI video moves, since one running or waiting stops it ordering another. */
function useAiTick(on: boolean): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => (on ? onAiJob(bump) : undefined), [on]);
}

/** The join's state and what it carries, not its progress (that ticks 30 times a second while it records). */
function useJoin(): Pick<JoinJob, "state" | "extra"> | null {
  const [join, setJoin] = useState(() => currentJoin() && { state: currentJoin()!.state, extra: currentJoin()!.extra });
  useEffect(() => {
    const off = onJoinJob((j) => setJoin((prev) => (prev?.state === j?.state && prev?.extra === j?.extra ? prev : j && { state: j.state, extra: j.extra })));
    return () => void off();
  }, []);
  return join;
}

type Words = { topic: string; note: string; person?: string };

/** The topic and the steer typed here (and a scene's person), kept on this device so leaving the page never loses them. */
function useWords(key: string): [Words, (w: Words) => void] {
  const [words, setWords] = useState<Words>(() => {
    try {
      const w = JSON.parse(localStorage.getItem(key) ?? "{}");
      const base = { topic: typeof w.topic === "string" ? w.topic : "", note: typeof w.note === "string" ? w.note : "" };
      return key === SCENE_WORDS_KEY ? { ...base, person: typeof w.person === "string" ? w.person : "" } : base;
    } catch {
      return { topic: "", note: "" };
    }
  });
  const save = (w: Words) => {
    setWords(w);
    try {
      localStorage.setItem(key, JSON.stringify(w));
    } catch {
      // the field still holds it for this visit
    }
  };
  return [words, save];
}

/** The note typed in the Remix sheet for this post, or "". */
function sheetNote(key: string): string {
  try {
    return localStorage.getItem(noteKey(key)) ?? "";
  } catch {
    return "";
  }
}

function lastBg(): WallBg {
  try {
    return localStorage.getItem(BG_KEY) === "mine" ? "mine" : "stock";
  } catch {
    return "stock";
  }
}

/** Trend kits with a TikTok or Instagram video, then the swipe file's videos by engagement, then followed accounts' videos. */
function trendingWalls(userId: string): RemixSource[] {
  const trends = TRENDS.filter((t) => t.source_url && (t.platform === "tiktok" || t.platform === "instagram")).map(fromTrend);
  const top = getAllTopPosts()
    .slice()
    .sort((a, b) => engagementScore(b) - engagementScore(a))
    .map((p) => fromTopPost(p, { id: p.advisorId, name: p.advisorName, handle: p.handle }));
  const followed = loadFollowing(userId).flatMap((a) => a.posts.map((p) => fromFollowPost(a, p)));
  return [...trends, ...top, ...followed].filter((s) => s.format === "video");
}

/** `scene`: Words over a made scene (/make/text-over-clip), a clip ai-video makes behind the words. */
export default function WallOfText({ userId, source, scene = false }: { userId: string; source: RemixSource | null; scene?: boolean }) {
  const def = formatBySlug(scene ? "text-over-clip" : "wall-of-text")!;
  const slot: WallSlot = scene ? "scene" : "wall";
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Read once on arrival: only the Remix sheet's Also make link sets { go: true } (navigation state). A scene costs
  // over US$1, so it never makes on arrival (phase 3 decision 6).
  const arrivedToMake = useRef(!scene && Boolean((location.state as { go?: boolean } | null)?.go));
  const update = useUrlUpdate();
  const job = useJob(slot);
  const join = useJoin();
  useAiTick(scene);
  const busy = !!job && wallBusy(slot);
  const gone = !!params.get("source") && !source;
  const [from] = useUrlState<WallFrom>("from", startFrom(source), { allowed: ["topic", "remix"] });
  const [mention] = useUrlState("mention", "yes", { allowed: ["yes", "no"] });
  // the last background picked on this device, except on a Remix sheet link, which makes at once over stock
  const [bgDefault] = useState<WallBg>(() => (arrivedToMake.current ? "stock" : lastBg()));
  const [bg] = useUrlState<WallBg>("bg", bgDefault, { allowed: ["stock", "mine"] });
  const [picking, setPicking] = useUrlFlag("pick", "open");
  const [sceneId] = useUrlState<WallScene>("scene", "kitchen", { allowed: SCENES.map(([id]) => id) });
  const [quality] = useUrlState<ClipQuality>("quality", "480p", { allowed: QUALITIES });
  // the price of one press, and the line that asks before it is spent (Leo's rule for anything over about US$1)
  const price = scene ? sumPrices(priceOf("remix-make"), priceOf("ai-clip", { seconds: SCENE_SECONDS, quality })) : null;
  const [asking, setAsking] = useState<null | "make" | "again">(null);
  const [words, setWords] = useWords(scene ? SCENE_WORDS_KEY : WORDS_KEY);
  const [file, setFile] = useState<File | null>(null);
  const brand = useMemo(() => brandName(userId), [userId]);
  const fileInput = useRef<HTMLInputElement>(null);
  // a file picked from the failure's "Pick my video" finishes that run with its words; one picked in the setup waits for Make it
  const finishOnPick = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null>(null);
  const toResult = () => {
    if (!window.matchMedia("(min-width: 1024px)").matches) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const remix = from === "remix";
  const about = remix ? words.note : words.topic;
  const ask: WallAsk = scene
    ? { source: remix ? source : null, about, mention: mention !== "no", bg: "stock", scene: { id: sceneId, quality, person: words.person ?? "" } }
    : { source: remix ? source : null, about, mention: mention !== "no", bg, file: bg === "mine" ? file : null };
  const reason =
    remix && !source ? "Pick a post to remix first."
    : !remix && words.topic.trim().length < 3 ? "Type what it's about first."
    : !scene && bg === "mine" && !file ? "Pick your video first."
    : scene && !busy ? (pendingScene() ? SCENE_WAITING : sceneBlock())
    : null;
  // a scene paid for and waiting on this device: Try again at no cost picks it up with its words
  const resumable = scene && !busy && pendingScene();
  // the made video waits in memory until the editor opens it; once opened, it is the wall project holding its caption
  const waiting = job?.state === "done" && !!job.extra && join?.state === "done" && join.extra === job.extra;
  const made = useMemo(
    () => (job?.state === "done" && !waiting ? loadProjects(userId).find((p) => p.settings?.wall && p.caption === job.written?.caption)?.id : undefined),
    [job, waiting, userId],
  );

  // a failed run whose own way forward writes nothing new (finish with the written words, or pick another post): it
  // leads, and the paid Make it steps down. A scene's written words still need a paid clip, so only its waiting clip leads.
  const freeWay = job?.state === "failed" && ((scene ? resumable : !!job.noClip || !!job.written) || (!!job.refused && !!job.ask.source));

  /** Starts a run on the setup as it is now; `changes` ride in the same URL write (two writes in a row keep only the last). */
  const makeIt = (changes: Record<string, string | null> = {}, over: Partial<WallAsk> = {}) => {
    if (Object.keys(changes).length) update(changes);
    if (reason || wallBusy(slot)) return;
    // from here the run's steps are this visit's own: its start scrolls into view and its join opens the editor
    seen.current ??= "start";
    void startWall(userId, { ...ask, ...over });
  };
  /** A scene's press asks first; "again" orders a new clip for words already written. */
  const confirm = (what: "make" | "again") => {
    setAsking(null);
    if (what === "again") {
      seen.current ??= "start";
      finishAgain({}, "scene");
    } else makeIt();
  };
  const askFirst = (what: "make" | "again") => {
    setAsking(what);
    toResult();
  };

  // A scene clip paid for and waiting on this device is picked up on arrival, at no cost, words and all.
  useEffect(() => {
    if (scene && !wallJob("scene") && pendingScene()) resumeScene(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // once per step, while this page is open: the start or failure of a run scrolls into view on a phone, and a run
  // that reaches its join opens the editor, which shows the join's progress and opens the video when it is done
  useEffect(() => {
    if (!job) return;
    const step = `${job.id}:${job.state}`;
    if (seen.current === step) return;
    const live = seen.current !== null;
    seen.current = step;
    if (!live) return;
    if (job.state === "writing" || job.state === "failed") toResult();
    // "My video" hands over in a microtask, so joining and done can land in one render: done with bg mine opens it too
    if (job.state === "joining" || (job.state === "done" && (job.ask.bg === "mine" || !!job.ask.scene))) navigate(links.edit());
  }, [job, navigate]);

  // The Remix sheet's Also make link makes on arrival, once. It comes as navigation state, which a pasted or outside
  // link cannot set (a ?go=1 in the address does nothing), and is cleared from history so a reload never makes again.
  const went = useRef(false);
  useEffect(() => {
    if (went.current || !arrivedToMake.current) return;
    went.current = true;
    try {
      window.history.replaceState({ ...window.history.state, usr: null }, "");
    } catch {
      /* the ref already stops a second make on this mount */
    }
    // the Remix sheet's own note for this post rides along; a steer typed here earlier for another post never does
    const note = source ? sheetNote(source.key) : words.note;
    if (note !== words.note) setWords({ ...words, note });
    makeIt({}, source ? { about: note } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: string | null) => update({ [k]: v });
  const pickBg = (v: WallBg) => {
    try {
      localStorage.setItem(BG_KEY, v);
    } catch {
      // the address still holds it for this visit
    }
    set("bg", v === bgDefault ? null : v);
  };
  const chooseFile = (finish: boolean) => {
    finishOnPick.current = finish;
    fileInput.current?.click();
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    if (bg !== "mine") pickBg("mine");
    if (finishOnPick.current) finishAgain({ bg: "mine", file: f });
  };

  const options = (
    <>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <Field label="Start from">
            <FilterChip active={!remix} onClick={() => set("from", source ? "topic" : null)}>A topic</FilterChip>
            <FilterChip active={remix} onClick={() => set("from", source ? null : "remix")}>Remix a trending one</FilterChip>
          </Field>
          {gone && <p className="text-sm text-amber-700 dark:text-amber-300">That post isn't in the swipe file any more.</p>}
          {remix && (
            <div className="space-y-2">
              <p className={FIELD_LABEL}>Post to remix</p>
              {source ? (
                <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                  {source.cover && <img src={source.cover} alt="" className="h-14 w-11 shrink-0 rounded object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{source.title || source.caption || "A video"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{metaOf(source)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setPicking(!picking)} aria-expanded={picking} className="[@media(pointer:coarse)]:min-h-11">
                    Change
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPicking(!picking)} aria-expanded={picking} className="[@media(pointer:coarse)]:min-h-11">
                  Pick one
                </Button>
              )}
              {picking && (
                <PickList
                  userId={userId}
                  load={trendingWalls}
                  label="Videos that did well"
                  fallback="A video"
                  current={source?.key}
                  onPick={(s) => {
                    rememberSource(s, userId);
                    update({ source: s.key, pick: null, from: null });
                  }}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Keeps the shape of a wall of text that did well: the opening, the length, the emoji. Writes new words for {brand}.{" "}
                {scene ? "The video is a scene made for you, never theirs." : "The video is yours or stock, never theirs."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          {scene ? (
            <>
              <Field label="Scene">
                {SCENES.map(([id, label]) => (
                  <FilterChip key={id} active={sceneId === id} onClick={() => set("scene", id === "kitchen" ? null : id)}>{label}</FilterChip>
                ))}
              </Field>
              <div className="space-y-1.5">
                <Label htmlFor="make-scene-person" className={FIELD_LABEL}>Who is in it (optional)</Label>
                <Input
                  id="make-scene-person"
                  value={words.person ?? ""}
                  maxLength={200}
                  placeholder="A Malay woman in her 30s in a grey cardigan"
                  onChange={(e) => setWords({ ...words, person: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{AI_LINE}</p>
              </div>
              <Field label="Quality">
                {QUALITIES.map((q) => (
                  <FilterChip key={q} active={quality === q} onClick={() => set("quality", q === "480p" ? null : q)}>{q}</FilterChip>
                ))}
              </Field>
            </>
          ) : (
            <>
              <Field label="Background" hint={bg === "mine" ? `Only the first ${MINE_SECONDS} seconds are used.` : undefined}>
                <FilterChip active={bg === "stock"} onClick={() => pickBg("stock")}>Stock clip</FilterChip>
                <FilterChip active={bg === "mine"} onClick={() => pickBg("mine")}>My video</FilterChip>
              </Field>
              {bg === "mine" && (
                <div className="flex min-w-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => chooseFile(false)} className="shrink-0 [@media(pointer:coarse)]:min-h-11">
                    {file ? "Change video" : "Pick a video"}
                  </Button>
                  {file && <span className="min-w-0 truncate text-sm text-muted-foreground">{file.name}</span>}
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  // the same file picked again still fires
                  e.target.value = "";
                }}
              />
            </>
          )}
          <Field label={`Mention ${brand}`} hint={`Yes works ${brand} into the text. No keeps it as pure value content.`}>
            <FilterChip active={mention !== "no"} onClick={() => set("mention", null)}>Yes</FilterChip>
            <FilterChip active={mention === "no"} onClick={() => set("mention", "no")}>No</FilterChip>
          </Field>
          <div className="space-y-1.5">
            <Label htmlFor="make-wall-about" className={FIELD_LABEL}>{remix ? "What it's about (optional)" : "What it's about"}</Label>
            <Textarea
              id="make-wall-about"
              rows={2}
              value={about}
              maxLength={200}
              placeholder={scene ? "What should the words be about?" : "What should the wall of text be about?"}
              onChange={(e) => setWords(remix ? { ...words, note: e.target.value } : { ...words, topic: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );

  const result = (
    <div ref={resultRef} className="scroll-mt-16 space-y-3 lg:scroll-mt-0">
      {asking && !busy ? (
        <div className="space-y-3 rounded-lg border border-border/60 p-4 text-sm">
          <p className="text-muted-foreground">
            This makes a video and uses {price && price !== "pick" ? priceText(price).replace(/^\w/, (c) => c.toLowerCase()) : "some"} of video credit. Make it?
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={() => confirm(asking)} className="flex-1 [@media(pointer:coarse)]:min-h-11">Make it</Button>
            <Button variant="ghost" onClick={() => setAsking(null)} className="text-muted-foreground [@media(pointer:coarse)]:min-h-11">Not now</Button>
          </div>
        </div>
      ) : busy && job ? (
        <Placeholder>
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <span role="status">{stepText(job)}</span>
          {/* an Also make press that arrived while another wall was still being made starts nothing: say so */}
          {(job.ask.source?.key ?? null) !== (source?.key ?? null) && <span>{scene ? "Still making your last video." : "Still making your last wall of text."}</span>}
          {job.state === "joining" && (
            <Button variant="link" onClick={() => navigate(links.edit())} className="[@media(pointer:coarse)]:min-h-11">
              Open the editor
            </Button>
          )}
        </Placeholder>
      ) : job?.state === "failed" ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {job.error}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* the ways forward that write nothing new lead; a refusal or the cap gets no Try again, which would spend or fail again */}
            {scene ? (
              resumable ? (
                <Button size="sm" onClick={() => resumeScene(ask)} className="[@media(pointer:coarse)]:min-h-11">Try again at no cost</Button>
              ) : job.written ? (
                // the words are written: a new clip for them, paid again, so it asks first
                <Button size="sm" variant="outline" onClick={() => askFirst("again")} disabled={!!reason} className="[@media(pointer:coarse)]:min-h-11">Try again</Button>
              ) : (
                !job.refused && !job.capped && (
                  <Button size="sm" variant="outline" onClick={() => askFirst("make")} disabled={!!reason} className="[@media(pointer:coarse)]:min-h-11">Try again</Button>
                )
              )
            ) : job.noClip || (job.written && job.ask.bg === "mine") ? (
              <Button size="sm" onClick={() => chooseFile(true)} className="[@media(pointer:coarse)]:min-h-11">Pick my video</Button>
            ) : job.written ? (
              // the words are written: finish again with them, no second write
              <Button size="sm" onClick={() => finishAgain({ bg: job.ask.bg, file: job.ask.file })} className="[@media(pointer:coarse)]:min-h-11">Try again</Button>
            ) : (
              !job.refused && !job.capped && (
                <Button size="sm" variant="outline" onClick={() => makeIt()} disabled={!!reason} className="[@media(pointer:coarse)]:min-h-11">Try again</Button>
              )
            )}
            {job.refused && job.ask.source && (
              <Button size="sm" onClick={() => update({ from: null, pick: "open" })} className="[@media(pointer:coarse)]:min-h-11">Pick another</Button>
            )}
          </div>
        </div>
      ) : job?.state === "done" ? (
        <Placeholder>
          <p className="font-medium text-foreground">Your video is ready.</p>
          <Button onClick={() => navigate(links.edit(made ? { p: made } : {}))} className="[@media(pointer:coarse)]:min-h-11">
            Open it in the editor
          </Button>
        </Placeholder>
      ) : (
        <Placeholder>Your result shows here once you make it.</Placeholder>
      )}
    </div>
  );

  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={options}
      result={result}
      footer={{
        cap: def.cap,
        ...(scene ? { price, caps: ["remix-make" as const] } : {}),
        label: "Make it",
        busyLabel: "Making...",
        busy,
        reason,
        disabled: !!reason || (scene && !!asking),
        secondary: !busy && (job?.state === "done" || freeWay),
        onMake: () => (scene ? askFirst("make") : makeIt()),
      }}
    />
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A dashed 9:16 frame: before the first make, while one runs, and once the video is waiting for the editor. */
function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
