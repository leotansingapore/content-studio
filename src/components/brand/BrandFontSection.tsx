// Fonts (brand-kit). After Colours on /brand, #font, Leo only (BrandPage mounts it). Up to five font files per brand,
// as Volume allows (Leo, 1 Nov 2026), read and checked in the browser (brandFont.ts), each shown in a sample line in
// itself. The slideshow editor offers them under Your fonts; the video end card uses the first.

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FONT_TYPE_ERROR, MAX_BRAND_FONTS, addBrandFont, fontLoads, loadBrandFonts, readFont, registerBrandFonts, removeBrandFont, type UploadedFont } from "@/lib/brandFont";

export default function BrandFontSection({ userId }: { userId: string }) {
  const [fonts, setFonts] = useState<UploadedFont[]>(() => loadBrandFonts(userId));
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // the saved fonts drawn in their sample lines once the browser has them
  useEffect(() => {
    let live = true;
    const saved = loadBrandFonts(userId);
    setFonts(saved);
    void registerBrandFonts(saved).then((ok) => live && setReady(ok));
    return () => {
      live = false;
    };
  }, [userId]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const read = await readFont(file);
      if ("error" in read) return setError(read.error);
      // first bytes can pass and the file still not load: nothing is saved then
      if (!(await fontLoads(read.font))) return setError(FONT_TYPE_ERROR);
      const saved = addBrandFont(userId, read.font);
      if ("error" in saved) return setError(saved.error);
      const next = loadBrandFonts(userId);
      setFonts(next);
      setReady(await registerBrandFonts(next));
    } finally {
      setBusy(false);
    }
  };

  const remove = (f: UploadedFont) => {
    if (!window.confirm(`Remove ${f.name}? Slides that use it show a plain font instead.`)) return;
    const saved = removeBrandFont(userId, f.family);
    if ("error" in saved) return setError(saved.error);
    const next = loadBrandFonts(userId);
    setFonts(next);
    void registerBrandFonts(next).then(setReady);
    setError("");
  };

  return (
    <section id="font" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="font">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Fonts</h2>
        <span className="text-xs text-muted-foreground">
          {fonts.length} of {MAX_BRAND_FONTS}
        </span>
      </div>
      {fonts.length > 0 && (
        <ul className="divide-y divide-border/60">
          {fonts.map((f) => (
            <li key={f.family} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.name}</p>
                <p className="break-words text-xl leading-snug" style={{ fontFamily: ready.has(f.family) ? `${f.family}, system-ui, sans-serif` : undefined }}>
                  Three CPF moves for your 30s
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={`Remove ${f.name}`} className="h-9 shrink-0 gap-1.5 text-muted-foreground [@media(pointer:coarse)]:h-11" onClick={() => remove(f)}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {fonts.length < MAX_BRAND_FONTS && (
        <label className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-semibold hover:border-primary/40 [@media(pointer:coarse)]:h-11 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "Reading the font..." : fonts.length ? "Upload another font" : "Upload a font"}
          <input type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
        </label>
      )}
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        {fonts.length < MAX_BRAND_FONTS ? "WOFF2, WOFF, TTF or OTF, up to 300 KB each. Only upload a font you have the right to use." : `${MAX_BRAND_FONTS} of ${MAX_BRAND_FONTS} fonts. Remove one to add another.`}
      </p>
    </section>
  );
}
