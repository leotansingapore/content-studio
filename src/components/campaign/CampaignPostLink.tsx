// "<campaign name> | Day N" on a post a campaign made, linking to that post on its campaign page (the Library card and
// the All posts row). Nothing for any other post, or once the campaign or the post is gone (campaignLine in
// src/lib/campaigns.ts, which also reads a campaign post made before drafts kept the link).

import { useEffect, useReducer } from "react";
import { Link } from "react-router-dom";
import { campaignLine, onCampaignsChanged } from "@/lib/campaigns";
import type { DraftEntry } from "@/lib/draftHistory";
import { cn } from "@/lib/utils";

export default function CampaignPostLink({ userId, draft, className }: { userId: string; draft: Pick<DraftEntry, "id" | "campaign">; className?: string }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onCampaignsChanged(redraw), []);
  const line = campaignLine(userId, draft);
  if (!line) return null;
  // a long name gives way, never the day
  const day = ` | Day ${line.day}`;
  return (
    <Link to={line.href} title={line.text} aria-label={line.text}
      className={cn("flex min-w-0 text-xs text-muted-foreground hover:text-foreground hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center", className)}>
      <span className="truncate">{line.text.slice(0, -day.length)}</span>
      <span className="shrink-0 whitespace-pre">{day}</span>
    </Link>
  );
}
