import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUsesLeft } from "@/lib/aiUsage";
import { LEN_MAX, LEN_MIN, MAX_THEME, dismissMontage, montageBusy, montageJob, onMontageJob, startMontage, type MontageJob } from "@/lib/montage";
import { VOICES, VOICE_IDS, speak, type VoiceId } from "@/lib/textVoice";
import {
  CLIP_QUALITIES, CLIP_SECONDS, LOOKS, MAX_AVATAR_SECONDS, MAX_FIELD, MAX_LOOK, MAX_TOPIC, TEMPLATES, TEMPLATE_CREDIT, TEMPLATE_SOURCE,
  aiJob, avatarCredits, clipCredits, creditsUsd, examplesUrl, explainerCredits, makeAvatar, makeExplainer, makePresenter,
  makeTemplateClip, onAiJob, pendingAvatar, resumeAvatar, sliceVoiceover, writeExplainer,
  type AiJob, type ClipQuality, type ClipSeconds, type FieldKey, type PhotoRole, type Scene, type VideoTemplate, type Voiceover,
} from "@/lib/aiVideo";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const secs = (t: number) => `${Math.round(t)} seconds`;
const cost = (credits: number) => `${credits} Higgsfield credits (about US$${creditsUsd(credits).toFixed(2)})`;

/** Edit a video's start screen: a video made without filming, from a template, of you or a presenter speaking, or an explainer. */
export default function AiVideo({ onClose }: { onClose: () => void }) {
  const [job, setJob] = useState<AiJob | null>(aiJob());
  useEffect(() => onAiJob(setJob), []);
  // an avatar video paid for but never put together (a reload) carries on by itself
  useEffect(() => resumeAvatar(), []);
  const [tab, setTab] = useState<"template" | "montage" | "avatar" | "explainer">(
    montageBusy() || montageJob()?.state === "failed" ? "montage" : job?.kind === "explainer" ? "explainer" : job?.kind === "avatar" || job?.kind === "presenter" ? "avatar" : "template");
  const busy = job?.state === "working";
  const left = useUsesLeft(busy);

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 p-4" aria-label="Make a video without filming">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Make a video without filming</h2>
        <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={onClose}>Close</Button>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of video">
        <Pill on={tab === "template"} onClick={() => setTab("template")} disabled={busy}>From a template</Pill>
        <Pill on={tab === "montage"} onClick={() => setTab("montage")} disabled={busy}>Montage</Pill>
        <Pill on={tab === "avatar"} onClick={() => setTab("avatar")} disabled={busy}>You speaking</Pill>
        <Pill on={tab === "explainer"} onClick={() => setTab("explainer")} disabled={busy}>Explainer</Pill>
      </div>
      {tab === "template" ? <Templates busy={busy} left={left} /> : tab === "montage" ? <Montage busy={busy} left={left} /> : tab === "avatar" ? <Avatar job={job} busy={busy} left={left} /> : <Explainer busy={busy} left={left} />}
      {busy && (
        <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
          <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> {job?.step}
        </p>
      )}
      {job?.state === "failed" && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-sm text-destructive">{job.error}</p>
          {(job.kind === "avatar" || job.kind === "template") && pendingAvatar() && (
            <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={resumeAvatar}>Try again at no cost</Button>
          )}
        </div>
      )}
    </section>
  );
}

type Left = ReturnType<typeof useUsesLeft>;

const MONTAGE_STEP = { writing: "Planning the shots...", finding: "Finding clips", joining: "Putting your montage together...", done: "", failed: "" } as const;

/** A montage from a theme: stock clips that fit it, one look over all, words on screen, your own track if you add one. */
function Montage({ busy, left }: { busy: boolean; left: Left }) {
  const [job, setJob] = useState<MontageJob | null>(montageJob());
  useEffect(() => onMontageJob(setJob), []);
  const [theme, setTheme] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [words, setWords] = useState(true);
  const [music, setMusic] = useState<File | null>(null);
  const running = montageBusy();
  const off = busy || running;
  const uses = left("montage-beats");

  return (
    <div className="space-y-3">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void startMontage({ theme: theme.trim(), seconds, words, music }); }}>
        <Input value={theme} maxLength={MAX_THEME} onChange={(e) => { setTheme(e.target.value); dismissMontage(); }} disabled={off}
          placeholder="A theme, like Singapore mornings" aria-label="What the montage is about" className="h-11 sm:h-10" />
        <Button type="submit" className="h-11 shrink-0 sm:h-10" disabled={off || theme.trim().length < 3 || uses === 0}>
          {running ? "Making..." : "Make the montage"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1.5" role="group" aria-label="Length">
          {[LEN_MIN, 30, LEN_MAX].map((n) => <Pill key={n} on={seconds === n} disabled={off} onClick={() => setSeconds(n)}>{n} seconds</Pill>)}
        </div>
        <Pill on={words} disabled={off} onClick={() => setWords(!words)}>Words on screen</Pill>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 sm:h-9">
          {music ? "Change music" : "Add your music (optional)"}
          <input type="file" accept="audio/*" className="sr-only" disabled={off}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setMusic(f); }} />
        </label>
        {music && (
          <>
            <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{music.name}</span>
            <Button size="sm" variant="ghost" className="h-11 text-xs sm:h-9" disabled={off} onClick={() => setMusic(null)}>Remove</Button>
          </>
        )}
        <Left n={uses} what="Montages" />
      </div>
      {running && job && (
        <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
          <ThinkingOrb state="working" size={20} theme="light" aria-hidden />
          {job.state === "finding" ? `Finding clips, ${job.done} of ${job.of}...` : MONTAGE_STEP[job.state]}
        </p>
      )}
      {job?.state === "failed" && <p className="text-sm text-destructive" role="alert">{job.error}</p>}
    </div>
  );
}

/** The gallery: pick a look, fill its blanks, read its warnings and the cost, make one Seedance clip. */
function Templates({ busy, left }: { busy: boolean; left: Left }) {
  const [pick, setPick] = useState<VideoTemplate | null>(null);
  // kept across templates, so a product typed once carries over
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>({});
  const [photos, setPhotos] = useState<Partial<Record<PhotoRole, { file: File; url: string }>>>({});
  const [seconds, setSeconds] = useState<ClipSeconds>(8);
  const [quality, setQuality] = useState<ClipQuality>("720p");
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (!pick) {
    return (
      <div className="space-y-2">
        <ul className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setPick(t)} disabled={busy}
                className="flex h-full min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border border-border/70 p-3 text-left hover:border-primary/40 disabled:opacity-60">
                <span className="text-sm font-semibold">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
        <a href={TEMPLATE_SOURCE} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-muted-foreground underline">{TEMPLATE_CREDIT}</a>
      </div>
    );
  }

  const value = (k: FieldKey) => (fields[k] ?? "").trim();
  const ready = pick.fields.every((f) => !f.required || value(f.key)) && (!pick.needsPhoto || !!photos[pick.needsPhoto]);
  const clips = left("ai-clip");
  // one photo at a time: a person opens the clip as its first frame, which leaves no room for a product photo
  const chosen = pick.photos.find((role) => photos[role]);
  const make = () =>
    void makeTemplateClip(value(pick.fields.find((f) => f.required)!.key).slice(0, 40) || pick.title, {
      template: pick.id,
      seconds,
      quality,
      fields: Object.fromEntries(pick.fields.flatMap((f) => (value(f.key) ? [[f.key, value(f.key)]] : []))),
      photo: chosen ? { role: chosen, file: photos[chosen]!.file } : null,
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold">{pick.title}</h3>
        <div className="flex items-center">
          <a href={examplesUrl(pick.id)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center px-2 text-xs text-muted-foreground underline sm:h-9">Examples</a>
          <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={() => setPick(null)} disabled={busy}>All templates</Button>
        </div>
      </div>
      {pick.fields.map((f) => (
        <label key={f.key} className="block space-y-1">
          <span className="text-xs font-medium">{f.label}{f.required ? "" : " (optional)"}</span>
          <Input value={fields[f.key] ?? ""} maxLength={MAX_FIELD} placeholder={f.placeholder} disabled={busy} className="h-11 sm:h-10"
            onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
        </label>
      ))}
      <div className="flex flex-wrap gap-3">
        {(chosen ? [chosen] : pick.photos).map((role) => {
          const ph = photos[role];
          return (
            <div key={role} className="flex items-center gap-2">
              {ph && <img src={ph.url} alt={`The ${role}`} className="h-16 w-12 rounded-lg object-cover" />}
              <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 sm:h-9">
                {ph ? `Change ${role} photo` : `Photo of the ${role}${pick.needsPhoto === role ? "" : " (optional)"}`}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const url = URL.createObjectURL(file);
                    urls.current.push(url);
                    setPhotos({ ...photos, [role]: { file, url } });
                  }} />
              </label>
              {ph && <Button size="sm" variant="ghost" className="h-11 text-xs sm:h-9" disabled={busy} onClick={() => setPhotos({ ...photos, [role]: undefined })}>Remove</Button>}
            </div>
          );
        })}
      </div>
      <ul className="space-y-1" aria-label="Before you make it">
        {pick.warnings.map((w) => (
          <li key={w} className="flex items-start gap-1.5 text-xs"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden /> {w}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1.5" role="group" aria-label="Length">
          {CLIP_SECONDS.map((n) => <Pill key={n} on={seconds === n} disabled={busy} onClick={() => setSeconds(n)}>{n} seconds</Pill>)}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Quality">
          {CLIP_QUALITIES.map((q) => <Pill key={q} on={quality === q} disabled={busy} onClick={() => setQuality(q)}>{q}</Pill>)}
        </div>
      </div>
      <p className="text-sm">Costs {cost(clipCredits(seconds, quality))}.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-11 sm:h-10" disabled={busy || !ready || clips === 0} onClick={make}>Make the clip</Button>
        <Left n={clips} what="AI clips" />
      </div>
    </div>
  );
}

function Avatar({ job, busy, left }: { job: AiJob | null; busy: boolean; left: Left }) {
  const [face, setFace] = useState<"photo" | "presenter">("photo");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [look, setLook] = useState(() => LOOKS[Math.floor(Math.random() * LOOKS.length)]);
  const [presenter, setPresenter] = useState(job?.kind === "presenter" && job.state === "done" ? job.url ?? "" : "");
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState<VoiceId>("alice");
  const [vo, setVo] = useState<(Voiceover & { url: string }) | null>(null);
  const [voBusy, setVoBusy] = useState(false);
  const [voError, setVoError] = useState("");
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    if (job?.kind === "presenter" && job.state === "done" && job.url) setPresenter(job.url);
  }, [job]);

  const n = words(script);
  const makeVoice = async () => {
    setVoBusy(true);
    setVoError("");
    try {
      const mp3 = await speak(script, voice);
      const v = await sliceVoiceover(mp3);
      const url = URL.createObjectURL(mp3);
      urls.current.push(url);
      setVo({ ...v, url });
    } catch (e) {
      setVoError((e as Error).message);
    } finally {
      setVoBusy(false);
    }
  };
  const image = face === "photo" ? photo : presenter;
  const tooLong = !!vo && vo.seconds > MAX_AVATAR_SECONDS + 0.5;
  const credits = vo ? avatarCredits(vo.slices.map((s) => s.end - s.start)) : 0;
  const videos = left("ai-video");

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who speaks">
          <Pill on={face === "photo"} onClick={() => setFace("photo")} disabled={busy}>My photo</Pill>
          <Pill on={face === "presenter"} onClick={() => setFace("presenter")} disabled={busy}>AI presenter</Pill>
        </div>
        {face === "photo" ? (
          <div className="flex items-center gap-3">
            {photoUrl && <img src={photoUrl} alt="Your photo" className="h-24 w-20 rounded-lg object-cover" />}
            <div className="space-y-1">
              <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-sm font-semibold hover:border-primary/40 sm:h-9">
                {photo ? "Change photo" : "Pick a photo of your face"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const u = URL.createObjectURL(f);
                    urls.current.push(u);
                    setPhoto(f);
                    setPhotoUrl(u);
                  }} />
              </label>
              <p className="text-xs text-muted-foreground">Use a photo of yourself, or of someone who agreed to it.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            {presenter && <img src={presenter} alt="Your AI presenter" className="h-40 w-24 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1 space-y-2">
              <Textarea rows={2} value={look} maxLength={MAX_LOOK} onChange={(e) => setLook(e.target.value)} aria-label="How your presenter looks" className="text-sm" disabled={busy} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-11 sm:h-9" disabled={busy}
                  onClick={() => setLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length])}>Another look</Button>
                <Button size="sm" variant="outline" className="h-11 sm:h-9" disabled={busy || look.trim().length < 10 || left("ai-image") === 0}
                  onClick={() => void makePresenter(look.trim())}>{presenter ? "Make another presenter" : "Make the presenter"}</Button>
                <Left n={left("ai-image")} what="AI images" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Textarea rows={4} value={script} maxLength={600} disabled={busy}
          onChange={(e) => { setScript(e.target.value); setVo(null); }} aria-label="What you say"
          placeholder={`What you say, up to about ${MAX_AVATAR_SECONDS} seconds`} className="text-sm" />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Voice">
          {VOICE_IDS.map((v) => (
            <Pill key={v} on={voice === v} disabled={busy} onClick={() => { setVoice(v); setVo(null); }}>{VOICES[v].label}, {VOICES[v].note}</Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={vo ? "outline" : "default"} className="h-11 sm:h-9" onClick={() => void makeVoice()}
            disabled={busy || voBusy || n < 3 || left("ai-voice") === 0}>
            {voBusy ? "Making the voiceover..." : vo ? "Make the voiceover again" : "Make the voiceover"}
          </Button>
          {n > 0 && <span className="text-[11px] text-muted-foreground">{n} words, about {secs(n / 2.5)}</span>}
          <Left n={left("ai-voice")} what="Voiceovers" />
        </div>
        {voError && <p className="text-xs text-destructive" role="alert">{voError}</p>}
      </div>

      {vo && (
        <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <audio src={vo.url} controls className="w-full" aria-label="Your voiceover" />
          {tooLong ? (
            <p className="text-sm text-destructive" role="alert">It runs {secs(vo.seconds)}. Cut the script to about {MAX_AVATAR_SECONDS} seconds.</p>
          ) : (
            <p className="text-sm">{secs(vo.seconds)} in {vo.slices.length} {vo.slices.length === 1 ? "part" : "parts"}. Costs {cost(credits)}.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-11 sm:h-10" disabled={busy || tooLong || !image || videos === 0}
              onClick={() => void makeAvatar(script.trim().slice(0, 40) || "AI video", image!, vo)}>Make the video</Button>
            {!image && <span className="text-xs text-muted-foreground">{face === "photo" ? "Pick a photo first." : "Make the presenter first."}</span>}
            <Left n={videos} what="AI videos" />
          </div>
        </div>
      )}
    </div>
  );
}

function Explainer({ busy, left }: { busy: boolean; left: Left }) {
  const [topic, setTopic] = useState("");
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState<VoiceId>("eric");

  const write = async () => {
    setWriting(true);
    setError("");
    try {
      setScenes(await writeExplainer(topic.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWriting(false);
    }
  };
  const total = scenes ? scenes.reduce((n, s) => n + words(s.say), 0) : 0;
  const videos = left("ai-video");

  return (
    <div className="space-y-3">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void write(); }}>
        <Input value={topic} maxLength={MAX_TOPIC} onChange={(e) => setTopic(e.target.value)} disabled={busy || writing}
          placeholder="What it explains, like why a hospital plan has a co-pay" aria-label="What the explainer is about" className="h-11 sm:h-10" />
        <Button type="submit" variant={scenes ? "outline" : "default"} className="h-11 shrink-0 sm:h-10"
          disabled={busy || writing || topic.trim().length < 5 || left("ai-video-script") === 0}>
          {writing ? "Writing..." : scenes ? "Write it again" : "Write it"}
        </Button>
      </form>
      <Left n={left("ai-video-script")} what="Explainer scripts" />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {scenes && (
        <>
          <ol className="space-y-2">
            {scenes.map((s, i) => (
              <li key={i} className="space-y-1 rounded-xl border border-border/60 p-2">
                <Textarea rows={2} value={s.say} maxLength={300} disabled={busy} aria-label={`Scene ${i + 1}, what the voice says`} className="text-sm"
                  onChange={(e) => setScenes(scenes.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)))} />
                <p className="text-xs text-muted-foreground">Picture: {s.picture}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Voice">
            {VOICE_IDS.map((v) => <Pill key={v} on={voice === v} disabled={busy} onClick={() => setVoice(v)}>{VOICES[v].label}, {VOICES[v].note}</Pill>)}
          </div>
          <p className="text-sm">
            {scenes.length} pictures, about {secs(total / 2.5)}. Costs {cost(explainerCredits(scenes.length))} and 1 voiceover.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-11 sm:h-10" disabled={busy || videos === 0 || left("ai-voice") === 0 || scenes.some((s) => !s.say.trim())}
              onClick={() => void makeExplainer(topic.trim().slice(0, 40) || "Explainer", scenes.map((s) => ({ ...s, say: s.say.trim() })), voice)}>
              Make the video
            </Button>
            <Left n={videos} what="AI videos" />
          </div>
        </>
      )}
    </div>
  );
}

function Pill({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled}
      className={`h-11 rounded-full border px-3 text-xs font-semibold disabled:opacity-60 sm:h-8 ${on ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{children}</button>
  );
}

function Left({ n, what }: { n: number | null; what: string }) {
  if (n === null) return null;
  return <span className={`text-[11px] ${n ? "text-muted-foreground" : "font-medium text-destructive"}`}>{what}: {n ? `${n} left today` : "none left today"}</span>;
}
