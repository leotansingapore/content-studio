// One card on /library: a thumb drawn only once it is on screen, "<Format> | <title>", the status line and Open,
// plus Schedule on a ready post and Try again on a failure. Thumbs are memoised by id and updatedAt.

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

  return (
    <article className="flex w-full min-w-0 flex-col gap-2">
      <Link to={item.href} tabIndex={-1} aria-hidden className={cn("relative block overflow-hidden rounded-lg border border-border/60 bg-muted", item.format === "video" ? "aspect-[9/16]" : "aspect-[4/5]")}>
        <div ref={ref} className="h-full w-full">
          <LibraryThumb item={item} sources={sources} seen={seen} />
        </div>
      </Link>
      <div className="min-w-0 space-y-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">
          <span className="text-muted-foreground">{item.kind} | </span>
          {item.title}
        </p>
        {item.source && <p className="truncate text-xs text-muted-foreground" title={item.source}>{item.source}</p>}
        {item.key.startsWith("d:") && <CampaignPostLink userId={sources.userId} draft={{ id: item.key.slice(2), campaign: item.campaign }} />}
        <p className={cn("flex items-start gap-1 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
          {making && (item.waiting ? <ClockIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> : <CircleNotchIcon className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden />)}
          <span className="min-w-0 break-words">{statusLine(item)}</span>
        </p>
        {item.autoPost && <span className="inline-block rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Auto-post</span>}
        {item.status === "ready" && item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
        {!here && <p className="text-xs text-muted-foreground">The video file is on the device that made it.</p>}
        {item.live && (
          <p className="flex flex-wrap gap-x-3 text-xs">
            {item.live.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 font-semibold text-primary hover:underline", TOUCH)}>
                {platformName(l.platform)} <ArrowSquareOutIcon className="h-3 w-3" aria-hidden />
              </a>
            ))}
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        {/* a failed job's Try again opens the same maker, so it stands alone */}
        {item.retryHref !== item.href && (
          <Button asChild size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", TOUCH)}>
            <Link to={item.href} aria-label={`Open ${item.title}`}>
              Open
            </Link>
          </Button>
        )}
        {item.scheduleHref && (
          <Button asChild size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", TOUCH)}>
            <Link to={item.scheduleHref}>Schedule</Link>
          </Button>
        )}
        {item.retryHref && (
          <Button asChild size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", TOUCH)}>
            <Link to={item.retryHref}>Try again</Link>
          </Button>
        )}
        {!making && !failed && <CopyLinkButton path={item.href} label={`Copy link to ${item.title}`.slice(0, 120)} className="ml-auto h-8 w-8" />}
      </div>
    </article>
  );
}

export default memo(LibraryCard);
