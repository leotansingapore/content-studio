// A video format made on its own page (/make/<slug>, Leo's; src/lib/formatMaker.ts says which formats): a presenter
// talk (News anchor, Stage talk, Spokesperson) or an editor template, set up here the way Fastlane's format pages do,
// instead of in the video editor. Talks: the script, with "Write it for me" (ai-video talk-script, presenter.ts, the
// editor's own writer) and the news banner. Templates: the template's own blanks. Under each, the words against the
// length (speakingWords), and the lengths its maker takes as chips; a written script moves the length to the one it
// fills. Typed words stay on this device (formatMaker.ts loadTyped).
// URL (docs/deep-links.md): length=<seconds> (replace), one of lengthsOf.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CircleNotchIcon } from "@phosphor-icons/react";
import ComplianceChips from "@/components/ComplianceChips";
import FormatShell from "@/components/make/FormatShell";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChip } from "@/components/ui/filter-chip";
import { Textarea } from "@/components/ui/textarea";
import type { FormatDef } from "@/data/formats";
import { useUsesLeft } from "@/lib/aiUsage";
import { scanCompliance } from "@/lib/compliance";
import { clipWordLine, countWords, lengthsOf, loadTyped, saveTyped, spokenKeys, startLength, talkLine, type Maker, type Typed } from "@/lib/formatMaker";
import { MAS_FLAG, loadTalk, offerNames, onTalkScript, pickOffer, takeScript, talkScript, writeTalkScript } from "@/lib/presenter";
import { adviserBrand } from "@/lib/profession";
import { lengthFor, type TalkLength } from "@/lib/talkingHead";
import { useUrlState } from "@/lib/urlState";
import { BANNER_MAX } from "@/lib/videoEdit";
import { MAX_FIELD, MAX_TOPIC } from "../../../supabase/functions/ai-video/logic.ts";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const SAY_MAX = 600;
const MOTION = "(hover: hover) and (prefers-reduced-motion: no-preference)";

export default function MakeHere({ def, maker, userId }: { def: FormatDef & { opens: () => string }; maker: Maker; userId: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [typed, setTyped] = useState<Typed>(() => loadTyped(def.slug, userId));
  useEffect(() => saveTyped(def.slug, userId, typed), [def.slug, userId, typed]);
  const lengths = lengthsOf(maker);
  const [lengthParam, setLengthParam] = useUrlState<string>("length", String(startLength(maker)), { allowed: lengths.map(String) });
  const length = Number(lengthParam);
  const setLength = (n: number) => setLengthParam(String(n));

  const options = (
    <>
      {def.preview && <Examples def={def} />}
      {maker.kind === "talk" ? (
        <TalkScript userId={userId} talk={maker.talk} typed={typed} setTyped={setTyped} length={length as TalkLength} onWritten={(n) => setLength(lengthFor(n))} offer={pickOffer(offerNames(userId), params.get("offer"), loadTalk(userId).offer)} />
      ) : (
        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-3 pt-4 sm:pt-5">
            {maker.template.fields.map((f) => (
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
            {spokenKeys(maker.template).length > 0 && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {clipWordLine(countWords(spokenKeys(maker.template).map((k) => typed.fields?.[k] ?? "").join(" ")), length)}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <Field label="Length">
            {lengths.map((n) => (
              <FilterChip key={n} active={length === n} onClick={() => setLength(n)}>{n} s</FilterChip>
            ))}
          </Field>
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
