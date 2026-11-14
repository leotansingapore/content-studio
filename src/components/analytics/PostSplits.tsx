// Analytics: the brand's posted posts with numbers split by platform, format, pillar, hook formula, audience or campaign
// (?split=; an old link's ?by=, the "Engagement rate by" card this replaced, opens the same split), each group's post
// count and average engagements per post (draftHistory's engagement: likes, comments and shares), after Fastlane's
// Organic posts. A split with fewer than 2 groups compares nothing, so it isn't offered, and the card draws nothing when
// none has 2.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { RankBars } from "@/components/charts/RankBars";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { AUDIENCE_NAMES } from "@/lib/addBrand";
import { labelForDimension, MIN_GROUP_SAMPLE, type TrackedPost } from "@/lib/analytics";
import { hookFormula } from "@/lib/hookFormulas";
import { useUrlState } from "@/lib/urlState";

export type SplitBy = "platform" | "format" | "pillar" | "hook-formula" | "audience" | "campaign";
const SPLITS: { id: SplitBy; label: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "format", label: "Format" },
  { id: "pillar", label: "Pillar" },
  { id: "hook-formula", label: "Hook formula" },
  { id: "audience", label: "Audience" },
  { id: "campaign", label: "Campaign" },
];
const IDS = SPLITS.map((s) => s.id);

export interface SplitRow {
  key: string;
  label: string;
  count: number;
  /** Average engagements per post, one decimal. */
  avg: number;
}

type Post = Pick<TrackedPost, "platform" | "format" | "pillar" | "hookFormula" | "audience" | "campaign" | "engagementTotal">;

const spoken = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ");

function labelOf(by: SplitBy, key: string, campaigns: ReadonlyMap<string, string>): string {
  if (by === "campaign") return key ? campaigns.get(key) || "A deleted campaign" : "No campaign";
  if (!key) return "Not set";
  if (by === "audience") return AUDIENCE_NAMES[key as keyof typeof AUDIENCE_NAMES] ?? key;
  const known = labelForDimension(by === "hook-formula" ? "hookFormula" : by, key);
  return known === key ? spoken(key) : known;
}

/** The posts grouped by one field, best average engagement first (more posts first on a tie). */
export function splitPosts(posts: Post[], by: SplitBy, campaigns: ReadonlyMap<string, string> = new Map()): SplitRow[] {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    // a post whose hook was not written with a known formula says nothing about formulas
    if (by === "hook-formula" && !hookFormula(p.hookFormula)) continue;
    const key = (by === "campaign" ? p.campaign?.id : by === "hook-formula" ? p.hookFormula : p[by]) ?? "";
    groups.set(key, [...(groups.get(key) ?? []), p.engagementTotal]);
  }
  return [...groups]
    .map(([key, list]) => ({ key, label: labelOf(by, key, campaigns), count: list.length, avg: Math.round((list.reduce((s, n) => s + n, 0) / list.length) * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
}

export default function PostSplits({ userId, posts, tag }: { userId: string; posts: TrackedPost[]; tag?: ReactNode }) {
  const [params] = useSearchParams();
  const by = params.get("by") as SplitBy | null;
  const [split, setSplit] = useUrlState<SplitBy>("split", by && IDS.includes(by) ? by : "platform", { allowed: IDS });
  // campaign names: their module loads only when a post came from a campaign
  const [campaigns, setCampaigns] = useState<ReadonlyMap<string, string>>(new Map());
  const inCampaigns = posts.some((p) => p.campaign);
  useEffect(() => {
    if (!inCampaigns) return;
    let live = true;
    import("@/lib/campaigns").then(
      (m) => live && setCampaigns(new Map(m.loadCampaigns(userId).map((c) => [c.id, c.name]))),
      () => {}, // a chunk gone after a deploy: "A deleted campaign" until the next load
    );
    return () => {
      live = false;
    };
  }, [inCampaigns, userId]);
  const splits = useMemo(() => SPLITS.map((s) => ({ ...s, rows: splitPosts(posts, s.id, campaigns) })).filter((s) => s.rows.length >= 2), [posts, campaigns]);

  if (!splits.length) return null;
  const open = splits.find((s) => s.id === split) ?? splits[0];
  return (
    <Card id="splits" className="scroll-mt-20 border-border/60 shadow-card">
      <CardHeader className="space-y-2.5">
        <CardTitle className="flex flex-wrap items-center gap-2 font-serif text-lg">
          Engagements per post by {open.label.toLowerCase()}
          <InfoTip label="About engagements per post">Likes, comments and shares per post, averaged. Not a % of views.</InfoTip>
          {tag}
        </CardTitle>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Split your posts by">
          {splits.map((s) => (
            <FilterChip key={s.id} active={s.id === open.id} onClick={() => setSplit(s.id)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <RankBars rows={open.rows.map((r) => ({ key: r.key || "-", label: r.label, value: r.avg, count: r.count }))} valueSuffix="" minSample={MIN_GROUP_SAMPLE} />
      </CardContent>
    </Card>
  );
}
