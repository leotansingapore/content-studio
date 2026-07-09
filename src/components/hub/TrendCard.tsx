import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Play, Sparkles, Wand2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Markdown from "@/components/hub/Markdown";
import type { HubTrend } from "@/lib/hub";

// Deep-link into Write with the trend pre-loaded, mirroring the swipe file's
// remix flow (GeneratePage consumes pillar/detail/ctx/format/platform).
function buildTrendRemixUrl(trend: HubTrend): string {
  const params = new URLSearchParams({
    pillar: "topic",
    detail: trend.title.slice(0, 90),
    ctx: [
      `Ride this trend: ${trend.title}.`,
      trend.summary_md.replace(/\s+/g, " ").slice(0, 300),
      `Angles to pick from: ${trend.angles_md.replace(/\s+/g, " ").slice(0, 400)}`,
    ].join(" "),
    format: "short-video",
    platform: "instagram",
  });
  return `/generate?${params.toString()}`;
}

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function TrendCard({ trend }: { trend: HubTrend }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
            {trend.niche}
          </span>
          {trend.audience_type === "client" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
              <Sparkles className="h-3 w-3" /> For you
            </span>
          )}
          <span className="ml-auto text-muted-foreground">{timeAgo(trend.created_at)}</span>
        </div>
        <CardTitle className="text-base leading-snug">{trend.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Markdown>{trend.summary_md}</Markdown>
        {(trend.example_video_urls ?? []).filter((u) => /^https?:\/\//i.test(u)).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(trend.example_video_urls ?? [])
              .filter((u) => /^https?:\/\//i.test(u))
              .slice(0, 3)
              .map((u, i, arr) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  <Play className="h-3 w-3" />
                  {arr.length === 1 ? "Watch an example" : `Example ${i + 1}`}
                </a>
              ))}
          </div>
        )}
        <button
          className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
          onClick={() => setOpen((v) => !v)}
        >
          Fresh angles
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <Markdown>{trend.angles_md}</Markdown>
            <Link
              to={buildTrendRemixUrl(trend)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Wand2 className="h-3.5 w-3.5" /> Remix in Write
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
