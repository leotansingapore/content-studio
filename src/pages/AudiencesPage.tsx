// Audiences (/audiences, Leo's sign-ins only; docs/north-star/items/brand-audiences.md): the named groups a brand's
// posts are for. The list (src/lib/audiences.ts) is seeded once from positioning; Suggest reads the brand's website
// or profile in a job outside React (src/lib/audienceSuggest.ts) whose rows wait for this tab until Keep or Remove.
// ?open=<id> opens a row's editor (push, so Back closes it; inline from lg up, a bottom sheet below); ?open=new
// opens a blank one. Fields save as they are typed, with the header's Saved tick. Everyone else gets the 404 page.

import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  type Audience, AUDIENCE_LIMITS, FULL_LINE, loadAudiences, MAX_ACTIVE, onAudiencesChanged, removeAudience, saveAudience, setMain, whoRepeatsName } from "@/lib/audiences";
import {
  hasProfile, keepAllSuggested, keepSuggested, loadWaiting, onSuggest, removeSuggested, siteFor, startSuggest, statusLine, suggestFailed,
  suggestingNow, type Waiting,
} from "@/lib/audienceSuggest";
import { links } from "@/lib/links";
import { speakerFor } from "@/lib/remixBrand";
import type { PlanAudience } from "@/lib/positioning";
import { reasonText } from "@/lib/prices";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useGoneItem, useUrlItem, useUrlUpdate } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
// Write's own chip words for the five life stages
const STAGES: { value: PlanAudience; label: string }[] = [
  { value: "general", label: "General" },
  { value: "young-adult", label: "Young adult" },
  { value: "working-adult", label: "Working adult" },
  { value: "parent", label: "Parent" },
  { value: "pre-retiree", label: "Pre-retiree" },
];
const NO_SOURCE = "Type your website, or say who you serve in Plan setup first.";

export default function AudiencesPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Audiences userId={leo.id} />;
}

function Audiences({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = onSuggest(redraw);
    const offList = onAudiencesChanged(redraw);
    return () => {
      off();
      offList();
    };
  }, []);
  const list = loadAudiences(userId);
  const running = suggestingNow(userId);
  const failed = suggestFailed(userId);
  const waiting = loadWaiting(userId);
  const [address, setAddress] = useState(() => running?.host || siteFor(userId));
  const left = useUsesLeft(Boolean(running))("audience-suggest");
  const why = reasonText({ left, leo: true });
  const full = list.length >= MAX_ACTIVE;
  const blocked = !address.trim() && !hasProfile(userId);
  const [line, setLine] = useState("");

  // the header's Saved tick, as /brand shows it
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(0);
  const flash = () => {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  };

  // ?open=<id> opens the editor (push); an id that is gone says so and leaves
  const [open, openEditor, closeEditor] = useUrlItem("open");
  useGoneItem("open", open && open !== "new" ? list.some((a) => a.id === open) : undefined, "audience");
  const editing = open === "new" ? (full ? null : "new") : list.find((a) => a.id === open)?.id ?? null;
  // a new one keeps its editor (and what is half typed) when its first save names it in the address
  const [created, setCreated] = useState<string | null>(null);

  const suggest = (e: FormEvent) => {
    e.preventDefault();
    setLine("");
    void startSuggest(userId, address);
  };
  const keepOne = (i: number) => {
    const error = keepSuggested(userId, i);
    setLine(error ?? "");
    if (!error) flash();
  };
  const keepAll = () => {
    const r = keepAllSuggested(userId);
    setLine(r.error ?? "");
    if (r.kept) flash();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Audiences</h1>
          <InfoTip label="About audiences">Who your posts are for. Write uses the one you pick.</InfoTip>
        </div>
        <span aria-live="polite" className={`flex items-center gap-1 text-xs font-medium text-success transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          <Check className="h-3.5 w-3.5" /> Saved
        </span>
      </header>

      <div className={`grid items-start gap-6 ${editing ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]" : ""}`}>
        <div className="min-w-0 space-y-4">
          <section className="space-y-2 rounded-xl border border-border/60 p-4 shadow-card" aria-label="Suggest audiences">
            <form onSubmit={suggest} className="flex flex-wrap gap-2">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="yoursite.sg" inputMode="url" autoCapitalize="none" autoCorrect="off"
                aria-label="Your website" className="min-w-[10rem] flex-1" disabled={!!running} />
              <Button type="submit" variant={waiting ? "outline" : "default"} className={`shrink-0 ${TOUCH}`} disabled={!!running || left === 0 || blocked}>
                {running ? "Suggesting..." : address.trim() ? "Suggest from my website" : "Suggest from my profile"}
              </Button>
            </form>
            <p><PriceChip feature="audience-suggest" left={left} /></p>
            {why && <p className="text-xs text-destructive">{why}</p>}
            {blocked && !running && <p className="text-xs text-muted-foreground">{NO_SOURCE}</p>}
            {failed && !running && (
              <p className={`text-sm ${failed.code === "none_new" ? "text-muted-foreground" : "text-destructive"}`} role="alert">{failed.line}</p>
            )}
          </section>

          {running ? (
            <div className="space-y-2" aria-live="polite">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl border border-dashed border-border bg-muted/40" />)}
              <p className="text-sm text-muted-foreground">{statusLine(running)}</p>
            </div>
          ) : waiting ? (
            <Suggestions waiting={waiting} full={full} onKeep={keepOne} onKeepAll={keepAll} onRemove={(i) => removeSuggested(userId, i)} />
          ) : null}

          <section className="space-y-3" aria-label="Your audiences">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button variant="outline" className={TOUCH} onClick={() => openEditor("new")} disabled={full}>Add one yourself</Button>
              {list.length > 0 && <span className="ml-auto text-xs font-semibold text-muted-foreground">{list.length} of {MAX_ACTIVE}</span>}
            </div>
            {/* with rows waiting, the line sits under their disabled Keep buttons instead */}
            {full && !waiting && !running && <p className="text-xs text-muted-foreground">{FULL_LINE}</p>}
            {line && <p className="text-sm text-destructive" role="alert">{line}</p>}
            {list.length > 0 && (
              <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                {list.map((a) => <Row key={a.id} a={a} open={a.id === editing} onOpen={() => openEditor(a.id)} />)}
              </ul>
            )}
          </section>
        </div>

        {editing && (
          <Editor
            key={editing === created ? "new" : editing}
            userId={userId}
            audience={list.find((a) => a.id === editing) ?? null}
            onClose={closeEditor}
            onSaved={flash}
            onCreated={setCreated}
            onRemoved={(gone) => {
              closeEditor();
              toast({
                title: `Removed ${gone.name}.`,
                action: (
                  <ToastAction altText="Undo" onClick={() => {
                    if (loadAudiences(userId).length >= MAX_ACTIVE) return toast({ title: FULL_LINE, variant: "destructive" });
                    saveAudience(userId, { ...gone, offAt: undefined });
                  }}>
                    Undo
                  </ToastAction>
                ),
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function Row({ a, open, onOpen }: { a: Audience; open: boolean; onOpen: () => void }) {
  return (
    <li className={`flex items-start gap-3 p-3 ${open ? "bg-muted/40" : ""}`}>
      <button type="button" onClick={onOpen} aria-expanded={open} className="min-w-0 flex-1 space-y-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="break-words text-sm font-semibold">{a.name}</span>
          {a.main && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Main</span>}
        </span>
        {a.who && !whoRepeatsName(a) && <span className="line-clamp-2 block text-xs text-muted-foreground">{a.who}</span>}
        {a.cares.length > 0 && <span className="block text-xs">{a.cares.join(" | ")}</span>}
      </button>
      <Button size="sm" variant="outline" className={`h-9 shrink-0 ${TOUCH}`} asChild>
        <Link to={links.generate({ aud: a.id })}>Write for them</Link>
      </Button>
    </li>
  );
}

function Suggestions({ waiting, full, onKeep, onKeepAll, onRemove }: {
  waiting: Waiting;
  full: boolean;
  onKeep: (i: number) => void;
  onKeepAll: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <section className="space-y-2" aria-label="Suggested audiences">
      {!waiting.scored && <p className="text-xs text-muted-foreground">Check each one: we couldn't sort these, so each is set to General.</p>}
      <ul className="space-y-2">
        {waiting.audiences.map((s, i) => (
          <li key={`${i}-${s.name}`} className="space-y-1 rounded-xl border border-dashed border-primary/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words text-sm font-semibold">{s.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">suggested</span>
              <span className="text-[11px] text-muted-foreground">{STAGES.find((x) => x.value === s.lifeStage)?.label}</span>
            </div>
            {s.who && <p className="text-xs text-muted-foreground">{s.who}</p>}
            {s.cares.length > 0 && <p className="text-xs">{s.cares.join(" | ")}</p>}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button size="sm" variant="outline" className={`h-9 ${TOUCH}`} disabled={full} onClick={() => onKeep(i)}>Keep</Button>
              <Button size="sm" variant="ghost" className={`h-9 text-muted-foreground ${TOUCH}`} onClick={() => onRemove(i)}>Remove</Button>
            </div>
          </li>
        ))}
      </ul>
      <Button className={TOUCH} disabled={full} onClick={onKeepAll}>Keep all</Button>
      {full && <p className="text-xs text-muted-foreground">{FULL_LINE}</p>}
    </section>
  );
}

type Fields = Pick<Audience, "name" | "who" | "lifeStage" | "cares"> & { says: string };
const fieldsOf = (a: Audience | null): Fields => ({ name: a?.name ?? "", who: a?.who ?? "", lifeStage: a?.lifeStage ?? "general", cares: a?.cares ?? [], says: a?.says ?? "" });

/** One audience: every field saves as it is typed (a new one once it has a name). */
function Editor({ userId, audience, onClose, onSaved, onCreated, onRemoved }: {
  userId: string;
  audience: Audience | null;
  onClose: () => void;
  onSaved: () => void;
  onCreated: (id: string) => void;
  onRemoved: (gone: Audience) => void;
}) {
  const update = useUrlUpdate();
  const [f, setF] = useState<Fields>(() => fieldsOf(audience));
  const [care, setCare] = useState("");
  const [line, setLine] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const set = (patch: Partial<Fields>) => {
    const next = { ...f, ...patch };
    setF(next);
    if (!next.name.trim()) return setLine(audience ? "Give it a name first." : "");
    const r = saveAudience(userId, { ...next, ...(audience ? { id: audience.id } : { source: "you" as const }) });
    if (r.ok === false) return setLine(r.error);
    setLine("");
    onSaved();
    // a new one now has an id: the address names it (replace, so Back still closes the editor)
    if (!audience) {
      onCreated(r.audience.id);
      update({ open: r.audience.id });
    }
  };
  const addCare = (e?: FormEvent) => {
    e?.preventDefault();
    const c = care.trim().slice(0, AUDIENCE_LIMITS.care);
    if (!c || f.cares.length >= AUDIENCE_LIMITS.cares || f.cares.includes(c)) return;
    setCare("");
    set({ cares: [...f.cares, c] });
  };
  const remove = () => {
    if (!audience) return onClose();
    const error = removeAudience(userId, audience.id);
    if (error) return setLine(error);
    onRemoved(audience);
  };
  const makeMain = () => {
    if (!audience) return;
    const error = setMain(userId, audience.id);
    if (error) return setLine(error);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/40 lg:static lg:z-auto lg:block lg:bg-transparent" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-labelledby="audience-editor-title"
        className="max-h-[88vh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-background p-4 shadow-elegant lg:sticky lg:top-20 lg:max-h-none lg:rounded-xl lg:border lg:border-border/60 lg:shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 id="audience-editor-title" className="truncate font-serif text-lg font-semibold">{audience ? audience.name : "Add an audience"}</h2>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aud-name">Name</Label>
          <Input id="aud-name" ref={first} value={f.name} maxLength={AUDIENCE_LIMITS.name} placeholder="Young parents in their 30s" onChange={(e) => set({ name: e.target.value })} />
          {!audience && !f.name.trim() && <p className="text-xs text-muted-foreground">It saves once it has a name.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aud-who">Who they are</Label>
          <Textarea id="aud-who" rows={3} value={f.who} maxLength={AUDIENCE_LIMITS.who} placeholder="Both working, kids under 10, worried about hospital bills" onChange={(e) => set({ who: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aud-stage">Life stage</Label>
          <select id="aud-stage" value={f.lifeStage} onChange={(e) => set({ lifeStage: e.target.value as PlanAudience })}
            className={`flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ${TOUCH}`}>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aud-care">What they care about</Label>
          {f.cares.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {f.cares.map((c) => (
                <li key={c} className="inline-flex items-center gap-1 rounded-full border border-border/70 py-0.5 pl-2.5 pr-1 text-xs">
                  {c}
                  <button type="button" aria-label={`Remove ${c}`} onClick={() => set({ cares: f.cares.filter((x) => x !== c) })}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {f.cares.length < AUDIENCE_LIMITS.cares && (
            <form onSubmit={addCare} className="flex gap-2">
              <Input id="aud-care" value={care} maxLength={AUDIENCE_LIMITS.care} placeholder="childcare costs" onChange={(e) => setCare(e.target.value)} />
              <Button type="submit" variant="outline" className={`shrink-0 ${TOUCH}`} disabled={!care.trim()}>Add</Button>
            </form>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aud-says">How they talk about {speakerFor(userId) === "person" ? "money" : "it"} (optional)</Label>
          <Input id="aud-says" value={f.says} maxLength={AUDIENCE_LIMITS.says} onChange={(e) => set({ says: e.target.value })} />
        </div>
        {line && <p className="text-sm text-destructive" role="alert">{line}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <Button type="button" className={TOUCH} onClick={onClose}>Done</Button>
          {audience && !audience.main && <Button type="button" variant="outline" className={TOUCH} onClick={makeMain}>Make this the main one</Button>}
          {audience?.main && <span className="text-xs text-muted-foreground">This is the main one.</span>}
          {audience && <Button type="button" variant="ghost" className={`ml-auto text-destructive ${TOUCH}`} onClick={remove}>Remove</Button>}
        </div>
      </section>
    </div>
  );
}
