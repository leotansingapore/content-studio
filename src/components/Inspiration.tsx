import { useMemo, useState } from "react";
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

export default function Inspiration({ onUseAsVibe }: Props) {
  const [search, setSearch] = useState("");
  const [platforms, setPlatforms] = useState<Set<InspirationEntry["platform"]>>(
    new Set(),
  );
  const [pillars, setPillars] = useState<Set<InspirationEntry["pillar"]>>(
    new Set(),
  );
  const [audiences, setAudiences] = useState<Set<string>>(new Set());

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

  return (
    <div className="space-y-5">
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Inspiration library
          </CardTitle>
          <CardDescription>
            Hand-picked FC content examples. Filter by platform, pillar, or
            audience. Tap "View" for the full card detail (deep-linkable), or
            "Use as vibe" to pre-fill the generator with that example's pattern.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inspiration-search" className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" /> Search
            </Label>
            <Input
              id="inspiration-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hooks, content, tags (e.g. CPF, BTO, retirement)"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Platform
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
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Pillar
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {PILLAR_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  active={pillars.has(p)}
                  onClick={() => togglePillar(p)}
                >
                  {p}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
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
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {ENTRIES.length} examples
            </p>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 gap-1 text-xs text-muted-foreground"
              >
                <X className="h-3 w-3" /> Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No examples match those filters. Try clearing some.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => (
            <InspirationCard
              key={entry.id}
              entry={entry}
              onUseAsVibe={onUseAsVibe}
            />
          ))}
        </div>
      )}
    </div>
  );
}
