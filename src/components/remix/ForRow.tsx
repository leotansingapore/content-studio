import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { links } from "@/lib/links";
import { forSummary } from "@/lib/remixBrand";

/**
 * Who the remix is for (docs/north-star/items/remix-your-brand.md): one summary line that opens into the few
 * switches that change it. Each switch saves at once. Face and Video voice come with the video formats.
 */
export default function ForRow(p: {
  brand: string;
  mention: boolean;
  offer: string | null;
  offers: string[];
  /** Posts in a usable voice profile, or 0 with none saved. */
  voicePosts: number;
  color?: string;
  logo?: string;
  open: boolean;
  setOpen(open: boolean): void;
  onMention(on: boolean): void;
  onOffer(name: string | null): void;
  disabled: boolean;
}) {
  const summary = forSummary({ brand: p.brand, hasVoice: p.voicePosts > 0, mention: p.mention, offer: p.offer, video: false });
  if (!p.open) {
    return (
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">For</span>
        <span className="min-w-0 flex-1 text-sm leading-snug text-foreground">{summary}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => p.setOpen(true)} className="h-8 shrink-0 text-xs font-semibold text-primary [@media(pointer:coarse)]:min-h-11">
          Change
        </Button>
      </div>
    );
  }
  const row = "grid gap-1.5 sm:grid-cols-[7.5rem_1fr] sm:items-start";
  const label = "pt-1.5 text-xs font-semibold text-muted-foreground";
  return (
    <div className="space-y-3 rounded-xl border border-border/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">For {p.brand}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => p.setOpen(false)} className="h-8 text-xs font-semibold text-primary [@media(pointer:coarse)]:min-h-11">
          Done
        </Button>
      </div>
      <div className={row}>
        <span className={label}>Mention {p.brand}</span>
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={p.mention} onClick={() => p.onMention(true)} disabled={p.disabled}>
              Yes
            </FilterChip>
            <FilterChip active={!p.mention} onClick={() => p.onMention(false)} disabled={p.disabled}>
              No
            </FilterChip>
          </div>
          <p className="text-xs text-muted-foreground">Yes works {p.brand} into the post. No keeps it as pure value content.</p>
        </div>
      </div>
      <div className={row}>
        <span className={label}>Offer</span>
        {p.offers.length ? (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={!p.offer} onClick={() => p.onOffer(null)} disabled={p.disabled || !p.mention}>
              None
            </FilterChip>
            {p.offers.map((o) => (
              <FilterChip key={o} active={p.offer === o} onClick={() => p.onOffer(o)} disabled={p.disabled || !p.mention}>
                {o}
              </FilterChip>
            ))}
          </div>
        ) : (
          <p className="pt-1.5 text-xs text-muted-foreground">
            No offers yet.{" "}
            <Link to={links.brand({ section: "offers" })} className="inline-flex items-center font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
              Add an offer
            </Link>
          </p>
        )}
      </div>
      <div className={row}>
        <span className={label}>Voice</span>
        {p.voicePosts > 0 ? (
          <p className="pt-1.5 text-xs text-foreground">Your voice ({p.voicePosts} posts)</p>
        ) : (
          <p className="pt-1.5 text-xs text-muted-foreground">
            No voice saved yet.{" "}
            <Link to={links.voice()} className="inline-flex items-center font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
              Add 3 posts
            </Link>
          </p>
        )}
      </div>
      <div className={row}>
        <span className={label}>Look</span>
        <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          {p.color && <span aria-hidden className="h-5 w-5 rounded-full border border-border/70" style={{ background: p.color }} />}
          {p.logo && <img src={p.logo} alt="" className="h-5 w-auto max-w-12 object-contain" />}
          <Link to={links.brand({ section: "colour" })} className="inline-flex items-center hover:underline [@media(pointer:coarse)]:min-h-11">
            From Brand kit
          </Link>
        </p>
      </div>
    </div>
  );
}
