// Brand kit (/brand): the one place for the name, handle, headshot, logo,
// colour and sign-off that carousels, videos and copied posts reuse. It edits
// the per-profile brand the carousel maker already saves (carousel.ts), so
// nothing set up there is lost.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, ImagePlus, Plus, Trash2, X } from "lucide-react";
import SectionTabs, { PLAYBOOK_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { DM_PROBLEM, dmFields, dmLinks, fbPageName, igUsername, waDigits, type DmFields } from "@/lib/bioPage";
import {
  BRAND_PRESETS,
  DEFAULT_BRAND,
  MAX_DM_CHARS,
  MAX_HANDLE_CHARS,
  MAX_IMAGE_CHARS,
  MAX_NAME_CHARS,
  MAX_OFFERS,
  MAX_OFFER_NAME,
  MAX_OFFER_URL,
  MAX_ROLE_CHARS,
  MAX_SIGNOFF_CHARS,
  MAX_WA_TEXT,
  loadBrand,
  normalizeHandle,
  normalizeHex,
  saveBrand,
  type CarouselBrand,
} from "@/lib/carousel";
import { offerUrl } from "@/lib/brandRules";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";

/** Reads an image file into a small data URL: a centred square for the photo, a fitted box for the logo. */
async function shrinkImage(file: File, kind: "photo" | "logo"): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image this browser can read."));
      i.src = url;
    });
    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    if (!g) throw new Error("This browser can't resize images.");
    if (kind === "photo") {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      c.width = c.height = 256;
      g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      return c.toDataURL("image/jpeg", 0.85);
    }
    const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    g.drawImage(img, 0, 0, c.width, c.height);
    // WebP keeps the transparency at a fraction of PNG's size; browsers without it hand back PNG
    const webp = c.toDataURL("image/webp", 0.9);
    return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CHECK = { instagram: igUsername, facebook: fbPageName, whatsapp: waDigits } as const;

/** One DM field: what was typed, why it can't be used (hidden while typing) and its link to copy. */
function DmField({
  field,
  label,
  placeholder,
  value,
  link,
  onChange,
  onCopy,
  children,
}: {
  field: keyof typeof CHECK;
  label: string;
  placeholder: string;
  value: string;
  link?: string;
  onChange: (v: string) => void;
  onCopy: (url: string) => void;
  children?: ReactNode;
}) {
  const clean = CHECK[field](value);
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`dm-${field}`}>{label}</Label>
      <Input
        id={`dm-${field}`}
        value={value}
        maxLength={MAX_DM_CHARS}
        placeholder={placeholder}
        inputMode={field === "whatsapp" ? "tel" : undefined}
        autoCapitalize="none"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => clean && clean !== value && onChange(clean)}
        className="peer"
      />
      {value.trim() && !clean && <p className="text-[11px] font-medium text-warning peer-focus:hidden">{DM_PROBLEM[field]}</p>}
      {children}
      {link && (
        <div className="flex min-w-0 items-center gap-1 rounded-md bg-muted/60 pl-2.5">
          <a href={link} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate py-1 font-mono text-[11px] text-primary hover:underline [@media(pointer:coarse)]:py-3.5">
            {link.replace(/^https:\/\//, "")}
          </a>
          <Button type="button" size="sm" variant="ghost" onClick={() => onCopy(link)} aria-label={`Copy your ${label.split(" ")[0]} DM link`} className="h-9 shrink-0 gap-1.5 text-primary [@media(pointer:coarse)]:h-11">
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>
      )}
    </div>
  );
}

/** One policy as a row of chips; the first option (undefined) means no rule. */
function PolicyChips<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T | undefined; options: [T | undefined, string][]; onChange: (v: T | undefined) => void }) {
  return (
    <div className="space-y-1.5">
      <p id={id} className="text-sm font-medium">{label}</p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={text}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${value === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BrandPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [brand, setBrand] = useState<CarouselBrand>(DEFAULT_BRAND);
  const [hexInput, setHexInput] = useState(DEFAULT_BRAND.color);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(0);
  const measure = useMemo(() => createCanvasMeasure(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const id = user?.id ?? null;
      setUserId(id);
      const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
      const accounts = loadSocialAccounts(id);
      const initial = loadBrand(id) ?? {
        ...DEFAULT_BRAND,
        name: String(meta.full_name ?? meta.name ?? "").slice(0, MAX_NAME_CHARS),
        handle: normalizeHandle(accounts.instagram?.handle ?? accounts.tiktok?.handle ?? ""),
      };
      setBrand(initial);
      setHexInput(initial.color);
      setReady(true);
    });
  }, []);

  const update = (patch: Partial<CarouselBrand>) => {
    setBrand((prev) => {
      const next = { ...prev, ...patch };
      if (userId) saveBrand(userId, next);
      return next;
    });
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  };

  const pickColor = (color: string) => {
    update({ color });
    setHexInput(color);
  };

  const upload = async (file: File | undefined, kind: "photo" | "logo") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ title: "Pick an image file", variant: "destructive" });
    try {
      const data = await shrinkImage(file, kind);
      if (data.length > MAX_IMAGE_CHARS) {
        return toast({ title: "That logo is too detailed to store", description: "Try a simpler or smaller PNG.", variant: "destructive" });
      }
      update({ [kind]: data });
    } catch (e) {
      toast({ title: "Couldn't use that image", description: (e as Error).message, variant: "destructive" });
    }
  };

  const preview = useMemo(() => {
    const layout = layoutSlide(
      { title: "Three CPF moves for your 30s", body: "Top up your SA early and let compounding do the work.", index: 1, total: 6, brand },
      measure,
    );
    return svgDataUrl(renderSvg(layout));
  }, [brand, measure]);

  const presetActive = BRAND_PRESETS.some((p) => p.color === brand.color);
  const dm = useMemo(() => dmFields(brand, loadSocialAccounts(userId)), [brand, userId]);
  const links = useMemo(() => dmLinks(dm), [dm]);
  const linkOf = (id: string) => links.find((l) => l.id === id)?.url;
  const setDm = (field: keyof DmFields) => (v: string) => update({ [field]: v });
  const offers = brand.offers ?? [];
  const setOffer = (i: number, patch: Partial<{ name: string; url: string }>) => update({ offers: offers.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const copyLink = (url: string) =>
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied" }),
      () => toast({ title: "Copy failed", description: url, variant: "destructive" }),
    );

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PLAYBOOK_TABS} />
      <header className="flex items-center gap-3">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Brand kit</h1>
        <span aria-live="polite" className={`flex items-center gap-1 text-xs font-medium text-success transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          <Check className="h-3.5 w-3.5" /> Saved
        </span>
      </header>

      {/* the form waits for the account, so nothing typed before it loads is dropped */}
      {ready && (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-4 rounded-xl border border-border/60 p-4 shadow-card">
            <h2 className="font-serif text-lg font-semibold">You</h2>
            <div className="flex items-center gap-4">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted">
                {brand.photo ? <img src={brand.photo} alt="Your photo" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden />}
              </span>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-semibold hover:border-primary/40">
                  {brand.photo ? "Change photo" : "Add your photo"}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload(f, "photo"); }} />
                </label>
                {brand.photo && (
                  <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => update({ photo: undefined })}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="brand-name">Name</Label>
                <Input id="brand-name" value={brand.name} maxLength={MAX_NAME_CHARS} placeholder="Your name" onChange={(e) => update({ name: e.target.value })} />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="brand-handle">Handle</Label>
                <Input
                  id="brand-handle"
                  value={brand.handle}
                  maxLength={MAX_HANDLE_CHARS}
                  placeholder="@yourhandle"
                  onChange={(e) => update({ handle: e.target.value })}
                  onBlur={() => {
                    const clean = normalizeHandle(brand.handle);
                    if (clean !== brand.handle) update({ handle: clean });
                  }}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="brand-role">Role</Label>
                <Input id="brand-role" value={brand.role ?? ""} maxLength={MAX_ROLE_CHARS} placeholder="Financial adviser" onChange={(e) => update({ role: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="dm-links">
            <div className="flex items-center gap-1">
              <h2 className="font-serif text-lg font-semibold">DM links</h2>
              <InfoTip label="About DM links">A tap opens a chat with you. Put one in a post or your bio.</InfoTip>
            </div>
            <DmField field="instagram" label="Instagram username" placeholder="yourhandle" value={dm.instagram} link={linkOf("instagram")} onChange={setDm("instagram")} onCopy={copyLink} />
            <DmField field="facebook" label="Facebook page username" placeholder="your.page" value={dm.facebook} link={linkOf("facebook")} onChange={setDm("facebook")} onCopy={copyLink} />
            <DmField field="whatsapp" label="WhatsApp number" placeholder="+65 9123 4567" value={dm.whatsapp} link={linkOf("whatsapp")} onChange={setDm("whatsapp")} onCopy={copyLink}>
              <Label htmlFor="dm-whatsapp-text" className="block pt-1 text-xs font-medium">
                Message they start with (optional)
              </Label>
              <Input id="dm-whatsapp-text" value={dm.whatsappText} maxLength={MAX_WA_TEXT} placeholder="Hi, I saw your post and have a question" onChange={(e) => update({ whatsappText: e.target.value })} />
            </DmField>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="offers">
            <div className="flex items-center gap-1">
              <h2 className="font-serif text-lg font-semibold">Offers</h2>
              <InfoTip label="About offers">Posts link only to these. Any other link gets flagged.</InfoTip>
            </div>
            {offers.length > 0 && (
              <ul className="space-y-3">
                {offers.map((o, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <Input value={o.name} maxLength={MAX_OFFER_NAME} aria-label={`Offer ${i + 1}: what it is`} placeholder="Free retirement review" onChange={(e) => setOffer(i, { name: e.target.value })} />
                      <div className="min-w-0 space-y-1">
                        <Input
                          value={o.url}
                          maxLength={MAX_OFFER_URL}
                          aria-label={`Offer ${i + 1}: link`}
                          placeholder="https://yoursite.sg/review"
                          inputMode="url"
                          autoCapitalize="none"
                          autoCorrect="off"
                          onChange={(e) => setOffer(i, { url: e.target.value })}
                          onBlur={() => {
                            const clean = offerUrl(o.url);
                            if (clean && clean !== o.url) setOffer(i, { url: clean });
                          }}
                          className="peer"
                        />
                        {o.url.trim() && !offerUrl(o.url) && <p className="text-[11px] font-medium text-warning peer-focus:hidden">Use a web link, like https://yoursite.sg/review</p>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label={`Remove offer ${i + 1}`} onClick={() => update({ offers: offers.filter((_, j) => j !== i) })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {offers.length < MAX_OFFERS && (
              <Button variant="outline" size="sm" className="h-9 gap-1.5 [@media(pointer:coarse)]:h-11" onClick={() => update({ offers: [...offers, { name: "", url: "" }] })}>
                <Plus className="h-3.5 w-3.5" /> Add an offer
              </Button>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="policies">
            <div className="flex items-center gap-1">
              <h2 className="font-serif text-lg font-semibold">Emoji and hashtags</h2>
              <InfoTip label="About emoji and hashtags">Posts, carousels and video captions written for you keep to these.</InfoTip>
            </div>
            <PolicyChips id="brand-emoji" label="Emoji" value={brand.emojiPolicy} options={[[undefined, "Any"], ["one", "One at most"], ["none", "None"]]} onChange={(v) => update({ emojiPolicy: v })} />
            <PolicyChips id="brand-hashtags" label="Hashtags" value={brand.hashtagPolicy} options={[[undefined, "Any"], ["ten", "Up to 10"], ["few", "2 to 4"], ["none", "None"]]} onChange={(v) => update({ hashtagPolicy: v })} />
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card">
            <h2 id="brand-colour-label" className="font-serif text-lg font-semibold">Colour</h2>
            <div role="group" aria-labelledby="brand-colour-label" className="flex flex-wrap items-center gap-2">
              {BRAND_PRESETS.map((p) => {
                const active = brand.color === p.color;
                return (
                  <button
                    key={p.color}
                    type="button"
                    onClick={() => pickColor(p.color)}
                    aria-pressed={active}
                    aria-label={p.name}
                    title={p.name}
                    style={{ backgroundColor: p.color }}
                    className={`h-9 w-9 rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "ring-2 ring-foreground" : "hover:scale-105"}`}
                  />
                );
              })}
              <label className={`flex h-9 items-center gap-1.5 rounded-full border px-1.5 text-xs text-muted-foreground [@media(pointer:coarse)]:min-h-11 ${presetActive ? "border-border" : "border-foreground"}`}>
                <input
                  type="color"
                  value={brand.color.toLowerCase()}
                  onChange={(e) => pickColor(normalizeHex(e.target.value) ?? brand.color)}
                  aria-label="Custom colour"
                  className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                />
                <span className="pr-1">Custom</span>
              </label>
              <Input
                value={hexInput}
                maxLength={7}
                aria-label="Colour hex code"
                onChange={(e) => {
                  setHexInput(e.target.value);
                  const hex = normalizeHex(e.target.value);
                  if (hex && e.target.value.replace("#", "").length === 6) update({ color: hex });
                }}
                onBlur={() => {
                  const hex = normalizeHex(hexInput);
                  if (hex) pickColor(hex);
                  else setHexInput(brand.color);
                }}
                className="h-9 w-24 font-mono text-xs [@media(pointer:coarse)]:h-11"
              />
            </div>
          </section>

          <section className="space-y-2 rounded-xl border border-border/60 p-4 shadow-card">
            <Label htmlFor="brand-signoff" className="font-serif text-lg font-semibold">Sign-off</Label>
            <Textarea
              id="brand-signoff"
              rows={4}
              value={brand.signOff ?? ""}
              maxLength={MAX_SIGNOFF_CHARS}
              onChange={(e) => update({ signOff: e.target.value })}
              placeholder={"DM me PLAN for a free review.\nFor information only, not financial advice.\n#financialplanning #singapore"}
            />
            <p className="text-xs text-muted-foreground">Added to the end of a post when you copy it. Hashtags already in the post aren't repeated.</p>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 pt-1 text-sm [@media(pointer:coarse)]:min-h-11">
              <input type="checkbox" checked={!!brand.tagLinks} onChange={(e) => update({ tagLinks: e.target.checked })} className="h-4 w-4 accent-primary" />
              Tag my links for tracking
              <InfoTip label="About link tracking">Adds utm_source, utm_medium and utm_campaign to links you post.</InfoTip>
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card">
            <div className="flex items-center gap-1">
              <h2 id="brand-slots-label" className="font-serif text-lg font-semibold">Posting times</h2>
              <InfoTip label="About posting times">A saved post suggests your next open time.</InfoTip>
            </div>
            <ul className="space-y-2" aria-labelledby="brand-slots-label">
              {(brand.slots ?? []).map((slot, i) => (
                <li key={i} className="flex items-center gap-2">
                  <select
                    value={slot[0]}
                    aria-label="Day"
                    onChange={(e) => update({ slots: (brand.slots ?? []).map((x, j) => (j === i ? `${e.target.value}${x.slice(1)}` : x)) })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, n) => (
                      <option key={d} value={n}>{d}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={slot.slice(2)}
                    aria-label="Time"
                    onChange={(e) => e.target.value && update({ slots: (brand.slots ?? []).map((x, j) => (j === i ? `${x[0]}T${e.target.value.slice(0, 5)}` : x)) })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Remove this time"
                    onClick={() => update({ slots: (brand.slots ?? []).filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {(brand.slots?.length ?? 0) < 14 && (
              <Button variant="outline" size="sm" className="h-9 gap-1.5 [@media(pointer:coarse)]:h-11"
                onClick={() => update({ slots: [...(brand.slots ?? []), (brand.slots ?? []).length ? `${(Number(brand.slots![brand.slots!.length - 1][0]) + 2) % 7}T${brand.slots![brand.slots!.length - 1].slice(2)}` : "1T08:30"] })}>
                <Plus className="h-3.5 w-3.5" /> Add a time
              </Button>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card">
            <h2 className="font-serif text-lg font-semibold">Logo</h2>
            <div className="flex flex-wrap items-center gap-4">
              {brand.logo && (
                <span className="flex h-20 w-32 items-center justify-center rounded-lg border border-border/70 bg-neutral-800 p-2">
                  <img src={brand.logo} alt="Your logo" className="max-h-full max-w-full object-contain" />
                </span>
              )}
              <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-semibold hover:border-primary/40">
                {brand.logo ? "Change logo" : "Add a logo"}
                <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload(f, "logo"); }} />
              </label>
              {brand.logo && (
                <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => update({ logo: undefined })}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">A PNG with a see-through background works best.</p>
          </section>
        </div>

        <aside className="space-y-2 lg:sticky lg:top-4">
          <p className="text-sm font-semibold">On your carousels</p>
          <img src={preview} alt="A carousel slide with your brand" className="w-full max-w-[320px] rounded-xl border border-border/60 shadow-card" />
        </aside>
      </div>
      )}
    </div>
  );
}
