// Social north star (/social-north-star, Leo's sign-ins only; docs/north-star/items/social-north-star.md): the formats
// that win among the brand's Apps like yours references, as plays, how many of each the brand posted this month, and
// Make one like this on each. No setup: opening it starts the brand's first find, the reads and the build
// (src/lib/socialNorthStar.ts, outside React, so leaving the page keeps them going). #<play id> scrolls to a play,
// ?example=<platform>:<post id> marks one of its examples. Everyone else gets the not-found page.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Shuffle } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import PriceChip from "@/components/PriceChip";
import VideoEmbed from "@/components/VideoEmbed";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { auditedHandles } from "@/lib/accountAudit";
import { useUsesLeft } from "@/lib/aiUsage";
import { embedUrlFor, safeExternalUrl } from "@/lib/embed";
import { remixUrl, watchText } from "@/lib/following";
import { links } from "@/lib/links";
import { reasonText } from "@/lib/prices";
import { dayMonth, fromFollowPost } from "@/lib/remixSource";
import { isFinding, lastFind, loadMedia, loadSimilar, onSimilarChanged, type PostMedia, similarBusy } from "@/lib/similarAccounts";
import {
  exampleCover, isBuilding, isReadingOwn, isStarting, lastNote, loadSocialNs, nextUp, onSocialNs, onSocialNsChanged, ownCounts, type Play, type PlayExample, progressOf, readCount, runBuild,
  startSocialNs,
} from "@/lib/socialNorthStar";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { useGoneItem, useScrollToHash, useScrollToItem, useUrlItem } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";
import { times } from "../../supabase/functions/_shared/outlier.ts";
import { FAMILY_NAME, HOOK_NAME } from "../../supabase/functions/social-plays/logic.ts";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const FORMAT = { video: "Video", carousel: "Slides", image: "Photo" } as const;

export default function SocialNorthStarPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <SocialNorthStar userId={leo.id} />;
}

function Bar({ done, target, label }: { done: number; target: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(done, target)} className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${target ? Math.min(100, (done / target) * 100) : 0}%` }} />
    </div>
  );
}

function SocialNorthStar({ userId }: { userId: string }) {
  // the stores: read again when saved; the jobs only redraw
  const [version, bump] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => onSocialNsChanged(() => bump((v) => v + 1)), []);
  useEffect(() => onSimilarChanged(() => bump((v) => v + 1)), []);
  useEffect(() => onSocialNs(() => tick((n) => n + 1)), []);
  const media = useMemo(() => loadMedia(userId), [userId, version]);

  const finding = isFinding();
  const building = isBuilding();
  const why = reasonText({ left: useUsesLeft(finding)("similar-find"), leo: true });
  const left = useUsesLeft(building)("social-plays");
  // no setup: the brand's first find, the reads, its own accounts and the build all start here, once a visit
  const [canFind] = useState(!why);
  const [begun, setBegun] = useState(false);
  useEffect(() => {
    void startSocialNs(userId, canFind);
    setBegun(true);
  }, [userId, canFind]);

  const ns = useMemo(() => loadSocialNs(userId), [userId, version]);
  const sim = useMemo(() => loadSimilar(userId), [userId, version]);
  const counts = ownCounts(ns);
  const counted = auditedHandles(loadSocialAccounts(userId)).length > 0;
  const total = progressOf(ns.plays, counts);
  const next = counted ? nextUp(ns.plays, counts) : ns.plays[0] ?? null;
  const [linked] = useUrlItem("example");
  // the plays may still be syncing while none are stored, so that decides nothing
  useGoneItem("example", ns.plays.length ? ns.plays.some((p) => p.examples.some((e) => e.key === linked)) : undefined, "example");
  useScrollToHash(ns.plays.length > 0);

  const read = readCount(sim);
  const reading = !finding && similarBusy();
  const own = isReadingOwn();
  const note = lastNote();
  const found = lastFind();
  // until the first start has run, the store may be a device behind: say so rather than show an empty plan
  const starting = !begun || isStarting();
  const busy = starting || finding || reading || own || building;
  const status = starting && !ns.plays.length
    ? "Checking your references..."
    : finding
      ? "Finding apps like yours first, about two minutes. The plan builds once their posts are in."
      : reading
        ? `Reading their posts: ${read} of ${sim.accounts.length} accounts so far. The plan builds when they're in.`
        : building
          ? "Sorting their best posts into plays, about a minute..."
          : own
            ? "Reading your own posts..."
            : null;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Social north star</h1>
          <InfoTip label="About the social north star">The formats that win for accounts like yours, rebuilt weekly from Apps like yours.</InfoTip>
        </div>
        {ns.builtAt && (
          <p className="text-sm text-muted-foreground">
            Built from your <Link to={links.swipe({ tab: "similar" })} className="font-medium text-primary hover:underline [@media(pointer:coarse)]:py-3">Apps like yours references</Link> ({ns.basis} {ns.basis === 1 ? "account" : "accounts"})
          </p>
        )}
      </header>

      {status && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {status}
        </p>
      )}
      {!busy && found?.error && <p role="alert" className="text-sm text-destructive">{found.text}</p>}
      {!busy && note && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p role={note.error ? "alert" : undefined} className={cn("text-sm", note.error ? "text-destructive" : "text-muted-foreground")}>{note.text}</p>
          {note.error && (
            <span className="flex items-center gap-2">
              <Button variant="outline" className={cn("h-10", TOUCH)} onClick={() => void runBuild(userId)}>Try again</Button>
              <PriceChip feature="social-plays" left={left} />
            </span>
          )}
        </div>
      )}
      {!busy && !finding && why && !sim.accounts.length && <p className="text-sm text-muted-foreground">{why}</p>}

      {ns.plays.length > 0 && (
        <section aria-labelledby="ns-month" className="space-y-2 rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="ns-month" className="text-sm font-semibold">This month</h2>
            {counted && <span className="text-sm tabular-nums">{total.done} of {total.target} posts</span>}
          </div>
          {counted ? (
            <>
              <Bar done={total.done} target={total.target} label="This month's posts against the plays" />
              {next && <p className="text-xs text-muted-foreground">Next up: <a href={`#${next.id}`} className="font-medium text-primary hover:underline">{FAMILY_NAME[next.id]}</a></p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add your Instagram or TikTok under Your account audit in <Link to={links.analytics()} className="font-medium text-primary hover:underline">Analytics</Link> to count your posts against each play.
            </p>
          )}
        </section>
      )}

      {ns.plays.length > 0 ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {ns.plays.map((p) => <PlayCard key={p.id} play={p} media={media} done={counts[p.id] ?? 0} counted={counted} next={next?.id === p.id} linked={linked} />)}
        </div>
      ) : (
        !busy && (
          <p className="text-sm text-muted-foreground">
            {ns.builtAt ? "None of the formats is used by 2 or more of your references yet." : sim.accounts.length ? "The plan builds once 2 or more of your references have their posts read." : "The plan builds from Apps like yours."}{" "}
            <Link to={links.swipe({ tab: "similar" })} className="font-medium text-primary hover:underline">Add accounts you like</Link>
          </p>
        )
      )}

      {ns.builtAt && (
        <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
          Built {dayMonth(ns.builtAt)}. It rebuilds weekly, and as more references are read.
        </p>
      )}
    </div>
  );
}

function PlayCard({ play: p, media, done, counted, next, linked }: {
  play: Play; media: Record<string, Record<string, PostMedia>>; done: number; counted: boolean; next: boolean; linked: string | null;
}) {
  const best = p.examples[0];
  const name = FAMILY_NAME[p.id];
  const slides = p.slides !== null || best?.post.format === "carousel";
  const length = p.seconds ? `About ${p.seconds} seconds` : p.slides ? `About ${p.slides} slides` : null;
  const rows: [string, string | null][] = [
    ["Hook", p.recipe ? p.recipe.hook : p.hook ? HOOK_NAME[p.hook] : null],
    [slides ? "Slides" : "Scenes", p.recipe?.body ?? null],
    ["Length", length],
    ["Caption", p.recipe?.caption ?? null],
    ["Call to action", p.recipe?.cta ?? null],
    ["How often", `About ${p.target} a month at the accounts that use it`],
  ];
  // the recipe goes into Remix's note, so the new post starts from it
  const note = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  return (
    <article id={p.id} className={cn("flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-xl border bg-card p-4 shadow-card", next ? "border-primary/60" : "border-border/60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-serif text-lg font-semibold tracking-tight">
            {name}
            {next && <span className="rounded-full bg-primary px-2 py-0.5 font-sans text-[10px] font-semibold text-primary-foreground">Next up</span>}
          </h2>
          <p className="text-xs text-muted-foreground">{p.accounts} accounts use it, {times(p.median)} their usual</p>
        </div>
        <CopyLinkButton path={links.socialNorthStar({ play: p.id })} label={`Copy link to ${name}`} className="-my-2 -mr-2" />
      </div>

      {counted && (
        <div className="space-y-1">
          <p className="text-xs tabular-nums"><span className="font-semibold">{Math.min(done, p.target)} of {p.target}</span> <span className="text-muted-foreground">this month</span></p>
          <Bar done={done} target={p.target} label={`${name} this month`} />
        </div>
      )}

      <ul className="grid grid-cols-3 gap-2" aria-label={`Best ${name.toLowerCase()} posts`}>
        {p.examples.map((e) => <ExampleTile key={e.key} e={e} cover={exampleCover(e, media)} linked={linked === e.key} />)}
      </ul>

      <dl className="space-y-1.5">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[88px_1fr] gap-2 text-xs">
            <dt className="font-semibold text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words leading-relaxed">{v}</dd>
          </div>
        ))}
      </dl>
      {!p.recipe && <p className="text-xs text-muted-foreground">The rest of the recipe comes with the next build.</p>}

      {best && (
        <div className="mt-auto pt-1">
          {/* a play is a format: Remix keeps it and writes about the brand, whatever the example's own topic */}
          <RemixButton source={fromFollowPost(best, best.post)} label={`${name}, from @${best.handle}'s post`} note={note} keep="topic" text="Make one like this" variant={next ? "default" : "outline"} size="default">
            <Button asChild variant={next ? "default" : "outline"} className={cn("gap-1.5", TOUCH)}>
              <Link to={remixUrl(best, best.post)}><Shuffle className="h-4 w-4" /> Make one like this</Link>
            </Button>
          </RemixButton>
        </div>
      )}
    </article>
  );
}

function ExampleTile({ e, cover, linked }: { e: PlayExample; cover: string | undefined; linked: boolean }) {
  const ref = useScrollToItem<HTMLLIElement>(linked);
  const [broken, setBroken] = useState(false);
  const open = safeExternalUrl(e.post.url);
  return (
    // it plays in place as Apps like yours' cards do, taking the whole row while it plays so the player can be watched
    <li ref={ref} className={cn("min-w-0 overflow-hidden rounded-lg border bg-muted/30 has-[iframe]:col-span-3", linked ? "border-primary ring-2 ring-primary/30" : "border-border/60")}>
      {embedUrlFor(e.post.url) ? (
        <VideoEmbed url={e.post.url} label={`@${e.handle}'s post`} poster={cover} text={watchText(e.platform, e.post.format)} className="rounded-none border-0" />
      ) : (
        <div className="aspect-[3/4] w-full bg-muted">
          {cover && !broken ? (
            // cover links expire within days; a broken one shows the format instead
            <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-[11px] text-muted-foreground">{FORMAT[e.post.format]}</span>
          )}
        </div>
      )}
      <div className="flex items-start gap-1 p-1.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[11px] font-medium">@{e.handle}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground">{times(e.ratio)} usual</p>
        </div>
        {open && (
          <a
            href={open}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open @${e.handle}'s post on ${e.platform === "tiktok" ? "TikTok" : "Instagram"}`}
            className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </li>
  );
}
