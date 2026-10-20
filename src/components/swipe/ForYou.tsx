// For you (/swipe?tab=foryou, Leo only; docs/north-star/items/find-niche-feed.md): every post and ad the app holds,
// the ones Jev matches to this brand first, with Today's 5 on top. ?kind= and ?q= filter, ?hidden=only lists the
// hidden cards. Matching runs outside React (src/lib/nicheFeed.ts); this only draws the stores and the job.
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EyeOff, ExternalLink, Loader2, Search, Shuffle } from "lucide-react";
import OutlierBadge, { OutlierScoreTip } from "@/components/OutlierBadge";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { onAdLabelsChanged, onSpaceAdsChanged } from "@/lib/adLibrary";
import { onCompetitorAdsChanged } from "@/lib/competitorAds";
import { onCompetitorPosts } from "@/lib/competitorPosts";
import { brandFacts, onCompetitorsChanged } from "@/lib/competitors";
import { safeExternalUrl } from "@/lib/embed";
import { onFollowing } from "@/lib/following";
import { sgDay } from "@/lib/goals";
import { links } from "@/lib/links";
import {
  CHIPS, type FeedItem, type FeedKind, arrange, brandSig, hideItem, loadFeed, loadNiche, matchOff, matching, onMatch, onNicheChanged, runMatch, unhideItem,
  updatedAt,
} from "@/lib/nicheFeed";
import { activeProfile } from "@/lib/profiles";
import { dayMonth } from "@/lib/remixSource";
import { useUrlFlag, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PAGE = 24;
const KINDS: { id: FeedKind; label: string }[] = [{ id: "all", label: "All" }, { id: "organic", label: "Organic" }, { id: "ads", label: "Ads" }];

export default function ForYou({ userId }: { userId: string }) {
  // stores: read again when one changes; the match job only redraws
  const [version, bump] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    const again = () => bump((v) => v + 1);
    const offs = [onNicheChanged(again), onFollowing(again), onCompetitorPosts(again), onCompetitorAdsChanged(again), onSpaceAdsChanged(again), onAdLabelsChanged(again), onCompetitorsChanged(again)];
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => onMatch(() => tick((n) => n + 1)), []);
  useEffect(() => {
    void runMatch(userId);
  }, [userId]);

  const [kind, setKind] = useUrlState<FeedKind>("kind", "all", { allowed: ["all", "organic", "ads"] });
  const [text, setText, q] = useUrlSearch("q");
  const [hiddenOnly, setHiddenOnly] = useUrlFlag("hidden");
  const update = useUrlUpdate();
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [kind, q]);
  const { toast } = useToast();

  const feed = useMemo(() => loadFeed(userId), [userId, version]);
  const state = useMemo(() => loadNiche(userId), [userId, version]);
  const facts = useMemo(() => brandFacts(userId), [userId, version]);
  // the brand kit's name, since the first brand's profile is called "Me"
  const brand = facts.name || activeProfile(userId)?.name || "your brand";
  const hasFacts = Boolean(facts.sells || facts.serves);
  // scores judged for other brand facts don't count until the next run clears them
  const scores = hasFacts && state.brandSig === brandSig(facts) ? state.scores : {};
  const { matched, other } = arrange(feed, scores, { kind, q, hidden: state.hidden });
  const rows = [...matched, ...other];
  const shown = rows.slice(0, limit);
  const running = matching(userId);
  const off = matchOff(userId);
  const judged = Object.keys(scores).length > 0;
  const nothingMatched = hasFacts && judged && !running && !matched.length && !q;
  const byId = new Map(feed.map((i) => [i.id, i]));
  const hidden = state.hidden.flatMap((id) => byId.get(id) ?? []).reverse();
  const picks = state.picks.day === sgDay() ? state.picks.ids.flatMap((id) => (state.hidden.includes(id) ? [] : byId.get(id) ?? [])) : [];
  const updated = updatedAt(feed);

  const hide = (i: FeedItem) => {
    hideItem(userId, i.id);
    toast({
      title: `Hidden for ${brand}.`,
      duration: 6000,
      action: <ToastAction altText="Undo" onClick={() => unhideItem(userId, i.id)}>Undo</ToastAction>,
    });
  };
  const clearSearch = () => {
    setText("");
    update({ q: null });
  };

  if (hiddenOnly) {
    return (
      <section className="space-y-4" aria-labelledby="for-you-hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="for-you-hidden" className="font-serif text-lg font-semibold tracking-tight">Hidden for {brand}</h2>
          <Button variant="outline" size="sm" className={`ml-auto h-9 ${TOUCH}`} onClick={() => setHiddenOnly(false)}>Back to For you</Button>
        </div>
        {hidden.length ? (
          <Grid>{hidden.map((i) => <FeedCard key={i.id} item={i} action={<UnhideButton onClick={() => unhideItem(userId, i.id)} />} />)}</Grid>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is hidden.</p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="for-you">
      {picks.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-serif text-lg font-semibold tracking-tight">Today's {picks.length} for {brand}</h2>
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {picks.map((i) => <FeedCard key={i.id} item={i} className="w-64 shrink-0" />)}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <h2 id="for-you" className="font-serif text-lg font-semibold tracking-tight">For you</h2>
          <OutlierScoreTip />
        </div>
        {matched.length > 0 && <p className="text-sm text-muted-foreground">{matched.length} of these match what {brand} sells, shown first.</p>}
      </div>

      {!hasFacts ? (
        <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
          <Link to="/brand" className="font-medium text-primary hover:underline">Add what you sell in Brand kit to match posts to you.</Link>
        </p>
      ) : running > 0 ? (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Matching {running} new posts to {brand}...
        </p>
      ) : off ? (
        <p role="status" className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">Matching is off right now. Showing everything by outlier score.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Show">
          {KINDS.map((k) => <FilterChip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</FilterChip>)}
        </div>
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-sm sm:basis-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search posts and ads, like CPF top-ups"
            aria-label="Search posts and ads"
            className="pl-9 [@media(pointer:coarse)]:h-11"
          />
        </div>
      </div>

      {nothingMatched && (
        <div className="space-y-1 text-sm">
          <p>Nothing here matches {brand} yet.</p>
          <p className="flex flex-wrap gap-x-4">
            <Link to={links.competitors({ view: "list" })} className={`font-medium text-primary hover:underline ${TOUCH} inline-flex items-center`}>Add competitors</Link>
            <Link to="/following" className={`font-medium text-primary hover:underline ${TOUCH} inline-flex items-center`}>Follow accounts</Link>
          </p>
        </div>
      )}

      {q && !rows.length ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p>No posts or ads match "{q}".</p>
          <Button variant="outline" size="sm" className={`h-9 ${TOUCH}`} onClick={clearSearch}>Clear search</Button>
        </div>
      ) : (
        <>
          {shown.length > 0 && Math.min(matched.length, shown.length) > 0 && (
            <Grid>{shown.slice(0, matched.length).map((i) => <FeedCard key={i.id} item={i} action={<HideButton onClick={() => hide(i)} />} />)}</Grid>
          )}
          {shown.length > matched.length && (
            <>
              {(matched.length > 0 || nothingMatched) && (
                <h3 className="flex items-center gap-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Other top posts lately <span aria-hidden className="h-px flex-1 bg-border" />
                </h3>
              )}
              <Grid>{shown.slice(matched.length).map((i) => <FeedCard key={i.id} item={i} action={<HideButton onClick={() => hide(i)} />} />)}</Grid>
            </>
          )}
          {rows.length > shown.length && (
            <div className="flex justify-center">
              <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={() => setLimit(shown.length + PAGE)}>
                Show {Math.min(PAGE, rows.length - shown.length)} more of {rows.length - shown.length}
              </Button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        {updated && <span>Updated {dayMonth(new Date(updated).toISOString())}.</span>}
        {hidden.length > 0 && (
          <button type="button" onClick={() => setHiddenOnly(true)} className={`font-medium text-primary hover:underline ${TOUCH}`}>
            Show hidden ({hidden.length})
          </button>
        )}
      </div>
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function HideButton({ onClick }: { onClick(): void }) {
  return (
    <Button type="button" size="sm" variant="ghost" className={`h-9 gap-1.5 px-2 text-destructive hover:text-destructive ${TOUCH}`} onClick={onClick}>
      <EyeOff className="h-3.5 w-3.5" aria-hidden /> Hide
    </Button>
  );
}

function UnhideButton({ onClick }: { onClick(): void }) {
  return (
    <Button type="button" size="sm" variant="outline" className={`h-9 ${TOUCH}`} onClick={onClick}>
      Unhide
    </Button>
  );
}

function FeedCard({ item: i, action, className = "" }: { item: FeedItem; action?: ReactNode; className?: string }) {
  const open = i.url ? safeExternalUrl(i.url) : null;
  return (
    <article className={`flex min-w-0 flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-3 shadow-card ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{CHIPS[i.from]}</span>
        {i.outlier && <OutlierBadge outlier={i.outlier} />}
        {i.kind === "ad" && i.active && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" /> Running
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{i.meta}</p>
      <p className="truncate text-[11px] font-medium">
        {i.who} {i.account !== i.who && <span className="font-normal text-muted-foreground">{i.account}</span>}
      </p>
      <p className="line-clamp-2 text-xs">{i.text || "No caption"}</p>
      {i.numbers && <p className="text-[11px] tabular-nums text-muted-foreground">{i.numbers}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <RemixButton source={i.source} label={`${i.who}'s ${i.kind === "ad" ? "ad" : "post"}`}>
          <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
            <Link to={i.remixUrl}><Shuffle className="h-3.5 w-3.5" /> Remix this</Link>
          </Button>
        </RemixButton>
        {action}
        {open && (
          <Button asChild size="sm" variant="ghost" className={`ml-auto h-9 w-9 p-0 ${TOUCH} [@media(pointer:coarse)]:w-11`}>
            <a href={open} target="_blank" rel="noopener noreferrer" aria-label={`Open ${i.who}'s ${i.kind === "ad" ? "ad" : "post"}`} title="Open the original">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}
