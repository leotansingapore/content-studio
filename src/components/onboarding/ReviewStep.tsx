import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowSquareOutIcon, CaretDownIcon, CircleNotchIcon, FacebookLogoIcon, InstagramLogoIcon, LinkedinLogoIcon, PlusIcon, StarIcon, TiktokLogoIcon, TrashIcon, UploadSimpleIcon, type Icon } from "@phosphor-icons/react";
import { FieldLabel, PrimaryPill, ScoreRing, StatusPill, StepTitle, areaClass, fieldClass, useLogoTile } from "@/components/onboarding/parts";
import { AUDIENCE_NAMES, NETWORKS, parseTopics, shownTopics, type BrandDna } from "@/lib/addBrand";
import { MAX_PAINS, proofLines, type AppRead } from "@/lib/appStore";
import type { SlideFont } from "@/lib/carouselLayout";
import type { PostLang } from "@/lib/links";
import { LOGO_FILE_ERROR, LOGO_TYPES, logoFromFile } from "@/lib/logoImage";
import { colourGap, confirmLabel, hexOf, nextLine, readableInk, scoreOf, sectionTitle, type Mode, type Section } from "@/lib/onboardingFlow";
import type { PlanAudience } from "@/lib/positioning";
import type { ReviewRow } from "@/lib/productScan";
import { LANG_NAMES } from "@/lib/translate";

const NETWORK_ICONS: Record<string, Icon> = { instagram: InstagramLogoIcon, facebook: FacebookLogoIcon, linkedin: LinkedinLogoIcon, tiktok: TiktokLogoIcon };
const SLIDE_LOOKS: { value: SlideFont; label: string; line: string; title: string; body: string }[] = [
  { value: "classic", label: "Classic", line: "Serif titles, plain text", title: "font-serif", body: "font-sans" },
  { value: "modern", label: "Modern", line: "Clean and plain throughout", title: "font-sans", body: "font-sans" },
  { value: "serif", label: "Editorial", line: "Serif throughout", title: "font-serif", body: "font-serif" },
];

function Swatch({ hex, size = "lg", label, onClick, selected }: { hex: string; size?: "lg" | "sm"; label: string; onClick: () => void; selected?: boolean }) {
  const big = size === "lg";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={`grid shrink-0 place-items-center rounded-full border bg-card transition-transform motion-safe:hover:scale-105 ${big ? "h-[51px] w-[51px] p-[5px]" : "h-9 w-9 p-[3px]"} ${selected ? "border-foreground/70 ring-2 ring-primary/40" : "border-border"}`}
    >
      <span className="h-full w-full rounded-full border border-foreground/15" style={{ backgroundColor: hex }} />
    </button>
  );
}

function ColourField({ picked, suggested, presets, max, onChange }: { picked: string[]; suggested: string[]; presets: string[]; max: number; onChange: (next: string[]) => void }) {
  const id = useId();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const row = useRef<HTMLDivElement>(null);
  const open = (i: number, start: string) => {
    setEditing(i);
    setDraft(start);
  };
  const close = (focusAt: number) => {
    setEditing(null);
    window.setTimeout(() => {
      const buttons = row.current?.querySelectorAll<HTMLElement>("button");
      buttons?.[Math.min(focusAt, (buttons?.length ?? 1) - 1)]?.focus({ preventScroll: true });
    }, 0);
  };
  const valid = hexOf(draft);
  const save = () => {
    if (!valid || editing === null) return;
    const next = [...picked];
    if (editing >= next.length) next.push(valid);
    else next[editing] = valid;
    onChange(next.slice(0, max));
    close(Math.min(editing, max - 1));
  };
  const away = (list: string[]) => list.filter((s) => !picked.some((c) => colourGap(c, s) < 60)).slice(0, 6);
  const others = away(suggested);
  const starters = away(presets);
  const use = (hex: string) => onChange(max === 1 ? [hex] : picked.length >= max ? [...picked.slice(0, max - 1), hex] : [...picked, hex]);
  return (
    <div className="space-y-3">
      <div ref={row} className="flex flex-wrap items-center gap-2.5">
        {picked.map((hex, i) => (
          <Swatch key={`${hex}-${i}`} hex={hex} label={`${i === 0 ? "Main colour" : `Colour ${i + 1}`} ${hex}, change it`} selected={editing === i} onClick={() => (editing === i ? setEditing(null) : open(i, hex))} />
        ))}
        {picked.length < max && (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => open(picked.length, others[0] ?? "#2563EB")}
              aria-label="Add a colour"
              className="grid h-[51px] w-[51px] place-items-center rounded-full border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
            >
              <PlusIcon size={20} />
            </button>
            <span className="text-[11px] font-medium text-transparent" aria-hidden="true">
              add
            </span>
          </div>
        )}
      </div>
      {editing !== null && (
        <div className="w-full max-w-[340px] space-y-3 rounded-2xl border border-border/70 bg-popover p-3 shadow-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
          <div className="h-9 w-full rounded-xl border border-black/10" style={{ backgroundColor: valid ?? "transparent" }} />
          <div className="flex items-center gap-2">
            <label className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-popover">
              <span className="sr-only">Pick a colour</span>
              <input type="color" value={(valid ?? "#2563EB").toLowerCase()} onChange={(e) => setDraft(e.target.value.toUpperCase())} className="absolute -inset-2 h-16 w-16 cursor-pointer focus-visible:outline-none" />
            </label>
            <label htmlFor={`${id}-hex`} className="sr-only">
              Hex value
            </label>
            <input
              id={`${id}-hex`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="#2563EB"
              maxLength={7}
              spellCheck={false}
              className={`${fieldClass} font-mono uppercase`}
              aria-invalid={!valid}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {editing > 0 && editing < picked.length && (
                <button type="button" className="rounded-full px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => {
                  const next = [...picked];
                  const [c] = next.splice(editing, 1);
                  onChange([valid ?? c, ...next]);
                  close(0);
                }}>
                  Make main
                </button>
              )}
              {editing < picked.length && picked.length > 1 && (
                <button type="button" className="rounded-full px-2.5 py-1.5 text-[13px] font-medium text-destructive hover:bg-destructive/10" onClick={() => {
                  onChange(picked.filter((_, i) => i !== editing));
                  close(Math.max(0, editing - 1));
                }}>
                  Remove
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <button type="button" className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted" onClick={() => close(editing)}>
                Cancel
              </button>
              <button type="button" disabled={!valid} onClick={save} className="rounded-full bg-foreground px-3.5 py-1.5 text-[13px] font-semibold text-background disabled:opacity-40">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {[
        { list: others, line: max === 1 ? "Also on your site and logo. Tap one to use it." : picked.length >= max ? "Also on your site and logo. Tap one to swap it in for the last." : "Also on your site and logo. Tap one to add it." },
        { list: starters, line: picked.length ? "Or start from one of these." : "Pick one of these, or add your own with +." },
      ].map(
        (row) =>
          row.list.length > 0 && (
            <div key={row.line} className="space-y-1.5">
              <p className="text-[13px] text-muted-foreground">{row.line}</p>
              <div className="flex flex-wrap gap-2">
                {row.list.map((hex) => (
                  <Swatch key={hex} hex={hex} size="sm" label={`Use ${hex}`} onClick={() => use(hex)} />
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}

function LogoField({ logo, name, colour, found, onLogo }: { logo: string | null; name: string; colour: string | null; found: boolean; onLogo: (v: string | null) => void }) {
  const id = useId();
  const tile = useLogoTile(logo);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [mine, setMine] = useState(false);
  const take = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      onLogo(await logoFromFile(file));
      setMine(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : LOGO_FILE_ERROR);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <input id={`${id}-file`} type="file" accept={LOGO_TYPES} className="peer sr-only" onChange={(e) => {
        void take(e.target.files?.[0]);
        e.target.value = "";
      }} />
      <label
        htmlFor={`${id}-file`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files?.[0]);
        }}
        className={`group relative block cursor-pointer rounded-[20px] border p-1.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card ${over ? "border-primary bg-primary/5" : "border-border/70 hover:border-border"}`}
      >
        <span className="flex min-h-[121px] flex-col items-center justify-center gap-1.5 rounded-[15px] bg-muted/50 p-5 text-center">
          {logo ? (
            <span className={`${tile} grid h-[72px] min-w-[72px] max-w-full place-items-center overflow-hidden rounded-xl px-2`}>
              <img src={logo} alt={`${name || "Brand"} logo`} className="max-h-[60px] max-w-[220px] object-contain" />
            </span>
          ) : (
            <UploadSimpleIcon size={28} weight="duotone" className="text-primary" />
          )}
          <span className="inline-flex items-center gap-1.5 text-base font-medium text-foreground">
            {logo && <UploadSimpleIcon size={16} />} {logo ? "Replace" : "Upload logo"}
          </span>
          <span className="text-xs font-medium text-muted-foreground">{!logo ? "PNG, JPG, WebP or SVG, up to 5 MB." : mine || !found ? "Your logo. Drop another file on it to swap." : "Found on your site. Drop a file on it to swap."}</span>
        </span>
        {busy && <span className="absolute inset-0 grid place-items-center rounded-[20px] bg-background/70 text-sm font-medium">Reading...</span>}
      </label>
      {logo && (
        <button type="button" onClick={() => {
          onLogo(null);
          setMine(false);
        }} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive [@media(pointer:coarse)]:h-11">
          <TrashIcon size={15} /> Remove
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export interface ReviewProps {
  titleId: string;
  mode?: Mode;
  manual: boolean;
  host: string;
  leo: boolean;
  dna: BrandDna;
  patch: (p: Partial<BrandDna>) => void;
  profession: string;
  onProfession: () => void;
  sections: readonly Section[];
  done: ReadonlySet<Section>;
  current: Section | null;
  expanded: ReadonlySet<Section>;
  onToggle: (s: Section) => void;
  onConfirm: (s: Section) => void;
  onCreate: () => void;
  createNote: ReactNode;
  colours: string[];
  suggested: string[];
  presets: string[];
  onColours: (c: string[]) => void;
  lang: PostLang | null;
  onLang: (l: PostLang | null) => void;
  slideFont: SlideFont;
  onSlideFont: (f: SlideFont) => void;
  app: AppRead | null;
  onTick: (key: "proof" | "pains", v: string, on: boolean) => void;
  products?: { busy: boolean; host: string; rows: ReviewRow[] } | null;
  onProductTick?: (i: number, on: boolean) => void;
  productsNote?: string;
}

const PRODUCT_GROUPS: [ReviewRow["group"], string | null][] = [["yours", null], ["maybe", "Maybe not yours"], ["unsorted", "Check each one: we couldn't sort these."]];

export function ReviewStep(p: ReviewProps) {
  const { dna, patch, leo, sections, done, current } = p;
  const id = useId();
  const [topicsTyped, setTopicsTyped] = useState("");
  const refs = useRef<Partial<Record<Section, HTMLElement | null>>>({});
  const shownCurrent = useRef(current);
  useEffect(() => {
    if (shownCurrent.current === current) return;
    shownCurrent.current = current;
    if (!current) return;
    refs.current[current]?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    document.getElementById(`${id}-${current}-h`)?.focus({ preventScroll: true });
  }, [current, id]);

  const finding = !!p.products?.busy;
  const valid = (s: Section) => (s === "identity" ? !!dna.name.trim() : s === "look" ? p.colours.length > 0 : s === "products" ? !finding : true);
  const summary = (s: Section): ReactNode => {
    switch (s) {
      case "identity":
        return dna.name.trim() || "No name yet";
      case "look":
        return (
          <span className="inline-flex items-center gap-1">
            {p.colours.map((c) => (
              <span key={c} className="h-3.5 w-3.5 rounded-full border border-foreground/20" style={{ backgroundColor: c }} />
            ))}
            {leo && <span className="ml-1">{SLIDE_LOOKS.find((l) => l.value === p.slideFont)?.label}</span>}
          </span>
        );
      case "voice":
        return dna.voice.trim() || AUDIENCE_NAMES[dna.audience];
      case "social":
        return NETWORKS.filter((n) => dna.handles[n.key]?.trim()).map((n) => n.label).join(", ") || "None added";
      case "proof":
        return `${p.app?.proof.length ?? 0} ${p.app?.proof.length === 1 ? "fact" : "facts"} to save`;
      case "pains":
        return p.app?.pains.length ? `${p.app.pains.length} picked` : "None picked";
      case "products":
        return finding ? "Finding what you sell..." : `${p.products?.rows.filter((r) => r.ticked).length ?? 0} of ${p.products?.rows.length ?? 0} to save`;
    }
  };

  const body = (s: Section): ReactNode => {
    switch (s) {
      case "identity":
        return (
          <>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-name`}>Brand name</FieldLabel>
              <input id={`${id}-name`} value={dna.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} placeholder="MoneyBees" className={fieldClass} aria-invalid={!dna.name.trim()} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Logo</FieldLabel>
              <LogoField logo={dna.logo} name={dna.name} colour={p.colours[0] ?? null} found={!p.manual} onLogo={(logo) => patch({ logo })} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-line`} hint={`${dna.oneLiner.length}/200`}>
                What you do, in one line
              </FieldLabel>
              <textarea id={`${id}-line`} rows={3} maxLength={200} value={dna.oneLiner} onChange={(e) => patch({ oneLiner: e.target.value })} placeholder="We help young families save so they can buy their first home." className={`${areaClass} resize-none`} />
            </div>
            <p className="text-[13px] text-muted-foreground">
              Posts are written for a {p.profession.trim() ? p.profession.trim().toLowerCase() : "professional"}.{" "}
              <button type="button" onClick={p.onProfession} className="font-medium text-primary underline-offset-2 hover:underline">
                Change
              </button>
            </p>
            {leo && (
              <div className="space-y-1.5">
                <FieldLabel htmlFor={`${id}-lang`}>Posts are written in</FieldLabel>
                <select id={`${id}-lang`} value={p.lang ?? ""} onChange={(e) => p.onLang((e.target.value || null) as PostLang | null)} className={`${fieldClass} appearance-auto`}>
                  <option value="">English</option>
                  {(Object.keys(LANG_NAMES) as PostLang[]).map((l) => (
                    <option key={l} value={l}>
                      {LANG_NAMES[l]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        );
      case "look":
        return (
          <>
            <div className="space-y-2">
              {leo && <FieldLabel>Brand colours</FieldLabel>}
              <ColourField picked={p.colours} suggested={p.suggested} presets={p.presets} max={4} onChange={p.onColours} />
              {!p.colours.length && <p className="text-[13px] font-medium text-destructive">Pick a colour to go on.</p>}
            </div>
            {leo && (
              <div className="space-y-2">
                <FieldLabel>Slide look</FieldLabel>
                {!!dna.fonts?.length && <p className="text-[13px] text-muted-foreground">Your site uses {dna.fonts.join(", ")}.</p>}
                <div role="group" aria-label="Slide look" className="grid grid-cols-3 gap-2">
                  {SLIDE_LOOKS.map((l) => {
                    const on = p.slideFont === l.value;
                    return (
                      <button key={l.value} type="button" aria-pressed={on} onClick={() => p.onSlideFont(l.value)} className={`rounded-2xl border-2 p-3 text-left transition-colors ${on ? "border-primary bg-primary/[0.07]" : "border-border/60 bg-muted/30 hover:border-border"}`}>
                        <span className={`block text-xl font-semibold leading-none ${l.title}`}>Aa</span>
                        <span className={`mt-2 block text-[13px] font-semibold ${l.body}`}>{l.label}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{l.line}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        );
      case "voice":
        return (
          <>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-voice`}>How you sound</FieldLabel>
              <textarea id={`${id}-voice`} rows={3} maxLength={400} value={dna.voice} onChange={(e) => patch({ voice: e.target.value })} placeholder="Warm and plain. Short sentences. Talks like a friend who knows the numbers." className={`${areaClass} resize-none`} />
            </div>
            <div className="space-y-2">
              <FieldLabel>Who you help</FieldLabel>
              <div role="group" aria-label="Who you help" className="flex flex-wrap gap-2">
                {(Object.keys(AUDIENCE_NAMES) as PlanAudience[]).map((a) => {
                  const on = dna.audience === a;
                  return (
                    <button key={a} type="button" aria-pressed={on} onClick={() => patch({ audience: a })} className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border/80 bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
                      {AUDIENCE_NAMES[a]}
                    </button>
                  );
                })}
              </div>
              <label htmlFor={`${id}-who`} className="sr-only">
                Exactly who
              </label>
              <textarea id={`${id}-who`} rows={2} value={dna.audienceDetail} maxLength={160} onChange={(e) => patch({ audienceDetail: e.target.value })} placeholder="Exactly who, like parents with kids under 10" className={`${areaClass} resize-none`} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-topics`} hint="Up to 6, with commas">
                What you post about
              </FieldLabel>
              <input id={`${id}-topics`} value={shownTopics(topicsTyped, dna.topics)} onChange={(e) => {
                setTopicsTyped(e.target.value);
                patch({ topics: parseTopics(e.target.value) });
              }} placeholder="Savings, insurance, retirement" className={fieldClass} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-edge`}>Why people pick you</FieldLabel>
              <textarea id={`${id}-edge`} rows={2} value={dna.edge} maxLength={200} onChange={(e) => patch({ edge: e.target.value })} placeholder="Plain answers, no sales pitch" className={`${areaClass} resize-none`} />
            </div>
          </>
        );
      case "social":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            {NETWORKS.map((n) => {
              const Glyph = NETWORK_ICONS[n.key];
              return (
                <div key={n.key} className="space-y-1.5">
                  <FieldLabel htmlFor={`${id}-${n.key}`}>{n.label}</FieldLabel>
                  <div className="relative">
                    <Glyph size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input id={`${id}-${n.key}`} value={dna.handles[n.key] ?? ""} onChange={(e) => patch({ handles: { ...dna.handles, [n.key]: e.target.value } })} placeholder={n.key === "linkedin" ? "company/your-page" : "yourhandle"} spellCheck={false} autoCapitalize="none" className={`${fieldClass} pl-10`} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      case "proof":
        return p.app ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {p.app.listing.icon && <img src={p.app.listing.icon} alt="" className="h-12 w-12 rounded-xl border border-border/60" />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{p.app.listing.name}</p>
                <p className="flex items-center gap-1 text-muted-foreground">
                  {p.app.listing.rating !== null && (
                    <>
                      <StarIcon size={14} weight="fill" /> {p.app.listing.rating.toFixed(1)} from {p.app.listing.ratings.toLocaleString("en-US")} ratings,{" "}
                    </>
                  )}
                  {p.app.listing.price || "No price shown"}
                </p>
              </div>
              <a href={p.app.listing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary [@media(pointer:coarse)]:min-h-11">
                Listing <ArrowSquareOutIcon size={12} />
              </a>
            </div>
            {p.app.listing.screenshots.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {p.app.listing.screenshots.map((src) => (
                  <img key={src} src={src} alt="" loading="lazy" className="h-28 shrink-0 rounded-md border border-border/60" />
                ))}
              </div>
            )}
            <fieldset className="space-y-1.5">
              <legend className="text-[13px] font-medium text-muted-foreground">Facts the writers may state</legend>
              {proofLines(p.app.listing).map((line) => (
                <label key={line} className="flex items-start gap-2 text-sm [@media(pointer:coarse)]:min-h-11">
                  <input type="checkbox" className="mt-1" checked={p.app!.proof.includes(line)} onChange={(e) => p.onTick("proof", line, e.target.checked)} />
                  {line}
                </label>
              ))}
            </fieldset>
          </div>
        ) : null;
      case "pains":
        return p.app ? (
          p.app.complaints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No 1 or 2 star reviews came back for apps like it. You can add problems later in Your voice.</p>
          ) : (
            <fieldset className="space-y-1.5">
              <legend className="text-[13px] text-muted-foreground">
                Pick up to {MAX_PAINS}. Writers can open a post on these problems. From reviews of {p.app.rivals.map((r) => r.name).join(", ")}.
              </legend>
              {p.app.complaints.map((c) => {
                const on = p.app!.pains.includes(c.id);
                return (
                  <label key={c.id} className="flex items-start gap-2 rounded-xl border border-border/60 p-2 text-sm [@media(pointer:coarse)]:min-h-11">
                    <input type="checkbox" className="mt-1" checked={on} disabled={!on && p.app!.pains.length >= MAX_PAINS} onChange={(e) => p.onTick("pains", c.id, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      {`"${c.text}"`}
                      <span className="block text-xs text-muted-foreground">
                        {c.app}, {c.stars} {c.stars === 1 ? "star" : "stars"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )
        ) : null;
      case "products":
        return p.products ? (
          finding ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleNotchIcon size={16} className="shrink-0 animate-spin" />
              Reading {p.products.host} for what you sell. This takes up to a minute.
            </p>
          ) : (
            <fieldset className="space-y-3">
              <legend className="text-[13px] text-muted-foreground">
                Found {p.products.rows.length} on {p.products.host}. Untick any that aren't yours. Pictures come in when you open Brand &gt; Products.
              </legend>
              {PRODUCT_GROUPS.map(([g, title]) => {
                const these = p.products!.rows.filter((r) => r.group === g);
                if (!these.length) return null;
                return (
                  <div key={g} className="space-y-2">
                    {title && <p className="text-xs font-semibold text-muted-foreground">{title}</p>}
                    {these.map((r) => (
                      <label key={r.i} className={`flex items-start gap-2.5 rounded-xl border border-border/60 p-2.5 text-sm [@media(pointer:coarse)]:min-h-11 ${r.added ? "opacity-60" : "cursor-pointer"}`}>
                        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={r.ticked} disabled={r.added} onChange={(e) => p.onProductTick?.(r.i, e.target.checked)} />
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          <span className="block font-semibold text-foreground">
                            {r.row.name}
                            {r.row.price && <span className="font-normal text-muted-foreground">, {r.row.price}</span>}
                          </span>
                          {r.row.what && <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">{r.row.what}</span>}
                          {r.added && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Already added</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </fieldset>
          )
        ) : null;
    }
  };

  const shown = sections.filter((s) => done.has(s) || s === current);
  const score = scoreOf(done.size, sections.length);
  const allDone = !current;
  const last = (s: Section) => sections.filter((x) => !done.has(x)).length === 1 && s === current;

  return (
    <div className="flex w-full max-w-[680px] flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <div className="mb-1">
        <StepTitle
          id={p.titleId}
          title={p.manual ? "Build your brand" : "Here's your brand"}
          lead={p.manual ? "Fill in each part. You can change any of it later." : `We read ${p.host}. Check each part and fix anything that's off.`}
        />
      </div>
      <div className="flex items-center gap-5 rounded-[20px] bg-card p-5">
        <ScoreRing value={score} />
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground">Brand set up</p>
          <p className="text-sm font-medium text-muted-foreground">{nextLine(current, done.size, sections.length, leo, p.mode)}</p>
        </div>
      </div>
      {p.productsNote && <p className="-mt-2 px-1 text-[13px] text-muted-foreground">{p.productsNote}</p>}
      {shown.map((s) => {
        const isOpen = s === current || p.expanded.has(s);
        const ok = valid(s);
        return (
          <div key={s} className="flex flex-col gap-4">
            <section
              ref={(el) => {
                refs.current[s] = el;
              }}
              className="scroll-mt-6 overflow-hidden rounded-[20px] bg-card shadow-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
              aria-labelledby={`${id}-${s}-h`}
            >
              <button
                type="button"
                id={`${id}-${s}-h`}
                aria-expanded={isOpen}
                aria-controls={`${id}-${s}-b`}
                onClick={() => s !== current && p.onToggle(s)}
                className={`flex w-full items-center gap-5 rounded-[20px] p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${s === current ? "cursor-default" : "hover:bg-muted/30"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-foreground">{sectionTitle(s, leo)}</span>
                  {!isOpen && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{summary(s)}</span>}
                </span>
                {(!ok || done.has(s)) && !(s === "products" && finding) && <StatusPill state={ok && done.has(s) ? "done" : "required"} />}
                <span className="grid h-[37px] w-[37px] shrink-0 place-items-center rounded-full bg-muted text-foreground">
                  <CaretDownIcon size={16} weight="bold" className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
              {isOpen && (
                <div id={`${id}-${s}-b`} className="flex flex-col gap-5 border-t border-border/70 p-5">
                  {body(s)}
                </div>
              )}
            </section>
            {s === current && (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <PrimaryPill disabled={last(s) ? !sections.every(valid) : !ok} onClick={() => (last(s) ? p.onCreate() : p.onConfirm(s))} className="w-full sm:w-auto">
                  {s === "products" && finding ? "Finding products..." : confirmLabel(s, last(s), dna.name, leo, p.mode)}
                </PrimaryPill>
                {last(s) && ok && !sections.every(valid) && <p className="text-sm font-medium text-destructive">Fill in the parts marked Required first.</p>}
                {last(s) && p.createNote}
              </div>
            )}
          </div>
        );
      })}
      {allDone && (
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <PrimaryPill disabled={!sections.every(valid)} onClick={p.onCreate} className="w-full sm:w-auto">
            {p.mode === "first" ? "Save my brand" : `Create ${dna.name.trim() || "brand"}`}
          </PrimaryPill>
          {!sections.every(valid) && <p className="text-sm font-medium text-destructive">Fill in the parts marked Required first.</p>}
          {p.createNote}
        </div>
      )}
    </div>
  );
}
