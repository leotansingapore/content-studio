// Your presenters (/people?tab=presenters; people-presenters, Leo only): up to 4 invented Singaporeans per brand, made
// three at a time on ai-video and kept with a name, and the brand's "Who appears" choice. The Make a presenter sheet is
// ?make=1 and a presenter's card ?presenter=<id> (both push). The make runs in presentersJob.ts, outside React, so the
// sheet can close and the page can be left while it goes on. Every presenter is labelled AI wherever it shows.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, MoreHorizontal, X } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { loadBrand } from "@/lib/carousel";
import { links } from "@/lib/links";
import { loadFace, onFaceChanged } from "@/lib/myFace";
import {
  FULL, MAX_EXTRA, MAX_NAME, MAX_ON, loadPresenters, nameFor, onPresenters, onPresentersChanged, removePresenter, renamePresenter, savePrefs, setWho,
  type Presenter, type Presenters,
} from "@/lib/presenters";
import { clearMake, keepPick, makeState, onMake, resumeMake, startMake } from "@/lib/presentersJob";
import { priceOf, reasonText, sumPrices } from "@/lib/prices";
import { activeProfile, DEFAULT_PROFILE_ID } from "@/lib/profiles";
import { useGoneItem, useScrollToItem, useUrlFlag, useUrlItem, useUrlUpdate } from "@/lib/urlState";

const CARD = "space-y-4 rounded-xl border border-border/60 p-4 shadow-card";
const BIG = "h-11 sm:h-10";
const PILL = "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors sm:min-h-9";
const AI_CHIP = "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground";
const ONE = sumPrices(priceOf("ai-presenter"), priceOf("ai-presenter"), priceOf("ai-presenter"));

type Prefs = Presenters["prefs"];
const CHIPS: { key: keyof Omit<Prefs, "extra">; label: string; options: [string | undefined, string][]; clears?: boolean }[] = [
  { key: "gender", label: "Gender", options: [["woman", "Woman"], ["man", "Man"], [undefined, "Either"]] },
  { key: "age", label: "Age", options: [["20s", "20s"], ["30s", "30s"], ["40s", "40s"], ["50s", "50s+"]], clears: true },
  { key: "background", label: "Background", options: [["chinese", "Chinese"], ["malay", "Malay"], ["indian", "Indian"], ["eurasian", "Eurasian"], [undefined, "Any Singaporean"]] },
  { key: "dress", label: "Dress", options: [["office", "Office"], ["smart-casual", "Smart casual"], ["casual", "Casual"]], clears: true },
];

function brandName(userId: string): string {
  const p = activeProfile(userId);
  return p.id === DEFAULT_PROFILE_ID ? loadBrand(userId)?.name.trim() || "your brand" : p.name;
}

export default function PresentersTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState(() => loadPresenters(userId));
  const [face, setFace] = useState(() => loadFace(userId));
  const make = useSyncExternalStore(onMake, makeState);
  const [sheet, setSheet] = useUrlFlag("make", "1");
  const [openId] = useUrlItem("presenter");
  const update = useUrlUpdate();
  const left = useUsesLeft(make.state === "making");
  const brand = brandName(userId);
  const on = onPresenters(data);
  const linked = useScrollToItem<HTMLLIElement>(!!openId);

  useEffect(() => onPresentersChanged(() => setData(loadPresenters(userId))), [userId]);
  useEffect(() => onFaceChanged(() => setFace(loadFace(userId))), [userId]);
  // a make paid for before a reload comes back as making, then the pick
  useEffect(() => resumeMake(userId), [userId]);
  useGoneItem("presenter", openId ? on.some((p) => p.id === openId) : undefined, "presenter");

  const openSheet = () => update({ make: "1" }, { push: true });
  const who = (id: string) => {
    const r = setWho(userId, id);
    if (r.ok === false) toast({ title: r.error });
  };

  const job = make.state !== "idle" && make.state !== "refused" && make.state !== "failed";
  return (
    <div className="space-y-6">
      <section className={CARD} aria-labelledby="who-appears">
        <h2 id="who-appears" className="font-serif text-lg font-semibold">Who appears in {brand} videos</h2>
        <div role="radiogroup" aria-labelledby="who-appears" className="flex flex-wrap items-center gap-2">
          <Choice checked={data.who === "me"} disabled={!face} onClick={() => who("me")}>Me</Choice>
          {on.map((p) => (
            <Choice key={p.id} checked={data.who === p.id} onClick={() => who(p.id)}>{p.name}, AI presenter</Choice>
          ))}
          <Choice checked={data.who === "ask"} onClick={() => who("ask")}>Ask each time</Choice>
          {!face && (
            <Link to={links.people({ record: true })} className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline sm:min-h-9">
              Save your face first
            </Link>
          )}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="your-presenters">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="your-presenters" className="font-serif text-lg font-semibold">Your presenters</h2>
          {on.length > 0 && !sheet && <Button className={BIG} onClick={openSheet}>Make a presenter</Button>}
        </div>

        {sheet ? (
          <MakeSheet userId={userId} prefs={data.prefs} full={on.length >= MAX_ON} taken={on.map((p) => p.name)} left={left("ai-presenter")} brand={brand} onClose={() => setSheet(false)} />
        ) : job ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3" aria-live="polite">
            {make.state === "making" ? (
              <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Making 3 presenters, about 20 seconds</p>
            ) : (
              <p className="text-sm">Your new presenters are ready.</p>
            )}
            <Button variant={make.state === "pick" ? "default" : "outline"} className={BIG} onClick={openSheet}>
              {make.state === "pick" ? "Pick one to keep" : "Show"}
            </Button>
          </div>
        ) : null}

        {on.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {on.map((p) => (
              <PresenterCard key={p.id} userId={userId} p={p} isDefault={data.who === p.id} open={openId === p.id} cardRef={openId === p.id ? linked : undefined} />
            ))}
          </ul>
        ) : (
          !sheet && (
            <div className={CARD}>
              <p className="text-sm text-muted-foreground">No presenters yet. Make one, and the same face can front every {brand} video.</p>
              <Button className={BIG} onClick={openSheet}>Make a presenter</Button>
            </div>
          )
        )}
      </section>
    </div>
  );
}

function Choice({ checked, disabled, onClick, children }: { checked: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} disabled={disabled} onClick={onClick}
      className={`${PILL} ${checked ? "border-primary bg-primary/10 font-medium text-primary" : "border-border/60 text-foreground hover:border-primary/40"} disabled:cursor-not-allowed disabled:opacity-50`}>
      {checked && <Check className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

// ---------- the Make a presenter sheet: the chips, then making, then the pick ----------

function MakeSheet(props: { userId: string; prefs: Prefs; full: boolean; taken: string[]; left: number | null; brand: string; onClose: () => void }) {
  const { userId, prefs, full, taken, left, brand, onClose } = props;
  const { toast } = useToast();
  const make = useSyncExternalStore(onMake, makeState);
  const [picked, setPicked] = useState(0);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pickKey = make.state === "pick" ? make.urls.join(" ") : "";

  // a new pick starts on its first picture, with a name that fits it
  useEffect(() => {
    if (make.state !== "pick") return;
    setPicked(0);
    setName(nameFor(make.looks[0], taken));
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickKey]);

  const change = (next: Prefs) => {
    if (make.state === "refused" || make.state === "failed") clearMake();
    savePrefs(userId, next);
  };
  const go = () => {
    const { extra, ...chips } = prefs;
    void startMake(userId, chips, extra?.trim() || undefined);
  };
  const keep = async () => {
    if (make.state !== "pick" || saving) return;
    setSaving(true);
    setError("");
    const r = await keepPick(userId, picked, name);
    setSaving(false);
    if (r.ok === false) return setError(r.error);
    toast({ title: `${r.presenter.name} is saved. New ${brand} videos can use ${r.presenter.name}.` });
    onClose();
  };

  const why = full ? FULL : reasonText({ left, uses: 3, leo: true });
  const kept = name.trim() || "this one";
  return (
    <section className={CARD} aria-labelledby="make-presenter">
      <div className="flex items-center justify-between gap-2">
        <h3 id="make-presenter" className="font-serif text-lg font-semibold">Make a presenter</h3>
        <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {make.state === "making" ? (
        <div className="space-y-3" aria-live="polite">
          <div className="grid max-w-md grid-cols-3 gap-2" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="aspect-[9/16] animate-pulse rounded-lg bg-muted" />)}
          </div>
          <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Making 3 presenters, about 20 seconds</p>
        </div>
      ) : make.state === "pick" ? (
        <div className="space-y-4">
          <p className="text-sm">Pick one to keep.</p>
          <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label="Your new presenters">
            {make.urls.map((u, i) => (
              <button key={u} type="button" role="radio" aria-checked={picked === i} aria-label={`Presenter ${i + 1}`}
                onClick={() => {
                  setPicked(i);
                  setName((n) => (n === nameFor(make.looks[picked], taken) ? nameFor(make.looks[i], taken) : n));
                }}
                className={`relative overflow-hidden rounded-lg border-2 transition-colors ${picked === i ? "border-primary" : "border-transparent hover:border-border"}`}>
                <img src={u} alt="" className="aspect-[9/16] w-full object-cover" />
                {picked === i && <Check className="absolute right-1 top-1 h-5 w-5 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden />}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">The person is made by AI.</p>
          <label className="block max-w-xs space-y-1.5">
            <span className="text-sm font-medium">Name, only you see it</span>
            <Input value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void keep()} className="h-11 sm:h-10" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button className={BIG} disabled={saving || full} onClick={() => void keep()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}Keep {kept}
            </Button>
            <Button variant="ghost" className={`${BIG} text-muted-foreground`} disabled={saving} onClick={clearMake}>Start over</Button>
          </div>
          {(error || full) && <p className="text-sm text-destructive" role="alert">{error || FULL}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {CHIPS.map((c) => (
            <div key={c.key} role="group" aria-label={c.label} className="flex flex-wrap gap-2">
              {c.options.map(([v, label]) => {
                const pressed = prefs[c.key] === v;
                return (
                  <button key={label} type="button" aria-pressed={pressed}
                    onClick={() => change({ ...prefs, [c.key]: pressed && c.clears ? undefined : v })}
                    className={`${PILL} ${pressed ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
          <label className="block max-w-md space-y-1.5">
            <span className="text-sm font-medium">Anything else (optional)</span>
            <Input value={prefs.extra ?? ""} maxLength={MAX_EXTRA} placeholder="Glasses, short hair, warm smile"
              onChange={(e) => change({ ...prefs, extra: e.target.value })} className="h-11 sm:h-10" />
          </label>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button className={BIG} disabled={full || (left !== null && left < 3)} onClick={go}>Make 3 options</Button>
            <PriceChip feature="ai-presenter" price={ONE} left={left} uses={3} />
          </div>
          {why && <p className="text-xs text-muted-foreground">{why}</p>}
          {(make.state === "refused" || make.state === "failed") && <p className="text-sm text-destructive" role="alert">{make.error}</p>}
        </div>
      )}
    </section>
  );
}

// ---------- a saved presenter ----------

function PresenterCard({ userId, p, isDefault, open, cardRef }: { userId: string; p: Presenter; isDefault: boolean; open: boolean; cardRef?: React.Ref<HTMLLIElement> }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"view" | "menu" | "rename" | "remove">("view");
  const [name, setName] = useState(p.name);
  const menu = useRef<HTMLDivElement>(null);

  // a tap outside closes the menu
  useEffect(() => {
    if (mode !== "menu") return;
    const down = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && setMode("view");
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [mode]);

  const rename = () => {
    const r = renamePresenter(userId, p.id, name);
    if (r.ok === false) return toast({ title: r.error });
    setMode("view");
  };
  const done = (r: ReturnType<typeof setWho>) => (r.ok === false ? toast({ title: r.error }) : setMode("view"));

  return (
    <li ref={cardRef} className={`flex gap-3 rounded-xl border p-3 shadow-card ${open ? "border-primary ring-2 ring-primary/30" : "border-border/60"}`}>
      <img src={p.photo || p.url} alt={`${p.name}, AI presenter`} className="aspect-[9/16] w-20 shrink-0 rounded-lg object-cover sm:w-24" />
      <div className="min-w-0 flex-1 space-y-2">
        {mode === "rename" ? (
          <div className="space-y-2">
            <Input value={name} maxLength={MAX_NAME} autoFocus aria-label="Name, only you see it" onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" && setMode("view"))} className="h-11 sm:h-10" />
            <div className="flex flex-wrap gap-2">
              <Button className={BIG} onClick={rename}>Save</Button>
              <Button variant="ghost" className={BIG} onClick={() => setMode("view")}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{p.name}</span>
            <span className={AI_CHIP}>AI presenter</span>
            {isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Default</span>}
          </div>
        )}
        {mode === "remove" ? (
          <div className="space-y-2" role="group" aria-label={`Remove ${p.name}`}>
            <p className="text-sm">Remove {p.name}? Videos already made keep {p.name}.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" className={BIG} onClick={() => done(removePresenter(userId, p.id))}>Remove</Button>
              <Button variant="ghost" className={BIG} onClick={() => setMode("view")}>Keep</Button>
            </div>
          </div>
        ) : mode !== "rename" && (
          <div className="flex flex-wrap items-center gap-1">
            <Button asChild variant="outline" className={BIG}>
              <Link to={links.edit({ panel: ["ai"], kind: "avatar", face: p.id })}>Use in a video</Link>
            </Button>
            <div ref={menu} className="relative">
              <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label={`More for ${p.name}`} aria-haspopup="menu" aria-expanded={mode === "menu"}
                onClick={() => setMode(mode === "menu" ? "view" : "menu")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {mode === "menu" && (
                <div role="menu" aria-label={`More for ${p.name}`} onKeyDown={(e) => e.key === "Escape" && setMode("view")}
                  className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-border/70 bg-popover p-1 shadow-elegant">
                  {[
                    { label: "Rename", run: () => (setName(p.name), setMode("rename")) },
                    ...(isDefault ? [] : [{ label: "Make default", run: () => done(setWho(userId, p.id)) }]),
                    { label: "Remove", run: () => setMode("remove") },
                  ].map((it) => (
                    <button key={it.label} type="button" role="menuitem" onClick={it.run}
                      className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none sm:h-9">
                      {it.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
