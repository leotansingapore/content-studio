import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ComplianceChips from "@/components/ComplianceChips";
import PriceChip from "@/components/PriceChip";
import { useUsesLeft } from "@/lib/aiUsage";
import { scanCompliance } from "@/lib/compliance";
import { getFile, putFile } from "@/lib/deviceFiles";
import { loadBrand } from "@/lib/carousel";
import { links } from "@/lib/links";
import { priceOf, priceText, reasonText, sumPrices, type Price, type PriceOpts } from "@/lib/prices";
import {
  MAS_FLAG, SET_LABELS, TALKS, TALK_LABELS, TALK_SETTING, UNBOXING, isSetTalk, loadTalk, makeSet, notePresenter, offerAt, offerNames, onPresenterSet,
  onTalkScript, pickOffer, presenterFits, presenterSet, savedSet, saveTalk, takeScript, talkExtra, talkScript, writeTalkScript, type Talk,
} from "@/lib/presenter";
import { getDraftById } from "@/lib/draftHistory";
import { PictureTile } from "@/components/brand/ProductEditor";
import { loadProducts, productLabel, type Product } from "@/lib/products";
import { PICTURE_FAILED, pictureFile } from "@/lib/productScan";
import { fitScript, postFill, type PostFill } from "@/lib/scriptCaption";
import { useLeoOnly, useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { BANNER_MAX, MUSIC_LEVEL, defaultSettings, moveTake, styleLabel, withLook } from "@/lib/videoEdit";
import { defaultSkill, loadSkills } from "@/lib/videoSkills";
import type { JoinExtra } from "@/lib/videoMedia";
import {
  EXPLAINER_LOOKS, FROMS, FROM_LABELS, LOOK_IDS, MAX_SCRIPT, SCRIPT_LIMITS, STOCK_TIP, dismissWrite, findStockNow, loadDraft, loadLook, makeNarrated, narratedWrite,
  onDraft, onNarratedWrite, saveDraft, saveLook, scriptDrafts, stockOn, summaryLine, usesStock, writeNarrated, type From, type LookId, type NarratedScene, type Visuals,
} from "@/lib/explainer";
import { LEN_MAX, LEN_MIN, MAX_THEME, describe, dismissMontage, montageBusy, montageJob, onMontageJob, startMontage, type MontageJob } from "@/lib/montage";
import { VOICES, VOICE_IDS, speak, type VoiceId } from "@/lib/textVoice";
import {
  CLIP_QUALITIES, CLIP_SECONDS, LOOKS, MAX_AVATAR_SECONDS, MAX_FIELD, MAX_LOOK, MAX_TOPIC, MIN_SCENES, TEMPLATE_CREDIT, TEMPLATE_SOURCE,
  aiJob, avatarCredits, clipCredits, creditsUsd, examplesUrl, explainerCredits, makeAvatar, makeExplainer, makePresenter,
  makeTemplateClip, onAiJob, pendingAvatar, pendingExplainer, resumeAvatar, resumeExplainer, sceneReady, sliceVoiceover, writeExplainer,
  type AiJob, type ClipQuality, type ClipSeconds, type FieldKey, type PhotoRole, type Scene, type VideoTemplate, type Voiceover,
} from "@/lib/aiVideo";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";
import { editorTemplates } from "../../supabase/functions/ai-video/templates.ts";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const secs = (t: number) => `${Math.round(t)} seconds`;
const cost = (credits: number) => `${credits} Higgsfield credits (about US$${creditsUsd(credits).toFixed(2)})`;

const KINDS = ["template", "montage", "avatar", "explainer"] as const;
type Kind = (typeof KINDS)[number];

/** "What you say" holds 600 characters; a post fills it with whole sentences that also fit 30 s at 2.5 words a second. */
const SAY_MAX = 600;
const FILL = { say: SAY_MAX, sayWords: MAX_AVATAR_SECONDS * 2.5, theme: MAX_THEME, line: MAX_FIELD };

/** Edit a video's start screen: a video made without filming, from a template, of you or a presenter speaking, or an explainer. */
export default function AiVideo({ onClose }: { onClose: () => void }) {
  const [job, setJob] = useState<AiJob | null>(aiJob());
  useEffect(() => onAiJob(setJob), []);
  // an avatar video, or Leo's narrated video, paid for but never put together (a reload) carries on by itself
  useEffect(() => {
    resumeAvatar();
    resumeExplainer();
  }, []);
  // Leo: the explainer is the narrated video (formats-faceless-video, formats-animated); everyone else keeps today's
  const user = useLeoUser();
  // ?kind= (docs/deep-links.md); without one, the kind of video being made or that just failed
  const [running] = useState<Kind>(() =>
    montageBusy() || montageJob()?.state === "failed" ? "montage" : job?.kind === "explainer" ? "explainer" : job?.kind === "avatar" || job?.kind === "presenter" ? "avatar" : "template");
  const [tab, setTab] = useUrlState<Kind>("kind", running, { allowed: KINDS });
  const busy = job?.state === "working";
  const left = useUsesLeft(busy);

  // edit-video, Leo only: ?draft=<id> fills the kind's form from that post and stays while the panel is open; a post
  // that is gone (deleted, or another brand's) says so and leaves the address. Everyone else's panel ignores it.
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const draftId = user ? params.get("draft") : null;
  const entry = useMemo(() => (user && draftId ? getDraftById(user.id, draftId) : null), [user, draftId]);
  const fill = useMemo(() => (entry ? postFill(entry, FILL) : null), [entry]);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!user || !draftId || entry) return;
    setGone(true);
    update({ draft: null });
  }, [user, draftId, entry, update]);
  const clearPost = () => {
    update({ draft: null });
    // a narrated video filled from this post keeps its typed words but no longer saves to it
    if (user && loadDraft(user.id).fromDraft === draftId) saveDraft(user.id, { fromDraft: undefined });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 p-4" aria-label="Make a video without filming">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Make a video without filming</h2>
        <div className="flex items-center">
          {user && <Link to={links.make()} className="inline-flex h-11 items-center whitespace-nowrap px-2 text-xs font-medium text-primary underline-offset-2 hover:underline sm:h-9 [@media(pointer:coarse)]:h-11">See every format</Link>}
          <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={onClose}>Close</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of video">
        <Pill on={tab === "template"} onClick={() => setTab("template")} disabled={busy}>From a template</Pill>
        <Pill on={tab === "montage"} onClick={() => setTab("montage")} disabled={busy}>Montage</Pill>
        <Pill on={tab === "avatar"} onClick={() => setTab("avatar")} disabled={busy}>You speaking</Pill>
        <Pill on={tab === "explainer"} onClick={() => setTab("explainer")} disabled={busy}>{user ? "Narrated video" : "Explainer"}</Pill>
      </div>
      {user && !busy && <FromPost draftId={draftId} fill={fill} gone={gone} cut={tab === "avatar" && !!fill?.say.left} onClear={clearPost} />}
      {tab === "template" ? <Templates busy={busy} left={left} fill={fill} />
        : tab === "montage" ? <Montage busy={busy} left={left} fill={fill} />
        : tab === "avatar" ? <Avatar job={job} busy={busy} left={left} fill={fill} />
        : user ? <Narrated userId={user.id} busy={busy} />
        : <Explainer busy={busy} left={left} />}
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
          {job.kind === "explainer" && pendingExplainer() && (
            <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={resumeExplainer}>Try again at no cost</Button>
          )}
        </div>
      )}
    </section>
  );
}

type Left = ReturnType<typeof useUsesLeft>;

const MONTAGE_STEP = { writing: "Planning the shots...", finding: "Finding clips", joining: "Putting your montage together...", done: "", failed: "" } as const;

/** A montage from a theme: stock clips that fit it, one look over all, words on screen, your own track if you add one. */
function Montage({ busy, left: panelLeft, fill }: { busy: boolean; left: Left; fill: PostFill | null }) {
  const [job, setJob] = useState<MontageJob | null>(montageJob());
  useEffect(() => onMontageJob(setJob), []);
  const [theme, setTheme] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [words, setWords] = useState(true);
  const [music, setMusic] = useState<File | null>(null);
  const running = montageBusy();
  const off = busy || running;
  const makeRef = useRef<HTMLButtonElement>(null);
  useFill(fill, off, (f) => {
    setTheme(f?.theme ?? "");
    if (f) focusSoon(makeRef);
  });
  const leo = useLeoOnly();
  // Leo's chip says what is left after this run, so his count is read again after a montage too
  const mine = useUsesLeft(off || !leo);
  const uses = (leo ? mine : panelLeft)("montage-beats");

  return (
    <div className="space-y-3">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void startMontage({ theme: theme.trim(), seconds, words, music, draftId: fill?.id }); }}>
        <Input value={theme} maxLength={MAX_THEME} onChange={(e) => { setTheme(e.target.value); dismissMontage(); }} disabled={off}
          placeholder="A theme, like Singapore mornings" aria-label="What the montage is about" className="h-11 sm:h-10" />
        <Button ref={makeRef} type="submit" className="h-11 shrink-0 sm:h-10" disabled={off || theme.trim().length < 3 || uses === 0}>
          {running ? "Making..." : "Make the montage"}
        </Button>
      </form>
      {leo && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:text-right">
          <Left n={uses} what="Montages" feature="montage-beats" busy={off} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1.5" role="group" aria-label="Length">
          {[LEN_MIN, 30, LEN_MAX].map((n) => <Pill key={n} on={seconds === n} disabled={off} onClick={() => setSeconds(n)}>{n} seconds</Pill>)}
        </div>
        <Pill on={words} disabled={off} onClick={() => setWords(!words)}>Words on screen</Pill>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 sm:h-9 [@media(pointer:coarse)]:h-11">
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
        {!leo && <Left n={uses} what="Montages" feature="montage-beats" />}
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
function Templates({ busy, left, fill }: { busy: boolean; left: Left; fill: PostFill | null }) {
  // ?template=<id> opens its form (push, so Back goes back to the gallery)
  const [templateId, openTemplate, closeTemplate] = useUrlItem("template");
  // kept across templates, so a product typed once carries over
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>({});
  // a post's first spoken sentence is "What they say" on every template that has that field
  useFill(fill, busy, (f) => setFields((x) => ({ ...x, line: f?.line ?? "" })));
  const [photos, setPhotos] = useState<Partial<Record<PhotoRole, { file: File; url: string }>>>({});
  const [seconds, setSeconds] = useState<ClipSeconds>(8);
  const [quality, setQuality] = useState<ClipQuality>("720p");
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const leo = useLeoOnly();
  // format pages make the hidden ones; the skits show for Leo only (the server refuses both for anyone else)
  const shown = editorTemplates(leo);
  const pick: VideoTemplate | null = shown.find((t) => t.id === templateId) ?? null;
  // Unboxing (formats-presenter, Leo only): ?offer=<n> fills "Your product" with that brand kit offer once, then leaves
  const user = useLeoUser();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const offerParam = params.get("offer");
  useEffect(() => {
    if (!user || offerParam === null || templateId !== UNBOXING) return;
    const name = offerAt(offerNames(user.id), offerParam);
    if (name) setFields((f) => ({ ...f, product: name }));
    update({ offer: null });
  }, [user, offerParam, templateId, update]);
  // brand-products, Leo only: a saved product fills the product slot with its first picture (fetched again when this
  // device lacks it) and the product field with its name, or its general kind for a named insurer product. One photo a
  // clip, so a person photo goes. ?product=<id> does it once, then leaves; "From your products" does it on a press.
  const saved = useMemo(() => (user ? loadProducts(user.id).items : []), [user]);
  const [taking, setTaking] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [productLine, setProductLine] = useState("");
  const takeProduct = async (p: Product) => {
    if (!user) return;
    setTaking(p.id);
    setProductLine("");
    setFields((f) => ({ ...f, product: productLabel(p).slice(0, MAX_FIELD) }));
    const file = await pictureFile(user.id, p).catch(() => null);
    setTaking(null);
    if (!file) return setProductLine(p.pictures[0] ? PICTURE_FAILED : "");
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setPhotos({ product: { file, url } });
    setProductId(p.id);
  };
  const productParam = params.get("product");
  useEffect(() => {
    if (!user || productParam === null) return;
    update({ product: null });
    const p = loadProducts(user.id).items.find((x) => x.id === productParam);
    if (p && pick?.photos.includes("product")) void takeProduct(p);
    // read once per link: takeProduct and pick are this render's
  }, [user, productParam, update]);
  // Leo is asked before a clip that costs a dollar or more (the default 8 s at 720p does), as You speaking and Narrated video ask
  const [asking, setAsking] = useState(false);
  const clipPrice = priceOf("ai-clip", { seconds, quality });
  const askFirst = leo && !!clipPrice && clipPrice !== "pick" && clipPrice.usd >= 1;

  if (!pick) {
    return (
      <div className="space-y-2">
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => openTemplate(t.id)} disabled={busy}
                className="flex h-full min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border border-border/70 p-3 text-left hover:border-primary/40 disabled:opacity-60">
                <span className="text-sm font-semibold">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
        <a href={TEMPLATE_SOURCE} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-muted-foreground underline [@media(pointer:coarse)]:py-3.5">{TEMPLATE_CREDIT}</a>
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
    }, fill ? { extra: { draftId: fill.id } } : undefined);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold">{pick.title}</h3>
        <div className="flex items-center">
          <a href={examplesUrl(pick.id)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center px-2 text-xs text-muted-foreground underline sm:h-9 [@media(pointer:coarse)]:h-11">Examples</a>
          <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={closeTemplate} disabled={busy}>All templates</Button>
        </div>
      </div>
      {pick.fields.map((f) => (
        <label key={f.key} className="block space-y-1">
          <span className="text-xs font-medium">{f.label}{f.required ? "" : " (optional)"}</span>
          <Input value={fields[f.key] ?? ""} maxLength={MAX_FIELD} placeholder={f.placeholder} disabled={busy} className="h-11 sm:h-10"
            onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
        </label>
      ))}
      {user && saved.length > 0 && pick.photos.includes("product") && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">From your products</p>
          <ul className="flex flex-wrap gap-2">
            {saved.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => void takeProduct(p)} disabled={busy || !!taking} aria-label={`Use ${p.name}`} aria-pressed={productId === p.id && !!photos.product}
                  className={`relative block w-14 space-y-0.5 rounded-lg text-left disabled:opacity-60 ${productId === p.id && photos.product ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary/40"}`}>
                  {p.pictures[0] ? <PictureTile userId={user.id} pictureKey={p.pictures[0]} source={p.sources[0]} name={p.name} className="h-14 w-14" fetchMissing={false} />
                    : <span className="block h-14 w-14 rounded-lg border border-border/60 bg-muted" aria-hidden />}
                  {taking === p.id && <span className="absolute inset-x-0 top-0 flex h-14 items-center justify-center rounded-lg bg-background/60"><ThinkingOrb state="working" size={20} theme="light" aria-hidden /></span>}
                  <span className="block truncate text-[10px] text-muted-foreground">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {productLine && <p className="text-xs text-destructive" role="alert">{productLine}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {(chosen ? [chosen] : pick.photos).map((role) => {
          const ph = photos[role];
          return (
            <div key={role} className="flex items-center gap-2">
              {ph && <img src={ph.url} alt={`The ${role}`} className="h-16 w-12 rounded-lg object-cover" />}
              <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 sm:h-9 [@media(pointer:coarse)]:h-11">
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
      {!leo && <p className="text-sm">Costs {cost(clipCredits(seconds, quality))}.</p>}
      {user && <CaptionsLine userId={user.id} />}
      {asking && !busy && clipPrice && clipPrice !== "pick" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">This makes a clip and uses {priceText(clipPrice).replace(/^\w/, (c) => c.toLowerCase())} of video credit. Make it?</p>
          <div className="flex items-center gap-2">
            <Button className="h-11 sm:h-10" onClick={() => { setAsking(false); make(); }}>Make it</Button>
            <Button variant="ghost" className="h-11 text-muted-foreground sm:h-10" onClick={() => setAsking(false)}>Not now</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-11 sm:h-10" disabled={busy || !ready || clips === 0} onClick={() => (askFirst ? setAsking(true) : make())}>Make the clip</Button>
          <Left n={clips} what="AI clips" feature="ai-clip" opts={{ seconds, quality }} busy={busy} />
        </div>
      )}
    </div>
  );
}

function Avatar({ job, busy, left: panelLeft, fill }: { job: AiJob | null; busy: boolean; left: Left; fill: PostFill | null }) {
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
  const leo = useLeoOnly();
  // Leo's chips say what is left after this run, so his counts are read again after a voiceover too
  const mine = useUsesLeft(busy || voBusy || !leo);
  const left = leo ? mine : panelLeft;
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    if (job?.kind === "presenter" && job.state === "done" && job.url) setPresenter(job.url);
  }, [job]);

  // formats-presenter, Leo only: the Format row (?talk=, replace; the brand's last pick when absent) and everyone
  // else's You speaking exactly as before, a typed talk= or offer= ignored
  const user = useLeoUser();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const kept = useMemo(() => (user ? loadTalk(user.id) : null), [user]);
  const [talkParam, setTalkParam] = useUrlState<Talk>("talk", kept?.talk ?? "plain", { allowed: TALKS });
  const talk: Talk = user ? talkParam : "plain";
  const offers = useMemo(() => (user ? offerNames(user.id) : []), [user]);
  const offer = pickOffer(offers, params.get("offer"), kept?.offer);
  const offerName = offer === null ? null : offers[offer];
  const [offerPic, setOfferPic] = useState<{ file: File; url: string } | null>(null);
  const [headline, setHeadline] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Write it for me runs outside React (presenter.ts): its script lands in this box, or the next one opened
  const [scriptJob, setScriptJob] = useState(talkScript);
  const scriptRef = useRef(script);
  scriptRef.current = script;
  useEffect(() => {
    const take = (j: ReturnType<typeof talkScript>) => {
      setScriptJob(j);
      const s = takeScript();
      if (!s?.say) return;
      if (scriptRef.current.trim() && scriptRef.current !== s.say) setUndo(scriptRef.current);
      setScript(s.say);
      setHeadline(s.headline ?? "");
      setVo(null);
    };
    take(talkScript());
    return onTalkScript(take);
  }, []);
  // a post's script (edit-video): filled once, then the voiceover is the next press
  const voiceRef = useRef<HTMLButtonElement>(null);
  useFill(fill, busy, (f) => {
    setScript(f?.say.text ?? "");
    setVo(null);
    setUndo(null);
    if (f) focusSoon(voiceRef);
  });
  // the empty set behind your own photo: made once (presenter.ts), then reused from this device
  const setTalk = isSetTalk(talk) ? talk : null;
  const [behind, setBehind] = useState<"keep" | "set">("keep");
  const [setJob, setSetJob] = useState(presenterSet);
  useEffect(() => onPresenterSet((j) => {
    setSetJob(j);
    if (j?.state === "failed") setBehind("keep");
  }), []);
  const setKey = setTalk ? (setJob?.talk === setTalk && setJob.key) || savedSet(setTalk) : null;
  const [setUrl, setSetUrl] = useState("");
  useEffect(() => {
    let url = "";
    let live = true;
    if (setKey) void getFile(setKey).then((b) => live && setSetUrl(b ? (url = URL.createObjectURL(b)) : ""), () => live && setSetUrl(""));
    else setSetUrl("");
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [setKey]);
  useEffect(() => setAsking(false), [vo]);

  const chooseTalk = (t: Talk) => {
    setTalkParam(t);
    if (user) saveTalk(user.id, { talk: t, ...(offer !== null ? { offer } : {}) });
  };
  const chooseOffer = (i: number) => {
    update({ offer: String(i) });
    if (user) saveTalk(user.id, { talk, offer: i });
  };
  // Unboxing is the Creator review template, its product filled from the offer once (push, so Back comes back here)
  const unboxing = () => update({ kind: "template", template: UNBOXING, talk: null, offer: offer === null ? null : String(offer) }, { push: true });
  // the box holds the script just written (or a script too long to be a topic): write again from the same topic
  const again = !!scriptJob?.topic && ((scriptJob.state === "done" && script === scriptJob.say) || script.trim().length > MAX_TOPIC);
  const topic = again ? scriptJob!.topic : script.trim();
  const canWrite = topic.length >= 5 && topic.length <= MAX_TOPIC;
  const writing = scriptJob?.state === "writing";
  const write = () => talk !== "plain" && void writeTalkScript({ talk, topic, offer: offerName });
  const flags = useMemo(() => {
    if (!user) return [];
    const mas = scriptJob?.state === "done" && scriptJob.mas && scriptJob.say === script ? [MAS_FLAG] : [];
    return [...scanCompliance(script), ...mas].filter((f) => !dismissed.has(f.id));
  }, [user, script, scriptJob, dismissed]);

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
  // a presenter made for another format's setting is not this one's
  const shown = !user || presenterFits(talk) ? presenter : "";
  const image = face === "photo" ? photo : shown;
  const tooLong = !!vo && vo.seconds > MAX_AVATAR_SECONDS + 0.5;
  const credits = vo ? avatarCredits(vo.slices.map((s) => s.end - s.start)) : 0;
  const videos = left("ai-video");
  const price = vo ? priceOf("ai-video", { slices: vo.slices.map((s) => s.end - s.start) }) : null;
  // Leo's dearer presses ask first (phase 1: anything over about a dollar)
  const askFirst = !!user && !!price && price !== "pick" && price.usd >= 1;
  const make = async () => {
    setAsking(false);
    let topKey: string | undefined;
    if (user && talk === "spokesperson" && offerPic) {
      // the picture rides to the join as a device file key (JoinExtra stays JSON); one that can't be kept leaves the plain video
      topKey = `offer-${Date.now().toString(36)}`;
      await putFile(topKey, offerPic.file).catch(() => (topKey = undefined));
    }
    const talked = user
      ? talkExtra({ talk, headline, setKey: face === "photo" && behind === "set" && setUrl ? setKey : null, offer: offerName, brand: loadBrand(user.id)?.name, topKey })
      : undefined;
    // made from a post: the editor saves its caption back there, even after a reload mid-make (Pending keeps extra)
    const extra = fill ? { ...talked, draftId: fill.id } : talked;
    void makeAvatar(script.trim().slice(0, 40) || "AI video", image!, vo!, extra);
  };
  const pickBtn = "inline-flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-sm font-semibold hover:border-primary/40 sm:h-9 [@media(pointer:coarse)]:h-11";

  return (
    <div className="space-y-3">
      {user && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Format">
          <span className="mr-1 text-xs font-medium">Format</span>
          {TALKS.map((t) => <Pill key={t} on={talk === t} onClick={() => chooseTalk(t)} disabled={busy}>{TALK_LABELS[t]}</Pill>)}
          <Pill on={false} onClick={unboxing} disabled={busy}>Unboxing</Pill>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who speaks">
          <Pill on={face === "photo"} onClick={() => setFace("photo")} disabled={busy}>My photo</Pill>
          <Pill on={face === "presenter"} onClick={() => setFace("presenter")} disabled={busy}>AI presenter</Pill>
        </div>
        {face === "photo" ? (
          <>
            <div className="flex items-center gap-3">
              {photoUrl && <img src={photoUrl} alt="Your photo" className="h-24 w-20 rounded-lg object-cover" />}
              <div className="space-y-1">
                <label className={pickBtn}>
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
            {user && setTalk && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Behind you">
                  <span className="mr-1 text-xs font-medium">Behind you</span>
                  <Pill on={behind === "keep"} onClick={() => setBehind("keep")} disabled={busy}>Keep my background</Pill>
                  <Pill on={behind === "set"} onClick={() => setBehind("set")} disabled={busy}>{SET_LABELS[setTalk]}</Pill>
                </div>
                {behind === "set" && (
                  setJob?.state === "working" && setJob.talk === setTalk ? (
                    <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
                      <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Making the set...
                    </p>
                  ) : setUrl ? (
                    <div className="flex items-center gap-2">
                      <img src={setUrl} alt={`The ${SET_LABELS[setTalk].toLowerCase()} behind you`} className="h-24 w-14 rounded-lg object-cover" />
                      {photoUrl && <img src={photoUrl} alt="" className="h-24 w-20 rounded-lg object-cover" />}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" className="h-11 sm:h-9" disabled={busy || setJob?.state === "working" || left("ai-image") === 0} onClick={() => void makeSet(setTalk)}>Make the set</Button>
                      <Left n={left("ai-image")} what="AI images" feature="ai-image" busy={busy} />
                    </div>
                  )
                )}
                {setJob?.state === "failed" && setJob.talk === setTalk && behind === "keep" && <p className="text-xs text-destructive" role="alert">{setJob.error}</p>}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            {shown && <img src={shown} alt="Your AI presenter" className="h-40 w-24 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1 space-y-2">
              <Textarea rows={2} value={look} maxLength={MAX_LOOK} onChange={(e) => setLook(e.target.value)} aria-label="How your presenter looks" className="text-sm" disabled={busy} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-11 sm:h-9" disabled={busy}
                  onClick={() => setLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length])}>Another look</Button>
                <Button size="sm" variant="outline" className="h-11 sm:h-9" disabled={busy || look.trim().length < 10 || left("ai-image") === 0}
                  onClick={() => {
                    // anyone else sends no setting: today's office
                    const setting = user ? TALK_SETTING[talk] : undefined;
                    notePresenter(setting);
                    void makePresenter(look.trim(), setting);
                  }}>{shown ? "Make another presenter" : "Make the presenter"}</Button>
                <Left n={left("ai-image")} what="AI images" feature="ai-image" busy={busy} />
              </div>
              {user && <p className="text-xs text-muted-foreground">The person is made by AI.</p>}
            </div>
          </div>
        )}
      </div>

      {user && talk === "spokesperson" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Your offer">
            <span className="mr-1 text-xs font-medium">Your offer</span>
            {offers.map((name, i) => name && <Pill key={i} on={offer === i} onClick={() => chooseOffer(i)} disabled={busy}>{name}</Pill>)}
          </div>
          {offer === null ? (
            <p className="text-xs text-muted-foreground">
              No offers in your brand kit yet. <Link to={links.brand({ section: "offers" })} className="underline [@media(pointer:coarse)]:inline-block [@media(pointer:coarse)]:py-3">Add one</Link>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {offerPic && <img src={offerPic.url} alt="Your offer's picture" className="h-16 w-12 rounded-lg object-cover" />}
              <label className={pickBtn}>
                {offerPic ? "Change picture" : "Add its picture"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const u = URL.createObjectURL(f);
                    urls.current.push(u);
                    setOfferPic({ file: f, url: u });
                  }} />
              </label>
              {offerPic && <Button size="sm" variant="ghost" className="h-11 text-xs sm:h-9" disabled={busy} onClick={() => setOfferPic(null)}>Remove</Button>}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {user && talk !== "plain" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium">Script</span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {undo !== null && (
                <Button size="sm" variant="ghost" className="h-11 sm:h-9" disabled={busy} onClick={() => { setScript(undo); setUndo(null); setVo(null); }}>Undo</Button>
              )}
              <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={write}
                disabled={busy || writing || !canWrite || left("ai-video-script") === 0}>{again ? "Write it again" : "Write it for me"}</Button>
              <Left n={left("ai-video-script")} what="Scripts" feature="ai-video-script" busy={writing} />
            </div>
          </div>
        )}
        {user && writing && (
          <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
            <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Writing your script...
          </p>
        )}
        {user && scriptJob?.state === "failed" && <p className="text-xs text-destructive" role="alert">{scriptJob.error}</p>}
        <Textarea rows={4} value={script} maxLength={SAY_MAX} disabled={busy || (!!user && writing)}
          onChange={(e) => { setScript(e.target.value); setVo(null); setUndo(null); }} aria-label="What you say"
          placeholder={user && talk !== "plain" ? "What you say, or a topic to write it from" : `What you say, up to about ${MAX_AVATAR_SECONDS} seconds`} className="text-sm" />
        {user && talk === "news" && (
          <label className="block space-y-1">
            <span className="text-xs font-medium">Banner headline</span>
            <Input value={headline} maxLength={BANNER_MAX} onChange={(e) => setHeadline(e.target.value)} disabled={busy} className="h-11 sm:h-10" />
          </label>
        )}
        {user && <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(id))} />}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Voice">
          {VOICE_IDS.map((v) => (
            <Pill key={v} on={voice === v} disabled={busy} onClick={() => { setVoice(v); setVo(null); }}>{VOICES[v].label}, {VOICES[v].note}</Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button ref={voiceRef} size="sm" variant={vo ? "outline" : "default"} className="h-11 sm:h-9" onClick={() => void makeVoice()}
            disabled={busy || voBusy || n < 3 || left("ai-voice") === 0}>
            {voBusy ? "Making the voiceover..." : vo ? "Make the voiceover again" : "Make the voiceover"}
          </Button>
          {n > 0 && <span className="text-[11px] text-muted-foreground">{n} words, about {secs(n / 2.5)}</span>}
          <Left n={left("ai-voice")} what="Voiceovers" feature="ai-voice" busy={busy || voBusy} />
        </div>
        {/* the video's price before its voiceover exists, from the script at 2.5 words a second */}
        {leo && !vo && n > 0 && <p className="text-[11px] text-muted-foreground">The video: <PriceChip feature="ai-video" opts={{ seconds: n / 2.5 }} left={videos} /></p>}
        {voError && <p className="text-xs text-destructive" role="alert">{voError}</p>}
      </div>

      {vo && (
        <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <audio src={vo.url} controls className="w-full" aria-label="Your voiceover" />
          {tooLong ? (
            <p className="text-sm text-destructive" role="alert">It runs {secs(vo.seconds)}. Cut the script to about {MAX_AVATAR_SECONDS} seconds.</p>
          ) : (
            <p className="text-sm">{secs(vo.seconds)} in {vo.slices.length} {vo.slices.length === 1 ? "part" : "parts"}.{leo ? "" : ` Costs ${cost(credits)}.`}</p>
          )}
          {user && <CaptionsLine userId={user.id} />}
          {asking && !busy && price && price !== "pick" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">This makes a video and uses {priceText(price).replace(/^\w/, (c) => c.toLowerCase())} of video credit. Make it?</p>
              <div className="flex items-center gap-2">
                <Button className="h-11 sm:h-10" onClick={() => void make()}>Make it</Button>
                <Button variant="ghost" className="h-11 text-muted-foreground sm:h-10" onClick={() => setAsking(false)}>Not now</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-11 sm:h-10" disabled={busy || tooLong || !image || videos === 0}
                onClick={() => (askFirst ? setAsking(true) : void make())}>Make the video</Button>
              {!image && <span className="text-xs text-muted-foreground">{face === "photo" ? "Pick a photo first." : "Make the presenter first."}</span>}
              <Left n={videos} what="AI videos" feature="ai-video" opts={{ slices: vo.slices.map((s) => s.end - s.start) }} busy={busy} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Explainer({ busy, left: panelLeft }: { busy: boolean; left: Left }) {
  const [topic, setTopic] = useState("");
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [writing, setWriting] = useState(false);
  const leo = useLeoOnly();
  // Leo's chips say what is left after this run, so his counts are read again after a script too
  const mine = useUsesLeft(busy || writing || !leo);
  const left = leo ? mine : panelLeft;
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
  const voices = left("ai-voice");
  const edit = (i: number, change: Partial<Scene>) => setScenes(scenes!.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const iconBtn = "h-11 w-11 p-0 sm:h-8 [@media(pointer:coarse)]:h-11 sm:w-8 [@media(pointer:coarse)]:w-11";

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
      <Left n={left("ai-video-script")} what="Explainer scripts" feature="ai-video-script" busy={writing} />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {scenes && (
        <>
          <ol className="space-y-2">
            {scenes.map((s, i) => (
              <li key={i} className="space-y-1 rounded-xl border border-border/60 p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Scene {i + 1}</span>
                  <div className="flex">
                    <Button size="sm" variant="ghost" className={iconBtn} aria-label={`Move scene ${i + 1} up`} disabled={busy || i === 0}
                      onClick={() => setScenes(moveTake(scenes, i, -1))}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className={iconBtn} aria-label={`Move scene ${i + 1} down`} disabled={busy || i === scenes.length - 1}
                      onClick={() => setScenes(moveTake(scenes, i, 1))}><ChevronDown className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className={`${iconBtn} text-muted-foreground hover:text-destructive`} aria-label={`Remove scene ${i + 1}`}
                      disabled={busy || scenes.length <= MIN_SCENES} onClick={() => setScenes(scenes.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Textarea rows={2} value={s.say} maxLength={300} disabled={busy} aria-label={`Scene ${i + 1}, what the voice says`} className="text-sm"
                  onChange={(e) => edit(i, { say: e.target.value })} />
                <label className="block space-y-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Picture</span>
                  <Textarea rows={2} value={s.picture} maxLength={400} disabled={busy} aria-label={`Scene ${i + 1}, the picture`} className="text-xs"
                    onChange={(e) => edit(i, { picture: e.target.value })} />
                </label>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Voice">
            {VOICE_IDS.map((v) => <Pill key={v} on={voice === v} disabled={busy} onClick={() => setVoice(v)}>{VOICES[v].label}, {VOICES[v].note}</Pill>)}
          </div>
          <p className="text-sm" aria-live="polite">
            {scenes.length} pictures, about {secs(total / 2.5)}.{leo ? "" : ` Costs ${cost(explainerCredits(scenes.length))} and 1 voiceover.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-11 sm:h-10" disabled={busy || videos === 0 || voices === 0 || !scenes.every(sceneReady)}
              onClick={() => void makeExplainer(topic.trim().slice(0, 40) || "Explainer", scenes.map((s) => ({ say: s.say.trim(), picture: s.picture.trim() })), voice)}>
              Make the video
            </Button>
            {!scenes.every(sceneReady) && <span className="text-xs text-muted-foreground">Fill in every scene first.</span>}
            {/* the pictures and the voiceover: two caps, so the smaller of the two is what's left */}
            <Left n={videos} what="AI videos" price={sumPrices(priceOf("ai-video", { scenes: scenes.length }), priceOf("ai-voice"))}
              least={videos === null || voices === null ? null : Math.min(videos, voices)} busy={busy} />
          </div>
        </>
      )}
    </div>
  );
}

const LENGTHS = ["30", "60"] as const;
const VISUALS: Visuals[] = ["stock", "ai"];

/**
 * Leo's narrated video: start from a topic, your script, a link or a draft; 30 or 60 s; stock clips first or AI only;
 * a look and moving scenes. What is typed and the scenes live in explainer.ts (this tab), so leaving the page keeps
 * them; the write runs there too. Every choice is in the URL (from, secs, visuals, look; topic and link fill once).
 */
function Narrated({ userId, busy }: { userId: string; busy: boolean }) {
  const [w, setW] = useState(narratedWrite);
  useEffect(() => onNarratedWrite(setW), []);
  const [d, setD] = useState(() => loadDraft(userId));
  useEffect(() => {
    setD(loadDraft(userId));
    return onDraft(() => setD(loadDraft(userId)));
  }, [userId]);
  const patch = (c: Parameters<typeof saveDraft>[1]) => saveDraft(userId, c);
  const writing = !!w && (w.state === "reading" || w.state === "writing" || w.state === "finding");
  const left = useUsesLeft(busy || writing);

  const [params] = useSearchParams();
  const update = useUrlUpdate();
  // a post's link (?draft=, edit-video) starts on A draft
  const [from, setFrom] = useUrlState<From>("from", params.get("draft") ? "draft" : "topic", { allowed: FROMS });
  const [len, setLen] = useUrlState<(typeof LENGTHS)[number]>("secs", "30", { allowed: LENGTHS, remember: "cs-narrated-length" });
  const [visuals, setVisuals] = useUrlState<Visuals>("visuals", "stock", { allowed: VISUALS, remember: "cs-narrated-visuals" });
  const kept = useMemo(() => loadLook(userId), [userId]);
  const [look, setLookParam] = useUrlState<LookId>("look", kept.look, { allowed: LOOK_IDS });
  const [move, setMove] = useState(kept.move);
  const seconds = len === "60" ? 60 : 30;
  const on = stockOn(visuals, look);
  const keep = from === "script" || from === "draft";

  // topic= and link= fill their box once, then leave the address
  const topicParam = params.get("topic");
  const linkParam = params.get("link");
  useEffect(() => {
    if (topicParam === null && linkParam === null) return;
    saveDraft(userId, { ...(topicParam ? { topic: topicParam.slice(0, MAX_TOPIC) } : {}), ...(linkParam ? { link: linkParam.slice(0, 500) } : {}) });
    update({ topic: null, link: null });
  }, [userId, topicParam, linkParam, update]);
  // A draft: ?draft=<id> fills the script from that post once (later edits are the adviser's)
  const list = useMemo(() => (from === "draft" ? scriptDrafts(userId) : []), [from, userId]);
  const draftParam = params.get("draft");
  const picked = list.find((x) => x.id === draftParam) ?? null;
  useEffect(() => {
    if (picked && loadDraft(userId).fromDraft !== picked.id) saveDraft(userId, { script: fitScript(picked.script, MAX_SCRIPT).text, fromDraft: picked.id });
  }, [userId, picked]);
  // Stock first picked after the scenes were written AI only: look for clips now (free, capped)
  const scenes = d.scenes;
  useEffect(() => {
    if (on && scenes?.length && !d.found && !busy) void findStockNow(userId);
  }, [on, scenes, d.found, busy, userId]);

  const [voice, setVoice] = useState<VoiceId>("eric");
  const [music, setMusic] = useState<File | null>(null);
  const [asking, setAsking] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const flags = useMemo(() => {
    const text = scenes ? scenes.map((s) => s.say).join(" ") : keep ? d.script : "";
    return [...scanCompliance(text), ...(scenes && d.mas ? [MAS_FLAG] : [])].filter((f) => !dismissed.has(f.id));
  }, [scenes, keep, d.script, d.mas, dismissed]);

  const chooseLook = (id: LookId) => {
    setLookParam(id);
    saveLook(userId, { look: id, move });
  };
  const toggleMove = () => {
    setMove(!move);
    saveLook(userId, { look, move: !move });
  };
  const scriptWords = words(d.script);
  const tooLong = keep && scriptWords > SCRIPT_LIMITS[seconds].maxWords;
  const canWrite =
    from === "topic" ? d.topic.trim().length >= 5 && d.topic.trim().length <= MAX_TOPIC
    : from === "link" ? /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(d.link.trim())
    : (from === "script" || !!picked) && d.script.trim().length >= 20 && !tooLong;
  const scripts = left("ai-video-script");
  const reads = left("page-read");
  const write = () => {
    dismissWrite();
    void writeNarrated(userId, { from, seconds, stock: on });
  };

  const aiCount = scenes ? scenes.filter((s) => !usesStock(s, on)).length : 0;
  const videos = left("ai-video");
  const voices = left("ai-voice");
  const price = aiCount ? sumPrices(priceOf("ai-video", { scenes: aiCount, move }), priceOf("ai-voice")) : priceOf("ai-voice");
  const least = aiCount ? (videos === null || voices === null ? null : Math.min(videos, voices)) : voices;
  const ready = !!scenes?.length && scenes.every(sceneReady);
  const askFirst = !!price && price !== "pick" && price.usd >= 1;
  const total = scenes ? scenes.reduce((n, s) => n + words(s.say), 0) : 0;
  const edit = (i: number, change: Partial<NarratedScene>) => patch({ scenes: scenes!.map((x, j) => (j === i ? { ...x, ...change } : x)) });
  const iconBtn = "h-11 w-11 p-0 sm:h-8 [@media(pointer:coarse)]:h-11 sm:w-8 [@media(pointer:coarse)]:w-11";
  const make = async () => {
    setAsking(false);
    let settings: JoinExtra["settings"];
    if (music) {
      const key = `mu-narrated-${Date.now().toString(36)}`;
      // music that can't be kept on this device leaves the video without it, as the editor would
      if (await putFile(key, music).then(() => true, () => false)) settings = { music: { key, name: music.name.replace(/\.[^.]+$/, "") || "Music", level: MUSIC_LEVEL } };
    }
    const extra: JoinExtra = {
      ...(settings ? { settings } : {}),
      ...(d.source ? { note: `Made from ${d.source.url}`, toast: "Your narrated video is ready" } : {}),
      ...(from === "draft" && d.fromDraft ? { draftId: d.fromDraft } : {}),
    };
    const name = (d.topic.trim() || d.source?.title || scenes![0].say).slice(0, 40) || "Narrated video";
    void makeNarrated(userId, { name, scenes: scenes!, voice, look, move, visuals, extra: Object.keys(extra).length ? extra : undefined });
  };
  const off = busy || writing;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Start from">
        <span className="mr-1 text-xs font-medium">Start from</span>
        {FROMS.map((f) => <Pill key={f} on={from === f} onClick={() => setFrom(f)} disabled={off}>{FROM_LABELS[f]}</Pill>)}
      </div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (canWrite) write(); }}>
        {from === "topic" && (
          <Input value={d.topic} maxLength={MAX_TOPIC} onChange={(e) => patch({ topic: e.target.value })} disabled={off}
            placeholder="What it explains, like why a hospital plan has a co-pay" aria-label="What the video explains" className="h-11 sm:h-10" />
        )}
        {from === "link" && (
          <Input type="url" inputMode="url" value={d.link} maxLength={500} onChange={(e) => patch({ link: e.target.value })} disabled={off}
            placeholder="Paste a link to an article" aria-label="A link to an article" className="h-11 sm:h-10" />
        )}
        {from === "draft" && (
          list.length ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Your short-video drafts">
              {list.slice(0, 8).map((x) => (
                <Pill key={x.id} on={picked?.id === x.id} disabled={off} onClick={() => update({ draft: x.id })}>{x.label.length > 48 ? `${x.label.slice(0, 47)}...` : x.label}</Pill>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No short-video drafts yet. <Link to={links.generate({ format: "short-video" })} className="underline [@media(pointer:coarse)]:inline-block [@media(pointer:coarse)]:py-3">Write one</Link></p>
          )
        )}
        {keep && (from === "script" || picked) && (
          <>
            <Textarea rows={4} value={d.script} maxLength={MAX_SCRIPT} onChange={(e) => patch({ script: e.target.value })} disabled={off}
              placeholder="Paste your script. It's read word for word." aria-label="Your script" className="text-sm" />
            {scriptWords > 0 && (
              <p className={`text-[11px] ${tooLong ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {scriptWords} words, about {secs(scriptWords / 2.5)}.{tooLong ? (seconds === 30 ? " Pick 60 seconds or cut it to 110 words." : " Cut it to 200 words.") : ""}
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Length">
            {LENGTHS.map((n) => <Pill key={n} on={len === n} disabled={off} onClick={() => setLen(n)}>{n} seconds</Pill>)}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pictures">
            <Pill on={on} disabled={off || look !== "photo"} onClick={() => setVisuals("stock")}>Stock first</Pill>
            <Pill on={!on} disabled={off} onClick={() => setVisuals("ai")}>AI only</Pill>
          </div>
          {look !== "photo" && <span className="text-[11px] text-muted-foreground">{STOCK_TIP}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Look">
          <span className="mr-1 text-xs font-medium">Look</span>
          {LOOK_IDS.map((id) => (
            <Pill key={id} on={look === id} disabled={off} onClick={() => chooseLook(id)}>
              {EXPLAINER_LOOKS[id].label}{d.recommended?.id === id ? <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Recommended</span> : null}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill on={move} disabled={off} onClick={toggleMove}>Make the scenes move</Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant={scenes ? "outline" : "default"} className="h-11 sm:h-10"
            disabled={off || !canWrite || scripts === 0 || (from === "link" && reads === 0)}>
            {writing ? (keep ? "Splitting..." : "Writing...") : keep ? "Split into scenes" : scenes ? "Write it again" : "Write it"}
          </Button>
          {/* a link spends a page read too: the smaller of the two is what's left */}
          <Left n={scripts} what="Explainer scripts" feature="ai-video-script" busy={writing} least={from === "link" && scripts !== null && reads !== null ? Math.min(scripts, reads) : scripts} />
        </div>
      </form>
      {keep && !scenes && <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(id))} />}
      {writing && (
        <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
          <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> {w!.step}
        </p>
      )}
      {w?.state === "failed" && <p className="text-xs text-destructive" role="alert">{w.error}</p>}
      {scenes && (
        <>
          <ol className="space-y-2">
            {scenes.map((s, i) => {
              const stock = usesStock(s, on);
              return (
                <li key={i} className="space-y-1 rounded-xl border border-border/60 p-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-muted-foreground">Scene {i + 1}</span>
                    <div className="flex">
                      <Button size="sm" variant="ghost" className={iconBtn} aria-label={`Move scene ${i + 1} up`} disabled={off || i === 0}
                        onClick={() => patch({ scenes: moveTake(scenes, i, -1) })}><ChevronUp className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className={iconBtn} aria-label={`Move scene ${i + 1} down`} disabled={off || i === scenes.length - 1}
                        onClick={() => patch({ scenes: moveTake(scenes, i, 1) })}><ChevronDown className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className={`${iconBtn} text-muted-foreground hover:text-destructive`} aria-label={`Remove scene ${i + 1}`}
                        disabled={off || scenes.length <= MIN_SCENES} onClick={() => patch({ scenes: scenes.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <Textarea rows={2} value={s.say} maxLength={300} disabled={off} aria-label={`Scene ${i + 1}, what the voice says`} className="text-sm"
                    onChange={(e) => edit(i, { say: e.target.value })} />
                  {stock ? (
                    <div className="flex items-center gap-2">
                      <img src={s.stock!.thumb} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">Stock clip{describe(s.stock!) ? `: ${describe(s.stock!)}` : ""}</span>
                      <Button size="sm" variant="ghost" className="h-11 text-xs sm:h-8" disabled={off} onClick={() => edit(i, { use: "ai" })}>Use a picture instead</Button>
                    </div>
                  ) : (
                    <>
                      <label className="block space-y-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground">AI picture</span>
                        <Textarea rows={2} value={s.picture} maxLength={400} disabled={off} aria-label={`Scene ${i + 1}, the picture`} className="text-xs"
                          onChange={(e) => edit(i, { picture: e.target.value })} />
                      </label>
                      {on && s.stock && (
                        <Button size="sm" variant="ghost" className="h-11 text-xs sm:h-8" disabled={off} onClick={() => edit(i, { use: "stock" })}>Use stock instead</Button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          {d.source && (
            <p className="text-xs text-muted-foreground">
              From <a href={d.source.url} target="_blank" rel="noreferrer" className="underline [@media(pointer:coarse)]:inline-block [@media(pointer:coarse)]:py-3">{d.source.site}</a>
            </p>
          )}
          <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(id))} />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Voice">
            {VOICE_IDS.map((v) => <Pill key={v} on={voice === v} disabled={off} onClick={() => setVoice(v)}>{VOICES[v].label}, {VOICES[v].note}</Pill>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 sm:h-9 [@media(pointer:coarse)]:h-11">
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
          </div>
          {aiCount > 0 && <p className="text-xs text-muted-foreground">The people in the AI pictures are made by AI.</p>}
          <p className="text-sm" aria-live="polite">{summaryLine(scenes, total / 2.5, on)}</p>
          <CaptionsLine userId={userId} />
          {asking && !busy && price && price !== "pick" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">This makes a video and uses {priceText(price).replace(/^\w/, (c) => c.toLowerCase())} of video credit. Make it?</p>
              <div className="flex items-center gap-2">
                <Button className="h-11 sm:h-10" onClick={() => void make()}>Make it</Button>
                <Button variant="ghost" className="h-11 text-muted-foreground sm:h-10" onClick={() => setAsking(false)}>Not now</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-11 sm:h-10" disabled={off || !ready || least === 0}
                onClick={() => (askFirst ? setAsking(true) : void make())}>Make the video</Button>
              {!ready && <span className="text-xs text-muted-foreground">Fill in every scene first.</span>}
              <Left n={aiCount ? videos : voices} what={aiCount ? "AI videos" : "Voiceovers"} price={price} least={least} busy={busy} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Runs `apply` once per post a ?draft= link brings, and with null once it is cleared; never while a video is being made. */
function useFill(fill: PostFill | null, off: boolean, apply: (f: PostFill | null) => void) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    const id = fill?.id ?? null;
    if (off || id === done.current) return;
    done.current = id;
    apply(fill);
    // apply only sets state, so a new one each render changes nothing
  }, [fill, off]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The next press, focused once the filled form has drawn; the page doesn't jump, so the strip above stays in view. */
const focusSoon = (ref: React.RefObject<HTMLButtonElement>) => requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));

/** edit-video (Leo only): the post the form was filled from, with the way back to it and Clear, or why nothing was. */
function FromPost({ draftId, fill, gone, cut, onClear }: { draftId: string | null; fill: PostFill | null; gone: boolean; cut: boolean; onClear: () => void }) {
  const link = "inline-flex h-11 items-center px-2 text-xs font-medium text-primary underline-offset-2 hover:underline sm:h-9 [@media(pointer:coarse)]:h-11";
  if (fill) {
    const n = fill.say.kept;
    return (
      <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-1">
        <div className="flex flex-wrap items-center gap-x-2">
          {/* a phone puts the buttons under the title rather than cutting it to a few letters */}
          <p className="min-w-[12rem] flex-1 truncate pt-2 text-sm sm:pt-0">From your post: <span className="font-semibold">{fill.title}</span></p>
          <div className="-mr-2 flex items-center">
            <Link to={links.generate({ draft: fill.id })} className={link}>Open in Write</Link>
            <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={onClear}>Clear</Button>
          </div>
        </div>
        {cut && (
          <p className="pb-2 text-xs text-amber-700 dark:text-amber-300">
            Cut to the first {n === 1 ? "sentence" : `${n} sentences`} to fit 30 seconds. Change it before you make it.
          </p>
        )}
      </div>
    );
  }
  if (draftId) {
    return (
      <p className="text-sm text-muted-foreground">
        That post has no script yet. <Link to={links.generate({ draft: draftId })} className={`${link} -ml-2`}>Write it</Link>
      </p>
    );
  }
  return gone ? <p className="text-sm text-muted-foreground" role="status">We couldn't find that post. Type the script instead.</p> : null;
}

/** Leo: the caption look a new video starts with (the default skill's, as the editor's upload uses), as Fastlane shows it. */
function CaptionsLine({ userId }: { userId: string }) {
  const s = withLook(defaultSettings("bold"), defaultSkill(loadSkills(userId))?.look);
  // shown to Leo only, so his plain style names ("Outline", not "TikTok")
  return <p className="text-xs text-muted-foreground">Captions: {s.captions === false ? "off" : styleLabel(s.style, true)}, saved for every new video.</p>;
}

function Pill({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled}
      className={`h-11 rounded-full border px-3 text-xs font-semibold disabled:opacity-60 sm:h-8 [@media(pointer:coarse)]:h-11 ${on ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{children}</button>
  );
}

/**
 * Uses left beside an AI button. Leo sees the price and what is left after this run instead (PriceChip), hidden while
 * `busy`, with the reason on its own line when the button can't run. `least` is the smallest left when a button spends
 * from several caps.
 */
function Left({ n, what, least = n, busy, ...chip }: { n: number | null; what: string; least?: number | null; busy?: boolean; feature?: UsageFeature; opts?: PriceOpts; price?: Price | "pick" | null }) {
  const leo = useLeoOnly();
  const why = reasonText({ left: least, leo });
  const today = n === null ? null : <span className={`text-[11px] ${n ? "text-muted-foreground" : "font-medium text-destructive"}`}>{what}: {n ? `${n} left today` : "none left today"}</span>;
  return (
    <>
      {!(leo && busy) && <PriceChip {...chip} left={least} fallback={today} />}
      {why && <span className="order-last block basis-full text-xs text-destructive">{why}</span>}
    </>
  );
}
