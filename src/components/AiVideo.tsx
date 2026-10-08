import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUsesLeft } from "@/lib/aiUsage";
import { VOICES, VOICE_IDS, speak, type VoiceId } from "@/lib/textVoice";
import {
  LOOKS, MAX_AVATAR_SECONDS, MAX_LOOK, MAX_TOPIC, aiJob, avatarCredits, creditsUsd, explainerCredits, makeAvatar,
  makeExplainer, makePresenter, onAiJob, pendingAvatar, resumeAvatar, sliceVoiceover, writeExplainer,
  type AiJob, type Scene, type Voiceover,
} from "@/lib/aiVideo";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const secs = (t: number) => `${Math.round(t)} seconds`;
const cost = (credits: number) => `${credits} Higgsfield credits (about US$${creditsUsd(credits).toFixed(2)})`;

/** Edit a video's start screen: a video made without filming, of you or a presenter speaking, or an explainer. */
export default function AiVideo({ onClose }: { onClose: () => void }) {
  const [job, setJob] = useState<AiJob | null>(aiJob());
  useEffect(() => onAiJob(setJob), []);
  // an avatar video paid for but never put together (a reload) carries on by itself
  useEffect(() => resumeAvatar(), []);
  const [tab, setTab] = useState<"avatar" | "explainer">(job?.kind === "explainer" ? "explainer" : "avatar");
  const busy = job?.state === "working";
  const left = useUsesLeft(busy);

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 p-4" aria-label="Make a video without filming">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Make a video without filming</h2>
        <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={onClose}>Close</Button>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Kind of video">
        <Pill on={tab === "avatar"} onClick={() => setTab("avatar")} disabled={busy}>You speaking</Pill>
        <Pill on={tab === "explainer"} onClick={() => setTab("explainer")} disabled={busy}>Explainer</Pill>
      </div>
      {tab === "avatar" ? <Avatar job={job} busy={busy} left={left} /> : <Explainer busy={busy} left={left} />}
      {busy && (
        <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
          <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> {job?.step}
        </p>
      )}
      {job?.state === "failed" && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-sm text-destructive">{job.error}</p>
          {job.kind === "avatar" && pendingAvatar() && (
            <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={resumeAvatar}>Try again at no cost</Button>
          )}
        </div>
      )}
    </section>
  );
}

type Left = ReturnType<typeof useUsesLeft>;

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
