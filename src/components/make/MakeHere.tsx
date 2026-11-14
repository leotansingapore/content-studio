// A video format made on its own page (/make/<slug>, Leo's; src/lib/formatMaker.ts says which formats): a presenter
// talk (News anchor, Stage talk, Spokesperson) or an editor template, set up here the way Fastlane's format pages do,
// instead of in the video editor. Talks: the script, with "Write it for me" (ai-video talk-script, presenter.ts, the
// editor's own writer) and the news banner. Templates: the template's own blanks. Under each, the words against the
// length (speakingWords), and the lengths its maker takes as chips; a written script moves the length to the one it
// fills. Who speaks (a talk) or who appears (a template with a person photo) as the talking head picks it, then More
// settings, folded with its picks in one line: a talk's voice and new presenter's look, Spokesperson's offer and whether
// its name tag names the business; a template's product and quality; and every format's captions style.
// Typed words stay on this device (formatMaker.ts loadTyped).
// URL (docs/deep-links.md), all replace: length=<seconds> (one of lengthsOf), who=mine|presenter|<presenter id> (a
// template: mine or a presenter id, none for the template's own person), voice=<voice id>, offer=<n> (a brand kit
// offer's place), mention=yes|no, product=<saved product id>, quality=480p|720p, captions=<style>|off, more=open.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CircleNotchIcon } from "@phosphor-icons/react";
import ComplianceChips from "@/components/ComplianceChips";
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
import { LOOKS, MAX_LOOK, CLIP_QUALITIES, type ClipQuality } from "@/lib/aiVideo";
import { scanCompliance } from "@/lib/compliance";
import { clipWordLine, countWords, lengthsOf, loadTyped, pickLine, saveTyped, spokenKeys, startLength, talkLine, type Maker, type Typed } from "@/lib/formatMaker";
import { links } from "@/lib/links";
import { CAPTION_CHOICES, loadPostChoices, nextLook, pickLook, presenterStarts, useCoin, useMentionStart } from "@/lib/postChoices";
import { MAS_FLAG, loadTalk, offerNames, onTalkScript, pickOffer, saveTalk, takeScript, talkScript, writeTalkScript } from "@/lib/presenter";
import { loadProducts, productLabel } from "@/lib/products";
import { adviserBrand } from "@/lib/profession";
import { loadRemixPrefs } from "@/lib/remixBrand";
import { lengthFor, speakerOf, startVoice, startWho, talkPicks, useSpeakers, whoChoices, type TalkLength } from "@/lib/talkingHead";
import { VOICES, VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import { useUrlState } from "@/lib/urlState";
import { BANNER_MAX, styleLabel } from "@/lib/videoEdit";
import { MAX_FIELD, MAX_TOPIC } from "../../../supabase/functions/ai-video/logic.ts";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const SAY_MAX = 600;
const MOTION = "(hover: hover) and (prefers-reduced-motion: no-preference)";
type Captions = (typeof CAPTION_CHOICES)[number];
const captionsLine = (c: Captions) => (c === "off" ? "no captions" : `captions ${styleLabel(c, true)}`);

export default function MakeHere({ def, maker, userId }: { def: FormatDef & { opens: () => string }; maker: Maker; userId: string }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState<Typed>(() => {
    const t = loadTyped(def.slug, userId);
    return t.look ? t : { ...t, look: pickLook(userId, LOOKS) };
  });
  useEffect(() => saveTyped(def.slug, userId, typed), [def.slug, userId, typed]);
  const talk = maker.kind === "talk" ? maker.talk : null;
  const template = maker.kind === "template" ? maker.template : null;

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

  const options = (
    <>
      {def.preview && <Examples def={def} />}
      {talk ? (
        <TalkScript userId={userId} talk={talk} typed={typed} setTyped={setTyped} length={length as TalkLength} onWritten={(n) => setLength(lengthFor(n))} offer={offer} />
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

  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={options}
      result={null}
      footer={{ cap: def.cap ?? null, price: def.price(), label: "Use this format", busyLabel: "", busy: false, onMake: () => navigate(def.opens()) }}
    />
  );
}

/** The script box of a presenter talk, with the format's own writer and, for News anchor, the banner's headline. */
function TalkScript({ userId, talk, typed, setTyped, length, onWritten, offer }: {
  userId: string;
  talk: Extract<Maker, { kind: "talk" }>["talk"];
  typed: Typed;
  setTyped: (f: (t: Typed) => Typed) => void;
  length: TalkLength;
  /** A written script landed, this many words long. */
  onWritten: (words: number) => void;
  offer: number | null;
}) {
  const script = typed.script ?? "";
  const [undo, setUndo] = useState<string | null>(null);
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

/** The format's example: its clip, playing silently while motion is allowed, with controls. */
function Examples({ def }: { def: FormatDef }) {
  const plays = typeof window !== "undefined" && !!window.matchMedia?.(MOTION).matches;
  return (
    <figure className="space-y-1.5">
      <p className={FIELD_LABEL}>Example</p>
      <div className="aspect-[9/16] w-28 overflow-hidden rounded-lg border border-border/60 bg-muted sm:w-32">
        <video src={`/formats/${def.slug}.mp4`} poster={`/formats/${def.slug}.webp`} muted loop playsInline autoPlay={plays} controls aria-label={`${def.name} example`} className="h-full w-full object-cover" />
      </div>
    </figure>
  );
}
