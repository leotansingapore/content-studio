import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, TrendingUp, ChevronDown, Bookmark, Filter } from "lucide-react";
import ReelCard from "@/components/ReelCard";
import IndustryNews from "@/components/IndustryNews";
import { NEWS } from "@/lib/industryNews";
import PostDetailDrawer from "@/components/PostDetailDrawer";
import { InfoTip } from "@/components/ui/info-tip";
import { FilterChip as Chip } from "@/components/ui/filter-chip";
import { supabase } from "@/lib/supabase";
import { loadSaved, toggleSaved } from "@/lib/savedItems";
import { loadPositioning } from "@/lib/positioning";
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

// Static data → enrich once at module load.
const ALL = getAllTopPosts();
const AVERAGES = buildCreatorAverages(ALL);
const ENRICHED: ScoredPost[] = ALL.map((post) => ({ post, insight: enrich(post, AVERAGES) }));
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
    <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs sm:h-8">
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
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "news" ? "news" : "posts";
  const setTab = (t: "posts" | "news") => {
    const next = new URLSearchParams(params);
    if (t === "news") next.set("tab", "news");
    else next.delete("tab");
    setParams(next, { replace: true });
  };
  const [userId, setUserId] = useState<string | null>(null);
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [hasPlaybook, setHasPlaybook] = useState(false);
  const [forYou, setForYou] = useState(false);

  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("all");
  const [kind, setKind] = useState("all");
  const [topic, setTopic] = useState("all");
  const [angle, setAngle] = useState("all");
  const [audience, setAudience] = useState("all");
  const [sort, setSort] = useState<SortKey>("engagement");
  const [savedOnly, setSavedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const target = useMemo(
    () => (userId ? personalTargetFromPositioning(loadPositioning(userId)) : null),
    [userId],
  );

  useEffect(() => {
    document.title = "Top posts - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setSavedSet(new Set(loadSaved(id).topPosts));
      const t = personalTargetFromPositioning(loadPositioning(id));
      setHasPlaybook(Boolean(t));
      setForYou(Boolean(t)); // default to personalised when a Playbook exists
    });
    return () => {
      active = false;
      document.title = "Content Studio";
    };
  }, []);

  const toggleSave = (key: string) => {
    if (!userId) return;
    const next = toggleSaved(userId, "topPosts", key);
    setSavedSet(new Set(next.topPosts));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = ENRICHED.filter(({ post, insight }) => {
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
      target: forYou ? target : null,
    });
  }, [search, format, kind, topic, angle, audience, sort, savedOnly, savedSet, forYou, target]);

  useEffect(() => setVisible(PAGE_SIZE), [search, format, kind, topic, angle, audience, sort, savedOnly, forYou]);

  const working = useMemo(
    () =>
      formatsWorkingNow(
        kind === "all" ? ENRICHED : ENRICHED.filter((x) => creatorKind(x.post.tier) === kind),
        Date.now(),
      ),
    [kind],
  );

  const activeFilters = [kind, topic, angle, audience].filter((v) => v !== "all").length;
  const clearFilters = () => {
    setSearch("");
    setFormat("all");
    setKind("all");
    setTopic("all");
    setAngle("all");
    setAudience("all");
    setSavedOnly(false);
  };
  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;
  const openItem = openKey ? ENRICHED.find((p) => postKey(p) === openKey) ?? null : null;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <TrendingUp className="h-6 w-6 text-primary" />
          Top posts to swipe
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Real high-performing posts from {ADVISOR_COUNT} SG finance creators.
        </p>
      </header>

      <div role="tablist" aria-label="Swipe file" className="flex w-full gap-1 rounded-lg border border-border/60 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
        {[
          { id: "posts" as const, label: "Top posts", n: TOTAL_TOP_POSTS },
          { id: "news" as const, label: "Industry news", n: NEWS.length },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} <span className="text-xs text-muted-foreground">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === "news" ? (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Industry news to talk about</h2>
            <InfoTip label="About industry news">The ActivityTracker bulletin's Industry picks, synced every morning.</InfoTip>
          </div>
          <IndustryNews />
        </section>
      ) : (
        <>
          {working.posts >= 5 && (
            <Card className="border-border/60 shadow-card">
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-foreground">Formats working now</h2>
                  <InfoTip label="About formats working now">
                    Last {working.days} days. 1.0x is the creator's usual engagement.
                  </InfoTip>
                  <span className="ml-auto text-xs text-muted-foreground">{working.posts} posts</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {working.formats.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFormat(format === f.value ? "all" : f.value)}
                      aria-pressed={format === f.value}
                      className={`flex min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                        format === f.value
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/60 bg-background hover:border-primary/40"
                      }`}
                    >
                      <span className="truncate text-[11px] font-medium text-muted-foreground">
                    {FORMAT_CHIPS.find((c) => c.value === f.value)?.label ?? f.label}
                  </span>
                      <span className="text-lg font-semibold leading-tight text-foreground">{f.ratio.toFixed(1)}x</span>
                      <span className="text-[11px] text-muted-foreground">{f.posts} posts</span>
                    </button>
                  ))}
                </div>
                {[
                  { name: "Topics", items: working.topics, value: topic, set: setTopic },
                  { name: "Angles", items: working.angles, value: angle, set: setAngle },
                ].map(
                  (row) =>
                    row.items.length > 0 && (
                      <div key={row.name} className="scrollbar-none flex items-center gap-1.5 overflow-x-auto">
                        <span className="w-14 shrink-0 text-xs font-semibold text-muted-foreground">{row.name}</span>
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
              </CardContent>
            </Card>
          )}

          {/* Filter bar: the same shape as Inspiration and Creators. Search and
              format stay out; who / topic / angle / audience fold behind Filters
              so the posts start above the fold on a phone. */}
          <Card className="border-border/60 shadow-card">
            <CardContent className="space-y-3 pt-5">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search ideas, captions, creators (e.g. CPF, objection, retirement)"
                    aria-label="Search top posts"
                    className="pl-9"
                  />
                </div>
                <Button
                  variant={showFilters || activeFilters > 0 ? "default" : "outline"}
                  onClick={() => setShowFilters((v) => !v)}
                  aria-expanded={showFilters}
                  className="shrink-0 gap-1.5"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {activeFilters > 0 && (
                    <span className="ml-0.5 rounded-full bg-background/30 px-1.5 text-[10px] font-bold">{activeFilters}</span>
                  )}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {FORMAT_CHIPS.map((f) => (
                  <Chip key={f.value} active={format === f.value} onClick={() => setFormat(f.value)}>
                    {f.label}
                  </Chip>
                ))}
                <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
                <Chip active={savedOnly} onClick={() => setSavedOnly((v) => !v)} count={savedSet.size > 0 ? savedSet.size : undefined}>
                  <Bookmark className="h-3 w-3" /> Saved
                </Chip>
              </div>

              {showFilters && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
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
              )}

              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  label="Sort"
                  value={sort}
                  onChange={(v) => setSort(v as SortKey)}
                  options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
                />
                {/* Personal ranking only changes these two sorts, so the switch shows only there. */}
                {hasPlaybook && (sort === "engagement" || sort === "trending") && (
                  <div className="inline-flex overflow-hidden rounded-full border border-border/60" role="group" aria-label="Rank for">
                    {[
                      { on: true, label: "For you" },
                      { on: false, label: "Everyone" },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => setForYou(o.on)}
                        aria-pressed={forYou === o.on}
                        className={`h-9 px-3 text-xs font-medium sm:h-8 ${forYou === o.on ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {filtered.length} of {TOTAL_TOP_POSTS} posts
                </span>
              </div>
            </CardContent>
          </Card>

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
                  return <ReelCard key={key} item={item} onOpen={() => setOpenKey(key)} />;
                })}
              </div>
              {remaining > 0 && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setVisible((c) => c + PAGE_SIZE)}
                    className="gap-1.5"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Show {Math.min(PAGE_SIZE, remaining)} more
                    <span className="text-muted-foreground">({remaining} left)</span>
                  </Button>
                </div>
              )}
            </>
          )}

          <PostDetailDrawer
            item={openItem}
            all={ENRICHED}
            saved={openKey ? savedSet.has(openKey) : false}
            onToggleSave={() => openKey && toggleSave(openKey)}
            onOpen={(next) => setOpenKey(postKey(next))}
            onClose={() => setOpenKey(null)}
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
