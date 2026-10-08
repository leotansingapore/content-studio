// Brand kit (/brand): the one place for the name, handle, headshot, logo,
// colour and sign-off that carousels, videos and copied posts reuse. It edits
// the per-profile brand the carousel maker already saves (carousel.ts), so
// nothing set up there is lost.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import SectionTabs, { PLAYBOOK_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import {
  BRAND_PRESETS,
  DEFAULT_BRAND,
  MAX_HANDLE_CHARS,
  MAX_IMAGE_CHARS,
  MAX_NAME_CHARS,
  MAX_ROLE_CHARS,
  MAX_SIGNOFF_CHARS,
  loadBrand,
  normalizeHandle,
  normalizeHex,
  saveBrand,
  type CarouselBrand,
} from "@/lib/carousel";
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
    document.title = "Brand kit - Content Studio";
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
                    className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "ring-2 ring-foreground" : "hover:scale-105"}`}
                  />
                );
              })}
              <label className={`flex h-9 items-center gap-1.5 rounded-full border px-1.5 text-xs text-muted-foreground ${presetActive ? "border-border" : "border-foreground"}`}>
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
                className="h-9 w-24 font-mono text-xs"
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
