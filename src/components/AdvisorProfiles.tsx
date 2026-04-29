import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Linkedin,
  Instagram,
  Facebook,
  Filter,
  X,
  ExternalLink,
  Copy,
  Youtube,
  Music,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from "lucide-react";
import advisorsData from "@/data/advisors.json";

export type AdvisorPlatform =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube";

export type AdvisorCompany =
  | "AIA"
  | "Prudential"
  | "Great Eastern"
  | "Manulife"
  | "Independent / Fee-only"
  | "Other"
  | (string & {});

export type AdvisorEntry = {
  id: string;
  name: string;
  handle: string;
  platform: AdvisorPlatform;
  platform_url: string;
  secondary_platforms?: string[];
  company?: AdvisorCompany;
  niche: string[];
  audience: string[];
  format: string[];
  post_cadence: string;
  why_follow: string;
  style_notes: string;
  source: string;
  verified: boolean;
  last_checked: string;
  verification_note?: string;
};

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

const PLATFORM_OPTIONS: AdvisorPlatform[] = [
  "linkedin",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
];

const COMPANY_OPTIONS: AdvisorCompany[] = [
  "AIA",
  "Prudential",
  "Great Eastern",
  "Manulife",
  "Independent / Fee-only",
  "Other",
];

const COMPANY_NONE = "__none__";

const COMPANY_BADGE_STYLES: Record<string, string> = {
  AIA: "border-red-500/40 bg-red-500/10 text-red-500",
  Prudential: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  "Great Eastern": "border-amber-500/40 bg-amber-500/10 text-amber-500",
  Manulife: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  "Independent / Fee-only":
    "border-sky-500/40 bg-sky-500/10 text-sky-500",
  Other: "border-violet-500/40 bg-violet-500/10 text-violet-500",
};

const AUDIENCE_OPTIONS = Array.from(
  new Set(ENTRIES.flatMap((e) => e.audience)),
).sort();

const NICHE_OPTIONS = Array.from(
  new Set(ENTRIES.flatMap((e) => e.niche)),
).sort();

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

function PlatformBadge({ platform }: { platform: AdvisorPlatform }) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.Icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function CompanyBadge({ company }: { company: AdvisorCompany }) {
  const style =
    COMPANY_BADGE_STYLES[company as string] ?? COMPANY_BADGE_STYLES.Other;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${style}`}
    >
      {company}
    </span>
  );
}

function TagBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </span>
  );
}

function AdvisorCard({ entry }: { entry: AdvisorEntry }) {
  const { toast } = useToast();

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
    <Card className="flex h-full flex-col border-border/60 shadow-card transition-all hover:border-primary/40 hover:shadow-elegant">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={entry.platform} />
          {entry.company && <CompanyBadge company={entry.company} />}
          {entry.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              <CheckCircle2 className="h-3 w-3" /> Verified {entry.last_checked}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-500">
              <AlertTriangle className="h-3 w-3" /> Unverified - check activity
            </span>
          )}
        </div>
        <CardTitle className="font-serif text-base font-semibold leading-snug">
          {entry.name}
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {entry.niche.slice(0, 4).map((n) => (
              <TagBadge key={`n-${n}`}>{n}</TagBadge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {entry.audience.map((a) => (
              <TagBadge key={`a-${a}`}>{a}</TagBadge>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            {entry.why_follow}
          </p>
          <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
            Style: {entry.style_notes}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
            Cadence: {entry.post_cadence.replace(/-/g, " ")}
          </p>
          {entry.verification_note && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-600">
              {entry.verification_note}
            </p>
          )}
          {entry.secondary_platforms && entry.secondary_platforms.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground/80">
              <Globe className="h-3 w-3" />
              Also on: {entry.secondary_platforms.join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full gap-1.5 sm:w-auto sm:flex-1"
          >
            <Link to={`/profiles/${encodeURIComponent(entry.id)}`}>
              <Eye className="h-3.5 w-3.5" />
              Details
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="w-full gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 sm:w-auto sm:flex-1"
          >
            <a
              href={entry.platform_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View profile
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdvisorProfiles() {
  const [search, setSearch] = useState("");
  const [platforms, setPlatforms] = useState<Set<AdvisorPlatform>>(new Set());
  const [companies, setCompanies] = useState<Set<string>>(new Set());
  const [audiences, setAudiences] = useState<Set<string>>(new Set());
  const [niches, setNiches] = useState<Set<string>>(new Set());

  const togglePlatform = (p: AdvisorPlatform) => {
    setPlatforms((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  const toggleCompany = (c: string) => {
    setCompanies((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
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
  const toggleNiche = (n: string) => {
    setNiches((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const clearFilters = () => {
    setPlatforms(new Set());
    setCompanies(new Set());
    setAudiences(new Set());
    setNiches(new Set());
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (platforms.size > 0 && !platforms.has(e.platform)) return false;
      if (companies.size > 0) {
        const key = (e.company as string | undefined) ?? COMPANY_NONE;
        if (!companies.has(key)) return false;
      }
      if (audiences.size > 0 && !e.audience.some((a) => audiences.has(a)))
        return false;
      if (niches.size > 0 && !e.niche.some((n) => niches.has(n))) return false;
      if (q.length > 0) {
        const haystack = (
          e.name +
          " " +
          e.handle +
          " " +
          (e.company ?? "") +
          " " +
          e.niche.join(" ") +
          " " +
          e.style_notes +
          " " +
          e.why_follow
        ).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [search, platforms, companies, audiences, niches]);

  const activeFilterCount =
    platforms.size +
    companies.size +
    audiences.size +
    niches.size +
    (search.trim() ? 1 : 0);

  return (
    <div className="space-y-5">
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Profiles to follow
          </CardTitle>
          <CardDescription>
            Curated SG-based financial advisors and personal-finance creators
            worth following for client-attracting content inspiration. Same bar
            as the inspiration cards: a 28yo working pro, 35yo new parent, or
            55yo pre-retiree should find value in their feeds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="advisor-search"
              className="flex items-center gap-1.5"
            >
              <Search className="h-3.5 w-3.5" /> Search
            </Label>
            <Input
              id="advisor-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search names, handles, niches, style (e.g. CPF, retirement, carousel)"
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
              Company
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_OPTIONS.map((c) => (
                <Chip
                  key={c}
                  active={companies.has(c as string)}
                  onClick={() => toggleCompany(c as string)}
                >
                  {c}
                </Chip>
              ))}
              <Chip
                active={companies.has(COMPANY_NONE)}
                onClick={() => toggleCompany(COMPANY_NONE)}
              >
                No company set
              </Chip>
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
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Niche
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {NICHE_OPTIONS.map((n) => (
                <Chip
                  key={n}
                  active={niches.has(n)}
                  onClick={() => toggleNiche(n)}
                >
                  {n}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {ENTRIES.length} profiles
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
            No profiles match those filters yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => (
            <AdvisorCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
