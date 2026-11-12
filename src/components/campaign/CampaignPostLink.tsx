// "<campaign name> | Day N" on a post a campaign made, linking to that post on its campaign page (the Library card and
// the All posts row). Nothing once the campaign or the post is gone (campaignLine in src/lib/campaigns.ts).

import { useEffect, useReducer } from "react";
import { Link } from "react-router-dom";
import { campaignLine, onCampaignsChanged } from "@/lib/campaigns";
import type { DraftEntry } from "@/lib/draftHistory";
import { cn } from "@/lib/utils";

export default function CampaignPostLink({ userId, link, className }: { userId: string; link: NonNullable<DraftEntry["campaign"]>; className?: string }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onCampaignsChanged(redraw), []);
  const line = campaignLine(userId, link);
  if (!line) return null;
  // a long name gives way, never the day
  const day = ` | Day ${link.day}`;
  return (
    <Link to={line.href} title={line.text} aria-label={line.text}
      className={cn("flex min-w-0 text-xs text-muted-foreground hover:text-foreground hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center", className)}>
      <span className="truncate">{line.text.slice(0, -day.length)}</span>
      <span className="shrink-0 whitespace-pre">{day}</span>
    </Link>
  );
}
