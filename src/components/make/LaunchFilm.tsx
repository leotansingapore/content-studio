// /make/launch-film (docs/north-star/items/formats-launch-film.md): a 15 to 60 second film of the brand's product,
// drawn in code from its kit and Media screens, with music on the beats, edited by pointing at a frame, exported in
// the browser. Leo's sign-ins only (MakeFormatPage). Three screens on one route: Setup, Pick a direction (?film= with
// no spec yet) and the studio (?film= with its spec). The jobs run in src/lib/filmJob.ts, outside React, so leaving
// keeps a write, the music or an export going.
//
// URL (docs/deep-links.md): length, shape, energy, voice=ai, product, screens, campaign and post fill Setup (replace;
// with none it opens with this device's last picks, cs-make-film-setup); film (push) opens a film; t, tab=fields,
// note and export=open (with shape, the sheet's pick) sit beside it. No URL starts a paid write: Show me 3
// directions, Show 3 more, Make this one, Send, Fix it and Read it again are presses with their price.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, Crosshair, Loader2, Pause, Play, Undo2 } from "lucide-react";
import FormatShell from "@/components/make/FormatShell";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBySlug } from "@/data/formats";
import { useUsesLeft } from "@/lib/aiUsage";
import { getCampaign } from "@/lib/campaigns";
import { loadBrand } from "@/lib/carousel";
import { scanCompliance } from "@/lib/compliance";
import { getFile } from "@/lib/deviceFiles";
import { drawFilm, type FilmAssets, type FilmMark } from "@/lib/film/draw";
import { SHAPE_NAME, SHAPE_SIZE, captionAt, exportsFast } from "@/lib/film/exportFilm";
import { productOf } from "@/lib/film/sound";
import { PRODUCTS } from "@/lib/film/synth/score";
import {
  BPM, ENERGIES, FILM_LENGTHS, GROUNDS, SHAPES, filmEvents, filmLength, filmWords, sceneAt, sceneSpans,
  type Energy, type Film, type FilmLength, type FilmScene, type Shape,
} from "@/lib/film/timeline";
import {
  MAX_SCREENS, appScreens, clearExport, clearFailure, editing, exportJob, exportShapes, fileName, filmJob, filmMix, filmVersion, fixIssues,
  getFilm, keysIn, loadFilmAssets, loadHistory, loadSetup, missingScreens, notQuite, onFilmJob, openInEditor, otherPhotos, resumeFilm,
  retryNote, dropNote, saveSetup, sendNote, setSpec, soundInputs, soundOf, soundState, ensureSound, stopExport, takeUnseen, undoFilm,
  voiceFilm, voiceStale, writeDirections, writeFilm, writing,
  type FilmNote, type FilmSetup, type NoteDraft, type ScreenItem, type StoredFilm,
} from "@/lib/filmJob";
import { links } from "@/lib/links";
import { priceOf, sumPrices } from "@/lib/prices";
import { loadProducts, productLabel } from "@/lib/products";
import type { RemixSource } from "@/lib/remixSource";
import { useUrlUpdate } from "@/lib/urlState";
import { cn } from "@/lib/utils";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const BIG = "[@media(pointer:coarse)]:min-h-11";
const ENERGY_NAME: Record<Energy, string> = { fast: "Fast cuts", continuous: "One continuous take", quiet: "Quiet" };
const CHECK_WORDS = "Check the words before posting.";
const CHECK_SCREEN = "Check this screen before posting.";

/** Re-renders on every job, note or stored film change. */
const useFilmTick = () => useSyncExternalStore(onFilmJob, filmVersion, filmVersion);

const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const sceneName = (id: string) => (id ? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ") : "");
const styleName = (s: string) => sceneName(s.replace(":", " "));

export default function LaunchFilm({ userId, source }: { userId: string; source: RemixSource | null }) {
  const [params] = useSearchParams();
  const tick = useFilmTick();
  const filmId = params.get("film");
  const film = useMemo(() => getFilm(userId, filmId), [userId, filmId, tick]);
  if (filmId && !film) return <Gone />;
  if (film?.spec) return <Studio key={film.id} userId={userId} film={film} spec={film.spec} />;
  if (film) return <Directions key={film.id} userId={userId} film={film} />;
  return <Setup userId={userId} source={source} />;
}

function Head({ title, blurb }: { title: string; blurb: string }) {
  const navigate = useNavigate();
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/home"));
  return (
    <header className="space-y-1">
      <Button variant="ghost" size="sm" onClick={back} className="-ml-2 gap-1 text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Back
      </Button>
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <p className="text-sm text-muted-foreground">{blurb}</p>
    </header>
  );
}

function Gone() {
  const update = useUrlUpdate();
  return (
    <div className="space-y-4">
      <Head title="Launch film" blurb="That film isn't on this device." />
      <Button onClick={() => update({ film: null, t: null, tab: null, note: null, export: null })} className={BIG}>Start a new film</Button>
    </div>
  );
}

/** A step line with the time so far. */
function Step({ label, since }: { label: string; since: number }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const i = window.setInterval(bump, 1000);
    return () => window.clearInterval(i);
  }, []);
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
      {label} <span className="tabular-nums">{clock((Date.now() - since) / 1000)}</span>
    </p>
  );
}

function Failed({ line, children }: { line: string; children?: ReactNode }) {
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="flex items-start gap-2 text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {line}
      </p>
      {children}
    </div>
  );
}

const Warn = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
    <AlertTriangle className="h-3 w-3" aria-hidden /> {children}
  </span>
);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** A Media screen's picture: a photo as it is, a demo video by its still. */
function Thumb({ item }: { item: ScreenItem }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    let made = "";
    void getFile(item.video ? item.key.replace(/^cvid-/, "cimg-") : item.key)
      .then((b) => {
        if (b && live) setUrl((made = URL.createObjectURL(b)));
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [item.key, item.video]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-muted" />;
}

/** The brand's pictures for drawing, loaded once per set of keys. */
function useAssets(userId: string, keys: string[]): FilmAssets | null {
  const sig = [...new Set(keys)].sort().join(",");
  const [assets, setAssets] = useState<FilmAssets | null>(null);
  useEffect(() => {
    let live = true;
    void loadFilmAssets(userId, sig ? sig.split(",") : []).then((a) => live && setAssets(a));
    return () => {
      live = false;
    };
  }, [userId, sig]);
  return assets;
}

// ---------- Setup ----------

const pickOf = <T extends string | number>(fromUrl: string | null, list: readonly T[], kept: unknown, fallback: T): T =>
  list.find((x) => String(x) === fromUrl) ?? list.find((x) => x === kept) ?? fallback;

function Setup({ userId, source }: { userId: string; source: RemixSource | null }) {
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const tick = useFilmTick();
  const def = formatBySlug("launch-film")!;
  const [picks, setPicks] = useState<Partial<FilmSetup>>(() => loadSetup());
  const screensAll = useMemo(() => appScreens(userId), [userId]);
  const others = useMemo(() => otherPhotos(userId), [userId]);
  const products = useMemo(() => loadProducts(userId).items, [userId]);
  const campaignId = params.get("campaign");
  const postN = Number(params.get("post")) || 0;
  const campaign = useMemo(() => {
    const c = campaignId ? getCampaign(userId, campaignId) : null;
    const p = c?.posts.find((x) => x.n === postN);
    return c && p ? { id: c.id, n: p.n, angle: c.angles.find((a) => a.id === p.angleId)?.title ?? p.hook ?? "" } : null;
  }, [userId, campaignId, postN]);
  // the typed words, filled once on arrival from the product, campaign post or source, else this device's last
  const [typed, setTyped] = useState(() => {
    const p = products.find((x) => x.id === params.get("product"));
    const hook = source ? source.teardown?.hook || source.title || (source.caption ?? "").split("\n")[0] : "";
    return {
      product: p ? productLabel(p) : picks.product ?? "",
      remember: (campaign?.angle || hook || picks.remember || "").slice(0, 120),
    };
  });
  const [adding, setAdding] = useState(false);
  const [toggled, setToggled] = useState(0);
  const j = filmJob();
  const busy = !!j && j.state === "working";
  const mine = !!j && j.filmId === null && j.kind === "directions";

  // directions that land while this page is open (or landed while it was away) open at once
  useEffect(() => {
    const id = takeUnseen();
    if (id) update({ film: id }, { push: true });
  }, [tick, update]);

  const available = new Set([...screensAll, ...others].map((s) => s.key));
  const length = pickOf<FilmLength>(params.get("length"), FILM_LENGTHS, picks.length, 30);
  const shape = pickOf<Shape>(params.get("shape"), SHAPES, picks.shape, "9x16");
  const energy = pickOf<Energy>(params.get("energy"), ENERGIES, picks.energy, "fast");
  const voice = params.has("voice") ? params.get("voice") === "ai" : picks.voice === true;
  const urlScreens = params.get("screens");
  const screens = (urlScreens !== null ? urlScreens.split(",") : picks.screens ?? screensAll.slice(0, 4).map((s) => s.key)).filter((k) => available.has(k)).slice(0, MAX_SCREENS);
  const product = products.find((p) => productLabel(p) === typed.product.trim());
  const flagged = screensAll.filter((s) => screens.includes(s.key) && s.flags.length);

  const pick = (k: keyof FilmSetup, v: string | number | boolean | string[], url: string | null) => {
    const next = { ...picks, [k]: v };
    setPicks(next);
    saveSetup({ [k]: v });
    update({ [k]: url });
  };
  const type = (k: "product" | "remember", v: string) => {
    setTyped({ ...typed, [k]: v });
    saveSetup({ [k]: v, ...(k === "product" ? { productId: products.find((p) => productLabel(p) === v.trim())?.id } : {}) });
  };
  const toggleScreen = (key: string) => {
    const on = screens.includes(key);
    if (!on && screens.length >= MAX_SCREENS) return setToggled((n) => n + 1);
    const next = on ? screens.filter((k) => k !== key) : [...screens, key];
    pick("screens", next, next.join(",") || null);
  };

  const setup: FilmSetup = {
    product: typed.product.trim(), ...(product ? { productId: product.id } : {}), remember: typed.remember.trim(), screens, length, shape, energy, voice,
    ...(campaign ? { campaign: { id: campaign.id, n: campaign.n } } : {}),
  };
  const reason = !setup.product && !setup.remember ? "Say what you're launching first." : busy && !mine ? "Still writing your last film." : j?.capped ? j.error ?? null : null;
  const make = () => {
    if (reason || busy) return;
    clearFailure();
    void writeDirections(userId, setup);
  };

  const screenButton = (s: ScreenItem) => {
    const on = screens.includes(s.key);
    return (
      <li key={s.key} className="space-y-1">
        <button
          type="button"
          aria-pressed={on}
          aria-label={s.name || s.alt || "App screen"}
          onClick={() => toggleScreen(s.key)}
          className={cn("relative block h-24 w-14 overflow-hidden rounded-md border-2", on ? "border-primary" : "border-transparent opacity-70")}
        >
          <Thumb item={s} />
          {on && <span className="absolute right-0.5 top-0.5 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{screens.indexOf(s.key) + 1}</span>}
        </button>
        {s.flags.length > 0 && <Warn>Check it</Warn>}
      </li>
    );
  };

  const options = (
    <>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <div className="space-y-1.5">
            <Label htmlFor="film-product" className={FIELD_LABEL}>What are you launching</Label>
            <Input id="film-product" list="film-products" value={typed.product} maxLength={120} placeholder="Like: Activity Tracker's AI coach" onChange={(e) => type("product", e.target.value)} />
            <datalist id="film-products">{products.map((p) => <option key={p.id} value={productLabel(p)} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="film-remember" className={FIELD_LABEL}>What should people remember</Label>
            <Input id="film-remember" value={typed.remember} maxLength={120} placeholder="Like: your week, planned in one tap" onChange={(e) => type("remember", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className={FIELD_LABEL}>App screens</p>
            {screensAll.length ? (
              <ul className="flex flex-wrap gap-2">{screensAll.map(screenButton)}</ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No app screens yet. The film will use words and your logo.{" "}
                <a href={links.media({ type: "screen" })} className="text-primary hover:underline">Add screens in Media</a>
              </p>
            )}
            {adding && others.length > 0 && <ul className="flex flex-wrap gap-2 border-t border-border/60 pt-2">{others.map(screenButton)}</ul>}
            <div className="flex flex-wrap items-center gap-2">
              {others.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} aria-expanded={adding} className={BIG}>Add from Media</Button>
              )}
              <span key={toggled} className={cn("text-xs text-muted-foreground", toggled > 0 && "font-medium text-foreground")}>Pick up to 8.</span>
            </div>
            {flagged.length > 0 && <p className="text-xs text-warning">{CHECK_SCREEN}</p>}
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <Field label="Length">
            {FILM_LENGTHS.map((n) => <FilterChip key={n} active={length === n} onClick={() => pick("length", n, n === 30 ? null : String(n))}>{n} s</FilterChip>)}
          </Field>
          <Field label="Shape">
            {SHAPES.map((s) => <FilterChip key={s} active={shape === s} onClick={() => pick("shape", s, s === "9x16" ? null : s)}>{SHAPE_NAME[s]}</FilterChip>)}
          </Field>
          <Field label="Energy">
            {ENERGIES.map((e) => <FilterChip key={e} active={energy === e} onClick={() => pick("energy", e, e === "fast" ? null : e)}>{ENERGY_NAME[e]}</FilterChip>)}
          </Field>
          <Field label="Voice">
            <FilterChip active={!voice} onClick={() => pick("voice", false, null)}>Music only</FilterChip>
            <FilterChip active={voice} onClick={() => pick("voice", true, "ai")}>AI voice reads it</FilterChip>
          </Field>
        </CardContent>
      </Card>
    </>
  );

  const result = mine && busy ? (
    <Placeholder shape={shape}><Step label="Writing 3 directions..." since={j!.startedAt} /></Placeholder>
  ) : mine && j?.state === "failed" ? (
    <Failed line={j.error ?? "Couldn't write the film. Try again in a minute."} />
  ) : (
    <Placeholder shape={shape}>Your 3 directions show here.</Placeholder>
  );

  return (
    <FormatShell
      title={def.name}
      blurb="A 15 to 60 second film of your product, made from your brand kit and app screens."
      options={options}
      result={result}
      footer={{ cap: "launch-film", label: "Show me 3 directions", busyLabel: "Writing 3 directions...", busy: mine && busy, reason, disabled: !!reason, onMake: make }}
    />
  );
}

function Placeholder({ shape, children }: { shape: Shape; children: ReactNode }) {
  const { w, h } = SHAPE_SIZE[shape];
  return (
    <div style={{ aspectRatio: `${w} / ${h}` }} className="mx-auto flex w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// ---------- Pick a direction ----------

/** A direction's hero scene as a one-scene film, in the direction's colours and its place's music style. */
function heroFilm(f: StoredFilm, i: number): Film {
  const d = f.directions[i];
  return {
    v: 1, kind: "launch", product: f.product, energy: f.setup.energy, bpm: BPM[f.setup.energy], style: (i % 3) as 0 | 1 | 2, font: "brand",
    ground: d.ground, accent: d.accent, drop: d.hero.id, scenes: [d.hero], voice: { on: false, lines: {} },
  };
}
/** The key time: just after the scene's last element lands. */
const keyTime = (film: Film) => Math.min(filmLength(film) - 0.05, Math.max(0, ...filmEvents(film).map((e) => e.t)) + 0.6);

function KeyFrame({ film, assets, shape, width = 360 }: { film: Film; assets: FilmAssets | null; shape: Shape; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = SHAPE_SIZE[shape];
  const cw = width, ch = Math.round((width * h) / w);
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g && assets) drawFilm(g, film, assets, keyTime(film), { w: cw, h: ch });
  }, [film, assets, cw, ch]);
  return <canvas ref={ref} width={cw} height={ch} className="block h-auto w-full rounded-md bg-muted" aria-hidden />;
}

function Directions({ userId, film }: { userId: string; film: StoredFilm }) {
  const tick = useFilmTick();
  const def = formatBySlug("launch-film")!;
  const j = filmJob();
  // ?direction=<n>, 1-based (replace): the picked direction; the recommended one is the default, left out
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const recommended = film.recommended ?? 0;
  const linked = Number(params.get("direction")) - 1;
  const pick = Number.isInteger(linked) && linked >= 0 && linked < film.directions.length ? linked : recommended;
  const setChosen = (i: number | null) => update({ direction: i === null || i === recommended ? null : String(i + 1) });
  const assets = useAssets(userId, film.directions.flatMap((d) => keysIn(d.hero)));
  const sig = JSON.stringify([film.directions, film.product, film.setup.energy]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const heroes = useMemo(() => film.directions.map((_, i) => heroFilm(film, i)), [sig]);
  const mine = j?.filmId === film.id;
  const busy = !!j && j.state === "working";
  const leftOf = useUsesLeft(busy);
  // Show 3 more lands on this film; nothing to open
  useEffect(() => {
    takeUnseen();
  }, [tick]);
  const shape = film.setup.shape;
  const voiced = film.setup.voice;
  const reason = busy && !mine ? "Still writing your last film." : j?.capped ? j.error ?? null : null;
  const make = () => {
    if (reason || busy) return;
    clearFailure();
    void writeFilm(userId, film.id, pick);
  };
  const more = () => {
    if (busy) return;
    clearFailure();
    setChosen(null);
    void writeDirections(userId, film.setup, film.id);
  };
  const flags = film.flags && (film.flags.mas || film.flags.compliance.length);

  const options = (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Pick a direction</h2>
      <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {film.directions.map((d, i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={pick === i}
              onClick={() => setChosen(i)}
              className={cn("flex w-full gap-3 rounded-xl border-2 p-2 text-left transition-colors sm:flex-col lg:flex-row", pick === i ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/50")}
            >
              <span className="w-24 shrink-0 sm:w-full lg:w-24"><KeyFrame film={heroes[i]} assets={assets} shape={shape} width={240} /></span>
              <span className="min-w-0 space-y-1">
                <span className="block font-semibold">{d.name}</span>
                <span className="block text-sm text-muted-foreground">{d.line}</span>
                {film.recommended === i && <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Recommended</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={more} disabled={busy || leftOf("launch-film") === 0} className={BIG}>
          {mine && busy && j?.kind === "directions" ? "Writing 3 directions..." : "Show 3 more"}
        </Button>
        <PriceChip feature="launch-film" left={leftOf("launch-film")} />
      </div>
      {flags ? <Warn>{CHECK_WORDS}</Warn> : null}
    </div>
  );

  const result = (
    <div className="space-y-3">
      {mine && busy ? (
        <Step label={j!.kind === "voice" ? "Reading the lines..." : j!.kind === "film" ? "Writing your film..." : "Writing 3 directions..."} since={j!.startedAt} />
      ) : mine && j?.state === "failed" ? (
        <Failed line={j.error ?? "Couldn't write the film. Try again in a minute."} />
      ) : null}
      <div className="mx-auto hidden w-full lg:block" style={{ maxWidth: `min(360px, calc(64vh * ${SHAPE_SIZE[shape].w / SHAPE_SIZE[shape].h}))` }}>
        <KeyFrame film={heroes[pick]} assets={assets} shape={shape} />
      </div>
    </div>
  );

  return (
    <FormatShell
      title={def.name}
      blurb={film.name}
      options={options}
      result={result}
      footer={{
        cap: "launch-film",
        ...(voiced ? { price: sumPrices(priceOf("launch-film"), priceOf("ai-voice")), caps: ["ai-voice" as const] } : {}),
        label: "Make this one",
        busyLabel: "Writing your film...",
        busy: mine && busy && j?.kind !== "directions",
        reason,
        disabled: !!reason || busy,
        onMake: make,
      }}
    />
  );
}

// ---------- the studio ----------

interface TextField {
  id: string;
  label: string;
  value: string;
  number?: true;
}
/** Every text, number and label a scene draws, by the id draw.ts marks it with. */
function textFields(s: FilmScene): TextField[] {
  const id = s.id;
  if (s.kind === "type") return s.words.map((v, i) => ({ id: `${id}.word${i + 1}`, label: `Line ${i + 1}`, value: v }));
  if (s.kind === "screen") return s.highlight ? [{ id: `${id}.highlight.label`, label: "Highlight label", value: s.highlight.label }] : [];
  if (s.kind === "cards")
    return s.cards.flatMap((c, i) => [
      { id: `${id}.card${i + 1}.title`, label: `Card ${i + 1} title`, value: c.title },
      { id: `${id}.card${i + 1}.line`, label: `Card ${i + 1} line`, value: c.line },
    ]);
  if (s.kind === "number")
    return [
      { id: `${id}.value`, label: "Number", value: String(s.value), number: true },
      { id: `${id}.suffix`, label: "After the number", value: s.suffix ?? "" },
      { id: `${id}.label`, label: "Label", value: s.label },
    ];
  if (s.kind === "montage") return s.shots.map((x, i) => ({ id: `${id}.word${i + 1}`, label: `Shot ${i + 1} word`, value: x.word }));
  return [
    { id: `${id}.line`, label: "Line", value: s.line },
    { id: `${id}.cta`, label: "Link", value: s.cta ?? "" },
  ];
}
const fieldOf = (spec: Film, markId: string) => spec.scenes.flatMap(textFields).find((f) => f.id === markId) ?? null;

/** The spec with one text changed; the parser checks it on save. */
function withText(spec: Film, fieldId: string, value: string): Film {
  const [sceneId, ...rest] = fieldId.split(".");
  const part = rest.join(".");
  const n = (p: string) => Number(/(\d+)/.exec(p)?.[1] ?? 0) - 1;
  return {
    ...spec,
    scenes: spec.scenes.map((s): FilmScene => {
      if (s.id !== sceneId) return s;
      if (s.kind === "type") return { ...s, words: s.words.map((w, i) => (i === n(part) ? value : w)) };
      if (s.kind === "montage") return { ...s, shots: s.shots.map((x, i) => (i === n(part) ? { ...x, word: value } : x)) };
      if (s.kind === "screen" && s.highlight) return { ...s, highlight: { ...s.highlight, label: value } };
      if (s.kind === "cards") return { ...s, cards: s.cards.map((c, i) => (i === n(part) ? { ...c, [part.endsWith("title") ? "title" : "line"]: value } : c)) };
      if (s.kind === "number") return part === "value" ? { ...s, value: Number(value) || 0 } : { ...s, [part === "suffix" ? "suffix" : "label"]: value };
      if (s.kind === "logo") return part === "cta" ? { ...s, cta: value || undefined } : { ...s, line: value };
      return s;
    }),
  };
}

interface Selected {
  draft: Omit<NoteDraft, "text">;
  shown: string;
  /** The outline, in canvas pixels; none for the whole film. */
  box?: { x: number; y: number; w: number; h: number };
  reopened?: string;
  thread?: FilmNote["thread"];
}

/** The smallest drawn element under the point, with slack. */
function hitAt(marks: FilmMark[], x: number, y: number, slack: number): FilmMark | null {
  const under = marks.filter((m) => x >= m.x - slack && x <= m.x + m.w + slack && y >= m.y - slack && y <= m.y + m.h + slack);
  return under.sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
}

function Studio({ userId, film, spec: stored }: { userId: string; film: StoredFilm; spec: Film }) {
  const [params] = useSearchParams();
  // the store hands a fresh object on every change anywhere (an export's progress too): one per spec, so nothing redraws or remixes for it
  const specJson = JSON.stringify(stored);
  const spec = useMemo(() => JSON.parse(specJson) as Film, [specJson]);
  const voiceSig = JSON.stringify(film.voice ?? null);
  const update = useUrlUpdate();
  useFilmTick();
  const leftOf = useUsesLeft(editing(film.id) || writing());
  const shape = film.setup.shape;
  const { w, h } = SHAPE_SIZE[shape];
  const length = filmLength(spec);
  const spans = sceneSpans(spec);
  const tab = params.get("tab") === "fields" ? "fields" : "notes";
  const noteParam = params.get("note");
  const [t, setT] = useState(() => Math.min(length, Math.max(0, Number(params.get("t")) || 0)));
  const tRef = useRef(t);
  const [playing, setPlaying] = useState(false);
  const [pointing, setPointing] = useState(false);
  const [sel, setSel] = useState<Selected | null>(null);
  const [text, setText] = useState("");
  const [inline, setInline] = useState<{ field: TextField; box: FilmMark; value: string } | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const marks = useRef<FilmMark[]>([]);
  const audio = useRef<{ ctx: AudioContext | null; src: AudioBufferSourceNode | null; raf: number }>({ ctx: null, src: null, raf: 0 });
  const assets = useAssets(userId, keysIn(spec));
  const [inputs, setInputs] = useState<Awaited<ReturnType<typeof soundInputs>> | null>(null);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => resumeFilm(userId, film.id), [userId, film.id]);
  useEffect(() => {
    takeUnseen();
  }, []);
  useEffect(() => {
    let live = true;
    void soundInputs(userId, { ...film, spec }).then((r) => live && setInputs(r));
    void missingScreens(userId, spec).then((g) => live && setGone(g));
    return () => {
      live = false;
    };
    // the film's voice by its signature: a new read, not a new object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, spec, voiceSig]);
  // the music for this spec: rendered once per timing, so a text change plays at once
  useEffect(() => {
    if (inputs) setKey(ensureSound(spec, inputs.opts));
  }, [spec, inputs]);
  const sound = key ? soundOf(key) : null;
  const mix = useMemo(() => (sound && inputs ? filmMix(spec, sound, inputs.lines, inputs.read) : null), [sound, inputs, spec]);
  const music = soundState();

  const drawAt = useCallback(
    (time: number) => {
      const g = canvas.current?.getContext("2d");
      if (!g || !assets) return;
      marks.current = drawFilm(g, spec, assets, time, { w, h, caption: captionAt(inputs?.lines ?? [], time) });
    },
    [assets, spec, w, h, inputs],
  );
  useEffect(() => {
    if (!playing) drawAt(t);
  }, [drawAt, t, playing]);

  const halt = useCallback(() => {
    const a = audio.current;
    cancelAnimationFrame(a.raf);
    try {
      a.src?.stop();
    } catch {
      /* already stopped */
    }
    a.src = null;
  }, []);
  useEffect(
    () => () => {
      halt();
      void audio.current.ctx?.close();
    },
    [halt],
  );

  const seek = (time: number, write = true) => {
    const next = Math.min(length, Math.max(0, time));
    tRef.current = next;
    setT(next);
    if (write) update({ t: next > 0 ? next.toFixed(1) : null });
  };
  const pause = () => {
    halt();
    setPlaying(false);
    seek(tRef.current);
  };
  const play = () => {
    if (!mix) return;
    setSel(null);
    setPointing(false);
    const a = audio.current;
    if (!a.ctx || a.ctx.state === "closed") a.ctx = new AudioContext({ sampleRate: 48000 });
    const ctx = a.ctx;
    void ctx.resume();
    const buf = ctx.createBuffer(2, mix.L.length, 48000);
    buf.copyToChannel(mix.L as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(mix.R as Float32Array<ArrayBuffer>, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const from = tRef.current >= length - 0.05 ? 0 : tRef.current;
    src.start(0, from);
    a.src = src;
    const t0 = ctx.currentTime;
    let shown = from;
    setPlaying(true);
    const loop = () => {
      const now = from + ctx.currentTime - t0;
      if (now >= length) {
        halt();
        setPlaying(false);
        seek(length - 0.01);
        return;
      }
      tRef.current = now;
      drawAt(now);
      if (Math.abs(now - shown) >= 0.1) {
        shown = now;
        setT(now);
      }
      a.raf = requestAnimationFrame(loop);
    };
    loop();
  };

  const togglePoint = () => {
    if (audio.current.src) pause();
    setInline(null);
    setPointing((p) => !p);
  };
  const toggleRef = useRef(togglePoint);
  toggleRef.current = togglePoint;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "c" && e.key !== "C") || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ?note= opens that note: the player at its time, an open note's box
  useEffect(() => {
    const n = noteParam ? film.notes.find((x) => x.id === noteParam) : null;
    if (!n) return;
    tRef.current = n.at;
    setT(n.at);
    if (n.status === "open") openNote(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteParam]);

  /** Canvas pixels under a pointer event. */
  const at = (e: { clientX: number; clientY: number }) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const k = c.width / Math.max(1, r.width);
    return { px: (e.clientX - r.left) * k, py: (e.clientY - r.top) * k, slack: 12 * k };
  };
  const onPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointing) return;
    const { px, py, slack } = at(e);
    const now = tRef.current;
    const hit = hitAt(marks.current, px, py, slack);
    const span = sceneAt(spec, now);
    setPointing(false);
    setText("");
    if (!hit) {
      setSel({ draft: { t: now, x: px / w, y: py / h, target: "", label: "The whole film", scene: null, at: now, pin: [px / w, py / h] }, shown: `The whole film, ${clock(now)}` });
      return;
    }
    const start = spans.find((s) => s.scene.id === hit.scene)?.start ?? span?.start ?? 0;
    // a point on a screen is sent as shares of the picture shown, so a highlight can find the button there
    // shortcut: shares of the part of the picture on screen, exact while the camera shows the whole picture; read the camera if pushed-in taps land wide
    const onScreen = hit.id.endsWith(".screen");
    const x = onScreen ? (px - hit.x) / Math.max(1, hit.w) : px / w, y = onScreen ? (py - hit.y) / Math.max(1, hit.h) : py / h;
    setSel({
      draft: { t: Math.max(0, now - start), x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), target: hit.id, label: hit.label, scene: hit.scene, at: now, pin: [px / w, py / h] },
      shown: `${hit.label}, ${sceneName(hit.scene)}, ${clock(now)}`,
      box: hit,
    });
  };
  const onDouble = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pointing || playing) return;
    const { px, py, slack } = at(e);
    const hit = hitAt(marks.current, px, py, slack);
    const field = hit && fieldOf(spec, hit.id);
    if (hit && field) setInline({ field, box: hit, value: field.value });
  };
  const openNote = (n: FilmNote) => {
    setSel({ draft: { t: n.t, x: n.x, y: n.y, target: n.target, label: n.label, scene: n.scene, at: n.at, pin: n.pin }, shown: `${n.label}, ${n.scene ? `${sceneName(n.scene)}, ` : ""}${clock(n.at)}`, reopened: n.id, thread: n.thread });
    setText(n.text);
  };
  const send = () => {
    if (!sel || text.trim().length < 2) return;
    sendNote(userId, film.id, { ...sel.draft, text }, sel.reopened);
    setSel(null);
    setText("");
  };
  const commitInline = () => {
    if (inline && inline.value !== inline.field.value) setSpec(userId, film.id, withText(spec, inline.field.id, inline.value));
    setInline(null);
  };

  const j = filmJob();
  const voiceRun = j?.filmId === film.id && j.kind === "voice" ? j : null;
  const flagged = useMemo(() => appScreens(userId).filter((s) => s.flags.length && keysIn(spec).includes(s.key)), [userId, spec]);
  const typedFlag = useMemo(() => scanCompliance(filmWords(spec).join("\n")).length > 0, [spec]);
  const wordsFlag = !!film.flags?.mas || !!film.flags?.compliance.length || typedFlag;
  const stale = voiceStale(film);
  const canUndo = loadHistory(film.id).length > 0;
  const busyNote = film.notes.some((n) => n.status === "changing" || n.status === "waiting");
  const pins = film.notes.filter((n) => n.pin && n.status !== "open" && Math.abs(n.at - t) < 1.5);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className="space-y-5">
      <Head title="Launch film" blurb={film.name} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-3">
          <div className="relative mx-auto w-full" style={{ maxWidth: `min(100%, calc(64vh * ${w / h}))` }}>
            <canvas
              ref={canvas}
              width={w}
              height={h}
              aria-label={`Launch film at ${clock(t)}`}
              onPointerDown={onPoint}
              onDoubleClick={onDouble}
              className={cn("block h-auto w-full rounded-lg bg-muted", pointing && "cursor-crosshair ring-2 ring-primary")}
            />
            {sel?.box && (
              <div aria-hidden className="pointer-events-none absolute rounded border-2 border-primary" style={{ left: pct(sel.box.x, w), top: pct(sel.box.y, h), width: pct(sel.box.w, w), height: pct(sel.box.h, h) }} />
            )}
            {pins.map((n) => (
              <span
                key={n.id}
                aria-hidden
                className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow"
                style={{ left: pct(n.pin![0], 1), top: pct(n.pin![1], 1) }}
              >
                {n.id.slice(1)}
              </span>
            ))}
            {inline && (
              <input
                autoFocus
                aria-label={inline.field.label}
                value={inline.value}
                onChange={(e) => setInline({ ...inline, value: e.target.value })}
                onBlur={commitInline}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitInline();
                  if (e.key === "Escape") setInline(null);
                }}
                className="absolute rounded border-2 border-primary bg-background px-1 text-sm text-foreground"
                style={{ left: pct(inline.box.x, w), top: pct(inline.box.y, h), width: `max(8rem, ${pct(inline.box.w, w)})` }}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-[5.5rem] text-sm tabular-nums" aria-live="off">{clock(t)} / {clock(length)}</span>
            <Button variant="outline" size="sm" onClick={playing ? pause : play} disabled={!mix && !playing} className={cn("gap-1.5", BIG)}>
              {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {playing ? "Pause" : "Play"}
            </Button>
            <Button variant={pointing ? "default" : "outline"} size="sm" onClick={togglePoint} aria-pressed={pointing} aria-keyshortcuts="C" className={cn("gap-1.5", BIG)}>
              <Crosshair className="h-4 w-4" aria-hidden /> Point to change <kbd className="hidden rounded border px-1 text-[10px] sm:inline">C</kbd>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => undoFilm(userId, film.id)} disabled={!canUndo || busyNote} className={cn("gap-1.5", BIG)}>
              <Undo2 className="h-4 w-4" aria-hidden /> Undo
            </Button>
          </div>
          <div className="relative">
            <div role="group" aria-label="Scenes" className="flex h-11 overflow-hidden rounded-md border border-border/70">
              {spans.map((s) => (
                <button
                  key={s.scene.id}
                  type="button"
                  onClick={() => seek(s.start)}
                  style={{ flexGrow: s.end - s.start, flexBasis: 0 }}
                  className={cn("min-w-0 truncate border-r border-border/70 px-1 text-[11px] last:border-r-0 hover:bg-muted", t >= s.start && t < s.end && "bg-primary/10 font-medium")}
                >
                  {sceneName(s.scene.id)}
                </button>
              ))}
            </div>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: pct(t, length) }} />
          </div>
          <input type="range" aria-label="Playhead" min={0} max={length} step={0.1} value={t} onChange={(e) => seek(Number(e.target.value))} className="w-full accent-primary" />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            {music?.key === key && music?.state === "working" && <Step label="Making the music..." since={music.startedAt} />}
            {music?.key === key && music?.state === "failed" && <Failed line={music.error ?? "Couldn't make the music."} />}
            {film.issues.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{film.issues.join(" ")}</span>
                <Button size="sm" variant="outline" onClick={() => fixIssues(userId, film.id)} disabled={busyNote || leftOf("film-edit") === 0} className={BIG}>Fix it</Button>
                <PriceChip feature="film-edit" left={leftOf("film-edit")} />
              </div>
            )}
            {(wordsFlag || flagged.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {wordsFlag && <Warn>{CHECK_WORDS}</Warn>}
                {flagged.length > 0 && <Warn>{CHECK_SCREEN}</Warn>}
              </div>
            )}
            {gone.length > 0 && <p className="text-sm text-warning">This screen is on another device. Pick it again or swap it.</p>}
            {voiceRun?.state === "working" ? (
              <Step label="Reading the lines..." since={voiceRun.startedAt} />
            ) : voiceRun?.state === "failed" ? (
              <Failed line={voiceRun.error ?? "Couldn't read the film's lines."}>
                <Button size="sm" variant="outline" onClick={() => void voiceFilm(userId, film.id)} className={BIG}>Try again</Button>
              </Failed>
            ) : stale ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{film.voice ? "The voice reads the old lines." : "The lines aren't read yet."}</span>
                <Button size="sm" variant="outline" onClick={() => void voiceFilm(userId, film.id)} disabled={writing() || leftOf("ai-voice") === 0} className={BIG}>
                  {film.voice ? "Read it again" : "Read the lines"}
                </Button>
                <PriceChip feature="ai-voice" left={leftOf("ai-voice")} />
              </div>
            ) : null}
          </div>

          {sel && (
            <div className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-30 space-y-2 border-t border-border bg-background p-4 pr-[4.5rem] shadow-lg sm:static sm:rounded-lg sm:border sm:pr-4 sm:shadow-none">
              <p className="text-sm font-medium">{sel.shown}</p>
              {sel.thread?.map((x, i) => (
                <p key={i} className="text-xs text-muted-foreground">&quot;{x.note}&quot; {x.reply && <>| {x.reply}</>}</p>
              ))}
              <Textarea
                autoFocus
                rows={2}
                value={text}
                maxLength={500}
                aria-label="What should change here?"
                placeholder="What should change here?"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                  if (e.key === "Escape") setSel(null);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={send} disabled={text.trim().length < 2 || leftOf("film-edit") === 0} className={BIG}>Send</Button>
                <Button variant="ghost" onClick={() => setSel(null)} className={BIG}>Cancel</Button>
                <PriceChip feature="film-edit" left={leftOf("film-edit")} />
              </div>
            </div>
          )}

          <div role="tablist" aria-label="Film" className="flex gap-1 border-b border-border/70">
            {(["notes", "fields"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => update({ tab: k === "notes" ? null : k })}
                className={cn("min-h-11 border-b-2 px-3 text-sm", tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground")}
              >
                {k === "notes" ? "Notes" : "Fields"}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "notes" ? (
              <Notes userId={userId} film={film} onOpen={(n) => { update({ note: n.id }); seek(n.at, false); if (n.status === "open") openNote(n); }} />
            ) : (
              <Fields userId={userId} film={film} spec={spec} />
            )}
          </div>

          <ExportPanel userId={userId} film={film} />
        </div>
      </div>
    </div>
  );
}

function Notes({ userId, film, onOpen }: { userId: string; film: StoredFilm; onOpen: (n: FilmNote) => void }) {
  if (!film.notes.length) return null;
  return (
    <ol className="space-y-2">
      {film.notes.map((n) => (
        <li key={n.id} className="flex gap-2 rounded-lg border border-border/60 p-2 text-sm">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n.id.slice(1)}</span>
          <div className="min-w-0 flex-1 space-y-1">
            <button type="button" onClick={() => onOpen(n)} className="block text-left hover:underline">
              {n.text || n.thread.length ? <>&quot;{n.text || n.thread[n.thread.length - 1].note}&quot;</> : <span className="text-muted-foreground">{n.label}</span>}
            </button>
            {n.status === "waiting" && <p className="text-xs text-muted-foreground">Waiting</p>}
            {n.status === "changing" && <p role="status" className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Changing...</p>}
            {n.status === "done" && n.undone && <p className="text-xs text-muted-foreground">Undone.</p>}
            {n.status === "done" && !n.undone && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs">Changed: {n.reply}</p>
                <Button size="sm" variant="ghost" onClick={() => { notQuite(userId, film.id, n.id); onOpen({ ...n, status: "open", thread: [...n.thread, { note: n.text, reply: n.reply ?? "" }], text: "" }); }} className={cn("h-7 px-2", BIG)}>
                  Not quite
                </Button>
              </div>
            )}
            {n.status === "failed" && (
              <div className="space-y-1">
                <p className="text-xs text-destructive">{n.error}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => retryNote(userId, film.id, n.id)} className={cn("h-7 px-2", BIG)}>Try again</Button>
                  <Button size="sm" variant="ghost" onClick={() => dropNote(userId, film.id, n.id)} className={cn("h-7 px-2", BIG)}>Remove</Button>
                </div>
              </div>
            )}
            {n.status === "open" && <p className="text-xs text-muted-foreground">Not sent</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One text, saved on Enter or when it loses focus. */
function TextInput({ field, onCommit }: { field: TextField; onCommit: (v: string) => void }) {
  const [v, setV] = useState(field.value);
  const commit = () => v !== field.value && onCommit(v);
  return (
    <div className="space-y-1">
      <Label htmlFor={`film-field-${field.id}`} className="text-[11px] text-muted-foreground">{field.label}</Label>
      <Input
        id={`film-field-${field.id}`}
        type={field.number ? "number" : "text"}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}

function Fields({ userId, film, spec }: { userId: string; film: StoredFilm; spec: Film }) {
  const [err, setErr] = useState<string | null>(null);
  const save = (next: Film) => setErr(setSpec(userId, film.id, next));
  const styles: string[] = PRODUCTS[productOf(spec) as keyof typeof PRODUCTS]?.styles ?? [];
  // colours are the kit's roles only
  const palette = useMemo(() => (loadBrand(userId)?.palette ?? []).map((p) => p.name), [userId]);
  return (
    <div className="space-y-5">
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {spec.scenes.map((s, i) => (
        <section key={s.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{i + 1}. {sceneName(s.id)}</h3>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" aria-label={`Shorter hold for ${sceneName(s.id)}`} disabled={s.beats <= 1} onClick={() => save({ ...spec, scenes: spec.scenes.map((x) => (x.id === s.id ? { ...x, beats: x.beats - 1 } : x)) })} className="h-8 w-8 p-0">-</Button>
              <span className="min-w-[4.5rem] text-center text-xs tabular-nums">{s.beats} beats</span>
              <Button size="sm" variant="outline" aria-label={`Longer hold for ${sceneName(s.id)}`} disabled={s.beats >= 32} onClick={() => save({ ...spec, scenes: spec.scenes.map((x) => (x.id === s.id ? { ...x, beats: x.beats + 1 } : x)) })} className="h-8 w-8 p-0">+</Button>
            </div>
          </div>
          {textFields(s).map((f) => <TextInput key={`${f.id}:${f.value}`} field={f} onCommit={(v) => save(withText(spec, f.id, v))} />)}
          {spec.voice.on && (
            <TextInput
              key={`${s.id}.voice:${spec.voice.lines[s.id] ?? ""}`}
              field={{ id: `${s.id}.voice`, label: "Spoken line", value: spec.voice.lines[s.id] ?? "" }}
              onCommit={(v) => {
                const lines = { ...spec.voice.lines };
                if (v.trim()) lines[s.id] = v;
                else delete lines[s.id];
                save({ ...spec, voice: { ...spec.voice, lines } });
              }}
            />
          )}
        </section>
      ))}
      <Field label="Ground">
        {GROUNDS.map((g) => <FilterChip key={g} active={spec.ground === g} onClick={() => save({ ...spec, ground: g })}>{sceneName(g)}</FilterChip>)}
      </Field>
      <Field label="Accent">
        <FilterChip active={spec.accent === "brand"} onClick={() => save({ ...spec, accent: "brand" })}>Brand</FilterChip>
        {palette.map((p) => <FilterChip key={p} active={spec.accent === `palette:${p}`} onClick={() => save({ ...spec, accent: `palette:${p}` })}>{p}</FilterChip>)}
      </Field>
      <Field label="Music">
        {styles.map((name, i) => <FilterChip key={name} active={spec.style === i} onClick={() => save({ ...spec, style: i as 0 | 1 | 2 })}>{styleName(name)}</FilterChip>)}
      </Field>
      <Field label="Voice">
        <FilterChip active={!spec.voice.on} onClick={() => save({ ...spec, voice: { ...spec.voice, on: false } })}>Music only</FilterChip>
        <FilterChip active={spec.voice.on} onClick={() => save({ ...spec, voice: { ...spec.voice, on: true } })}>AI voice reads it</FilterChip>
      </Field>
    </div>
  );
}

function ExportPanel({ userId, film }: { userId: string; film: StoredFilm }) {
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const navigate = useNavigate();
  const open = params.get("export") === "open";
  const fromUrl = SHAPES.find((s) => s === params.get("shape"));
  const [all, setAll] = useState(false);
  const shape = fromUrl ?? film.setup.shape;
  const e = exportJob();
  const mine = e?.filmId === film.id ? e : null;
  const seconds = Math.round(filmLength(film.spec!));
  const urls = useMemo(() => (mine?.state === "done" ? mine.files.map((f) => URL.createObjectURL(f.blob)) : []), [mine?.state, mine?.files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const close = () => update({ export: null, shape: null });

  if (!open && !mine) {
    return <Button onClick={() => update({ export: "open" })} className={cn("w-full", BIG)}>Export</Button>;
  }
  return (
    <section aria-label="Export" className="space-y-3 rounded-xl border border-border/70 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Export</h2>
        {mine?.state !== "working" && <Button size="sm" variant="ghost" onClick={() => (clearExport(), close())} className={BIG}>Close</Button>}
      </div>
      {mine?.state === "working" ? (
        <div className="space-y-2">
          <p role="status" className="text-sm">Exporting, {Math.floor(mine.progress * 100)}%...</p>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${mine.progress * 100}%` }} /></div>
          <Button variant="outline" onClick={stopExport} className={BIG}>Stop</Button>
        </div>
      ) : mine?.state === "done" ? (
        <div className="space-y-3">
          <p className="font-medium">Your film is ready.</p>
          <ul className="space-y-2">
            {mine.files.map((f, i) => (
              <li key={f.shape}>
                <a href={urls[i]} download={fileName(film, f)} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">
                  Download {mine.files.length > 1 ? SHAPE_NAME[f.shape] : ""}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void openInEditor(userId, film.id, mine.files[0]);
                navigate(links.edit());
              }}
              className={BIG}
            >
              Open in editor
            </Button>
            <Button variant="outline" onClick={clearExport} className={BIG}>Make another shape</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {mine?.state === "failed" && <Failed line={mine.error ?? "Couldn't export the film. Try again."} />}
          <div className="flex flex-wrap gap-1.5">
            {SHAPES.map((s) => (
              <FilterChip key={s} active={!all && shape === s} onClick={() => { setAll(false); update({ export: "open", shape: s === film.setup.shape ? null : s }); }}>{SHAPE_NAME[s]}</FilterChip>
            ))}
            <FilterChip active={all} onClick={() => setAll(true)}>All three</FilterChip>
          </div>
          {!exportsFast() && <p className="text-sm text-muted-foreground">This browser exports in real time, so a {seconds} second film takes {seconds} seconds.</p>}
          <Button onClick={() => void exportShapes(userId, film.id, all ? [shape, ...SHAPES.filter((s) => s !== shape)] : [shape])} className={cn("w-full", BIG)}>Export</Button>
        </div>
      )}
    </section>
  );
}
