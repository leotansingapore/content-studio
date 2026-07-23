import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getTrends,
  buildTrendRemixUrl,
  type TrendEntry,
  type TrendPlatform,
} from "@/lib/trends";
import {
  Flame,
  Wand2,
  ExternalLink,
  Lightbulb,
  Clapperboard,
  Linkedin,
  Instagram,
  Facebook,
  Video,
} from "lucide-react";

const PLATFORM_META: Record<
  TrendPlatform,
  { label: string; icon: typeof Linkedin }
> = {
  linkedin: { label: "LinkedIn", icon: Linkedin },
  instagram: { label: "Instagram", icon: Instagram },
  facebook: { label: "Facebook", icon: Facebook },
  tiktok: { label: "TikTok", icon: Video },
};

const FORMAT_LABEL: Record<string, string> = {
  "text-post": "Text post",
  carousel: "Carousel",
  "short-video": "Short video",
  story: "Story",
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TrendCard({ trend }: { trend: TrendEntry }) {
  const platformMeta = PLATFORM_META[trend.platform];
  const PlatformIcon = platformMeta.icon;
  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            <PlatformIcon className="h-3 w-3" /> {platformMeta.label}
          </span>
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {FORMAT_LABEL[trend.format] ?? trend.format}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {new Date(trend.date_found).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        <p className="font-serif text-base font-semibold leading-snug text-foreground">
          {trend.title}
        </p>

        <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/20 p-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Lightbulb className="h-3 w-3" /> Why it works
          </p>
          <p className="text-[12px] leading-relaxed text-foreground/80">
            {trend.why_it_works}
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Clapperboard className="h-3 w-3" /> How to film it
          </p>
          <p className="text-[12px] leading-relaxed text-foreground/80">
            {trend.how_to_film}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            asChild
            size="sm"
            className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Link to={buildTrendRemixUrl(trend)}>
              <Wand2 className="h-3.5 w-3.5" /> Remix in Write
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={trend.source_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Source
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrendsPage() {
  const [platform, setPlatform] = useState<TrendPlatform | "all">("all");
  const trends = useMemo(() => getTrends(), []);

  useEffect(() => {
    document.title = "Trends - Content Studio";
  }, []);

  const filtered = useMemo(
    () =>
      platform === "all" ? trends : trends.filter((t) => t.platform === platform),
    [trends, platform],
  );

  const platforms = useMemo(
    () => [...new Set(trends.map((t) => t.platform))] as TrendPlatform[],
    [trends],
  );

  const latestDate = trends[0]?.date_found;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Flame className="h-6 w-6 text-primary" /> Trends
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What's actually working in finance content right now, per platform -
          plus how to tweak and film it for your own audience. Refreshed
          periodically from current research.
          {latestDate
            ? ` Last refreshed ${new Date(latestDate).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`
            : ""}
        </p>
      </header>

      {platforms.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={platform === "all"} onClick={() => setPlatform("all")}>
            All
          </Chip>
          {platforms.map((p) => (
            <Chip key={p} active={platform === p} onClick={() => setPlatform(p)}>
              {PLATFORM_META[p].label}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No trends for this platform yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TrendCard key={t.id} trend={t} />
          ))}
        </div>
      )}
    </div>
  );
}
