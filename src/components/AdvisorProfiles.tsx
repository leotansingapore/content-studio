import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { FilterChip as Chip } from "@/components/ui/filter-chip";
import { ToastAction } from "@/components/ui/toast";
import PriceChip from "@/components/PriceChip";
import { humanLabel } from "@/lib/utils";
import { NICHE_GROUPS, inNicheGroups, nicheGroup } from "@/lib/nicheGroups";
import { links } from "@/lib/links";
import { toggled, useUrlLabels, useUrlFlag, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  CAP_LINE, FIT_CHIP, FOLLOW_ONLY, fitHash, fitInput, fitRun, followButton, followable, loadFit, onFitRun, runFit, sortByAudience, sortByFit,
} from "@/lib/creatorFit";
import { MAX_FOLLOWED, checkCapped, checkFailure, followAccount, isChecking, loadFollowing, onFollowing, sameAccount } from "@/lib/following";
import { loadPositioning } from "@/lib/positioning";
import { personalTargetFromPositioning } from "@/lib/postInsights";
import { useLeoUser } from "@/lib/useLeoOnly";
import { normalizeHandle } from "../../supabase/functions/_shared/socialAudit.ts";
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
  ChevronDown,
  Bookmark,
  Check,
  UserPlus,
} from "lucide-react";
import advisorsData from "@/data/advisors.json";
import { supabase } from "@/lib/supabase";
import {
  loadSaved,
  toggleSaved,
  isSaved,
  type SavedItems,
} from "@/lib/savedItems";

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
  // 1 = individual financial advisor, 2 = finance creator / media, 3 = firm / platform
  tier?: number;
};

const TIER_ORDER = [1, 2, 3];

const TIER_META: Record<number, { label: string }> = {
  1: { label: "Financial advisors" },
  2: { label: "Finance creators & media" },
  3: { label: "Firms & institutions" },
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
// In links as their slugs: ?company=great-eastern,none
const COMPANY_KEYS: string[] = [...COMPANY_OPTIONS, COMPANY_NONE];

const AUDIENCE_OPTIONS = Array.from(
  new Set(ENTRIES.flatMap((e) => e.audience)),
).sort();

const IN_DATA = new Set(ENTRIES.flatMap((e) => e.niche.map(nicheGroup)));
const NICHE_OPTIONS = NICHE_GROUPS.map((g) => g.label).filter((l) => IN_DATA.has(l));

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

// One neutral style for every company: brand-like colours read as an insurer's endorsement.
function CompanyBadge({ company }: { company: AdvisorCompany }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-secondary-foreground">
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

/**
 * Leo's Follow on a creator's card or page (find-creators): the account joins Following and its first check starts
 * outside React, so the button reads "Following" at once. Followed, it links to Following; the line under it says
 * when the check was refused by today's cap or failed (private, missing).
 */
export function FollowButton({
  entry,
  userId,
  left,
  where,
  main = false,
}: {
  entry: AdvisorEntry;
  userId: string;
  left: number | null;
  where: "card" | "page";
  main?: boolean;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [, tick] = useState(0);
  useEffect(() => onFollowing(() => tick((n) => n + 1)), []);
  const handle = followable(entry.platform) ? normalizeHandle(entry.platform, entry.handle) : null;
  const account = handle && followable(entry.platform) ? { platform: entry.platform, handle } : null;
  const followed = Boolean(account && loadFollowing(userId).some((a) => sameAccount(a, account)));
  const b = followButton(entry.platform, {
    leo: true,
    where,
    followed,
    capped: account ? checkCapped(account) : false,
    failure: account ? checkFailure(account) : null,
  });
  if (!b) return null;
  const openFollowing = (
    <ToastAction altText="Open Following" onClick={() => navigate(links.following())}>
      Open Following
    </ToastAction>
  );
  const follow = () => {
    if (!account) return;
    const r = followAccount(userId, account.platform, account.handle);
    if (r === "added") toast({ title: `Following @${account.handle}. Their newest posts load in a minute.`, action: openFollowing });
    if (r === "full") toast({ title: `You can follow up to ${MAX_FOLLOWED} accounts`, description: "Remove one first.", variant: "destructive", action: openFollowing });
    tick((n) => n + 1);
  };
  const size = where === "page" ? "lg" : "sm";
  const wide = where === "page" ? "w-full sm:w-auto" : "";
  const failed = b.reason !== null && b.reason !== FOLLOW_ONLY && b.reason !== CAP_LINE;
  return (
    <div className="space-y-1">
      {/* on a creator's page the chip goes under Follow, so Open profile sits right beside it */}
      <div className={where === "page" ? "flex flex-col gap-1 sm:items-start" : "flex flex-wrap items-center gap-x-2 gap-y-1"}>
        {b.label === "Following" ? (
          <Button asChild variant="outline" size={size} className={`gap-1.5 ${wide}`}>
            <Link to={links.following()}>
              <Check className="h-3.5 w-3.5" /> Following
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant={main ? "default" : "outline"}
            size={size}
            disabled={b.disabled}
            onClick={follow}
            className={`gap-1.5 ${wide} ${main ? "bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95" : ""}`}
          >
            <UserPlus className="h-3.5 w-3.5" /> Follow
          </Button>
        )}
        {b.label === "Follow" && !b.disabled && <PriceChip feature="track-accounts" left={left} />}
      </div>
      {b.reason && <p className={`text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>{b.reason}</p>}
    </div>
  );
}

function AdvisorCard({
  entry,
  saved,
  onToggleSave,
  follow,
  goodFit = false,
}: {
  entry: AdvisorEntry;
  saved?: boolean;
  onToggleSave?: () => void;
  /** Leo only: Follow on an Instagram or TikTok card. */
  follow?: { userId: string; left: number | null };
  /** Leo's Best for you: Jev rated this creator at FIT_CHIP or above. */
  goodFit?: boolean;
}) {
  const { toast } = useToast();
  const { search } = useLocation();

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

  const buttons = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="w-full gap-1.5 sm:w-auto sm:flex-1 [@media(pointer:coarse)]:h-11"
      >
        <Link to={links.profile(entry.id)} state={{ back: `/profiles${search}` }}>
          <Eye className="h-3.5 w-3.5" />
          Details
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        className="w-full gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 sm:w-auto sm:flex-1 [@media(pointer:coarse)]:h-11"
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
  );

  return (
    <Card className="flex h-full flex-col border-border/60 shadow-card transition-all hover:border-primary/40 hover:shadow-elegant">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <PlatformBadge platform={entry.platform} />
            {entry.company && <CompanyBadge company={entry.company} />}
            {entry.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <CheckCircle2 className="h-3 w-3" /> Verified {entry.last_checked}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Unverified - check activity
              </span>
            )}
            {goodFit && (
              <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                Good fit for you
              </span>
            )}
          </div>
          {onToggleSave && (
            <button
              type="button"
              onClick={onToggleSave}
              aria-label={saved ? "Remove bookmark" : "Save creator"}
              title={saved ? "Saved to your Playbook" : "Save creator"}
              className={`-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors [@media(pointer:coarse)]:-mr-3 [@media(pointer:coarse)]:-mt-3 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${
                saved ? "text-primary" : "text-muted-foreground hover:text-primary"
              }`}
            >
              <Bookmark className={`h-4 w-4 ${saved ? "fill-primary/20" : ""}`} />
            </button>
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border sm:h-6 sm:w-6 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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
              <TagBadge key={`n-${n}`}>{humanLabel(n)}</TagBadge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {entry.audience.map((a) => (
              <TagBadge key={`a-${a}`}>{humanLabel(a)}</TagBadge>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            {entry.why_follow}
          </p>
          <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
            Style: {entry.style_notes}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Cadence: {humanLabel(entry.post_cadence)}
          </p>
          {entry.verification_note && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-700">
              {entry.verification_note}
            </p>
          )}
          {entry.secondary_platforms && entry.secondary_platforms.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
              <Globe className="h-3 w-3" />
              Also on: {entry.secondary_platforms.join(", ")}
            </p>
          )}
        </div>
        {follow ? (
          // Leo's Follow sits above the card's two buttons, in one block so the card keeps them at its foot
          <div className="space-y-2">
            <FollowButton entry={entry} userId={follow.userId} left={follow.left} where="card" />
            {buttons}
          </div>
        ) : (
          buttons
        )}
      </CardContent>
    </Card>
  );
}

const PAGE_SIZE = 12;

export default function AdvisorProfiles() {
  // Search, chips and Saved live in the URL (docs/deep-links.md), so a filtered list can be linked.
  const [search, setSearch] = useUrlSearch("q");
  const [platformList, setPlatforms] = useUrlLabels("platform", PLATFORM_OPTIONS);
  const [companyList, setCompanies] = useUrlLabels("company", COMPANY_KEYS);
  const [audienceList, setAudiences] = useUrlLabels("audience", AUDIENCE_OPTIONS);
  const [nicheList, setNiches] = useUrlLabels("niche", NICHE_OPTIONS);
  const [savedOnly, setSavedOnly] = useUrlFlag("saved");
  const update = useUrlUpdate();
  const platforms = new Set(platformList);
  const companies = new Set<string>(companyList);
  const audiences = new Set(audienceList);
  const niches = new Set(nicheList);
  // A link that names a filter behind the Filters button opens them.
  const [showFilters, setShowFilters] = useState(() => platformList.length + audienceList.length + nicheList.length > 0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedItems>({
    inspiration: [],
    creators: [],
    topPosts: [],
  });

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setSaved(loadSaved(id));
    });
    return () => {
      active = false;
    };
  }, []);

  // Leo only (find-creators): Follow on the cards, and Best for you with a Plan positioning (?sort=for-you)
  const leo = useLeoUser();
  const plan = useMemo(() => (leo ? loadPositioning(leo.id) : null), [leo]);
  const hasPlan = Boolean(personalTargetFromPositioning(plan));
  const [sort, setSort] = useUrlState<string>("sort", "", { allowed: leo && hasPlan ? ["for-you"] : [] });
  const forYou = Boolean(leo && plan && sort === "for-you");
  const input = useMemo(() => (leo && forYou ? fitInput(leo.id, plan) : null), [leo, plan, forYou]);
  const hash = input ? fitHash(input) : "";
  const [, tick] = useState(0);
  useEffect(() => onFitRun(() => tick((n) => n + 1)), []);
  useEffect(() => onFollowing(() => tick((n) => n + 1)), []);
  // cached for 7 days per brand input; a run already made in this tab (done, capped or failed) is not repeated
  useEffect(() => {
    if (leo && input && !loadFit(leo.id, hash) && !fitRun(hash)) void runFit(leo.id, input, ENTRIES);
  }, [leo, input, hash]);
  const run = forYou ? fitRun(hash) : null;
  const fit = (leo && forYou ? loadFit(leo.id, hash) : null) ?? (run?.state === "done" ? run.fit : null);
  // Leo's price chips read today's uses once, and again when a follow's first check ends
  const anyChecking = leo ? loadFollowing(leo.id).some(isChecking) : false;
  const left = useUsesLeft(!leo || anyChecking)("track-accounts");

  const handleToggleSave = (id: string) => {
    if (!userId) return;
    setSaved(toggleSaved(userId, "creators", id));
  };

  const togglePlatform = (p: AdvisorPlatform) => setPlatforms(toggled(platformList, p));
  const toggleCompany = (c: string) => setCompanies(toggled<string>(companyList, c));
  const toggleAudience = (a: string) => setAudiences(toggled(audienceList, a));
  const toggleNiche = (n: string) => setNiches(toggled(nicheList, n));

  const clearFilters = () => {
    setSearch("");
    update({ q: null, platform: null, company: null, audience: null, niche: null, saved: null });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (savedOnly && !saved.creators.includes(e.id)) return false;
      if (platforms.size > 0 && !platforms.has(e.platform)) return false;
      if (companies.size > 0) {
        const key = (e.company as string | undefined) ?? COMPANY_NONE;
        if (!companies.has(key)) return false;
      }
      if (audiences.size > 0 && !e.audience.some((a) => audiences.has(a)))
        return false;
      if (!inNicheGroups(e.niche, niches)) return false;
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
    // The Sets are rebuilt every render, so the memo keys on the URL lists they come from.
  }, [search, platformList.join(), companyList.join(), audienceList.join(), nicheList.join(), savedOnly, saved.creators]);

  const activeFilterCount =
    platforms.size +
    companies.size +
    audiences.size +
    niches.size +
    (search.trim() ? 1 : 0);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, platformList.join(), companyList.join(), audienceList.join(), nicheList.join(), sort]);

  // Best for you: Jev's order, data order while it runs, the Plan's audience first when there is no answer
  const ordered = !forYou || !plan ? filtered : fit ? sortByFit(filtered, fit) : !run || run.state === "working" ? filtered : sortByAudience(filtered, plan.audience);
  const visible = ordered.slice(0, visibleCount);
  const remaining = ordered.length - visible.length;
  const cardProps = (entry: AdvisorEntry) =>
    leo ? { follow: { userId: leo.id, left }, goodFit: Boolean(fit && (fit[entry.id] ?? 0) >= FIT_CHIP) } : {};

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Creators to follow
        </h1>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-5">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="advisor-search"
                aria-label="Search creators"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search names, handles, niches (e.g. CPF, retirement)"
                className="pl-9 [@media(pointer:coarse)]:h-11"
              />
            </div>
            <Button
              variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className="shrink-0 gap-1.5 [@media(pointer:coarse)]:h-11"
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

          {/* Company is the axis consultants care about most, so keep it up top. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {COMPANY_OPTIONS.map((c) => (
              <Chip
                key={c}
                active={companies.has(c as string)}
                onClick={() => toggleCompany(c as string)}
              >
                {c}
              </Chip>
            ))}
            <Chip active={companies.has(COMPANY_NONE)} onClick={() => toggleCompany(COMPANY_NONE)}>
              No company
            </Chip>
            <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
            <Chip active={savedOnly} onClick={() => setSavedOnly(!savedOnly)} count={saved.creators.length > 0 ? saved.creators.length : undefined}>
              <Bookmark className="h-3 w-3" /> Saved
            </Chip>
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
                      {humanLabel(a)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {leo && hasPlan && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
                  <span className="font-semibold text-muted-foreground">Sort</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="h-full bg-transparent font-medium text-foreground outline-none"
                    aria-label="Sort"
                  >
                    <option value="">By type</option>
                    <option value="for-you">Best for you</option>
                  </select>
                </label>
                {forYou && !fit && run?.state === "working" && <span className="text-xs text-muted-foreground" aria-live="polite">Sorting by fit...</span>}
                {forYou && !fit && run?.state === "capped" && <span className="text-xs text-muted-foreground">Sorted by audience until 8am.</span>}
                {forYou && !fit && run?.state === "failed" && leo && input && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void runFit(leo.id, input, ENTRIES)}>
                    Try again
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {filtered.length} creator{filtered.length === 1 ? "" : "s"}
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
            {savedOnly && saved.creators.length === 0 ? (
              <>
                Nothing saved yet. Tap the bookmark on any creator to keep it here.{" "}
                <button
                  type="button"
                  onClick={() => setSavedOnly(false)}
                  className="font-semibold text-primary hover:underline"
                >
                  Show all creators
                </button>
              </>
            ) : (
              <>
                No creators match those filters.{" "}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="font-semibold text-primary hover:underline"
                >
                  Clear filters
                </button>{" "}
                to see them all.
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Best for you is one ranked list; otherwise the three tier sections */}
          {forYou ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((entry) => (
                <AdvisorCard
                  key={entry.id}
                  entry={entry}
                  saved={isSaved(saved, "creators", entry.id)}
                  onToggleSave={() => handleToggleSave(entry.id)}
                  {...cardProps(entry)}
                />
              ))}
            </div>
          ) : TIER_ORDER.map((tier) => {
            const group = visible.filter((e) => (e.tier ?? 2) === tier);
            if (group.length === 0) return null;
            const meta = TIER_META[tier];
            return (
              <section key={tier} className="space-y-3">
                <div className="border-b border-border/60 pb-1.5">
                  <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
                    {meta.label}
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((entry) => (
                    <AdvisorCard
                  key={entry.id}
                  entry={entry}
                  saved={isSaved(saved, "creators", entry.id)}
                  onToggleSave={() => handleToggleSave(entry.id)}
                  {...cardProps(entry)}
                />
                  ))}
                </div>
              </section>
            );
          })}
          {remaining > 0 && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="gap-1.5 [@media(pointer:coarse)]:h-11"
              >
                <ChevronDown className="h-4 w-4" />
                Show {Math.min(PAGE_SIZE, remaining)} more
                <span className="text-muted-foreground">({remaining} left)</span>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
