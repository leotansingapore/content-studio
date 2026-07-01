import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Search,
  Linkedin,
  Instagram,
  Facebook,
  Filter,
  X,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import inspirationData from "@/data/inspiration.json";

export type InspirationEntry = {
  id: string;
  platform: "linkedin" | "instagram" | "facebook";
  format: "text-only" | "carousel" | "short-video";
  pillar: "Authority" | "Social" | "Tip" | "Hook" | "CTA";
  audience: string;
  topic: string;
  hook: string;
  content: string;
  why_it_works: string;
  source: string;
  curriculum_anchor: string;
  tags: string[];
};

function formatCurriculumAnchor(anchor: string): string {
  return anchor
    .split(":")
    .map((part) =>
      part
        .split("-")
        .map((word) =>
          word.length > 0
            ? word[0].toUpperCase() + word.slice(1).toLowerCase()
            : word,
        )
        .join(" "),
    )
    .join(" - ");
}

const ENTRIES = inspirationData as InspirationEntry[];

const PLATFORM_META: Record<
  InspirationEntry["platform"],
  { label: string; Icon: typeof Linkedin }
> = {
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  instagram: { label: "Instagram", Icon: Instagram },
  facebook: { label: "Facebook", Icon: Facebook },
};

const PILLAR_OPTIONS: InspirationEntry["pillar"][] = [
  "Authority",
  "Social",
  "Tip",
  "Hook",
  "CTA",
];

const PLATFORM_OPTIONS: InspirationEntry["platform"][] = [
  "linkedin",
  "instagram",
  "facebook",
];

const AUDIENCE_OPTIONS = Array.from(
  new Set(ENTRIES.map((e) => e.audience)),
).sort();

type Props = {
  onUseAsVibe?: (entry: InspirationEntry) => void;
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
          : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PlatformBadge({ platform }: { platform: InspirationEntry["platform"] }) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.Icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function PillarBadge({ pillar }: { pillar: InspirationEntry["pillar"] }) {
  const tone =
    pillar === "Authority" || pillar === "Tip"
      ? "border-primary/40 bg-primary/10 text-primary"
      : pillar === "Social"
        ? "border-accent/50 bg-accent/15 text-accent-foreground"
        : "border-border/60 bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone}`}
    >
      {pillar}
    </span>
  );
}

function AudienceBadge({ audience }: { audience: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {audience}
    </span>
  );
}

function InspirationCard({
  entry,
  onUseAsVibe,
}: {
  entry: InspirationEntry;
  onUseAsVibe?: (e: InspirationEntry) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const preview =
    entry.content.length > 140 && !expanded
      ? entry.content.slice(0, 140).trimEnd() + "..."
      : entry.content;

  const handleUseAsVibe = () => {
    if (onUseAsVibe) {
      onUseAsVibe(entry);
    } else {
      navigate(`/generate?vibe=${encodeURIComponent(entry.id)}`);
    }
  };

  return (
    <Card className="flex h-full flex-col border-border/60 shadow-card transition-all hover:border-primary/40 hover:shadow-elegant">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={entry.platform} />
          <PillarBadge pillar={entry.pillar} />
          <AudienceBadge audience={entry.audience} />
        </div>
        <p className="text-[10px] font-medium text-muted-foreground/80">
          Pattern: {formatCurriculumAnchor(entry.curriculum_anchor)}
        </p>
        <CardTitle className="font-serif text-base font-semibold leading-snug">
          {entry.hook}
        </CardTitle>
        <CardDescription className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {entry.topic} - {entry.format}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-2">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {preview}
          </p>
          {entry.content.length > 140 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Read more <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
          <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
            Why it works: {entry.why_it_works}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full gap-1.5 sm:w-auto sm:flex-1"
          >
            <Link to={`/inspiration/${encodeURIComponent(entry.id)}`}>
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </Link>
          </Button>
          <Button
            size="sm"
            onClick={handleUseAsVibe}
            className="w-full gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 sm:w-auto sm:flex-1"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Use as vibe
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const PAGE_SIZE = 12;

export default function Inspiration({ onUseAsVibe }: Props) {
  const [search, setSearch] = useState("");
  const [platforms, setPlatforms] = useState<Set<InspirationEntry["platform"]>>(
    new Set(),
  );
  const [pillars, setPillars] = useState<Set<InspirationEntry["pillar"]>>(
    new Set(),
  );
  const [audiences, setAudiences] = useState<Set<string>>(new Set());
  // Collapse the secondary filters and paginate the grid so the page opens
  // as a short, scannable screen instead of one endless wall of cards.
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const togglePlatform = (p: InspirationEntry["platform"]) => {
    setPlatforms((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  const togglePillar = (p: InspirationEntry["pillar"]) => {
    setPillars((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  const toggleAudience = (a: string) => {
    setAudiences((s) => {
      const next = new Set(s);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  const clearFilters = () => {
    setPlatforms(new Set());
    setPillars(new Set());
    setAudiences(new Set());
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (platforms.size > 0 && !platforms.has(e.platform)) return false;
      if (pillars.size > 0 && !pillars.has(e.pillar)) return false;
      if (audiences.size > 0 && !audiences.has(e.audience)) return false;
      if (q.length > 0) {
        const haystack = (
          e.hook +
          " " +
          e.content +
          " " +
          e.tags.join(" ") +
          " " +
          e.topic
        ).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [search, platforms, pillars, audiences]);

  const activeFilterCount =
    platforms.size + pillars.size + audiences.size + (search.trim() ? 1 : 0);

  // Any time the filters change, jump back to the first page of results.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, platforms, pillars, audiences]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Inspiration
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Real posts that worked, sorted so you can borrow the pattern. Open one
          to read the full breakdown, or hit "Use as vibe" to start a draft from
          it.
        </p>
      </header>

      {/* Compact toolbar: search + a single row of pillar quick-filters, with
          platform/audience tucked behind a toggle to keep the top short. */}
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="inspiration-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search examples (e.g. CPF, BTO, retirement)"
                className="pl-9"
              />
            </div>
            <Button
              variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className="gap-1.5"
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-background/30 px-1.5 text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>

          {/* Pillar = the primary axis, so it stays visible as quick-filters. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {PILLAR_OPTIONS.map((p) => (
              <Chip key={p} active={pillars.has(p)} onClick={() => togglePillar(p)}>
                {p}
              </Chip>
            ))}
          </div>

          {showFilters && (
            <div className="space-y-3 border-t border-border/60 pt-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Platform
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORM_OPTIONS.map((p) => (
                    <Chip
                      key={p}
                      active={platforms.has(p)}
                      onClick={() => togglePlatform(p)}
                    >
                      {PLATFORM_META[p].label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Audience
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {AUDIENCE_OPTIONS.map((a) => (
                    <Chip
                      key={a}
                      active={audiences.has(a)}
                      onClick={() => toggleAudience(a)}
                    >
                      {a}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {filtered.length} example{filtered.length === 1 ? "" : "s"}
              {activeFilterCount > 0 ? " match your filters" : ""}
            </p>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 gap-1 text-xs text-muted-foreground"
              >
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No examples match those filters.{" "}
            <button
              type="button"
              onClick={clearFilters}
              className="font-semibold text-primary hover:underline"
            >
              Clear filters
            </button>{" "}
            to see them all.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((entry) => (
              <InspirationCard
                key={entry.id}
                entry={entry}
                onUseAsVibe={onUseAsVibe}
              />
            ))}
          </div>
          {remaining > 0 && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="gap-1.5"
              >
                <ChevronDown className="h-4 w-4" />
                Show {Math.min(PAGE_SIZE, remaining)} more
                <span className="text-muted-foreground">
                  ({remaining} left)
                </span>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
