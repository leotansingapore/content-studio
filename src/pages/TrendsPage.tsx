import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getTrends,
  buildTrendRemixUrl,
  trendHooks,
  trendTalkingPoints,
  trendFreshness,
  type TrendEntry,
  type TrendPlatform,
} from "@/lib/trends";
import {
  Flame,
  Wand2,
  ExternalLink,
  Lightbulb,
  Clapperboard,
  Megaphone,
  Copy,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
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

// Colour-code by what kind of moment the post is riding, so the grid is
// scannable when a drop has 20+ entries.
const TREND_TYPE_STYLE: Record<string, string> = {
  meme: "border-brand/30 bg-brand/10 text-brand",
  news: "border-primary/30 bg-primary/10 text-primary",
  "current-affairs": "border-primary/30 bg-primary/10 text-primary",
  event: "border-success/30 bg-success/10 text-success",
  culture: "border-warning/30 bg-warning/10 text-warning",
  sport: "border-success/30 bg-success/10 text-success",
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
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const platformMeta = PLATFORM_META[trend.platform];
  const PlatformIcon = platformMeta?.icon ?? Globe;
  const hooks = trendHooks(trend);
  const points = trendTalkingPoints(trend);
  const hasKit = hooks.length > 0 || points.length > 0 || Boolean(trend.cta);
  const freshness = trendFreshness(trend);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Card className="flex flex-col border-border/60 shadow-card">
      <CardContent className="flex flex-1 flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <PlatformIcon className="h-3 w-3" /> {platformMeta?.label ?? trend.platform}
          </span>
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {FORMAT_LABEL[trend.format] ?? trend.format}
          </span>
          {trend.trend_type && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                TREND_TYPE_STYLE[trend.trend_type] ??
                "border-border/60 bg-muted/40 text-muted-foreground"
              }`}
            >
              {trend.trend_type.replace(/-/g, " ")}
            </span>
          )}
          {freshness && (
            <span
              title={
                freshness.stale
                  ? "Older than the 48h freshness bar - the scout may not have refreshed"
                  : "Spotted trending within the last 48 hours"
              }
              className={`ml-auto inline-flex items-center gap-1 text-[10px] font-semibold ${
                freshness.stale ? "text-warning" : "text-success"
              }`}
            >
              <Clock className="h-3 w-3" />
              {freshness.label}
            </span>
          )}
        </div>

        <p className="font-serif text-base font-semibold leading-snug text-foreground">
          {trend.title}
        </p>

        {trend.trend_source && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Globe className="h-3 w-3" /> What&apos;s trending
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">
              {trend.trend_source}
            </p>
          </div>
        )}

        {/* Lead hook stays visible - it's the highest-value line on the card. */}
        {hooks.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                <Lightbulb className="h-3 w-3" /> Hook
              </p>
              <button
                type="button"
                onClick={() => copy(hooks[0], "Hook")}
                aria-label="Copy hook"
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <p className="text-[12px] font-medium leading-relaxed text-foreground">
              {hooks[0]}
            </p>
          </div>
        )}

        {hasKit && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            {open ? (
              <>
                Hide the kit <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show the full kit <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}

        {open && (
          <div className="space-y-3">
            {hooks.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  More hooks
                </p>
                <ul className="space-y-1.5">
                  {hooks.slice(1).map((h, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border/50 bg-background p-2 text-[12px] leading-relaxed text-foreground/85"
                    >
                      <span>{h}</span>
                      <button
                        type="button"
                        onClick={() => copy(h, "Hook")}
                        aria-label="Copy hook"
                        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {points.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  What to say
                </p>
                <ul className="space-y-1">
                  {points.map((p, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[12px] leading-relaxed text-foreground/85"
                    >
                      <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trend.cta && (
              <div className="space-y-1 rounded-lg border border-success/25 bg-success/[0.06] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-success">
                    <Megaphone className="h-3 w-3" /> Call to action
                  </p>
                  <button
                    type="button"
                    onClick={() => copy(trend.cta!, "CTA")}
                    aria-label="Copy call to action"
                    className="text-muted-foreground transition-colors hover:text-success"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[12px] leading-relaxed text-foreground/85">
                  {trend.cta}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Clapperboard className="h-3 w-3" /> How to make it
              </p>
              <p className="text-[12px] leading-relaxed text-foreground/80">
                {trend.how_to_film}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Why it works
              </p>
              <p className="text-[12px] leading-relaxed text-foreground/80">
                {trend.why_it_works}
              </p>
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button
            asChild
            size="sm"
            className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Link to={buildTrendRemixUrl(trend)}>
              <Wand2 className="h-3.5 w-3.5" /> Write this
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
  const [type, setType] = useState<string>("all");
  const trends = useMemo(() => getTrends(), []);

  useEffect(() => {
    document.title = "Trends - Content Studio";
  }, []);

  const platforms = useMemo(
    () => [...new Set(trends.map((t) => t.platform))] as TrendPlatform[],
    [trends],
  );
  const types = useMemo(
    () =>
      [...new Set(trends.map((t) => t.trend_type).filter(Boolean))] as string[],
    [trends],
  );

  const filtered = useMemo(
    () =>
      trends.filter(
        (t) =>
          (platform === "all" || t.platform === platform) &&
          (type === "all" || t.trend_type === type),
      ),
    [trends, platform, type],
  );

  const latestDate = trends[0]?.date_found;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Flame className="h-6 w-6 text-primary" /> Trends
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What the world is talking about today - memes, news, and cultural
          moments - turned into posts you can actually make, with hooks, talking
          points and a CTA ready to go. Refreshes every morning.
          {latestDate
            ? ` Last drop ${new Date(latestDate).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })}.`
            : ""}
        </p>
      </header>

      {(platforms.length > 1 || types.length > 1) && (
        <div className="space-y-2">
          {platforms.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Chip active={platform === "all"} onClick={() => setPlatform("all")}>
                All platforms
              </Chip>
              {platforms.map((p) => (
                <Chip
                  key={p}
                  active={platform === p}
                  onClick={() => setPlatform(p)}
                >
                  {PLATFORM_META[p]?.label ?? p}
                </Chip>
              ))}
            </div>
          )}
          {types.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Chip active={type === "all"} onClick={() => setType("all")}>
                All types
              </Chip>
              {types.map((t) => (
                <Chip key={t} active={type === t} onClick={() => setType(t)}>
                  {t.replace(/-/g, " ")}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {filtered.length} trend{filtered.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No trends match those filters.
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
