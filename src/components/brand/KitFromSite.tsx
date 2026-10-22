// The MoneyBees kit on /brand (ig-kit, tiny-word-hive docs/north-star/items/ig-kit.md). Shown above Colour on a
// profile linked to a board brand whose site publishes a kit (brandKitFeed.ts KIT_FEEDS), Leo only (BrandPage
// mounts it). Its swatches and logo are what carousels, videos and posts use; Refresh reads the site again.
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KitRefresh } from "@/lib/brandKitFeed";

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const host = (feed: string) => new URL(feed).hostname;

/** The reason shown beside Colour and Logo while the kit sets them. */
export const kitLockLine = (feed: string) => `Set by the MoneyBees kit on ${host(feed)}. Change it there.`;

export default function KitFromSite({ feed, state, onRefresh }: { feed: string; state: KitRefresh | null; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const cache = state?.cache;
  const site = host(feed);
  const refresh = async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="site-kit" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="site-kit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">From {site}</h2>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 [@media(pointer:coarse)]:h-11" onClick={refresh} disabled={busy || !state}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </Button>
      </div>
      {cache && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5" role="list" aria-label="Kit colours">
            {[cache.kit.roles.primary, ...cache.kit.roles.accents].map((name) => (
              <span key={name} role="listitem" title={`${name} ${cache.kit.colors[name]}`} aria-label={`${name} ${cache.kit.colors[name]}`}
                className="h-9 w-9 rounded-full border border-border/70" style={{ backgroundColor: cache.kit.colors[name] }} />
            ))}
          </div>
          {cache.logo && (
            <span className="flex h-14 w-28 items-center justify-center rounded-lg border border-border/70 bg-neutral-800 p-2">
              <img src={cache.logo} alt="" className="max-h-full max-w-full object-contain" />
            </span>
          )}
        </div>
      )}
      {cache && <p className="text-xs text-muted-foreground">Kit {cache.kit.version}, updated {day(cache.kit.built)}</p>}
      {state && !state.ok && (
        <p role="status" className="text-xs text-destructive">
          Couldn't reach {site}.{cache ? ` Showing the kit from ${day(cache.kit.built)}.` : ""}
        </p>
      )}
    </section>
  );
}
