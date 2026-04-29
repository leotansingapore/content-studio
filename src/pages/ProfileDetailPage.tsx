import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ExternalLink,
  Linkedin,
  Instagram,
  Facebook,
  Youtube,
  Music,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Copy,
} from "lucide-react";
import advisorsData from "@/data/advisors.json";
import { type AdvisorEntry, type AdvisorPlatform } from "@/components/AdvisorProfiles";

const ENTRIES = advisorsData as AdvisorEntry[];

const PLATFORM_META: Record<
  AdvisorPlatform,
  { label: string; Icon: typeof Linkedin }
> = {
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  instagram: { label: "Instagram", Icon: Instagram },
  facebook: { label: "Facebook", Icon: Facebook },
  tiktok: { label: "TikTok", Icon: Music },
  youtube: { label: "YouTube", Icon: Youtube },
};

const COMPANY_BADGE_STYLES: Record<string, string> = {
  AIA: "border-red-500/40 bg-red-500/10 text-red-500",
  Prudential: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  "Great Eastern": "border-amber-500/40 bg-amber-500/10 text-amber-500",
  Manulife: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  "Independent / Fee-only": "border-sky-500/40 bg-sky-500/10 text-sky-500",
  Other: "border-violet-500/40 bg-violet-500/10 text-violet-500",
};

export default function ProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const entry = ENTRIES.find((e) => e.id === id);

  useEffect(() => {
    if (entry) {
      document.title = `${entry.name} - Content Studio`;
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
            Profile not found
          </CardTitle>
          <CardDescription>
            The id "{id}" does not match any profile entry. It may have been
            renamed or removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/profiles">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all profiles
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const platformMeta = PLATFORM_META[entry.platform];
  const PlatformIcon = platformMeta.Icon;
  const companyStyle = entry.company
    ? COMPANY_BADGE_STYLES[entry.company as string] ?? COMPANY_BADGE_STYLES.Other
    : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.handle);
      toast({
        title: "Handle copied",
        description: `${entry.handle} is on your clipboard.`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the handle manually and copy.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link to="/profiles">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to all profiles
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
            {entry.company && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${companyStyle}`}
              >
                {entry.company}
              </span>
            )}
            {entry.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <CheckCircle2 className="h-3 w-3" /> Verified {entry.last_checked}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-500">
                <AlertTriangle className="h-3 w-3" /> Unverified
              </span>
            )}
          </div>
          <CardTitle className="font-serif text-2xl font-semibold leading-snug">
            {entry.name}
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="font-mono normal-case tracking-normal">
              {entry.handle}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              aria-label="Copy handle"
              title="Copy handle"
            >
              <Copy className="h-3 w-3" />
            </button>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Niche
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.niche.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Audience
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.audience.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Format
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.format.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
            <p className="text-sm leading-relaxed text-foreground/90">
              {entry.why_follow}
            </p>
            <p className="text-[11px] italic text-muted-foreground">
              Style: {entry.style_notes}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-muted-foreground">
            <p>
              <span className="font-semibold uppercase tracking-[0.14em]">Cadence:</span>{" "}
              {entry.post_cadence.replace(/-/g, " ")}
            </p>
            <p>
              <span className="font-semibold uppercase tracking-[0.14em]">Source:</span>{" "}
              {entry.source}
            </p>
            <p>
              <span className="font-semibold uppercase tracking-[0.14em]">Last checked:</span>{" "}
              {entry.last_checked}
            </p>
            {entry.secondary_platforms && entry.secondary_platforms.length > 0 && (
              <p className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Also on: {entry.secondary_platforms.join(", ")}
              </p>
            )}
          </div>
          {entry.verification_note && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-600">
              {entry.verification_note}
            </p>
          )}
          <div className="pt-2">
            <Button
              asChild
              size="lg"
              className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 sm:w-auto"
            >
              <a
                href={entry.platform_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                Open profile
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
