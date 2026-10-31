// /design: your slideshows, then the templates to start from (Volume's 16, folded in), then the ones you saved.
// ?format=instagram shows the templates at 4:5.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Copy, GalleryHorizontalEnd, Plus, Trash2 } from "lucide-react";
import SlideView, { setBrandPictures } from "@/components/design/SlideView";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { loadBrand } from "@/lib/carousel";
import {
  DESIGNS_CHANGED,
  FORMAT_LABEL,
  ensureDesignFonts,
  loadDesigns,
  loadOwnTemplates,
  loadTemplates,
  newDesign,
  removeDesign,
  removeOwnTemplate,
  saveDesign,
  type Design,
  type DesignFormat,
  type DesignTemplate,
} from "@/lib/design";
import { ago } from "@/lib/slideshow";
import { useSignedInUser } from "@/lib/useLeoOnly";

const CARD_W = 160;

function Cover({ d, onOpen, children }: { d: Pick<Design, "format" | "slides">; onOpen: () => void; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5" style={{ width: CARD_W }}>
      <button type="button" onClick={onOpen} className="overflow-hidden rounded-lg border border-border hover:border-primary focus-visible:border-primary">
        <SlideView slide={d.slides[0]} format={d.format} width={CARD_W - 2} thumb />
      </button>
      {children}
    </li>
  );
}

export default function DesignPage() {
  const user = useSignedInUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const format: DesignFormat = params.get("format") === "instagram" ? "instagram" : "tiktok";
  const [templates, setTemplates] = useState<DesignTemplate[] | null>(null);
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const userId = user?.id ?? null;
  const designs = useMemo(() => loadDesigns(userId), [userId, tick]);
  const own = useMemo(() => loadOwnTemplates(userId), [userId, tick]);

  useEffect(() => {
    ensureDesignFonts();
    const b = loadBrand(userId);
    setBrandPictures({ logo: b?.logo, photo: b?.photo });
    void loadTemplates().then(setTemplates);
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(DESIGNS_CHANGED, bump);
    return () => window.removeEventListener(DESIGNS_CHANGED, bump);
  }, [userId]);

  if (!userId) return null;
  const open = (d: Design) => {
    saveDesign(userId, d);
    navigate(`/design/${d.id}`);
  };
  const shown = (templates ?? []).filter((t) => t.docs[format]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Design</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => open(newDesign("tiktok"))} className="gap-1.5">
            <Plus className="h-4 w-4" /> New TikTok slideshow
          </Button>
          <Button variant="outline" onClick={() => open(newDesign("instagram", "Untitled carousel"))} className="gap-1.5">
            <Plus className="h-4 w-4" /> Instagram carousel
          </Button>
        </div>
      </header>

      {designs.length > 0 && (
        <section aria-labelledby="yours" className="space-y-3">
          <h2 id="yours" className="text-lg font-semibold">
            Your slideshows
          </h2>
          <ul className="flex flex-wrap gap-x-3 gap-y-5">
            {designs.map((d) => (
              <Cover key={d.id} d={d} onOpen={() => navigate(`/design/${d.id}`)}>
                <Link to={`/design/${d.id}`} className="truncate text-sm font-medium hover:underline">
                  {d.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {FORMAT_LABEL[d.format]}, {d.slides.length} slides, edited {ago(d.updatedAt)}
                </span>
                {confirm === d.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    Delete it?
                    <button type="button" className="font-medium text-destructive hover:underline" onClick={() => (removeDesign(userId, d.id), setConfirm(null))}>
                      Delete
                    </button>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="flex gap-3 text-xs text-muted-foreground">
                    <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => open(newDesign(d.format, `${d.title} copy`, d.slides))}>
                      <Copy className="h-3 w-3" /> Duplicate
                    </button>
                    <button type="button" className="flex items-center gap-1 hover:text-destructive" onClick={() => setConfirm(d.id)}>
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </span>
                )}
              </Cover>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="templates" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="templates" className="text-lg font-semibold">
            Start from a template
          </h2>
          <div className="flex gap-1.5">
            {(["tiktok", "instagram"] as const).map((f) => (
              <FilterChip key={f} active={format === f} onClick={() => setParams((p) => (f === "tiktok" ? p.delete("format") : p.set("format", f), p), { replace: true })}>
                {FORMAT_LABEL[f]}
              </FilterChip>
            ))}
          </div>
        </div>
        {!templates && <p className="text-sm text-muted-foreground">Loading the templates</p>}
        <ul className="flex flex-wrap gap-x-3 gap-y-5">
          {shown.map((t) => {
            const doc = { format, slides: t.docs[format]!.slides };
            return (
              <Cover key={t.id} d={doc} onOpen={() => open(newDesign(format, t.id === "blank" ? "Untitled slideshow" : t.name, doc.slides))}>
                <span className="text-sm font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.blurb} {doc.slides.length > 1 ? `${doc.slides.length} slides.` : ""}
                </span>
              </Cover>
            );
          })}
        </ul>
        <Link to="/carousels" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <GalleryHorizontalEnd className="h-4 w-4" /> Find a format that's working in your niche
        </Link>
      </section>

      {own.length > 0 && (
        <section aria-labelledby="own" className="space-y-3">
          <h2 id="own" className="text-lg font-semibold">
            Your templates
          </h2>
          <ul className="flex flex-wrap gap-x-3 gap-y-5">
            {own.map((t) => (
              <Cover key={t.id} d={t} onOpen={() => open(newDesign(t.format, t.title, t.slides))}>
                <span className="truncate text-sm font-medium">{t.title}</span>
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  {FORMAT_LABEL[t.format]}, {t.slides.length} slides
                  <button type="button" aria-label={`Remove the template ${t.title}`} className="hover:text-destructive" onClick={() => removeOwnTemplate(userId, t.id)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </Cover>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
