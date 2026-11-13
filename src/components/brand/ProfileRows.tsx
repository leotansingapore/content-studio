// Brand > Profile's rows (/playbook), drawn as Fastlane draws them: a group heading, then one card of rows, each a
// label, what is on file and a chevron. A row with `edit` (brandOverview.ts) opens in place under itself and saves as
// it is typed to the same store its own page saves to: the brand kit (carousel.ts saveBrand), the positioning, the
// main product or the script product card, so Brand kit, Plan and Products read the change at once. The other rows
// link to the page that edits them. ?edit=<row id> is the open row (push, so Back closes it).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon, CaretDownIcon, CaretRightIcon, ImageSquareIcon, TrashIcon } from "@phosphor-icons/react";
import ProfessionField from "@/components/ProfessionField";
import { LogoTile } from "@/components/onboarding/parts";
import { shrinkImage } from "@/components/brand/shrinkImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { isSet, type OverviewGroup, type OverviewRow, type ProfileEdit } from "@/lib/brandOverview";
import { kitOf, saveProfileField, type ProfileField } from "@/components/brand/profileSave";
import { BRAND_PRESETS, MAX_AVOID_CHARS, MAX_IMAGE_CHARS, MAX_NAME_CHARS, MAX_SIGNOFF_CHARS, normalizeHex } from "@/lib/carousel";
import { EMPTY_POSITIONING, loadPositioning } from "@/lib/positioning";
import { LIMITS, loadProducts, mainProduct } from "@/lib/products";
import { FIELD_MAX, loadScriptContext } from "@/lib/scriptContext";

const ONE_LINER_MAX = 200;
const EDGE_MAX = 300;
const WHO_MAX = 200;

/** Where a row's own page is, in words, for the quiet link under its editor. */
const pageName = (to: string) =>
  to.startsWith("/brand/products") ? "Open Products" : to.startsWith("/brand") ? "More in Brand kit" : to.startsWith("/plan") ? "Open your plan" : null;

function Value({ row }: { row: OverviewRow }) {
  if (row.image) {
    return (
      <span className="flex items-center gap-3">
        <LogoTile src={row.image} alt="Your logo" className="h-9 w-14 shrink-0 rounded-md border border-border/60 p-1" />
        <span className="text-muted-foreground">{row.value}</span>
      </span>
    );
  }
  if (row.swatches?.length) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {row.swatches.map((hex, k) => <span key={k} title={hex} className="h-5 w-5 rounded-full border border-border/60" style={{ backgroundColor: hex }} />)}
      </span>
    );
  }
  if (row.chips?.length) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {row.chips.map((c) => <span key={c} className="max-w-full truncate rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs text-foreground">{c}</span>)}
      </span>
    );
  }
  return row.value ? <span className="line-clamp-2 break-words text-foreground">{row.value}</span> : <span className="text-muted-foreground">{row.note ?? "Not set"}</span>;
}

/** The label and value, side by side from sm up and stacked on a phone, the way every row reads. */
function RowFace({ row, icon }: { row: OverviewRow; icon: ReactNode }) {
  return (
    <>
      <span className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
        <span className="block text-xs text-muted-foreground sm:w-40 sm:shrink-0 sm:pt-0.5 sm:text-sm">{row.label}</span>
        <span className="mt-1 block min-w-0 flex-1 text-sm sm:mt-0">
          <Value row={row} />
        </span>
      </span>
      {icon}
    </>
  );
}

/** The "Next:" pointer's look, at the top of Profile and in an open row. */
export const NEXT = "inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11";

/** "Next: Add a logo", opening that row in place or linking to the page that fills it. */
export function NextGap({ row, onOpen }: { row: OverviewRow; onOpen: (id: string) => void }) {
  const words = <>Next: {row.add} <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden /></>;
  return row.edit
    ? <button type="button" onClick={() => onOpen(row.id)} className={NEXT}>{words}</button>
    : <Link to={row.to} className={NEXT}>{words}</Link>;
}

const ROW = "group flex min-h-[52px] w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export function ProfileGroups({ groups, uid, openId, next, onOpen, onClose, onSaved }: {
  groups: OverviewGroup[];
  uid: string;
  openId: string | null;
  /** The first gap after the open row, offered beside its Done. */
  next?: OverviewRow;
  onOpen: (id: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="scroll-mt-20 space-y-2">
          <h2 id={`${g.id}-title`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.title}</h2>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
            {g.rows.map((r) => {
              const open = openId === r.id && !!r.edit;
              return (
                <li key={r.id} data-profile-row={r.id}>
                  {r.edit ? (
                    <button type="button" className={ROW} aria-expanded={open} aria-controls={`edit-${r.id}`} onClick={() => (open ? onClose() : onOpen(r.id))}>
                      <RowFace row={r} icon={<CaretDownIcon className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />} />
                    </button>
                  ) : (
                    <Link to={r.to} className={ROW}>
                      <RowFace row={r} icon={<CaretRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />} />
                    </Link>
                  )}
                  {open && (
                    <div id={`edit-${r.id}`} className="border-t border-border/60 bg-muted/20 px-4 py-4">
                      <RowEditor kind={r.edit!} row={r} uid={uid} next={next} onOpen={onOpen} onSaved={onSaved} onDone={onClose} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RowEditor({ kind, row, uid, next, onOpen, onSaved, onDone }: {
  kind: ProfileEdit;
  row: OverviewRow;
  uid: string;
  next?: OverviewRow;
  onOpen: (id: string) => void;
  onSaved: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState("");
  const box = useRef<HTMLDivElement>(null);
  // the first field takes the keys, so a row opened by Next or a click is typed into straight away
  useEffect(() => (["input:not([type=file]):not([type=color]), textarea", "[aria-pressed=true]", "label, button"].map((q) => box.current?.querySelector<HTMLElement>(q)).find(Boolean))?.focus(), []);
  const saved = (error: string | null) => {
    setStatus(error ?? "Saved");
    onSaved();
  };
  const more = pageName(row.to);
  return (
    <div
      ref={box}
      className="space-y-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
    >
      <Editor kind={kind} uid={uid} save={saved} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="button" size="sm" variant="outline" className="h-9 [@media(pointer:coarse)]:h-11" onClick={onDone}>Done</Button>
        {/* the next gap beside the field just filled (law 8), so the chain never sends the eye back to the top */}
        {next && <NextGap row={next} onOpen={onOpen} />}
        {more && <Link to={row.to} className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline [@media(pointer:coarse)]:py-3">{more}</Link>}
        <p aria-live="polite" className={`ml-auto text-xs ${status === "Saved" ? "text-success" : "text-destructive"}`}>{status}</p>
      </div>
    </div>
  );
}

/** One text field that saves on every change, as the brand kit's own fields do. */
function TextEdit({ label, initial, max, rows, placeholder, hint, save }: {
  label: string;
  initial: string;
  max: number;
  rows?: number;
  placeholder?: string;
  hint?: string;
  save: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  const id = `pe-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const change = (next: string) => {
    setV(next);
    save(next);
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {rows ? (
        <Textarea id={id} rows={rows} value={v} maxLength={max} placeholder={placeholder} onChange={(e) => change(e.target.value)} />
      ) : (
        <Input id={id} value={v} maxLength={max} placeholder={placeholder} onChange={(e) => change(e.target.value)} className="[@media(pointer:coarse)]:h-11" />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Editor({ kind, uid, save }: { kind: ProfileEdit; uid: string; save: (error: string | null) => void }) {
  const kit = kitOf(uid);
  const pos = loadPositioning(uid) ?? EMPTY_POSITIONING;
  const to = (field: ProfileField) => (v: string) => save(saveProfileField(uid, field, v));
  switch (kind) {
    case "name":
      return <TextEdit label="Name" initial={kit.name} max={MAX_NAME_CHARS} save={to("name")} />;
    case "does":
      return (
        <div className="space-y-4">
          <TextEdit label="In one line" initial={pos.oneLiner} max={ONE_LINER_MAX} rows={2} placeholder="I help busy parents plan for their kids' future" save={to("oneLiner")} />
          <ProfessionFieldEdit initial={kit.profession ?? ""} save={to("profession")} />
        </div>
      );
    case "edge":
      return <TextEdit label="Why they choose you" initial={pos.edge} max={EDGE_MAX} rows={3} placeholder="A one-page plan every quarter, and a call after every big life change" save={to("edge")} />;
    case "who":
      return <TextEdit label="Who you serve" initial={pos.audienceDetail} max={WHO_MAX} placeholder="Working parents in their 30s" save={to("who")} />;
    case "topics":
      return <TextEdit label="Topics" initial={pos.topics.join(", ")} max={600} rows={2} hint="Separate them with commas or new lines. Up to 12." save={to("topics")} />;
    case "price": {
      const main = mainProduct(loadProducts(uid).items);
      return main ? <TextEdit label={`Price of ${main.name}`} initial={main.price ?? ""} max={LIMITS.price} placeholder="$120 a month" save={to("price")} /> : null;
    }
    case "proof":
      return <TextEdit label="Real words and numbers" initial={loadScriptContext(uid).product.proof} max={FIELD_MAX} rows={3}
        placeholder="48 cafes, books closed by the 5th every month" hint="The AI may quote these. It never makes up a review, a figure or a date." save={to("proof")} />;
    case "avoid":
      return <TextEdit label="Words you never use" initial={kit.avoidWords ?? ""} max={MAX_AVOID_CHARS} rows={2} placeholder="cheapest, best plan, hustle"
        hint="Separate them with commas or new lines." save={to("avoid")} />;
    case "signoff":
      return <TextEdit label="Sign-off" initial={kit.signOff ?? ""} max={MAX_SIGNOFF_CHARS} rows={3} placeholder="DM me PLAN for a free review."
        hint="Added to the end of a post when you copy it." save={to("signoff")} />;
    case "logo":
      return <LogoEdit uid={uid} save={save} />;
    case "colours":
      return <ColourEdit uid={uid} save={save} />;
  }
}

function ProfessionFieldEdit({ initial, save }: { initial: string; save: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return <ProfessionField value={v} onChange={(next) => { setV(next); save(next); }} />;
}

function LogoEdit({ uid, save }: { uid: string; save: (error: string | null) => void }) {
  const { toast } = useToast();
  const [logo, setLogo] = useState(kitOf(uid).logo);
  const [busy, setBusy] = useState(false);
  const set = (next: string | undefined) => {
    setLogo(next);
    save(saveProfileField(uid, "logo", next ?? ""));
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return save("Pick an image file.");
    setBusy(true);
    try {
      const data = await shrinkImage(file, "logo");
      if (data.length > MAX_IMAGE_CHARS) return save("That logo is too detailed to store. Try a simpler or smaller PNG.");
      set(data);
    } catch (e) {
      save((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = () => {
    const was = logo;
    set(undefined);
    toast({ title: "Logo removed.", action: <ToastAction altText="Undo" onClick={() => set(was)}>Undo</ToastAction> });
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {logo && (
        <LogoTile src={logo} alt="Your logo" className="h-16 w-28 rounded-lg border border-border/70 p-2" />
      )}
      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring [@media(pointer:coarse)]:h-11">
        <ImageSquareIcon className="h-4 w-4" aria-hidden /> {busy ? "Reading..." : logo ? "Change logo" : "Add a logo"}
        <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload(f); }} />
      </label>
      {logo && (
        <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground [@media(pointer:coarse)]:h-11" onClick={remove}>
          <TrashIcon className="h-3.5 w-3.5" aria-hidden /> Remove
        </Button>
      )}
      <p className="w-full text-xs text-muted-foreground">A PNG with a see-through background works best.</p>
    </div>
  );
}

function ColourEdit({ uid, save }: { uid: string; save: (error: string | null) => void }) {
  const [color, setColor] = useState(kitOf(uid).color);
  const pick = (hex: string) => {
    setColor(hex);
    save(saveProfileField(uid, "color", hex));
  };
  const preset = BRAND_PRESETS.some((p) => p.color === color);
  return (
    <div role="group" aria-label="Main colour" className="flex flex-wrap items-center gap-2">
      {BRAND_PRESETS.map((p) => (
        <button key={p.color} type="button" aria-pressed={color === p.color} aria-label={p.name} title={p.name} onClick={() => pick(p.color)}
          style={{ backgroundColor: p.color }}
          className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${color === p.color ? "ring-2 ring-foreground" : ""}`} />
      ))}
      <label className={`flex h-9 items-center gap-1.5 rounded-full border px-1.5 text-xs text-muted-foreground [@media(pointer:coarse)]:min-h-11 ${preset ? "border-border" : "border-foreground"}`}>
        <input type="color" value={color.toLowerCase()} aria-label="Custom colour" onChange={(e) => pick(normalizeHex(e.target.value) ?? color)}
          className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
        <span className="pr-1">Custom</span>
      </label>
    </div>
  );
}
