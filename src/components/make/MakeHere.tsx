// A video format made on its own page (/make/<slug>, Leo's; src/lib/formatMaker.ts says which formats): a presenter
// talk (News anchor, Stage talk, Spokesperson) or an editor template, set up here the way Fastlane's format pages do,
// instead of in the video editor. Talks: the script, with "Write it for me" (ai-video talk-script, presenter.ts, the
// editor's own writer) and the news banner. Templates: the template's own blanks. Under each, the words against the
// length (speakingWords), and the lengths its maker takes as chips; a written script moves the length to the one it
// fills. Who speaks (a talk) or who appears (a template with a person photo) as the talking head picks it, then More
// settings, folded with its picks in one line: a talk's voice and new presenter's look, Spokesperson's offer and whether
// its name tag names the business; a template's product and quality; and every format's captions style.
// Then the press's price and uses left, and Make it: a talk runs the talking head's chain (talkingHeadJob.ts startTalk
// with `as`: a new presenter if needed, the voiceover, the price check, then Speak), a template the editor's own
// makeTemplateClip. Both run outside React, so leaving the page keeps them going, and show in /library's Making now.
// The finished video shows here; Open in the video editor takes it there (it lands in the editor's projects as a make
// from the editor does). A paid video still waiting on this device is finished in the editor first, never replaced.
// Typed words stay on this device (formatMaker.ts loadTyped). The agent's make skills open this page with their
// answers in the address (makeSkills.ts): topic fills the script once, then leaves; who, length and product are picks.
// URL (docs/deep-links.md), all replace: topic=<words> (fills the script once, then leaves), length=<seconds> (one of lengthsOf), who=mine|presenter|<presenter id> (a
// template: mine or a presenter id, none for the template's own person), voice=<voice id>, offer=<n> (a brand kit
// offer's place), mention=yes|no, product=<saved product id>, quality=480p|720p, captions=<style>|off, more=open.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CircleNotchIcon, WarningIcon } from "@phosphor-icons/react";
import ComplianceChips from "@/components/ComplianceChips";
import Examples from "@/components/make/Examples";
import FormatShell from "@/components/make/FormatShell";
import MoreSettings from "@/components/make/MoreSettings";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChip } from "@/components/ui/filter-chip";
import { Textarea } from "@/components/ui/textarea";
import type { FormatDef } from "@/data/formats";
import { useUsesLeft } from "@/lib/aiUsage";
import { LOOKS, MAX_LOOK, CLIP_QUALITIES, aiBusy, aiJob, makeTemplateClip, onAiJob, pendingAvatar, type AiJob, type ClipQuality, type TemplateAsk } from "@/lib/aiVideo";
import { loadBrand } from "@/lib/carousel";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { scanCompliance } from "@/lib/compliance";
import { clipWordLine, countWords, lengthsOf, loadTyped, makeCaps, makePrice, pickLine, saveTyped, spokenKeys, startLength, talkLine, type Maker, type Typed } from "@/lib/formatMaker";
import { links } from "@/lib/links";
import { CAPTION_CHOICES, loadPostChoices, nextLook, pickLook, presenterStarts, useCoin, useMentionStart } from "@/lib/postChoices";
import { MAS_FLAG, TALK_SETTING, loadTalk, offerNames, onTalkScript, pickOffer, saveTalk, takeScript, talkExtra, talkScript, writeTalkScript } from "@/lib/presenter";
import { loadProducts, productLabel, type Product } from "@/lib/products";
import { pictureFile } from "@/lib/productScan";
import { adviserBrand } from "@/lib/profession";
import { loadRemixPrefs } from "@/lib/remixBrand";
import { aiMark, lengthFor, speakerFile, speakerOf, startVoice, startWho, talkPicks, useSpeakers, whoChoices, type Speaker, type TalkLength, type TalkWho } from "@/lib/talkingHead";
import { dropTalk, goOnAtPrice, madePresenter, onTalkJob, startTalk, talkBusy, talkJob, type TalkJob } from "@/lib/talkingHeadJob";
import { VOICES, VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { BANNER_MAX, captionLookOf, defaultSettings, styleLabel, type EditSettings } from "@/lib/videoEdit";
import { currentJoin, onJoinJob, type JoinExtra } from "@/lib/videoMedia";
import { MAX_FIELD, MAX_TOPIC } from "../../../supabase/functions/ai-video/logic.ts";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const SAY_MAX = 600;
type Captions = (typeof CAPTION_CHOICES)[number];
const captionsLine = (c: Captions) => (c === "off" ? "no captions" : `captions ${styleLabel(c, true)}`);
const PICK = "inline-flex h-11 cursor-pointer items-center rounded-full border border-border/70 bg-background px-3.5 text-xs font-semibold hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring sm:h-9 [@media(pointer:coarse)]:h-11";
const OTHER_VIDEO = "Your last AI video isn't finished yet. Open the editor to finish it.";
const START_FAILED = "Couldn't start the video right now. Try again in a minute.";

/** The captions a video opens with when the pick isn't the brand's Post choices one (the editor starts from that). */
export function captionsSettings(pick: Captions, start: Captions): Partial<EditSettings> | undefined {
  if (pick === start) return undefined;
  return pick === "off" ? { captions: false } : (captionLookOf(defaultSettings(pick)) as Partial<EditSettings>);
}

/** The editor hand-off with more settings laid over its own (a talk's banner or name tag, then the captions). */
const withSettings = (extra: JoinExtra | undefined, more: Partial<EditSettings> | undefined): JoinExtra | undefined =>
  more ? { ...extra, settings: { ...extra?.settings, ...more } } : extra;

// ---- a template clip made from this page, outside React like the clip itself ----

/** The format page whose clip the editor's AI job is making now. */
let clipBy: string | null = null;

/** The editor's makeTemplateClip, mirrored into /library's Making now under this format until it ends. */
function makeClip(def: FormatDef, ask: TemplateAsk, extra: JoinExtra, params: Record<string, string>) {
  clipBy = def.slug;
  const off = onAiJob((j) => {
    if (j?.kind !== "template" || clipBy !== def.slug) return;
    const done = j.state === "done";
    setFormatJob({
      slug: def.slug,
      label: def.name,
      format: "video",
      state: j.state === "failed" ? "failed" : done ? "ready" : "working",
      ...(j.state === "failed" ? { error: j.error } : { step: j.step.replace(/\.\.\.$/, "") }),
      href: done ? links.edit() : links.makeFormat(def.slug, params),
    });
    if (j.state !== "working") off();
  });
  clearFormatJob(def.slug);
  void makeTemplateClip((ask.fields.line || ask.fields.question || ask.fields.product || def.name).slice(0, 40), ask, { extra });
  // makeTemplateClip starts at once or not at all (another AI video took the slot first)
  if (aiJob()?.kind !== "template" || !aiBusy()) {
    off();
    clipBy = null;
  }
}

function useTalkJob(): TalkJob | null {
  const [job, setJob] = useState(talkJob);
  useEffect(() => onTalkJob(setJob), []);
  return job;
}
function useAiJob(): AiJob | null {
  const [job, setJob] = useState(aiJob);
  useEffect(() => onAiJob(setJob), []);
  return job;
}

export default function MakeHere({ def, maker, userId }: { def: FormatDef & { opens: () => string }; maker: Maker; userId: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const talk = maker.kind === "talk" ? maker.talk : null;
  const template = maker.kind === "template" ? maker.template : null;
  // the agent's topic fills the script once (what was there is one Undo away), then leaves the address
  const [typed, setTyped] = useState<Typed>(() => {
    const t = loadTyped(def.slug, userId);
    const topic = talk ? params.get("topic")?.trim().slice(0, MAX_TOPIC) : "";
    return { ...t, look: t.look || pickLook(userId, LOOKS), ...(topic ? { script: topic } : {}) };
  });
  const [before] = useState(() => (talk && params.get("topic")?.trim() && loadTyped(def.slug, userId).script?.trim()) || null);
  useEffect(() => {
    if (params.get("topic") !== null) update({ topic: null });
  }, [params, update]);
  useEffect(() => saveTyped(def.slug, userId, typed), [def.slug, userId, typed]);

  const lengths = lengthsOf(maker);
  const [lengthParam, setLengthParam] = useUrlState<string>("length", String(startLength(maker)), { allowed: lengths.map(String) });
  const length = Number(lengthParam);
  const setLength = (n: number) => setLengthParam(String(n));

  // who speaks or appears: a talk starts as the talking head does (the brand's Who appears, your face, else a new AI
  // presenter); a template's person is its own made-up one until you pick your face or a saved presenter
  const people = useSpeakers(userId);
  const flip = useCoin();
  const whoStart = talk && people ? startWho(people, (l) => presenterStarts(userId, l, flip)) : "";
  const whoAllowed = people ? whoChoices(people).filter((w) => talk || w !== "presenter") : [];
  const [who, setWho] = useUrlState<string>("who", whoStart, { allowed: whoAllowed });
  const speaker = people ? speakerOf(people, who) : null;
  const look = typed.look ?? "";
  const [voice, setVoice] = useUrlState<VoiceId>("voice", startVoice(people, who, look, loadRemixPrefs(userId).voice), { allowed: VOICE_IDS });

  // Spokesperson's offer, from the brand kit as the editor picks it; the last pick is kept per brand
  const offers = useMemo(() => offerNames(userId), [userId]);
  const [offerParam, setOfferParam] = useUrlState<string>("offer", "", { allowed: offers.flatMap((n, i) => (n ? [String(i)] : [])) });
  const offer = talk === "spokesperson" ? pickOffer(offers, offerParam || null, loadTalk(userId).offer) : null;
  const chooseOffer = (i: number) => {
    setOfferParam(String(i));
    saveTalk(userId, { talk: loadTalk(userId).talk, offer: i });
  };
  const [mention, setMention] = useUrlState("mention", useMentionStart(userId), { allowed: ["yes", "no"] });

  // a template's product: one of the brand's saved products (its name in the product blank, its picture the clip's)
  const products = useMemo(() => (template && (template.photos.includes("product") || template.fields.some((f) => f.key === "product")) ? loadProducts(userId).items : []), [template, userId]);
  const [productId, setProductId] = useUrlState<string>("product", "", { allowed: products.map((p) => p.id) });
  const product = products.find((p) => p.id === productId) ?? null;
  // a product that came in the address names the product blank when it is empty
  useEffect(() => {
    if (product && template?.fields.some((f) => f.key === "product") && !typed.fields?.product?.trim()) setTyped((t) => ({ ...t, fields: { ...t.fields, product: productLabel(product).slice(0, MAX_FIELD) } }));
    // once per product picked by link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);
  const chooseProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p && template?.fields.some((f) => f.key === "product")) setTyped((t) => ({ ...t, fields: { ...t.fields, product: productLabel(p).slice(0, MAX_FIELD) } }));
  };
  const [quality, setQuality] = useUrlState<ClipQuality>("quality", "720p", { allowed: CLIP_QUALITIES });
  const captionsStart = loadPostChoices(userId).captions;
  const [captions, setCaptions] = useUrlState<Captions>("captions", captionsStart, { allowed: CAPTION_CHOICES });

  const picks = talk
    ? pickLine([
        ...talkPicks(voice, null, who === "presenter" ? look : null),
        talk === "spokesperson" && (offer === null ? "no offer" : offers[offer]),
        talk === "spokesperson" && (mention === "no" ? "no business name" : "business named"),
        captionsLine(captions),
      ])
    : pickLine([products.length > 0 && (product ? productLabel(product) : "no product"), quality, captionsLine(captions)]);

  // ---- the press ----
  const tJob = useTalkJob();
  const ai = useAiJob();
  const [, joinBump] = useState(0);
  useEffect(() => {
    const off = onJoinJob(() => joinBump((n) => n + 1));
    return () => void off();
  }, []);
  const [upload, setUpload] = useState<{ role: "person" | "product"; file: File; url: string } | null>(null);
  useEffect(() => () => { if (upload) URL.revokeObjectURL(upload.url); }, [upload]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  const ours = talk ? tJob?.ask?.as?.slug === def.slug : clipBy === def.slug && ai?.kind === "template";
  const tBusy = talk ? ours && talkBusy() : ours && ai?.state === "working";
  const busy = tBusy || starting;
  const priced = !!talk && ours && tJob?.state === "priced" && !!tJob.real;
  const failed = ours && (talk ? tJob?.state === "failed" && !tJob.writeOnly : ai?.state === "failed");
  const done = ours && (talk ? tJob?.state === "done" : ai?.state === "done");
  const step = talk ? tJob?.step : ai?.step;
  const error = startError || (talk ? tJob?.error : ai?.error) || START_FAILED;
  // a paid video waiting on this device is finished in the editor before another starts, so it is never replaced
  const elsewhere = !busy && !priced && (aiBusy() || talkBusy() || !!pendingAvatar());
  const presenterNeeded = !!talk && who === "presenter" && !madePresenter(look, TALK_SETTING[talk] ?? "office");
  const n = countWords(typed.script ?? "");
  const field = (k: string) => (typed.fields?.[k as keyof NonNullable<Typed["fields"]>] ?? "").trim();
  const photoRole: "person" | "product" | null = !template ? null
    : upload ? upload.role
    : speaker && template.photos.includes("person") ? "person"
    : product?.pictures[0] && template.photos.includes("product") ? "product"
    : null;
  const missing = template?.fields.find((f) => f.required && !field(f.key));
  const tooLong = template?.fields.find((f) => f.maxWords && countWords(field(f.key)) > f.maxWords);
  const reason =
    priced ? `The voiceover runs ${Math.round(tJob!.real!.seconds)} seconds, so this costs about US$${tJob!.real!.price.usd.toFixed(2)}.`
    : busy ? null
    : elsewhere ? OTHER_VIDEO
    : talk && n < 3 ? "Type the script, or a topic and press Write it for me."
    : talk && who === "mine" && !speaker ? "Save your face first."
    : talk && who === "presenter" && look.trim().length < 10 ? "Describe your presenter under More settings."
    : missing ? `Fill in "${missing.label}" first.`
    : tooLong ? `Keep "${tooLong.label}" to ${tooLong.maxWords} words.`
    : template?.needsPhoto && photoRole !== template.needsPhoto ? `Add a photo of the ${template.needsPhoto} first.`
    : null;
  const captionsMore = captionsSettings(captions, captionsStart);
  const pageParams = () => Object.fromEntries([...params].filter(([k]) => k !== "more"));

  const makeIt = async () => {
    if (reason || busy) return;
    setStartError("");
    if (!window.matchMedia("(min-width: 1024px)").matches) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (talk) {
      const offerName = offer === null ? null : offers[offer];
      const extra = withSettings(talkExtra({ talk, headline: typed.headline, offer: offerName, brand: mention !== "no" ? loadBrand(userId)?.name : undefined }), captionsMore);
      return void startTalk(userId, {
        source: null,
        text: typed.script ?? "",
        who: who as TalkWho,
        photo: null,
        look,
        setting: "office",
        voice,
        length: length as TalkLength,
        mention: mention !== "no",
        as: { slug: def.slug, label: def.name, params: pageParams(), setting: TALK_SETTING[talk] ?? "office", extra },
      });
    }
    if (!template) return;
    setStarting(true);
    const photo = await photoOf(photoRole, upload, speaker, product, userId).catch(() => null);
    setStarting(false);
    if (photoRole && !photo) return setStartError("That photo didn't open. Pick it again or upload one.");
    const fields = Object.fromEntries(template.fields.flatMap((f) => (field(f.key) ? [[f.key, field(f.key)]] : [])));
    const person = photoRole === "person" && !upload ? speaker : template.photos.includes("person") ? ("generated" as const) : null;
    makeClip(def, { template: template.id, seconds: length as TemplateAsk["seconds"], quality, fields, photo }, withSettings({ ai: aiMark("template", person, null) }, captionsMore)!, pageParams());
    if (clipBy !== def.slug) setStartError(START_FAILED);
  };

  const options = (
    <>
      {def.preview && <Examples f={def} card="w-36" />}
      {talk ? (
        <TalkScript userId={userId} talk={talk} typed={typed} setTyped={setTyped} length={length as TalkLength} onWritten={(n) => setLength(lengthFor(n))} offer={offer} before={before} />
      ) : template && (
        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-3 pt-4 sm:pt-5">
            {template.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`make-${f.key}`} className={FIELD_LABEL}>{f.label}{f.required ? "" : " (optional)"}</Label>
                <Input
                  id={`make-${f.key}`}
                  value={typed.fields?.[f.key] ?? ""}
                  maxLength={MAX_FIELD}
                  placeholder={f.placeholder}
                  className="h-11 sm:h-10"
                  onChange={(e) => setTyped((t) => ({ ...t, fields: { ...t.fields, [f.key]: e.target.value } }))}
                />
              </div>
            ))}
            {spokenKeys(template).length > 0 && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {clipWordLine(countWords(spokenKeys(template).map((k) => typed.fields?.[k] ?? "").join(" ")), length)}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          {people && (talk || template?.photos.includes("person")) && (
            <>
              <Field label={talk ? "Who speaks" : "Who appears"}>
                {template && <FilterChip active={!who} onClick={() => setWho("")}>Someone new</FilterChip>}
                {(people.face || who === "mine") && <FilterChip active={who === "mine"} onClick={() => setWho("mine")}>My face</FilterChip>}
                {people.presenters.map((p) => <FilterChip key={p.id} active={who === p.id} onClick={() => setWho(p.id)}>{p.name}, AI</FilterChip>)}
                {talk && <FilterChip active={who === "presenter"} onClick={() => setWho("presenter")}>New presenter</FilterChip>}
              </Field>
              {speaker ? (
                <div className="flex items-center gap-3">
                  <img
                    src={speaker.person === "mine" ? speaker.face.photo : speaker.p.photo}
                    alt={speaker.person === "mine" ? "Your saved face" : `${speaker.p.name}, your AI presenter`}
                    className="h-24 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <p className="text-xs text-muted-foreground">{speaker.person === "mine" ? "Made by AI from your saved face." : "The person is made by AI."}</p>
                </div>
              ) : who === "mine" ? (
                <Link to={links.people({ record: true })} className={`inline-flex items-center text-sm font-medium text-primary underline-offset-2 hover:underline ${TOUCH}`}>Save your face first</Link>
              ) : (
                <p className="text-xs text-muted-foreground">The person is made by AI.</p>
              )}
            </>
          )}
          {template && template.photos.length > 0 && (
            <div className="space-y-1.5">
              <p className={FIELD_LABEL}>{template.needsPhoto ? "Photo" : "Photo (optional)"}</p>
              <div className="flex flex-wrap items-center gap-2">
                {upload && <img src={upload.url} alt={`The ${upload.role}`} className="h-16 w-12 rounded-lg object-cover" />}
                {template.photos.map((role) => (
                  <label key={role} className={PICK}>
                    {upload?.role === role ? `Change the ${role} photo` : `Upload a photo of the ${role}`}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) setUpload({ role, file, url: URL.createObjectURL(file) });
                      }} />
                  </label>
                ))}
                {upload && <Button size="sm" variant="ghost" className={TOUCH} onClick={() => setUpload(null)}>Remove</Button>}
              </div>
              {!upload && photoRole === "product" && product && <p className="text-xs text-muted-foreground">Uses {productLabel(product)}'s picture.</p>}
            </div>
          )}
          <Field label="Length">
            {lengths.map((n) => (
              <FilterChip key={n} active={length === n} onClick={() => setLength(n)}>{n} s</FilterChip>
            ))}
          </Field>
          <MoreSettings picks={picks}>
            {talk && (
              <Field label="Voice">
                {VOICE_IDS.map((v) => <FilterChip key={v} active={voice === v} onClick={() => setVoice(v)}>{VOICES[v].label}, {VOICES[v].note}</FilterChip>)}
              </Field>
            )}
            {talk && who === "presenter" && (
              <div className="space-y-1.5">
                <Label htmlFor="make-look" className={FIELD_LABEL}>How they look</Label>
                <Textarea id="make-look" rows={3} value={look} maxLength={MAX_LOOK} className="text-sm" onChange={(e) => { const v = e.target.value; setTyped((t) => ({ ...t, look: v })); }} />
                <Button size="sm" variant="outline" className={TOUCH} onClick={() => setTyped((t) => ({ ...t, look: nextLook(userId, LOOKS, look) }))}>Another look</Button>
              </div>
            )}
            {talk === "spokesperson" && (
              <>
                <Field label="Your offer">
                  {offers.map((name, i) => name && <FilterChip key={i} active={offer === i} onClick={() => chooseOffer(i)}>{name}</FilterChip>)}
                </Field>
                {offer === null && (
                  <Link to={links.brand({ section: "offers" })} className={`inline-flex items-center text-sm font-medium text-primary underline-offset-2 hover:underline ${TOUCH}`}>Add an offer to your brand kit</Link>
                )}
                <Field label="Name the business">
                  <FilterChip active={mention !== "no"} onClick={() => setMention("yes")}>Yes</FilterChip>
                  <FilterChip active={mention === "no"} onClick={() => setMention("no")}>No</FilterChip>
                </Field>
              </>
            )}
            {products.length > 0 && (
              <Field label="Product">
                <FilterChip active={!product} onClick={() => setProductId("")}>None</FilterChip>
                {products.map((p) => <FilterChip key={p.id} active={product?.id === p.id} onClick={() => chooseProduct(p.id)}>{productLabel(p) || "Untitled"}</FilterChip>)}
              </Field>
            )}
            {template && (
              <Field label="Quality">
                {CLIP_QUALITIES.map((q) => <FilterChip key={q} active={quality === q} onClick={() => setQuality(q)}>{q}</FilterChip>)}
              </Field>
            )}
            <Field label="Captions">
              {CAPTION_CHOICES.map((c) => <FilterChip key={c} active={captions === c} onClick={() => setCaptions(c)}>{c === "off" ? "Off" : styleLabel(c, true)}</FilterChip>)}
            </Field>
          </MoreSettings>
        </CardContent>
      </Card>
    </>
  );

  const setup = (
    <>
      <fieldset disabled={busy || priced} className="min-w-0 space-y-5">{options}</fieldset>
      {priced && (
        <div role="status" className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
          <p className="min-w-0">Your voiceover is kept, so going on doesn't pay for it again.</p>
          <Button size="sm" variant="ghost" onClick={() => dropTalk()} className={TOUCH}>Shorten the script</Button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        <Link to={def.opens()} className={`inline-flex items-center underline-offset-2 hover:text-foreground hover:underline ${TOUCH}`}>Set it up in the video editor instead</Link>
      </p>
    </>
  );

  const result = (
    <div ref={resultRef} className="scroll-mt-16 lg:scroll-mt-0" aria-live="polite">
      {busy ? (
        <Frame>
          <CircleNotchIcon className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <span role="status">{starting ? "Getting your photo ready..." : step}</span>
          <span className="text-xs">You can leave this page. It keeps going.</span>
        </Frame>
      ) : failed || startError ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-start gap-2 text-destructive"><WarningIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}</p>
          {pendingAvatar() && <Button size="sm" variant="outline" onClick={() => navigate(links.edit())} className={TOUCH}>Open the editor to finish it</Button>}
        </div>
      ) : done ? (
        <Made onOpen={() => navigate(links.edit())} />
      ) : (
        <Frame empty>Your video shows here and in your Library.</Frame>
      )}
    </div>
  );

  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={setup}
      result={result}
      footer={{
        cap: def.cap ?? null,
        price: priced ? tJob!.real!.price : makePrice(maker, { length, quality, presenter: presenterNeeded }),
        caps: priced ? undefined : makeCaps(maker, presenterNeeded),
        label: priced ? `Make it for US$${tJob!.real!.price.usd.toFixed(2)}` : failed ? "Try again" : "Make it",
        busyLabel: "Making...",
        busy,
        disabled: !!reason && !priced,
        reason,
        secondary: done,
        onMake: priced ? () => void goOnAtPrice(userId) : () => void makeIt(),
      }}
    />
  );
}

/** The photo a clip opens with or shows: an upload, your face or a presenter, or the saved product's first picture. */
async function photoOf(role: "person" | "product" | null, upload: { role: "person" | "product"; file: File } | null, speaker: Speaker | null, product: Product | null, userId: string): Promise<TemplateAsk["photo"]> {
  if (!role) return null;
  if (upload) return { role: upload.role, file: upload.file };
  if (role === "person" && speaker) return { role, file: await speakerFile(speaker) };
  const file = product ? await pictureFile(userId, product) : null;
  return file ? { role: "product", file } : null;
}

/** A dashed 9:16 frame while a make runs; before the first one a short box on a phone, where it sits under the options. */
function Frame({ empty = false, children }: { empty?: boolean; children: ReactNode }) {
  return (
    <div className={`mx-auto flex w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground ${empty ? "min-h-28 py-6 lg:aspect-[9/16]" : "aspect-[9/16]"}`}>
      {children}
    </div>
  );
}

/** The finished video, played from the file waiting for the editor, and the way there. */
function Made({ onOpen }: { onOpen: () => void }) {
  const file = currentJoin()?.state === "done" ? currentJoin()?.file : undefined;
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return setUrl("");
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="mx-auto w-full max-w-[300px] space-y-3">
      {url ? (
        <video src={url} controls playsInline className="aspect-[9/16] w-full rounded-xl bg-muted object-cover" aria-label="Your video" />
      ) : (
        <Frame>Your video is in the editor.</Frame>
      )}
      <p className="text-sm font-medium text-foreground">Your video is ready.</p>
      <Button onClick={onOpen} className={`w-full ${TOUCH}`}>Open in the video editor</Button>
    </div>
  );
}

/** The script box of a presenter talk, with the format's own writer and, for News anchor, the banner's headline. */
function TalkScript({ userId, talk, typed, setTyped, length, onWritten, offer, before }: {
  userId: string;
  talk: Extract<Maker, { kind: "talk" }>["talk"];
  typed: Typed;
  setTyped: (f: (t: Typed) => Typed) => void;
  length: TalkLength;
  /** A written script landed, this many words long. */
  onWritten: (words: number) => void;
  offer: number | null;
  /** What the box held before the agent's topic filled it. */
  before: string | null;
}) {
  const script = typed.script ?? "";
  const [undo, setUndo] = useState<string | null>(before);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // the writer runs outside React (presenter.ts): its script lands in this box, or the next one opened
  const [job, setJob] = useState(talkScript);
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const written = useRef(onWritten);
  written.current = onWritten;
  useEffect(() => {
    const take = (j: ReturnType<typeof talkScript>) => {
      setJob(j);
      const s = takeScript();
      if (!s?.say) return;
      if (scriptRef.current.trim() && scriptRef.current !== s.say) setUndo(scriptRef.current);
      setTyped((t) => ({ ...t, script: s.say, headline: s.headline ?? "" }));
      written.current(countWords(s.say));
    };
    take(talkScript());
    return onTalkScript(take);
  }, [setTyped]);
  const writing = job?.state === "writing";
  const left = useUsesLeft(writing);
  // the box holds the script just written (or is too long to be a topic): write again from the same topic
  const again = !!job?.topic && ((job.state === "done" && script === job.say) || script.trim().length > MAX_TOPIC);
  const topic = again ? job!.topic : script.trim();
  const canWrite = topic.length >= 5 && topic.length <= MAX_TOPIC;
  const offerName = offer === null ? null : offerNames(userId)[offer];
  const n = countWords(script);
  const adviser = adviserBrand(userId);
  const flags = useMemo(() => {
    if (!adviser) return [];
    const mas = job?.state === "done" && job.mas && job.say === script ? [MAS_FLAG] : [];
    return [...scanCompliance(script), ...mas].filter((f) => !dismissed.has(f.id));
  }, [adviser, script, job, dismissed]);

  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-3 pt-4 sm:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="make-script" className={FIELD_LABEL}>Script</Label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {undo !== null && (
              <Button size="sm" variant="ghost" className={TOUCH} onClick={() => { setTyped((t) => ({ ...t, script: undo })); setUndo(null); }}>Undo</Button>
            )}
            <Button size="sm" variant="outline" className={`gap-1.5 ${TOUCH}`} disabled={writing || !canWrite || left("ai-video-script") === 0}
              onClick={() => void writeTalkScript({ talk, topic, offer: offerName })}>
              {writing && <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {again ? "Write it again" : "Write it for me"}
            </Button>
          </div>
        </div>
        <Textarea
          id="make-script"
          rows={5}
          value={script}
          maxLength={SAY_MAX}
          disabled={writing}
          placeholder="What they say, or a topic to write it from"
          onChange={(e) => { const v = e.target.value; setTyped((t) => ({ ...t, script: v })); setUndo(null); }}
        />
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {talkLine(n, length)}
          </p>
          {canWrite && <span className="text-xs"><PriceChip feature="ai-video-script" left={left("ai-video-script")} /></span>}
        </div>
        {job?.state === "failed" && <p className="text-xs text-destructive" role="alert">{job.error}</p>}
        {adviser && <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(id))} />}
        {talk === "news" && (
          <div className="space-y-1.5">
            <Label htmlFor="make-headline" className={FIELD_LABEL}>Banner headline</Label>
            <Input id="make-headline" value={typed.headline ?? ""} maxLength={BANNER_MAX} className="h-11 sm:h-10" onChange={(e) => { const v = e.target.value; setTyped((t) => ({ ...t, headline: v })); }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
