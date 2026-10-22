// Font (brand-kit). After Colours on /brand, #font, Leo only (BrandPage mounts it). One font file per brand, read and
// checked in the browser (brandFont.ts), shown in a sample line, and used by the video end card. Carousels keep
// system fonts (the spike in docs/north-star/items/brand-kit.md, Open questions).

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND_FONT_FAMILY, FONT_TYPE_ERROR, loadBrandFont, readFont, registerBrandFont, saveBrandFont, type BrandFont } from "@/lib/brandFont";

export default function BrandFontSection({ userId }: { userId: string }) {
  const [font, setFont] = useState<BrandFont | null>(() => loadBrandFont(userId));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // the saved font drawn in its sample line once the browser has it
  useEffect(() => {
    let live = true;
    const saved = loadBrandFont(userId);
    setFont(saved);
    void registerBrandFont(saved).then((ok) => live && setReady(ok));
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
      if (!(await registerBrandFont(read.font))) {
        await registerBrandFont(font);
        return setError(FONT_TYPE_ERROR);
      }
      const saved = saveBrandFont(userId, read.font);
      if ("error" in saved) {
        await registerBrandFont(font);
        return setError(saved.error);
      }
      setFont(read.font);
      setReady(true);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    const saved = saveBrandFont(userId, null);
    if ("error" in saved) return setError(saved.error);
    void registerBrandFont(null);
    setFont(null);
    setReady(false);
    setError("");
  };

  return (
    <section id="font" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="font">
      <h2 className="font-serif text-lg font-semibold">Font</h2>
      {font && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 text-sm">
            Your font: <span className="font-semibold">{font.name}</span>
          </p>
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground [@media(pointer:coarse)]:h-11" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
          <p className="w-full break-words text-2xl leading-snug" style={{ fontFamily: ready ? `${BRAND_FONT_FAMILY}, system-ui, sans-serif` : undefined }}>
            Three CPF moves for your 30s
          </p>
        </div>
      )}
      <label className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-semibold hover:border-primary/40 [@media(pointer:coarse)]:h-11 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? "Reading the font..." : "Upload a font"}
        <input type="file" accept=".woff2,.ttf,.otf,font/woff2,font/ttf,font/otf" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
      </label>
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">WOFF2, TTF or OTF, up to 300 KB. Only upload a font you have the right to use.</p>
    </section>
  );
}
