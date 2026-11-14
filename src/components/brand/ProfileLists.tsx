// Brand > Profile's lists (/playbook), as Fastlane's Profile has them: a label with "0 of 10", the rows, and Add opening
// one field in place. Each list saves to the store its writers already read (voiceMemory.ts learnings and facts), or
// to the brand kit for what code adds (legal lines), so nothing here is sent anywhere new. Remove has Undo, as /voice.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { NO_ROOM, kitOf } from "@/components/brand/profileSave";
import { guidelineLines } from "@/lib/brandRules";
import { MAX_LEGAL, MAX_LEGAL_CHARS, MAX_PROMO_CHARS, MAX_SAY, MAX_SAY_CHARS, livePromo, localDay, saveBrand } from "@/lib/carousel";
import { loadProducts } from "@/lib/products";
import { ownBrandName } from "@/lib/remixBrand";
import { adviserBrand } from "@/lib/profession";
import {
  FACT_CHARS, FACT_KINDS, LEARNING_CHARS, MAX_FACTS, RULES, addFact, addFactOf, addRule, dayWords, factsOf, fullLine, isOn, loadFacts, onMemoryChanged, proofFacts, rulesOf,
  setFactOff, setLearningOff,
  type FactKind, type RuleKind,
} from "@/lib/voiceMemory";

/** A Profile group's heading and its one card, the way ProfileRows draws them. */
export const GROUP_H2 = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
export const GROUP_CARD = "divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card";
const TOUCH = "[@media(pointer:coarse)]:h-11";

/** Re-reads on a save here, in another tab or from sync. */
export function useMemoryRead<T>(read: () => T, deps: unknown[]): T {
  const [v, setV] = useState(read);
  useEffect(() => {
    setV(read());
    return onMemoryChanged(() => setV(read()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

/** A Remove that says Removed with Undo, as /voice's rows do. */
export function useRemove() {
  const { toast } = useToast();
  return (off: (on: boolean) => { ok: true } | { ok: false; error: string }) => {
    const r = off(true);
    if ("error" in r) return toast({ title: r.error, variant: "destructive" });
    toast({
      title: "Removed.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo" onClick={() => { const u = off(false); if ("error" in u) toast({ title: u.error, variant: "destructive" }); }}>
          Undo
        </ToastAction>
      ),
    });
  };
}

export function CountedList({ id, label, hint, rows, max, chars, placeholder, add, remove }: {
  id: string;
  label: string;
  hint?: ReactNode;
  rows: { id: string; text: string }[];
  max: number;
  chars: number;
  placeholder: string;
  /** Saves one; the line to show when it couldn't. */
  add: (text: string) => string | null;
  remove: (rowId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const full = rows.length >= max;
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const error = add(text);
    if (error) return setLine(error);
    setText("");
    setLine(null);
  };
  return (
    <div id={id} className="scroll-mt-20 space-y-2 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{rows.length} of {max}</span>
        {!open && (
          <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => setOpen(true)} className={`ml-auto h-9 gap-1 px-2 text-primary ${TOUCH}`}>
            <PlusIcon className="h-3.5 w-3.5" aria-hidden /> Add
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-1 rounded-md bg-muted/40 pl-3 text-sm">
              <span className="min-w-0 flex-1 py-2 [overflow-wrap:anywhere]">{r.text}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${r.text}`} title="Remove" onClick={() => remove(r.id)}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <XIcon className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} className="flex flex-wrap gap-2">
          <Input ref={field} aria-label={`Add to ${label}`} value={text} maxLength={chars} placeholder={placeholder} disabled={full}
            onChange={(e) => (setText(e.target.value), setLine(null))} className={`min-w-0 flex-1 basis-48 ${TOUCH}`} />
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={full || !text.trim()} className={TOUCH}>Add</Button>
            <Button type="button" variant="ghost" onClick={() => (setOpen(false), setText(""), setLine(null))} className={`text-muted-foreground ${TOUCH}`}>Done</Button>
          </div>
        </form>
      )}
      {(line || (open && full)) && (
        <p className={`text-xs ${line ? "text-destructive" : "text-muted-foreground"}`} role={line ? "alert" : undefined}>
          {line ?? `${max} is the most. Remove one to add another.`}
        </p>
      )}
    </div>
  );
}

/** One of the Profile's learning lists (Do, Don't): its rows, Add and Remove. */
export function RuleList({ uid, kind, label, hint, placeholder }: { uid: string; kind: RuleKind; label: string; hint?: ReactNode; placeholder: string }) {
  const rows = useMemoryRead(() => rulesOf(uid, kind), [uid, kind]);
  const removed = useRemove();
  return (
    <CountedList id={kind} label={label} hint={hint} rows={rows} max={RULES[kind].max} chars={LEARNING_CHARS - RULES[kind].lead.length} placeholder={placeholder}
      add={(t) => { const r = addRule(uid, kind, t); return "error" in r ? r.error : null; }}
      remove={(id) => removed((off) => setLearningOff(uid, id, off))} />
  );
}

/** Tone and voice's Do and Don't, under its rows. */
export function ToneLists({ uid }: { uid: string }) {
  return (
    <div className={GROUP_CARD}>
      <p className="px-4 py-3 text-xs text-muted-foreground">Every caption and script the AI writes follows these.</p>
      <RuleList uid={uid} kind="do" label="Do" placeholder="Write like you talk to a friend" />
      <RuleList uid={uid} kind="dont" label="Don't" placeholder="Open with a question" />
    </div>
  );
}

/** One of the Profile's fact lists (Product claims, Reviews, Stock and dates): its rows, Add and Remove. */
export function FactList({ uid, kind, id, label, hint, placeholder }: { uid: string; kind: FactKind; id: string; label: string; hint?: ReactNode; placeholder: string }) {
  const rows = useMemoryRead(() => factsOf(uid, kind), [uid, kind]);
  const removed = useRemove();
  const cap = FACT_KINDS[kind].max ?? MAX_FACTS;
  return (
    <CountedList id={id} label={label} hint={hint} rows={rows} max={cap} chars={FACT_CHARS - FACT_KINDS[kind].lead.length} placeholder={placeholder}
      add={(t) => { const r = addFactOf(uid, kind, t); return "error" in r ? r.error : null; }}
      remove={(rowId) => removed((off) => setFactOff(uid, rowId, off))} />
  );
}

const legalOf = (uid: string) => kitOf(uid).legal ?? [];
const saveLegal = (uid: string, lines: string[]) => saveBrand(uid, { ...kitOf(uid), legal: lines });

/** Adds a legal line to the brand kit; the line to show when it couldn't. */
export function addLegal(uid: string, text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Type one first.";
  const now = legalOf(uid);
  if (now.some((l) => l.toLowerCase() === t.toLowerCase())) return null;
  if (now.length >= MAX_LEGAL) return fullLine(MAX_LEGAL);
  if (t.length > MAX_LEGAL_CHARS) return `Keep it under ${MAX_LEGAL_CHARS} characters.`;
  saveLegal(uid, [...now, t]);
  return legalOf(uid).length > now.length ? null : NO_ROOM;
}

/** The brand kit's legal lines: added to the end of every ad's text (RunAsAdSheet, plainText withLegal). */
function LegalList({ uid }: { uid: string }) {
  const [rows, setRows] = useState(() => legalOf(uid));
  const removed = useRemove();
  // brand kit saves fire no event, so the list reads again on LEGAL_CHANGED: its own changes and an import's
  useEffect(() => onLegalChanged(() => setRows(legalOf(uid))), [uid]);
  return (
    <CountedList id="legal" label="Legal lines" hint="Lines your ads must carry, added to the end of each one." rows={rows.map((text, i) => ({ id: String(i), text }))}
      max={MAX_LEGAL} chars={MAX_LEGAL_CHARS} placeholder={adviserBrand(uid) ? "This advertisement has not been reviewed by the Monetary Authority of Singapore." : "Terms and conditions apply."}
      add={(t) => { const e = addLegal(uid, t); legalChanged(); return e; }}
      remove={(rowId) => {
        const line = rows[Number(rowId)];
        removed((off) => {
          const now = legalOf(uid);
          if (!off && now.length >= MAX_LEGAL) return { ok: false, error: fullLine(MAX_LEGAL) };
          saveLegal(uid, off ? now.filter((l) => l !== line) : [...now, line]);
          legalChanged();
          return { ok: true };
        });
      }} />
  );
}

const LEGAL_CHANGED = "content-studio-legal-changed";
const legalChanged = () => window.dispatchEvent(new Event(LEGAL_CHANGED));
const onLegalChanged = (fn: () => void) => {
  window.addEventListener(LEGAL_CHANGED, fn);
  return () => window.removeEventListener(LEGAL_CHANGED, fn);
};

const PICKS = [
  { id: "legal", label: "Legal line" },
  { id: "claim", label: "Product claim" },
  { id: "avoid", label: "Avoid" },
  { id: "do", label: "Do" },
  { id: "dont", label: "Don't" },
] as const;
type Pick = (typeof PICKS)[number]["id"];
const LABEL = Object.fromEntries(PICKS.map((p) => [p.id, p.label])) as Record<Pick, string>;
/** The most characters a line may have in each list. */
const ROOM: Record<Pick, number> = {
  legal: MAX_LEGAL_CHARS,
  claim: FACT_CHARS - FACT_KINDS.claim.lead.length,
  avoid: LEARNING_CHARS - RULES.avoid.lead.length,
  do: LEARNING_CHARS - RULES.do.lead.length,
  dont: LEARNING_CHARS - RULES.dont.lead.length,
};

function addPicked(uid: string, kind: Pick, text: string): string | null {
  if (text.length > ROOM[kind]) return `too long for ${LABEL[kind]}`;
  if (kind === "legal") return addLegal(uid, text);
  const r = kind === "claim" ? addFactOf(uid, "claim", text) : addRule(uid, kind, text);
  return "error" in r ? r.error : null;
}

/** "Paste your brand guidelines": each line with a tick and the list it goes to; Add puts the ticked ones in. */
function GuidelinesImport({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lines, setLines] = useState<{ text: string; on: boolean; kind: Pick }[] | null>(null);
  const [line, setLine] = useState("");
  const ticked = lines?.filter((l) => l.on).length ?? 0;
  const set = (i: number, patch: Partial<{ on: boolean; kind: Pick }>) => setLines((ls) => ls && ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = () => {
    if (!lines) return;
    const kept: typeof lines = [];
    const why = new Set<string>();
    let added = 0;
    for (const l of lines) {
      if (!l.on) {
        kept.push(l);
        continue;
      }
      const error = addPicked(uid, l.kind, l.text);
      if (error) {
        kept.push(l);
        why.add(error.replace(/\.$/, ""));
      } else added++;
    }
    legalChanged();
    setLines(kept);
    setLine(`Added ${added}.${why.size ? ` ${ticked - added} not added: ${[...why].join("; ")}.` : ""}`);
  };
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">Have brand guidelines? Paste them and pick which lines to keep.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className={`h-9 ${TOUCH}`}>Paste your brand guidelines</Button>
      </div>
    );
  }
  return (
    <div id="guidelines" className="scroll-mt-20 space-y-3 px-4 py-3.5">
      <Label htmlFor="pe-guidelines">Your brand guidelines</Label>
      {!lines ? (
        <>
          <Textarea id="pe-guidelines" rows={6} value={text} maxLength={20000} onChange={(e) => setText(e.target.value)}
            placeholder="Paste the text from your guidelines. Each line becomes one you can keep." />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!text.trim()} onClick={() => (setLines(guidelineLines(text).map((t) => ({ text: t, on: false, kind: "do" as Pick }))), setLine(""))} className={`h-9 ${TOUCH}`}>
              Show the lines
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => (setOpen(false), setText(""))} className={`h-9 text-muted-foreground ${TOUCH}`}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          {lines.length ? (
            <ul className="space-y-1.5">
              {lines.map((l, i) => (
                <li key={`${i}-${l.text}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-1.5 text-sm">
                  <label className="flex min-h-9 min-w-0 flex-1 basis-56 cursor-pointer items-start gap-2.5 py-1 [@media(pointer:coarse)]:min-h-11">
                    <input type="checkbox" checked={l.on} onChange={(e) => set(i, { on: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{l.text}</span>
                  </label>
                  <select aria-label={`List for: ${l.text}`} value={l.kind} onChange={(e) => set(i, { kind: e.target.value as Pick, on: true })}
                    className={`h-9 rounded-md border border-input bg-background px-2 text-sm ${TOUCH}`}>
                    {PICKS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Every line is in.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {lines.length > 0 && <Button type="button" size="sm" disabled={!ticked} onClick={add} className={`h-9 ${TOUCH}`}>{ticked ? `Add ${ticked} ticked` : "Tick the lines to keep"}</Button>}
            <Button type="button" variant="ghost" size="sm" onClick={() => (setOpen(false), setText(""), setLines(null), setLine(""))} className={`h-9 text-muted-foreground ${TOUCH}`}>Done</Button>
            <p aria-live="polite" className="text-xs text-muted-foreground">{line}</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Fastlane's Rules: the guidelines import, then Legal lines, Product claims and Avoid. */
export function RulesSection({ uid }: { uid: string }) {
  return (
    <section id="rules" aria-labelledby="rules-title" className="scroll-mt-20 space-y-2">
      <h2 id="rules-title" className={GROUP_H2}>Rules</h2>
      <div className={GROUP_CARD}>
        <p className="px-4 py-3 text-xs text-muted-foreground">Every ad, script and caption the AI makes follows these.</p>
        <GuidelinesImport uid={uid} />
        <LegalList uid={uid} />
        <FactList uid={uid} kind="claim" id="claims" label="Product claims" hint="Claims your ads and posts can make." placeholder="Set up in 10 minutes" />
        <RuleList uid={uid} kind="avoid" label="Avoid" hint="What your content never shows or says. A post that uses one is flagged." placeholder="Guaranteed returns" />
      </div>
    </section>
  );
}

/** Fastlane's Current promotion: the offer's exact words and an optional last day, kept on the brand kit; every writer
 * gets it as a fact while it runs (voiceMemory memoryLine, carousel livePromo) and stops after the last day. */
export function PromoSection({ uid }: { uid: string }) {
  const [saved, setSaved] = useState(() => kitOf(uid).promo);
  const [text, setText] = useState(saved?.text ?? "");
  const [until, setUntil] = useState(saved?.until ?? "");
  const [error, setError] = useState("");
  const write = (promo: { text: string; until?: string } | undefined) => {
    saveBrand(uid, { ...kitOf(uid), promo });
    setSaved(kitOf(uid).promo);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (until && until < localDay()) return setError("Pick a last day from today on.");
    write({ text: text.trim(), ...(until ? { until } : {}) });
    setError("");
  };
  const none = () => {
    write(undefined);
    setText("");
    setUntil("");
    setError("");
  };
  const changed = text.trim() !== (saved?.text ?? "") || until !== (saved?.until ?? "");
  const status = !saved ? "" : livePromo({ promo: saved }) ? (saved.until ? `On until ${dayWords(saved.until)}.` : "On, with no last day.") : `Ended ${dayWords(saved.until!)}. The AI no longer uses it.`;
  return (
    <section id="promotion" aria-labelledby="promotion-title" className="scroll-mt-20 space-y-2">
      <h2 id="promotion-title" className={GROUP_H2}>Current promotion</h2>
      <form onSubmit={save} className="space-y-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 shadow-card">
        <p className="text-xs text-muted-foreground">The AI uses your exact words while it runs, and stops after the last day.</p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="pe-promo">Your current offer</Label>
            <Input id="pe-promo" value={text} maxLength={MAX_PROMO_CHARS} placeholder="20% off your first month" onChange={(e) => (setText(e.target.value), setError(""))} className={TOUCH} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="pe-promo-until">Last day <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="pe-promo-until" type="date" min={localDay()} value={until} onChange={(e) => (setUntil(e.target.value), setError(""))} className={TOUCH} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={!text.trim() || !changed} className={`h-9 ${TOUCH}`}>Save offer</Button>
          <Button type="button" size="sm" variant="outline" disabled={!saved && !text && !until} onClick={none} className={`h-9 ${TOUCH}`}>No offer</Button>
          <p aria-live="polite" className={`text-xs ${error ? "text-destructive" : status.startsWith("On") ? "text-success" : "text-muted-foreground"}`}>{error || status}</p>
        </div>
      </form>
    </section>
  );
}

/** The names a voice may say: the brand's own and each product it sells, once each. */
export function sayableNames(uid: string): string[] {
  const seen = new Set<string>();
  return [ownBrandName(uid), ...loadProducts(uid).items.filter((p) => p.use).map((p) => p.name)]
    .map((n) => n.trim())
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .slice(0, MAX_SAY);
}

function NameRow({ name, saved, onSave }: { name: string; saved?: string; onSave: (say: string) => void }) {
  const [v, setV] = useState(saved ?? name);
  const checked = saved !== undefined && v.trim() === saved;
  return (
    <li className="px-4 py-3 sm:flex sm:items-center sm:gap-4">
      <span className="block text-sm font-medium text-foreground [overflow-wrap:anywhere] sm:w-40 sm:shrink-0">{name}</span>
      <form onSubmit={(e) => (e.preventDefault(), v.trim() && onSave(v.trim()))} className="mt-2 flex min-w-0 flex-1 items-center gap-2 sm:mt-0">
        <Input aria-label={`How ${name} is said`} value={v} maxLength={MAX_SAY_CHARS} onChange={(e) => setV(e.target.value)} className={`min-w-0 flex-1 ${TOUCH}`} />
        {checked ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-1 px-2 text-sm font-medium text-success"><CheckIcon className="h-4 w-4" aria-hidden /> Checked</span>
        ) : (
          <Button type="submit" variant="outline" size="sm" disabled={!v.trim()} className={`h-9 shrink-0 ${TOUCH}`}>{v.trim() === name ? "Yes" : "Save"}</Button>
        )}
      </form>
    </li>
  );
}

/** Fastlane's How Senna says your names: a respelling per name, which only text-to-speech gets (sayNames.ts). */
export function NamesSection({ uid }: { uid: string }) {
  const names = sayableNames(uid);
  const [say, setSay] = useState(() => kitOf(uid).say ?? []);
  const save = (name: string, v: string) => {
    saveBrand(uid, { ...kitOf(uid), say: [...(kitOf(uid).say ?? []).filter((n) => n.name !== name), { name, say: v }] });
    setSay(kitOf(uid).say ?? []);
  };
  return (
    <section id="names" aria-labelledby="names-title" className="scroll-mt-20 space-y-2">
      <h2 id="names-title" className={GROUP_H2}>How your names are said</h2>
      <div className={GROUP_CARD}>
        <p className="px-4 py-3 text-xs text-muted-foreground">Videos with a voice say each name this way. Check it, or spell it the way it sounds.</p>
        {names.length ? (
          <ul className="divide-y divide-border/60">
            {names.map((n) => <NameRow key={n} name={n} saved={say.find((s) => s.name === n)?.say} onSave={(v) => save(n, v)} />)}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">Add your name under Identity first.</p>
        )}
      </div>
    </section>
  );
}

/** Proof's Figures: the facts typed on /voice, with no lead (voiceMemory proofFacts). */
function FigureList({ uid }: { uid: string }) {
  const rows = useMemoryRead(() => proofFacts(loadFacts(uid)).filter(isOn).map((f) => ({ id: f.id, text: f.text })), [uid]);
  const removed = useRemove();
  return (
    <CountedList id="figures" label="Figures" rows={rows} max={MAX_FACTS} chars={FACT_CHARS} placeholder={adviserBrand(uid) ? "12 years as an adviser" : "48 cafes use it"}
      add={(t) => { const r = addFact(uid, t); return "error" in r ? r.error : null; }}
      remove={(id) => removed((off) => setFactOff(uid, id, off))} />
  );
}

/** Fastlane's Proof: Reviews, Figures and Stock and dates, the facts the writers may print (memoryLine). An adviser's
 * brand gets no Reviews list, as it is never offered a testimonial (remix decision 12). */
export function ProofLists({ uid }: { uid: string }) {
  return (
    <div className={GROUP_CARD}>
      <p className="px-4 py-3 text-xs text-muted-foreground">Real words and numbers the AI may print. It never invents a review, a figure or a date.</p>
      {!adviserBrand(uid) && <FactList uid={uid} kind="review" id="reviews" label="Reviews" placeholder={'"Books closed by the 5th, every month." Mei, cafe owner'} />}
      <FigureList uid={uid} />
      <FactList uid={uid} kind="stock" id="stock" label="Stock and dates" placeholder="New menu from 1 December" />
    </div>
  );
}
