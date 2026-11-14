import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon, CaretDownIcon, BookmarkSimpleIcon, FunnelIcon, PlusIcon } from "@phosphor-icons/react";
import ReelCard from "@/components/ReelCard";
import IndustryNews from "@/components/IndustryNews";
import AdsSwipe from "@/components/AdsSwipe";
import ViralSearch from "@/components/ViralSearch";
import { ADS, ADS_FETCHED } from "@/lib/adsSwipe";
import YourFeeds from "@/components/YourFeeds";
import Mentions from "@/components/Mentions";
import { NEWS } from "@/lib/industryNews";
import PostDetailDrawer from "@/components/PostDetailDrawer";
import { InfoTip } from "@/components/ui/info-tip";
import { withParam, useGoneItem, useShownCount, useUrlFlag, useUrlItem, useUrlLabel, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { FilterChip as Chip } from "@/components/ui/filter-chip";
import { supabase } from "@/lib/supabase";
import { loadSaved, toggleSaved } from "@/lib/savedItems";
import { loadCompetitors, onCompetitorsChanged } from "@/lib/competitors";
import { loadPositioning } from "@/lib/positioning";
import { links } from "@/lib/links";
import { adviserBrand } from "@/lib/profession";
import { useLeoUser } from "@/lib/useLeoOnly";
import { getAllTopPosts, TOTAL_TOP_POSTS, generatorFormat, creatorKind } from "@/lib/topPosts";
import {
  enrich,
  buildCreatorAverages,
  sortPosts,
  formatsWorkingNow,
  personalTargetFromPositioning,
  TOPICS,
  ANGLES,
  AUDIENCES,
  SORTS,
  type ScoredPost,
  type SortKey,
} from "@/lib/postInsights";

// Leo's ads tab (the ad library and its drawer), For you and Hooks: chunks of their own, so nobody else downloads them.
const AdLibrary = lazy(() => import("@/components/AdLibrary"));
const ForYou = lazy(() => import("@/components/swipe/ForYou"));
const HookBank = lazy(() => import("@/components/swipe/HookBank"));
const AppsLikeYours = lazy(() => import("@/components/swipe/AppsLikeYours"));

// Static data → enrich once at module load.
const ALL = getAllTopPosts();
const AVERAGES = buildCreatorAverages(ALL);
const ENRICHED: ScoredPost[] = ALL.map((post) => ({ post, insight: enrich(post, AVERAGES) }));
// Leo's labels prefer Jev's tags from the drop (angle and topic cut measured at 0.5); everyone else keeps the keyword rules.
const tagged = (): ScoredPost[] => ALL.map((post) => ({ post, insight: enrich(post, AVERAGES, { useTags: true }) }));
const ADVISOR_COUNT = new Set(ALL.map((p) => p.handle)).size;

const FORMAT_CHIPS = [
  { value: "all", label: "All" },
  { value: "short-video", label: "Reels" },
  { value: "carousel", label: "Carousels" },
  { value: "text-post", label: "Single posts" },
];

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "advisor", label: "Advisors" },
  { value: "influencer", label: "Influencers" },
];

const PAGE_SIZE = 12;

type Tab = "posts" | "foryou" | "news" | "ads" | "search" | "hooks" | "similar";
// the one line under the h1 (an adviser brand keeps its finance creators line instead)
const SUBTITLE: Partial<Record<Tab, string>> = {
  similar: "How apps and creators like yours post on Instagram and TikTok",
  foryou: "Posts and ads that fit what your brand sells",
  news: "Stories from your feeds and the names you watch",
  ads: "What your competitors and brands in your space run on Meta",
  search: "TikTok and YouTube videos that beat their account's size",
  hooks: "Hook formulas and the real opening lines that used them",
};
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
// Leo's tabs (phase 2): a link naming one waits for the session rather than flashing Top posts first.
const LEO_TABS = ["search", "foryou", "hooks", "similar"];

const postKey = (p: ScoredPost) => p.post.advisorId + "-" + p.post.shortCode;

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full max-w-[9rem] bg-transparent font-medium text-foreground outline-none"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SwipeFilePage() {
  // Tab, search, filters, sort and the open post live in the URL (docs/deep-links.md).
  const leo = useLeoUser();
  // Leo's ads tab counts his whole library (competitors, your space, the drop), counted again when a store changes.
  // Imported only for him, so nobody else downloads the library's code; null until it is read.
  const [leoAds, setLeoAds] = useState<number | null>(null);
  useEffect(() => {
    if (!leo) return;
    let live = true;
    let offs: (() => void)[] = [];
    void Promise.all([import("@/lib/adLibrary"), import("@/lib/competitorAds")]).then(([lib, comp]) => {
      if (!live) return;
      const count = () => setLeoAds(lib.loadLibrary(leo.id).length);
      count();
      offs = [comp.onCompetitorAdsChanged(count), lib.onSpaceAdsChanged(count)];
    });
    return () => {
      live = false;
      offs.forEach((off) => off());
    };
  }, [leo]);
  const adsTab = ADS.length > 0 || Boolean(leo && leoAds);
  // the header's "Your competitors N": /competitors is Leo's, so only his sign-ins read the brand's list
  const [rivalsRead, rereadRivals] = useState(0);
  useEffect(() => onCompetitorsChanged(() => rereadRivals((n) => n + 1)), []);
  const rivals = useMemo(() => (leo ? loadCompetitors(leo.id).list.length : 0), [leo, rivalsRead]);
  // Top posts and the Singapore ads are Singapore personal finance: another brand's page opens on News, and its ads
  // tab opens only from a link (Leo's ads tab is his own library and stays). Leo's open on Apps like yours there, and
  // an adviser brand offers it as a tab too (Leo 1 Nov: competitor accounts for any brand).
  const adviser = adviserBrand();
  const similarTab = Boolean(leo);
  const [tab] = useUrlState<Tab>("tab", adviser ? "posts" : similarTab ? "similar" : "news", {
    allowed: [
      ...(adsTab ? (["news", "ads"] as const) : (["news"] as const)), ...(leo ? (["foryou", "search", "hooks"] as const) : []),
      ...(similarTab ? (["similar"] as const) : []),
    ],
  });
  const isLeo = Boolean(leo);
  const enriched = useMemo(() => (isLeo ? tagged() : ENRICHED), [isLeo]);
  // Leo's six tabs scroll sideways on a phone: keep the open one in view (the bar only, never the page)
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = () => {
      const bar = tabsRef.current;
      const on = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!bar || !on || bar.scrollWidth <= bar.clientWidth) return;
      if (on.offsetLeft < bar.scrollLeft || on.offsetLeft + on.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = on.offsetLeft - 8;
    };
    show();
    // the labels widen once the web font arrives
    void document.fonts?.ready.then(show);
  }, [tab, leo]);
  const update = useUrlUpdate();
  // Each tab has its own search and filters, so a tab switch starts them clean in one write.
  const setTab = (t: Tab) =>
    update({
      tab: t === "posts" ? null : t, q: null, format: null, from: null, topic: null, angle: null, audience: null, sort: null, saved: null, post: null,
      industry: null, story: null, ad: null, kind: null, hidden: null, scope: null, hook: null, running: null, run: null, platform: null, emotion: null,
      posted: null, why: null, formula: null, f: null,
    });
  const [userId, setUserId] = useState<string | null>(null);
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [hasPlaybook, setHasPlaybook] = useState(false);

  const [search, setSearch] = useUrlSearch("q");
  const [format, setFormat] = useUrlState("format", "all", { allowed: FORMAT_CHIPS.map((c) => c.value) });
  const [kind, setKind] = useUrlState("from", "all", { allowed: KIND_OPTIONS.map((k) => k.value) });
  const [topicLabel, setTopicLabel] = useUrlLabel("topic", TOPICS);
  const [angleLabel, setAngleLabel] = useUrlLabel("angle", ANGLES);
  const [audienceLabel, setAudienceLabel] = useUrlLabel("audience", AUDIENCES);
  const topic: string = topicLabel ?? "all";
  const angle: string = angleLabel ?? "all";
  const audience: string = audienceLabel ?? "all";
  const setTopic = (v: string) => setTopicLabel(TOPICS.find((t) => t === v) ?? null);
  const setAngle = (v: string) => setAngleLabel(ANGLES.find((a) => a === v) ?? null);
  const setAudience = (v: string) => setAudienceLabel(AUDIENCES.find((a) => a === v) ?? null);
  // Best for you is the default once a Playbook exists; a link's sort wins either way.
  const [sort, setSort] = useUrlState<SortKey>("sort", hasPlaybook ? "for-you" : "engagement", {
    allowed: SORTS.map((x) => x.value).filter((v) => hasPlaybook || v !== "for-you"),
  });
  const [savedOnly, setSavedOnly] = useUrlFlag("saved");
  // A link that names a filter behind the Filters button opens them.
  const [showFilters, setShowFilters] = useState(() => [kind, topic, angle, audience].some((v) => v !== "all"));
  const [openKey, openPost, closePost] = useUrlItem("post");
  const { search: here } = useLocation();
  // ads waits too: Leo's library replaces the Singapore picks, so they never flash first, and with no picks it
  // waits for his library's count
  const linkedTab = new URLSearchParams(here).get("tab") ?? "";
  const leoTabLoading = (leo === undefined && [...LEO_TABS, "ads"].includes(linkedTab)) || (Boolean(leo) && leoAds === null && !ADS.length && linkedTab === "ads");

  const target = useMemo(
    () => (userId ? personalTargetFromPositioning(loadPositioning(userId)) : null),
    [userId],
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setSavedSet(new Set(loadSaved(id).topPosts));
      setHasPlaybook(Boolean(personalTargetFromPositioning(loadPositioning(id))));
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleSave = (key: string) => {
    if (!userId) return;
    const next = toggleSaved(userId, "topPosts", key);
    setSavedSet(new Set(next.topPosts));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = enriched.filter(({ post, insight }) => {
      if (savedOnly && !savedSet.has(postKey({ post, insight }))) return false;
      if (kind !== "all" && creatorKind(post.tier) !== kind) return false;
      if (format !== "all" && generatorFormat(post) !== format) return false;
      if (topic !== "all" && insight.topic !== topic) return false;
      if (angle !== "all" && insight.angle !== angle) return false;
      if (audience !== "all" && !insight.audiences.includes(audience as never)) return false;
      if (q) {
        const hay = `${post.advisorName} ${post.handle} ${post.caption} ${post.idea?.hook ?? ""} ${post.idea?.why ?? ""} ${insight.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortPosts(items, sort, {
      averages: AVERAGES,
      now: Date.now(),
      target,
    });
  }, [enriched, search, format, kind, topic, angle, audience, sort, savedOnly, savedSet, target]);

  // Show more lives in the address (?shown=), so Back from a post returns to the same spot; a new filter starts over
  // the sort as the address has it: its default changes once the Playbook loads, which is not a new filter
  const [visible, showMore] = useShownCount(PAGE_SIZE, [search, format, kind, topic, angle, audience, new URLSearchParams(here).get("sort"), savedOnly].join("|"));

  const working = useMemo(
    () =>
      formatsWorkingNow(
        kind === "all" ? enriched : enriched.filter((x) => creatorKind(x.post.tier) === kind),
        Date.now(),
      ),
    [enriched, kind],
  );

  const activeFilters = [kind, topic, angle, audience].filter((v) => v !== "all").length;
  const clearFilters = () => {
    setSearch("");
    update({ q: null, format: null, from: null, topic: null, angle: null, audience: null, saved: null });
  };
  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;
  const openItem = openKey ? enriched.find((p) => postKey(p) === openKey) ?? null : null;
  // The posts are bundled, so an id that is not among them is gone: open the page without it, saying so. Apps like
  // yours checks its own ?post=.
  useGoneItem("post", tab === "similar" ? undefined : !!openItem);

  const tabs = [
    ...(adviser ? [{ id: "posts" as const, label: "Posts", n: TOTAL_TOP_POSTS }] : []),
    ...(similarTab ? [{ id: "similar" as const, label: "Apps like yours", n: null }] : []),
    ...(leo ? [{ id: "foryou" as const, label: "For you", n: null }] : []),
    adviser ? { id: "news" as const, label: "Industry news", n: NEWS.length } : { id: "news" as const, label: "News", n: null },
    // Hidden until the first weekly ads drop lands, rather than a tab that opens on nothing; Leo's counts his library.
    ...(adsTab && (adviser || leo) ? [{ id: "ads" as const, label: "Ads", n: leo ? (leoAds ?? ADS.length) : ADS.length }] : []),
    ...(leo ? [{ id: "search" as const, label: "Search", n: null }, { id: "hooks" as const, label: "Hooks", n: null }] : []),
  ];
  // another brand's page is whichever tab is open (Leo's open on Apps like yours; everyone else has News alone)
  // Leo's ad library is its own screen, so it never reads "Top posts to swipe"; an adviser's other tabs keep that heading
  const adsHead = !!leo && tab === "ads";
  const heading = adsHead ? "Ads" : adviser ? "Top posts to swipe" : tabs.find((t) => t.id === tab)?.label ?? "News";
  const title = adsHead ? "Ads" : adviser ? "Top posts" : heading;
  const subtitle = adviser && !adsHead ? `Real high-performing posts from ${ADVISOR_COUNT} SG finance creators.` : tabs.some((t) => t.id === tab) ? SUBTITLE[tab] : undefined;
  useEffect(() => {
    document.title = `${title} - Postmosis`;
    return () => {
      document.title = "Postmosis";
    };
  }, [title]);

  // the Posts tab's sort: beside Filters from sm up, with the count on a phone
  const sortPick = (
    <FilterSelect
      label="Sort"
      value={sort}
      onChange={(v) => setSort(v as SortKey)}
      options={SORTS.filter((s) => hasPlaybook || s.value !== "for-you").map((s) => ({ value: s.value, label: s.label }))}
    />
  );

  return (
    <div className="space-y-5">
      {/* Radar's header: the title and one line, the competitor buttons on the right (under it on a phone). Outlined, so
          each tab's own action stays the one filled button (law 7) */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{heading}</h1>
          {subtitle && <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {leo && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" className={`h-10 rounded-full ${TOUCH}`}>
              <Link to={links.competitors({ view: "list" })}>Your competitors <span className="tabular-nums text-muted-foreground">{rivals}</span></Link>
            </Button>
            {/* /competitors opens with its add bar on top, so the list is the add state */}
            <Button asChild variant="outline" className={`h-10 gap-1.5 rounded-full ${TOUCH}`}>
              <Link to={links.competitors({ view: "list" })}><PlusIcon className="h-4 w-4" aria-hidden />Add competitor</Link>
            </Button>
          </div>
        )}
      </header>

      {tabs.length > 1 && <div
        ref={tabsRef}
        role="tablist"
        aria-label="Swipe file"
        // underline tabs, as Ideas draws them: the section's own tab row above is the only row of pills (law 16)
        className={`flex w-full border-b border-border/60 ${leo ? "scrollbar-none relative max-w-full overflow-x-auto" : ""}`}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            // Leo's six tabs: on a phone each takes its own width and the bar scrolls; the counts wait for sm, so no label wraps
            className={`-mb-px min-h-10 border-b-2 text-sm font-medium transition-colors sm:flex-none [@media(pointer:coarse)]:min-h-11 ${
              leo ? "shrink-0 whitespace-nowrap px-3" : "flex-1 px-3 sm:px-4"
            } ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label} {t.n !== null && <span className={`text-xs text-muted-foreground ${leo ? "hidden sm:inline" : ""}`}>{t.n}</span>}
          </button>
        ))}
      </div>}

      {leoTabLoading ? (
        <div className="min-h-[40vh]" aria-busy="true" />
      ) : tab === "similar" && leo && similarTab ? (
        <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
          <AppsLikeYours userId={leo.id} />
        </Suspense>
      ) : tab === "search" && leo ? (
        <ViralSearch userId={leo.id} />
      ) : (tab === "foryou" || tab === "hooks") && leo ? (
        <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
          {tab === "foryou" ? <ForYou userId={leo.id} /> : <HookBank userId={leo.id} />}
        </Suspense>
      ) : tab === "ads" && leo ? (
        <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
          <AdLibrary userId={leo.id} />
        </Suspense>
      ) : tab === "ads" ? (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Paid ads running in Singapore</h2>
            <InfoTip label="About these ads">
              From the Meta Ad Library{ADS_FETCHED ? `, updated ${ADS_FETCHED}` : ""}. Borrow the structure, never the wording.
            </InfoTip>
          </div>
          <AdsSwipe />
        </section>
      ) : tab === "news" ? (
        <>
          {/* the bulletin's picks are Singapore personal-finance news: an adviser's brand only; feeds and mentions are anyone's */}
          {adviser && <section className="space-y-3">
            <div className="flex items-center gap-1.5">
              <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Industry news to talk about</h2>
              <InfoTip label="About industry news">The ActivityTracker bulletin's Industry picks, synced every morning.</InfoTip>
            </div>
            <IndustryNews />
          </section>}
          <YourFeeds />
          <Mentions />
        </>
      ) : (
        <>
          {/* Radar's order: search with Filters and Sort, then the chips, the count and the grid. What "Formats working
              now" showed rides on the format chips (each one's lift over the creator's usual), and its topic and angle
              rows open with Filters, beside the Topic and Angle pickers they narrow the same way (laws 1, 12). */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search ideas, captions, creators (e.g. CPF, objection, retirement)"
                  aria-label="Search top posts"
                  className="pl-9 [@media(pointer:coarse)]:h-11"
                />
              </div>
              <Button
                variant={showFilters || activeFilters > 0 ? "secondary" : "outline"}
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className="shrink-0 gap-1.5 [@media(pointer:coarse)]:h-11"
              >
                <FunnelIcon className="h-3.5 w-3.5" />
                Filters
                {activeFilters > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">{activeFilters}</span>
                )}
              </Button>
              <span className="hidden sm:inline-flex">{sortPick}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {FORMAT_CHIPS.map((f) => {
                const lift = working.posts >= 5 ? working.formats.find((w) => w.value === f.value) : undefined;
                return (
                  <Chip key={f.value} active={format === f.value} onClick={() => setFormat(format === f.value && f.value !== "all" ? "all" : f.value)}>
                    {f.label}
                    {lift && <span className="tabular-nums text-muted-foreground">{lift.ratio.toFixed(1)}x</span>}
                  </Chip>
                );
              })}
              {working.posts >= 5 && (
                <InfoTip label="About the format numbers">
                  Last {working.days} days: how each format does against its creator's usual engagement (1.0x).
                </InfoTip>
              )}
              <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
              <Chip active={savedOnly} onClick={() => setSavedOnly(!savedOnly)} count={savedSet.size > 0 ? savedSet.size : undefined}>
                <BookmarkSimpleIcon className="h-3 w-3" /> Saved
              </Chip>
            </div>

            {showFilters && (
              <div className="space-y-3 border-t border-border/60 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FilterSelect label="From" value={kind} onChange={setKind} options={KIND_OPTIONS} />
                  <FilterSelect
                    label="Topic"
                    value={topic}
                    onChange={setTopic}
                    options={[{ value: "all", label: "All" }, ...TOPICS.map((t) => ({ value: t, label: t }))]}
                  />
                  <FilterSelect
                    label="Angle"
                    value={angle}
                    onChange={setAngle}
                    options={[{ value: "all", label: "All" }, ...ANGLES.map((a) => ({ value: a, label: a }))]}
                  />
                  <FilterSelect
                    label="Audience"
                    value={audience}
                    onChange={setAudience}
                    options={[{ value: "all", label: "All" }, ...AUDIENCES.map((a) => ({ value: a, label: a }))]}
                  />
                </div>
                {working.posts >= 5 && [
                  { name: "Topics", items: working.topics, value: topic, set: setTopic },
                  { name: "Angles", items: working.angles, value: angle, set: setAngle },
                ].map(
                  (row) =>
                    row.items.length > 0 && (
                      <div key={row.name} className="scrollbar-none flex items-center gap-1.5 overflow-x-auto">
                        <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">{row.name} working</span>
                        {row.items.map((t) => (
                          <Chip
                            key={t.label}
                            active={row.value === t.label}
                            onClick={() => row.set(row.value === t.label ? "all" : t.label)}
                            count={t.posts}
                          >
                            {t.label}
                          </Chip>
                        ))}
                      </div>
                    ),
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-muted-foreground">
                {filtered.length} of {TOTAL_TOP_POSTS} posts
              </span>
              <span className="sm:hidden">{sortPick}</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="border-border/60 shadow-card">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                {savedOnly && savedSet.size === 0 ? (
                  <>
                    <p>No saved posts yet. Open a post and tap Save to keep it here.</p>
                    <Button variant="outline" size="sm" onClick={() => setSavedOnly(false)}>
                      Show all posts
                    </Button>
                  </>
                ) : (
                  <>
                    <p>No posts match those filters.</p>
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((item) => {
                  const key = postKey(item);
                  return <ReelCard key={key} item={item} href={`?${withParam(new URLSearchParams(here), "post", key)}`} />;
                })}
              </div>
              {remaining > 0 && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    onClick={() => showMore()}
                    className="gap-1.5 [@media(pointer:coarse)]:h-11"
                  >
                    <CaretDownIcon className="h-4 w-4" />
                    Show {Math.min(PAGE_SIZE, remaining)} more
                    <span className="text-muted-foreground">({remaining} left)</span>
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Leo: a search the hand-picked posts barely answer goes to TikTok and YouTube (a link, so nothing is spent here) */}
          {leo && search.trim() && filtered.length < 5 && (
            <p className="text-center text-sm">
              <Link to={links.swipe({ tab: "search", q: search })} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:inline-block [@media(pointer:coarse)]:py-3">
                {filtered.length ? `Only ${filtered.length}` : "None"} in the hand-picked posts. Search TikTok and YouTube for "{search.trim()}"
              </Link>
            </p>
          )}

          <PostDetailDrawer
            item={openItem}
            all={enriched}
            saved={openKey ? savedSet.has(openKey) : false}
            onToggleSave={() => openKey && toggleSave(openKey)}
            // A similar post replaces the open one, so Back still closes the drawer in one step.
            onOpen={(next) => update({ post: postKey(next) })}
            onClose={closePost}
          />

          <p className="pt-1 text-center text-xs text-muted-foreground">
            Need a hand turning one into your own?{" "}
            <Link to="/create-guide" className="font-semibold text-primary hover:underline">
              How to create it
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
