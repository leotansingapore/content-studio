// The screens of the first-run set-up (OnboardingFlow owns the flow, the read and the savers). Each takes the flow and
// a way to change it; none of them saves anything itself.
import type { ReactNode } from "react";
import { CheckIcon, CircleNotchIcon, GlobeIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ProfessionField from "@/components/ProfessionField";
import { PROFESSION_NEEDED, READ_STEPS } from "@/lib/addBrand";
import { DEFAULT_BRAND } from "@/lib/carousel";
import { hostOf } from "@/lib/brandRead";
import {
  canConfirm, firstTopic, NETWORK_KEYS, noSiteReady, openSection, reviewLine, SECTION_NAMES, SECTIONS, type Draft, type Flow, type Network, type Section,
} from "@/lib/onboardingFlow";
import { CADENCE_OPTIONS, GOAL_KINDS, type GoalKind } from "@/lib/positioning";
import { PLATFORM_NAME } from "@/lib/socialConnect";

// Targets here are 44px on every device: these screens have the room, and a phone needs it.
export const QUIET = "inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground hover:underline";
const H1 = "font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl";
const LABEL = "block space-y-1.5 text-sm font-medium";
const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`;
const MAIN = "min-h-11 w-full sm:w-auto";
const FIELD = "h-11 font-normal";

export function WebsiteStep({ value, onChange, onRead, onNoSite }: { value: string; onChange: (v: string) => void; onRead: () => void; onNoSite: () => void }) {
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onRead(); }}>
      <h1 className={H1}><label htmlFor="ob-site">What's your website?</label></h1>
      <Input id="ob-site" value={value} onChange={(e) => onChange(e.target.value)} placeholder="yourbusiness.com" inputMode="url" autoCapitalize="none" autoCorrect="off" autoFocus className="h-12 text-base" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Button type="submit" size="lg" disabled={!value.trim()} className={MAIN}><GlobeIcon /> Read my website</Button>
        <button type="button" onClick={onNoSite} className={QUIET}>I don't have a website</button>
      </div>
    </form>
  );
}

export function NoSiteStep({ draft, patch, onNext, onHaveSite }: { draft: Draft; patch: (p: Partial<Draft>) => void; onNext: () => void; onHaveSite: () => void }) {
  const ready = !!draft.name.trim() && !!draft.profession.trim();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onNext(); }}>
      <h1 className={H1}>Tell us about you</h1>
      <label className={LABEL}>
        Your name or your business's
        <Input value={draft.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} autoFocus className={FIELD} />
      </label>
      <ProfessionField value={draft.profession} onChange={(v) => patch({ profession: v })} emptyIsAdviser={false} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Button type="submit" size="lg" disabled={!ready} className={MAIN}>Continue</Button>
        <button type="button" onClick={onHaveSite} className={QUIET}>I have a website</button>
      </div>
    </form>
  );
}

export function NetworksStep({ picked, onToggle, onNext }: { picked: Network[]; onToggle: (n: Network) => void; onNext: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className={H1} id="ob-networks">Where do you post?</h1>
      <div role="group" aria-labelledby="ob-networks" className="flex flex-wrap gap-2">
        {NETWORK_KEYS.map((n) => (
          <button key={n} type="button" aria-pressed={picked.includes(n)} onClick={() => onToggle(n)} className={chip(picked.includes(n))}>
            {PLATFORM_NAME[n]}
          </button>
        ))}
      </div>
      <Button size="lg" onClick={onNext} className={MAIN}>Continue</Button>
    </div>
  );
}

/** How often, as one tap: the plan's own paces. */
const PACES = CADENCE_OPTIONS.filter((n) => n === 3 || n === 5 || n === 7);

export function ReadingStep({ flow, tick, goals, onGoal, onCadence, onStop }: {
  flow: Flow;
  /** The read step showing its spinner. */
  tick: number;
  goals: Record<GoalKind, string>;
  onGoal: (k: GoalKind) => void;
  onCadence: (n: number) => void;
  onStop: () => void;
}) {
  return (
    <div className="space-y-5">
      <h1 className={H1}>Reading {hostOf(flow.address)}</h1>
      <ol className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-card" aria-live="polite">
        {READ_STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 text-sm ${i > tick ? "text-muted-foreground" : ""}`}>
            {i < tick ? <CheckIcon className="h-4 w-4 text-success" /> : i === tick ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4" />}
            {s}
          </li>
        ))}
      </ol>
      <div className="space-y-2">
        <h2 className="text-sm font-medium" id="ob-goal">What is posting for?</h2>
        <div role="group" aria-labelledby="ob-goal" className="flex flex-wrap gap-2">
          {GOAL_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={flow.goalKind === k} onClick={() => onGoal(k)} className={`${chip(flow.goalKind === k)} h-auto py-2 text-left`}>{goals[k]}</button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-medium" id="ob-pace">How often will you post?</h2>
        <div role="group" aria-labelledby="ob-pace" className="flex flex-wrap gap-2">
          {PACES.map((n) => (
            <button key={n} type="button" aria-pressed={flow.cadence === n} onClick={() => onCadence(n)} className={chip(flow.cadence === n)}>{n === 7 ? "Every day" : `${n} a week`}</button>
          ))}
        </div>
      </div>
      <button type="button" onClick={onStop} className={QUIET}>Fill it in myself</button>
    </div>
  );
}

const summary = (f: Flow, s: Section, logo: boolean): string => {
  const d = f.draft;
  if (s === "brand") return [d.name.trim(), d.profession.trim()].filter(Boolean).join(", ");
  if (s === "look") return [d.colour || "Default colour", logo ? "logo" : ""].filter(Boolean).join(", ");
  return d.topics.trim() || d.voice.trim() || "Not set";
};

export function ReviewStep({ flow, patch, logo, onRemoveLogo, onConfirm, onReopen }: {
  flow: Flow;
  patch: (p: Partial<Draft>) => void;
  /** The logo the read found, as the brand kit holds it. */
  logo: string;
  onRemoveLogo: () => void;
  onConfirm: (s: Section) => void;
  onReopen: (s: Section) => void;
}) {
  const d = flow.draft;
  const open = openSection(flow);
  const { pct, line } = reviewLine(flow);
  const body: Record<Section, ReactNode> = {
    brand: (
      <>
        <label className={LABEL}>
          Name
          <Input value={d.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} className={FIELD} />
        </label>
        <ProfessionField value={d.profession} onChange={(v) => patch({ profession: v })} emptyIsAdviser={false} />
        <label className={LABEL}>
          Your one-line pitch
          <Textarea rows={2} value={d.oneLiner} onChange={(e) => patch({ oneLiner: e.target.value })} placeholder="We help ... so they can ..." className="font-normal" />
        </label>
        <label className={LABEL}>
          Who it's for
          <Input value={d.audienceDetail} onChange={(e) => patch({ audienceDetail: e.target.value })} placeholder="First-time home buyers in their 30s" className={FIELD} />
        </label>
        {!noSiteReady(flow) && <p className="text-sm text-destructive">{d.name.trim() ? PROFESSION_NEEDED : "Add a name first."}</p>}
      </>
    ),
    look: (
      <>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="color" value={d.colour || DEFAULT_BRAND.color} onChange={(e) => patch({ colour: e.target.value })} className="h-11 w-14 rounded border border-border/60 bg-transparent" aria-label="Brand colour" />
          Brand colour
          <span className="font-normal text-muted-foreground">{d.colour || "Default"}</span>
        </label>
        {logo && (
          <div className="flex items-center gap-3 text-sm font-medium">
            {/* a logo is drawn for a white page, in either theme */}
            <img src={logo} alt="Logo" className="h-14 w-14 rounded-lg border border-border/60 bg-white object-contain p-1" />
            <Button type="button" variant="ghost" className="min-h-11" onClick={onRemoveLogo}>Remove logo</Button>
          </div>
        )}
      </>
    ),
    voice: (
      <>
        <label className={LABEL}>
          How you sound
          <Textarea rows={3} value={d.voice} onChange={(e) => patch({ voice: e.target.value })} placeholder="Warm and plain. Short sentences." className="font-normal" />
        </label>
        <label className={LABEL}>
          Topics
          <Input value={d.topics} onChange={(e) => patch({ topics: e.target.value })} placeholder="Topics, separated by commas" className={FIELD} />
        </label>
      </>
    ),
  };
  return (
    <div className="space-y-4">
      <h1 className={H1}>{flow.read === "ok" ? "Check what we found" : "Set up your brand"}</h1>
      {flow.read === "failed" && <p className="text-sm text-destructive" role="alert">{flow.readError} Fill it in below instead.</p>}
      <div className="space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Brand set up">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm font-medium text-muted-foreground" data-testid="ob-review-line">{line}</p>
      </div>
      {SECTIONS.map((s) =>
        flow.confirmed.includes(s) ? (
          <section key={s} className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
            <CheckIcon className="h-4 w-4 shrink-0 text-success" />
            <span className="font-semibold">{SECTION_NAMES[s]}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary(flow, s, !!logo)}</span>
            <Button variant="ghost" className="min-h-11 min-w-11" onClick={() => onReopen(s)} aria-label={`Change ${SECTION_NAMES[s]}`}><PencilSimpleIcon /></Button>
          </section>
        ) : s === open ? (
          <form key={s} className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 shadow-card" onSubmit={(e) => { e.preventDefault(); onConfirm(s); }}>
            <h2 className="text-sm font-semibold">{SECTION_NAMES[s]}</h2>
            {body[s]}
            <Button type="submit" disabled={!canConfirm(flow, s)} className={MAIN}>Confirm {SECTION_NAMES[s].toLowerCase()}</Button>
          </form>
        ) : (
          <section key={s} className="rounded-xl border border-border/60 p-3 text-sm font-semibold text-muted-foreground">{SECTION_NAMES[s]}</section>
        ),
      )}
    </div>
  );
}

export function ConnectStep({ networks, busy, error, onConnect, onNext }: { networks: Network[]; busy: string; error: string; onConnect: (n: Network) => void; onNext: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className={H1}>Connect your accounts</h1>
      <ul className="space-y-2">
        {(networks.length ? networks : [...NETWORK_KEYS]).map((n) => (
          <li key={n} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 text-sm font-medium">
            {PLATFORM_NAME[n]}
            <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => onConnect(n)}>
              {busy === n && <CircleNotchIcon className="animate-spin" />} Connect
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button size="lg" onClick={onNext} className={MAIN}>Continue</Button>
    </div>
  );
}

export function DoneStep({ flow, logo, onWrite }: { flow: Flow; logo: boolean; onWrite: () => void }) {
  const d = flow.draft;
  const topic = firstTopic(flow);
  const rows = [
    ["Brand", summary(flow, "brand", logo)],
    ["Look", summary(flow, "look", logo)],
    ["Voice", d.voice.trim() ? "How you sound is saved" : ""],
    ["Topics", d.topics.trim()],
    ["Posting on", flow.networks.map((n) => PLATFORM_NAME[n]).join(", ")],
    ["First post", topic],
  ].filter((r) => r[1]);
  return (
    <div className="space-y-5">
      <h1 className={H1}>{d.name.trim() || "Your brand"} is set up</h1>
      <ul className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
        {rows.map(([k, v]) => (
          <li key={k} className="flex items-start gap-2 text-sm">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span className="shrink-0 font-semibold">{k}</span>
            <span className="min-w-0 break-words text-muted-foreground">{v}</span>
          </li>
        ))}
      </ul>
      <Button size="lg" onClick={onWrite} className={MAIN}><PencilSimpleIcon /> Write my first post</Button>
    </div>
  );
}
