import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, TrendingUp, ChevronDown, Bookmark, Sparkles } from "lucide-react";
import TopPostCard from "@/components/TopPostCard";
import PostDetailDrawer from "@/components/PostDetailDrawer";
import { supabase } from "@/lib/supabase";
import { loadSaved, toggleSaved } from "@/lib/savedItems";
import { loadPositioning } from "@/lib/positioning";
import { getAllTopPosts, TOTAL_TOP_POSTS, generatorFormat } from "@/lib/topPosts";
import {
  enrich,
  buildCreatorAverages,
  sortPosts,
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

const PAGE_SIZE = 12;

const postKey = (p: ScoredPost) => p.post.advisorId + "-" + p.post.shortCode;

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
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

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
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[9rem] bg-transparent font-medium text-foreground outline-none"
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
  const [userId, setUserId] = useState<string | null>(null);
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [hasPlaybook, setHasPlaybook] = useState(false);
  const [forYou, setForYou] = useState(false);

  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("all");
  const [topic, setTopic] = useState("all");
  const [angle, setAngle] = useState("all");
  const [audience, setAudience] = useState("all");
  const [sort, setSort] = useState<SortKey>("engagement");
  const [savedOnly, setSavedOnly] = useState(false);
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
  }, [search, format, topic, angle, audience, sort, savedOnly, savedSet, forYou, target]);

  useEffect(() => setVisible(PAGE_SIZE), [search, format, topic, angle, audience, sort, savedOnly, forYou]);

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
          Real high-performing posts from {ADVISOR_COUNT} SG finance creators. Save the
          ones you like and remix any into your own — in your voice, for your audience.
        </p>
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {forYou && hasPlaybook
            ? "Showing content relevant to your audience & content pillars"
            : "Showing high-performing content relevant to Financial Advisors"}
        </p>
      </header>

      {/* Filter bar */}
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ideas, captions, creators (e.g. CPF, objection, retirement)"
              className="pl-9"
            />
          </div>

          {/* Format + saved + For You */}
          <div className="flex flex-wrap items-center gap-1.5">
            {FORMAT_CHIPS.map((f) => (
              <Chip key={f.value} active={format === f.value} onClick={() => setFormat(f.value)}>
                {f.label}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={() => setSavedOnly((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                savedOnly
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/60 bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Bookmark className="h-3 w-3" /> Saved{savedSet.size > 0 ? ` (${savedSet.size})` : ""}
            </button>
            {hasPlaybook && (
              <div className="inline-flex overflow-hidden rounded-full border border-border/60">
                <button
                  type="button"
                  onClick={() => setForYou(true)}
                  className={`px-3 py-1 text-xs font-medium ${forYou ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                >
                  For You
                </button>
                <button
                  type="button"
                  onClick={() => setForYou(false)}
                  className={`px-3 py-1 text-xs font-medium ${!forYou ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                >
                  All
                </button>
              </div>
            )}
          </div>

          {/* Topic / Angle / Audience / Sort */}
          <div className="flex flex-wrap items-center gap-2">
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
            <FilterSelect
              label="Sort"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
            />
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} of {TOTAL_TOP_POSTS} posts
            </span>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {savedOnly
              ? "No saved posts yet. Tap the bookmark on any card to build your swipe library."
              : "No posts match those filters."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((item) => {
              const key = postKey(item);
              return (
                <TopPostCard
                  key={key}
                  post={item.post}
                  insight={item.insight}
                  advisor={{ name: item.post.advisorName, handle: item.post.handle }}
                  showAdvisor
                  saved={savedSet.has(key)}
                  onToggleSave={userId ? () => toggleSave(key) : undefined}
                  onOpen={() => setOpenKey(key)}
                />
              );
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
        No preview thumbnails are stored (Instagram's image links expire) — open{" "}
        <span className="font-medium text-foreground">View original</span> on any post for
        the real visual. Need a hand turning one into a post?{" "}
        <Link to="/create-guide" className="font-semibold text-primary hover:underline">
          How to create it
        </Link>
        .
      </p>
    </div>
  );
}
