// /make/green-screen (docs/north-star/items/formats-green-screen.md): you, or an AI presenter, standing in front of a
// note list, your demo video or a picture. The page gathers the parts and the editor does the compositing, so it opens
// on its face tab with Behind you and Where you stand already set. The run is src/lib/greenScreen.ts (outside React, so
// leaving the page keeps it going; a paid presenter video resumes at no cost after a reload).
//
// URL (docs/deep-links.md): source=<RemixSource key> (the list is written from it), mention=no, who=presenter,
// behind=demo|picture, stand=corner, and for a presenter the talking head page's setting, length and voice, all
// replace. Nothing makes on arrival: the presenter costs more than US$1, and the green screen has no Also make link.
// Device: cs-make-green-screen-<scoped uid> keeps the typed note and the demo or picture picked; the presenter's script
// and look are the talking head page's (cs-make-talking-head-<scoped uid>).

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import FormatShell from "@/components/make/FormatShell";
import { metaOf } from "@/components/make/PickList";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBySlug } from "@/data/formats";
import { useUsesLeft } from "@/lib/aiUsage";
import { LOOKS, MAX_LOOK, aiBusy, onAiJob, pendingAvatar } from "@/lib/aiVideo";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { cutoutReady, findsPerson } from "@/lib/faceVision";
import {
  CUTOUT_LOADING, GREEN_BEHIND, GREEN_TOAST, GREEN_WHO, NO_PERSON, OTHER_VIDEO, STANDS, bdKey, canWriteList, greenBusy, greenCaps, greenJob, greenPrice,
  greenReason, goOn, listPlan, loadTyped, noteItems, onGreenJob, resumeGreen, saveTyped, startGreen, writeList,
  type BehindPick, type GreenBehind, type GreenJob, type GreenWho, type Typed,
} from "@/lib/greenScreen";
import { links } from "@/lib/links";
import { mediaLength } from "@/lib/longAudio";
import { NOTE_ITEMS, layoutNote, noteSvg } from "@/lib/notesCard";
import type { RemixSource } from "@/lib/remixSource";
import {
  DEFAULT_LENGTH, TALK_LENGTHS, TALK_SETTINGS, loadTyped as loadTalkTyped, saveTyped as saveTalkTyped, wordCount, wordLine, writePlan,
  type TalkLength, type TalkSetting, type Typed as TalkTyped,
} from "@/lib/talkingHead";
import { dropTalk, madePresenter, onTalkJob, ownsPending, talkJob, type TalkJob } from "@/lib/talkingHeadJob";
import { VOICES, VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { standBox, type Stand } from "@/lib/videoEdit";
import { getFile, joinAdd, putFile } from "@/lib/videoMedia";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PICK = `inline-flex h-9 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-sm font-semibold hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring ${TOUCH}`;
const WHO_LABELS: Record<GreenWho, string> = { mine: "My video", presenter: "AI presenter" };
const BEHIND_LABELS: Record<GreenBehind, string> = { notes: "A note list", demo: "My demo video", picture: "A picture" };
const STAND_LABELS: Record<Stand, string> = { bottom: "Bottom", corner: "Corner" };
const PAID_WAITING = "This video is paid for already. Use Try again at no cost.";

function useJob<T>(read: () => T, on: (fn: (j: T) => void) => () => void): T {
  const [j, setJ] = useState(read);
  useEffect(() => on(setJ), [on]);
  return j;
}

/** Your video, as picked on this visit: its length for the captions' price, and whether a person shows in it. */
interface Mine {
  file: File;
  minutes: number | null;
}

export default function GreenScreen({ userId, source }: { userId: string; source: RemixSource | null }) {
  const def = formatBySlug("green-screen")!;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const update = useUrlUpdate();
  const job = useJob<GreenJob | null>(greenJob, onGreenJob);
  const talk = useJob<TalkJob | null>(talkJob, onTalkJob);
  // the AI video slot is shared with the editor's AI panel and the talking head page
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAiJob(() => bump()), []);
  const [who, setWho] = useUrlState<GreenWho>("who", "mine", { allowed: GREEN_WHO });
  const [behind, setBehind] = useUrlState<GreenBehind>("behind", "notes", { allowed: GREEN_BEHIND });
  const [stand, setStand] = useUrlState<Stand>("stand", "bottom", { allowed: STANDS });
  const [setting, setSetting] = useUrlState<TalkSetting>("setting", "office", { allowed: TALK_SETTINGS.map((s) => s.id) });
  const [lengthParam, setLength] = useUrlState<string>("length", String(DEFAULT_LENGTH), { allowed: TALK_LENGTHS.map(String) });
  const length = Number(lengthParam) as TalkLength;
  const [voice, setVoice] = useUrlState<VoiceId>("voice", "alice", { allowed: VOICE_IDS });
  const [mention] = useUrlState("mention", "yes", { allowed: ["yes", "no"] });
  const [typed, setTyped] = useState<Typed>(() => loadTyped(userId));
  const [said, setSaid] = useState<TalkTyped>(() => {
    const t = loadTalkTyped(userId);
    return t.look ? t : { ...t, look: LOOKS[Math.floor(Math.random() * LOOKS.length)] };
  });
  const [mine, setMine] = useState<Mine | null>(null);
  const [person, setPerson] = useState<"none" | "loading" | "looking" | "nobody" | "found">("none");
  const checking = useRef(0);
  // the demo or picture behind you, read back from this device (null: it isn't here any more)
  const [behindUrl, setBehindUrl] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [pickError, setPickError] = useState("");
  const left = useUsesLeft(greenBusy());
  const measure = useMemo(() => (typeof document === "undefined" ? null : createCanvasMeasure()), []);
  const resultRef = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null>(null);
  const appliedList = useRef(job?.written ? `${job.id}` : "");
  const appliedScript = useRef(`${talk?.id}:${talk?.script ?? ""}`);

  useEffect(() => saveTyped(userId, typed), [userId, typed]);
  useEffect(() => saveTalkTyped(userId, said), [userId, said]);

  // a presenter video paid for but never put together picks up again at no cost
  useEffect(() => {
    if (resumeGreen(userId)) seen.current = "start";
  }, [userId]);

  // a list a press or Write it for me wrote goes in the boxes
  useEffect(() => {
    if (!job?.written || appliedList.current === `${job.id}`) return;
    appliedList.current = `${job.id}`;
    setTyped((t) => ({ ...t, ...job.written }));
  }, [job]);
  // the presenter's script, once the talking head's run writes it from a topic or the post
  useEffect(() => {
    const key = `${talk?.id}:${talk?.script ?? ""}`;
    if (!talk?.script || appliedScript.current === key) return;
    appliedScript.current = key;
    setSaid((s) => (s.script === talk.script ? s : { ...s, script: talk.script! }));
  }, [talk]);

  // once per step, while this page is open: a start or failure scrolls into view on a phone, and the editor opens
  // once your video is handed over, or once the presenter's is being put together
  useEffect(() => {
    if (!job || job.writeOnly) return;
    const step = `${job.id}:${job.state}`;
    if (seen.current === step) return;
    const live = seen.current !== null;
    seen.current = step;
    if (!live) return;
    if (job.state === "done" || (job.state === "joining" && job.who === "presenter")) navigate(links.edit());
    else if (!window.matchMedia("(min-width: 1024px)").matches) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [job, navigate]);

  const pickKey = typed.behind?.key ?? "";
  useEffect(() => {
    if (!pickKey) return setBehindUrl(undefined);
    let live = true;
    let url = "";
    getFile(pickKey)
      .then((b) => live && setBehindUrl(b ? (url = URL.createObjectURL(b)) : null))
      .catch(() => live && setBehindUrl(null));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pickKey]);

  const busy = greenBusy() && !job?.writeOnly;
  const writing = job?.state === "writing" && !!job.writeOnly;
  const priced = job?.state === "priced" && !!talk?.real;
  const locked = busy || writing || priced;
  const gone = !!params.get("source") && !source;
  const pick: BehindPick | null = typed.behind && behindUrl !== null && typed.behind.kind === behind ? typed.behind : null;
  const note = { title: typed.title, items: typed.items };
  const writeFirst = behind === "notes" && !!listPlan(note, source);

  // the presenter: the talking head page's rules
  const pending = pendingAvatar();
  const oursWaiting = !!pending && ownsPending(pending) && joinAdd()?.name === pending.name && joinAdd()?.extra.toast === GREEN_TOAST;
  const elsewhere = !busy && (aiBusy() || (!!pending && !oursWaiting));
  const scriptPlan = writePlan(said.script, length, source);
  const n = wordCount(said.script);
  const talkSpend = who === "presenter" ? { length, write: !!scriptPlan, presenter: !madePresenter(said.look, setting) } : null;
  const talkReason =
    who !== "presenter" ? null
    : oursWaiting ? PAID_WAITING
    : elsewhere ? OTHER_VIDEO
    : !scriptPlan && n < 3 ? "Type what they say, or a topic to write it from."
    : said.look.trim().length < 10 ? "Describe your presenter first."
    : null;
  const spend = { write: writeFirst, talk: talkSpend, minutes: who === "mine" ? mine?.minutes ?? null : null };
  const { cap, caps } = greenCaps(spend);
  const realUsd = priced ? talk!.real!.price.usd.toFixed(2) : "";
  const reason = priced
    ? `The voiceover runs ${Math.round(talk!.real!.seconds)} seconds, so this costs about US$${realUsd}.`
    : busy ? null
    : greenReason({ who, behind, person: who === "mine" && !mine ? "none" : person, note, source, pick, talk: talkReason });
  const retry = job?.state === "failed" && !job.writeOnly && !job.refused && !job.waiting && !job.gone;

  const pickMine = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) return setPerson("none");
    const id = ++checking.current;
    setMine({ file: f, minutes: null });
    setPerson(cutoutReady() ? "looking" : "loading");
    const [seconds, found] = await Promise.all([mediaLength(f).catch(() => NaN), findsPerson(f).catch(() => null)]);
    if (checking.current !== id) return;
    setMine({ file: f, minutes: Number.isFinite(seconds) && seconds > 0 ? seconds / 60 : null });
    // a check that couldn't run (the model didn't load) never blocks: the editor shows the person as it finds them
    setPerson(found === false ? "nobody" : "found");
  };
  const pickBehind = async (f: File | undefined, kind: "demo" | "picture") => {
    if (!f) return;
    const noun = kind === "demo" ? "video" : "picture";
    const max = kind === "demo" ? 200 : 15;
    if (!f.type.startsWith(kind === "demo" ? "video/" : "image/")) return setPickError(`That isn't a ${noun}.`);
    if (f.size > max * 1024 * 1024) return setPickError(`That ${noun} is over ${max} MB.`);
    setPickError("");
    setSaving(true);
    try {
      // shortcut: a replaced pick's file stays on this device, like the editor's own backdrops; clear them if space runs short
      const key = bdKey();
      await putFile(key, f);
      setTyped((t) => ({ ...t, behind: { kind, key, name: f.name } }));
    } catch {
      setPickError(`Couldn't keep the ${noun} on this device.`);
    } finally {
      setSaving(false);
    }
  };
  const ask = () => ({
    source,
    mention: mention !== "no",
    who,
    behind,
    stand,
    title: typed.title,
    items: typed.items,
    pick,
    mine: mine?.file ?? null,
    talk: { text: said.script, look: said.look, setting, voice, length },
  });
  const makeIt = () => {
    if (reason || greenBusy()) return;
    seen.current = "start";
    void startGreen(userId, ask());
  };
  const tryAgainFree = () => {
    if (resumeGreen(userId)) seen.current = "start";
  };
  const setItem = (i: number, v: string) => setTyped((t) => ({ ...t, items: t.items.map((x, j) => (j === i ? v : x)) }));
  const items = typed.items.length ? typed.items : [""];

  const options = (
    <fieldset disabled={locked} className="min-w-0 space-y-5">
      {(source || gone) && (
        <Card className="border-border/60 shadow-card">
          <CardContent className="pt-4 sm:pt-5">
            {gone ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">That post isn't on this device any more.</p>
            ) : (
              source && (
                <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                  {source.cover && <img src={source.cover} alt="" className="h-14 w-11 shrink-0 rounded object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{source.title || source.caption || "A post"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{metaOf(source)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => update({ source: null })} className={TOUCH}>Remove</Button>
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          <Field label="Who talks">
            {GREEN_WHO.map((w) => (
              <FilterChip key={w} active={who === w} onClick={() => setWho(w)}>{WHO_LABELS[w]}</FilterChip>
            ))}
          </Field>
          {who === "mine" ? (
            <div className="space-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <label className={PICK}>
                  {mine ? "Change video" : "Pick a video"}
                  <input type="file" accept="video/*" className="sr-only" onChange={(e) => { void pickMine(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {mine && <span className="min-w-0 truncate text-xs text-muted-foreground">{mine.file.name}</span>}
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {person === "loading" ? CUTOUT_LOADING : person === "looking" ? "Looking for you in the video..." : "One person facing the camera works best."}
              </p>
              {person === "nobody" && <p className="text-xs text-destructive" role="alert">{NO_PERSON}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="make-green-script" className={FIELD_LABEL}>What they say</Label>
                <Textarea id="make-green-script" rows={4} value={said.script} maxLength={600} placeholder="What they say, or a topic to write it from"
                  onChange={(e) => setSaid({ ...said, script: e.target.value })} />
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {wordLine(n, length)}
                  {scriptPlan && <> {scriptPlan === "source" ? "Make the video writes what they say from this post first." : "Make the video writes what they say from this topic first."}</>}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {madePresenter(said.look, setting) && <img src={madePresenter(said.look, setting)!} alt="Your AI presenter" className="h-40 w-24 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1 space-y-2">
                  <Textarea rows={3} value={said.look} maxLength={MAX_LOOK} aria-label="How your presenter looks" className="text-sm"
                    onChange={(e) => setSaid({ ...said, look: e.target.value })} />
                  <Button size="sm" variant="outline" className={TOUCH} onClick={() => setSaid({ ...said, look: LOOKS[(LOOKS.indexOf(said.look) + 1) % LOOKS.length] })}>
                    Another look
                  </Button>
                  <p className="text-xs text-muted-foreground">The person is made by AI.</p>
                </div>
              </div>
              <Field label="Setting">
                {TALK_SETTINGS.map((s) => (
                  <FilterChip key={s.id} active={setting === s.id} onClick={() => setSetting(s.id)}>{s.label}</FilterChip>
                ))}
              </Field>
              <Field label="Voice">
                {VOICE_IDS.map((v) => (
                  <FilterChip key={v} active={voice === v} onClick={() => setVoice(v)}>{VOICES[v].label}, {VOICES[v].note}</FilterChip>
                ))}
              </Field>
              <Field label="Length">
                {TALK_LENGTHS.map((s) => (
                  <FilterChip key={s} active={length === s} onClick={() => setLength(String(s))}>{s} s</FilterChip>
                ))}
              </Field>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          <Field label="Behind them">
            {GREEN_BEHIND.map((b) => (
              <FilterChip key={b} active={behind === b} onClick={() => setBehind(b)}>{BEHIND_LABELS[b]}</FilterChip>
            ))}
          </Field>
          {behind === "notes" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="make-green-title" className={FIELD_LABEL}>Title</Label>
                <Input id="make-green-title" value={typed.title} maxLength={120} placeholder="Like how I stopped overspending"
                  onChange={(e) => setTyped({ ...typed, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={FIELD_LABEL}>Items</p>
                  <Button size="sm" variant="outline" onClick={() => void writeList(userId, ask())} disabled={!canWriteList(typed.title, source) || left("remix-make") === 0} className={`gap-1.5 ${TOUCH}`}>
                    {writing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    Write it for me
                  </Button>
                </div>
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input value={it} maxLength={120} aria-label={`Item ${i + 1}`} placeholder={i === 0 ? "Wait 24 hours before any buy over $50" : ""}
                      onChange={(e) => (typed.items.length ? setItem(i, e.target.value) : setTyped({ ...typed, items: [e.target.value] }))} />
                    {typed.items.length > 1 && (
                      <Button size="icon" variant="ghost" aria-label={`Remove item ${i + 1}`} className={`h-9 w-9 shrink-0 ${TOUCH}`}
                        onClick={() => setTyped({ ...typed, items: typed.items.filter((_, j) => j !== i) })}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {items.length < NOTE_ITEMS ? (
                    <Button size="sm" variant="ghost" className={`-ml-2 gap-1 ${TOUCH}`} onClick={() => setTyped({ ...typed, items: [...items, ""] })}>
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </Button>
                  ) : <span />}
                  {canWriteList(typed.title, source) && <span className="pt-2 text-xs"><PriceChip feature="remix-make" left={left("remix-make")} /></span>}
                </div>
                {writeFirst && !noteItems(typed.items).length && (
                  <p className="text-xs text-muted-foreground">{source ? "Make the video writes the list from this post first." : "Make the video writes the list from this title first."}</p>
                )}
                {job?.writeOnly && job.state === "failed" && <p className="text-xs text-destructive" role="alert">{job.error}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <label className={PICK}>
                  {saving ? "Keeping it on this device..." : pick ? (behind === "demo" ? "Change video" : "Change picture") : behind === "demo" ? "Pick a video" : "Pick a picture"}
                  <input type="file" accept={behind === "demo" ? "video/*" : "image/*"} className="sr-only" disabled={saving}
                    onChange={(e) => { void pickBehind(e.target.files?.[0], behind); e.target.value = ""; }} />
                </label>
                {pick && <span className="min-w-0 truncate text-xs text-muted-foreground">{pick.name}</span>}
              </div>
              {pickError || (typed.behind?.kind === behind && behindUrl === null) ? (
                <p className="text-xs text-destructive" role="alert">{pickError || "That file isn't on this device any more. Pick it again."}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{behind === "demo" ? "It plays muted and loops. Up to 200 MB." : "A screenshot works too. Up to 15 MB."}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="pt-4 sm:pt-5">
          <Field label="Where they stand">
            {STANDS.map((s) => (
              <FilterChip key={s} active={stand === s} onClick={() => setStand(s)}>{STAND_LABELS[s]}</FilterChip>
            ))}
          </Field>
        </CardContent>
      </Card>
      {priced && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
          <p className="min-w-0">Your voiceover is kept, so going on doesn't pay for it again.</p>
          <Button size="sm" variant="ghost" onClick={() => dropTalk()} className={TOUCH}>Shorten the script</Button>
        </div>
      )}
    </fieldset>
  );

  const stepText = job?.state === "talking" || job?.state === "joining" ? job.step || talk?.step || "Making your presenter..." : job?.step;
  const result = (
    <div ref={resultRef} className="scroll-mt-16 space-y-3 lg:scroll-mt-0">
      {busy && job ? (
        <Frame>
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <span role="status">{stepText}</span>
          {job.state === "joining" && <Button variant="link" onClick={() => navigate(links.edit())} className={TOUCH}>Open the editor</Button>}
        </Frame>
      ) : job?.state === "failed" && !job.writeOnly ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {job.error}
          </p>
          {job.waiting && oursWaiting && <Button size="sm" onClick={tryAgainFree} className={TOUCH}>Try again at no cost</Button>}
        </div>
      ) : job?.state === "done" ? (
        <Frame>
          <p className="font-medium text-foreground">Your green screen is ready.</p>
          <Button onClick={() => navigate(links.edit())} className={TOUCH}>Open it in the editor</Button>
        </Frame>
      ) : (
        <div className="space-y-2">
          {oursWaiting && !talk && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
              <p className="min-w-0">{PAID_WAITING}</p>
              <Button size="sm" onClick={tryAgainFree} className={TOUCH}>Try again at no cost</Button>
            </div>
          )}
          <Preview
            behind={behind}
            stand={stand}
            src={behind === "notes" ? (measure ? svgDataUrl(noteSvg(layoutNote(note, measure))) : null) : pick ? behindUrl ?? null : null}
          />
        </div>
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
        cap,
        price: priced ? talk!.real!.price : greenPrice(spend),
        caps: priced ? undefined : caps,
        label: priced ? `Make it for US$${realUsd}` : retry ? "Try again" : "Make the video",
        busyLabel: "Making...",
        busy,
        disabled: busy || writing || (!!reason && !priced),
        reason,
        secondary: job?.state === "done",
        onMake: priced ? () => { seen.current = "start"; void goOn(userId); } : makeIt,
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** A dashed 9:16 frame: while a make runs, and once it is waiting for the editor. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** What goes behind (the note, the demo's first frame or the picture) with a grey person where they will stand. */
function Preview({ behind, stand, src }: { behind: GreenBehind; stand: Stand; src: string | null }) {
  const b = standBox(stand, 9, 16, 9, 16);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="mx-auto w-full max-w-[300px] space-y-2">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border/60 bg-muted">
        {src && behind === "demo" ? (
          <video src={`${src}#t=0.1`} muted playsInline preload="metadata" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        ) : src ? (
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-x-0 top-1/3 px-6 text-center text-xs text-muted-foreground">{behind === "demo" ? "Your demo shows here." : "Your picture shows here."}</span>
        )}
        <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMax meet" aria-hidden className="absolute"
          style={{ left: pct(b.x, 9), top: pct(b.y, 16), width: pct(b.w, 9), height: pct(b.h, 16) }}>
          <circle cx="45" cy="64" r="17" fill="#9CA3AF" fillOpacity="0.9" />
          <path d="M10 160 C10 118 24 92 45 92 C66 92 80 118 80 160 Z" fill="#9CA3AF" fillOpacity="0.9" />
        </svg>
      </div>
    </div>
  );
}
