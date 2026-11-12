// One card on /library, after Fastlane's (11 Nov): a thumb drawn only once it is on screen, where it came from,
// "<Kind> | <title>" and the status line, the whole card one link. Schedule and Copy link show over the thumb on hover
// with a mouse; a failure keeps Try again in words. Thumbs are memoised by id and updatedAt.

import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClockIcon, ArrowSquareOutIcon, CircleNotchIcon } from "@phosphor-icons/react";
import CampaignPostLink from "@/components/campaign/CampaignPostLink";
import CopyLinkButton from "@/components/CopyLinkButton";
import LibraryThumb, { useOnScreen, type ThumbSources } from "@/components/library/LibraryThumb";
import { Button } from "@/components/ui/button";
import { getFile } from "@/lib/deviceFiles";
import { statusLine, type LibraryItem } from "@/lib/library";
import { platformName } from "@/lib/socialConnect";
import { cn } from "@/lib/utils";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";

const onDevice = new Map<string, Promise<boolean>>();
const fileHere = (key: string) => {
  if (!onDevice.has(key)) onDevice.set(key, getFile(key).then((f) => !!f, () => false));
  return onDevice.get(key)!;
};

function LibraryCard({ item, sources }: { item: LibraryItem; sources: ThumbSources }) {
  const [ref, seen] = useOnScreen<HTMLDivElement>();
  const [here, setHere] = useState(true);
  useEffect(() => {
    if (!seen || !item.file || item.format !== "video") return;
    let live = true;
    void fileHere(item.file).then((h) => live && setHere(h));
    return () => {
      live = false;
    };
  }, [seen, item.file, item.format]);
  const making = item.status === "making";
  const failed = item.status === "failed";

  // a ready post's Schedule and any card's Copy link: shown over the picture on hover or focus with a mouse, left out
  // on touch (the editor the card opens has both), as Fastlane's cards carry no buttons at rest
  const tools = !making && !failed && (
    <span className="absolute inset-x-1.5 bottom-1.5 z-10 hidden items-center justify-end gap-1 transition-opacity [@media(pointer:fine)]:flex [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:focus-within:opacity-100 [@media(pointer:fine)]:group-hover/card:opacity-100">
      {item.scheduleHref && (
        <Button asChild size="sm" variant="secondary" className="h-7 px-2 text-xs shadow-sm">
          <Link to={item.scheduleHref}>Schedule</Link>
        </Button>
      )}
      <CopyLinkButton path={item.href} label={`Copy link to ${item.title}`.slice(0, 120)} className="h-7 w-7 rounded-md bg-secondary shadow-sm" />
    </span>
  );

  return (
    // the whole card opens the piece (the title's link stretches over it); the links inside sit above that
    <article className="group/card relative flex w-full min-w-0 flex-col gap-1.5">
      <div className={cn("relative overflow-hidden rounded-lg border border-border/60 bg-muted transition-colors group-hover/card:border-primary/40", item.format === "video" ? "aspect-[9/16]" : "aspect-[4/5]")}>
        <div ref={ref} className="h-full w-full">
          <LibraryThumb item={item} sources={sources} seen={seen} />
        </div>
        {tools}
      </div>
      <div className="min-w-0 space-y-0.5">
        {/* Fastlane's card: where it came from, "Kind · title" on one line, then when it goes out */}
        {item.source && <p className="truncate text-[11px] text-muted-foreground" title={item.source}>{item.source}</p>}
        <p className="truncate text-sm font-medium leading-snug" title={`${item.kind} | ${item.title}`}>
          {/* a failed job's Try again opens the same maker, so the card opens it too */}
          <Link to={item.href} aria-label={`Open ${item.title}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
            <span className="text-muted-foreground">{item.kind} | </span>
            {item.title}
          </Link>
        </p>
        {item.key.startsWith("d:") && (
          <div className="relative z-10 empty:hidden">
            <CampaignPostLink userId={sources.userId} draft={{ id: item.key.slice(2), campaign: item.campaign }} />
          </div>
        )}
        <p className={cn("flex items-start gap-1 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
          {making && (item.waiting ? <ClockIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> : <CircleNotchIcon className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden />)}
          <span className="min-w-0 break-words">{statusLine(item)}</span>
        </p>
        {item.autoPost && <span className="inline-block rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Auto-post</span>}
        {item.status === "ready" && item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
        {!here && <p className="text-xs text-muted-foreground">The video file is on the device that made it.</p>}
        {item.live && (
          <p className="relative z-10 flex flex-wrap gap-x-3 text-xs">
            {item.live.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 font-semibold text-primary hover:underline", TOUCH)}>
                {platformName(l.platform)} <ArrowSquareOutIcon className="h-3 w-3" aria-hidden />
              </a>
            ))}
          </p>
        )}
        {/* a failure stays in words with its way out, on every screen */}
        {item.retryHref && item.retryHref !== item.href && (
          <Link to={item.retryHref} className={cn("relative z-10 inline-flex items-center text-xs font-semibold text-primary hover:underline", TOUCH)}>
            Try again
          </Link>
        )}
      </div>
    </article>
  );
}

export default memo(LibraryCard);
