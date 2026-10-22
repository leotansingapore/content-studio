// Put on every post (brand-kit). After Logo on /brand, #on-every-post, Leo only (BrandPage mounts it). The switches
// a new video and an AI picture start with (withKit in videoEdit.ts, aiImage.ts), and the carousel look the carousel
// maker saved to the kit.

import { Link } from "react-router-dom";
import { InfoTip } from "@/components/ui/info-tip";
import { links } from "@/lib/links";
import { SLIDE_FONTS } from "@/lib/carouselLayout";
import type { CarouselBrand } from "@/lib/carousel";

type Stamp = NonNullable<CarouselBrand["stamp"]>;

function Switch({ label, on, set, reason }: { label: string; on: boolean; set: (v: boolean) => void; reason?: string }) {
  return (
    <label className={`flex min-h-9 items-center gap-2 text-sm [@media(pointer:coarse)]:min-h-11 ${reason ? "text-muted-foreground" : "cursor-pointer"}`}>
      <input type="checkbox" checked={on} disabled={!!reason} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
      {reason && <span className="text-xs">{reason}</span>}
    </label>
  );
}

/** setBrand goes through BrandPage's own save, so two writers never race on the kit (decision 14). */
export default function OnEveryPost({ brand, setBrand }: { brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void }) {
  const stamp = brand.stamp ?? {};
  const set = (patch: Stamp) => setBrand({ stamp: { ...stamp, ...patch } });
  const noLogo = brand.logo ? undefined : "Add a logo first";
  const look = brand.slideFont || brand.slidePaper ? `${SLIDE_FONTS[brand.slideFont ?? "classic"].label}, ${brand.slidePaper ?? "light"} paper` : "";
  return (
    <section id="on-every-post" className="scroll-mt-20 space-y-2 rounded-xl border border-border/60 p-4 shadow-card" data-testid="on-every-post">
      <div className="flex items-center gap-1">
        <h2 className="font-serif text-lg font-semibold">Put on every post</h2>
        <InfoTip label="About what goes on every post">New videos and pictures start with these. Change any one per video.</InfoTip>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Switch label="Logo on every video" on={!!brand.logo && stamp.videoLogo !== false} set={(v) => set({ videoLogo: v })} reason={noLogo} />
        <Switch label="End card on every video" on={!!stamp.videoEnd} set={(v) => set({ videoEnd: v })} />
        <Switch label="Intro card on every video" on={!!stamp.videoIntro} set={(v) => set({ videoIntro: v })} />
        <Switch label="Logo on AI pictures" on={!!brand.logo && !!stamp.pictureLogo} set={(v) => set({ pictureLogo: v })} reason={noLogo} />
      </div>
      <p className="border-t border-border/60 pt-2 text-sm">
        Carousel look: {look || "not set"}{" "}
        <Link to={links.carousel()} className="text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
          {look ? "Change it in the carousel maker" : "Set it in the carousel maker"}
        </Link>
      </p>
    </section>
  );
}
