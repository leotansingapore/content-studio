import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Linkedin,
  Instagram,
  Facebook,
} from "lucide-react";
import inspirationData from "@/data/inspiration.json";
import { type InspirationEntry } from "@/components/Inspiration";

const ENTRIES = inspirationData as InspirationEntry[];

const PLATFORM_META: Record<
  InspirationEntry["platform"],
  { label: string; Icon: typeof Linkedin }
> = {
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  instagram: { label: "Instagram", Icon: Instagram },
  facebook: { label: "Facebook", Icon: Facebook },
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

export default function InspirationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const entry = ENTRIES.find((e) => e.id === id);

  useEffect(() => {
    if (entry) {
      document.title = `${entry.hook.slice(0, 60)} - Content Studio`;
    } else {
      document.title = "Not found - Content Studio";
    }
    return () => {
      document.title = "Content Studio";
    };
  }, [entry]);

  if (!entry) {
    return (
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Inspiration not found
          </CardTitle>
          <CardDescription>
            The id "{id}" does not match any inspiration entry. It may have been
            renamed or removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/inspiration">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all inspiration
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const platformMeta = PLATFORM_META[entry.platform];
  const PlatformIcon = platformMeta.Icon;

  const handleUseAsVibe = () => {
    navigate(`/generate?vibe=${encodeURIComponent(entry.id)}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link to="/inspiration">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to all inspiration
          </Link>
        </Button>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <PlatformIcon className="h-3 w-3" />
              {platformMeta.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                entry.pillar === "Authority" || entry.pillar === "Tip"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : entry.pillar === "Social"
                    ? "border-accent/50 bg-accent/15 text-accent-foreground"
                    : "border-border/60 bg-muted text-muted-foreground"
              }`}
            >
              {entry.pillar}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {entry.audience}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {entry.format}
            </span>
          </div>
          <p className="text-[10px] font-medium text-muted-foreground/80">
            Pattern: {formatCurriculumAnchor(entry.curriculum_anchor)} - Source:{" "}
            {entry.source}
          </p>
          <CardTitle className="font-serif text-2xl font-semibold leading-snug">
            {entry.hook}
          </CardTitle>
          <CardDescription className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {entry.topic}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {entry.content}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[12px] italic text-muted-foreground">
            Why it works: {entry.why_it_works}
          </div>
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="pt-2">
            <Button
              size="lg"
              onClick={handleUseAsVibe}
              className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              Use as vibe
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
