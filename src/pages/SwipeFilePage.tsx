import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, TrendingUp, Sparkles, Rocket, ChevronDown } from "lucide-react";
import TopPostCard from "@/components/TopPostCard";
import { getAllTopPosts, TOTAL_TOP_POSTS, generatorFormat } from "@/lib/topPosts";

const ALL = getAllTopPosts();

const FORMAT_FILTERS: { value: string; label: string }[] = [
  { value: "carousel", label: "Carousels" },
  { value: "short-video", label: "Reels" },
  { value: "text-post", label: "Single posts" },
];

const PAGE_SIZE = 12;

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

export default function SwipeFilePage() {
  const [search, setSearch] = useState("");
  const [formats, setFormats] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    document.title = "Top posts - Content Studio";
    return () => {
      document.title = "Content Studio";
    };
  }, []);

  const toggleFormat = (f: string) =>
    setFormats((s) => {
      const n = new Set(s);
      n.has(f) ? n.delete(f) : n.add(f);
      return n;
    });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL.filter((p) => {
      if (formats.size > 0 && !formats.has(generatorFormat(p))) return false;
      if (q) {
        const hay = (
          p.advisorName +
          " " +
          p.handle +
          " " +
          p.caption +
          " " +
          (p.idea?.hook ?? "") +
          " " +
          (p.idea?.why ?? "")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, formats]);

  useEffect(() => setVisible(PAGE_SIZE), [search, formats]);

  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <TrendingUp className="h-6 w-6 text-primary" />
          Top posts to swipe
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The best-performing recent posts from {new Set(ALL.map((p) => p.handle)).size}{" "}
          financial advisors, ranked by engagement. Read the idea behind each one,
          then hit <span className="font-semibold text-foreground">Remix in Write</span>{" "}
          to turn it into your own post - in your voice, for your audience.
        </p>
      </header>

      {/* How-to-create banner */}
      <Card className="border-primary/30 bg-primary/5 shadow-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-start gap-2.5">
            <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                New here? Follow the 4-step flow
              </p>
              <p className="text-xs text-muted-foreground">
                Find a post you like &rarr; Remix in Write &rarr; polish the copy &rarr;
                build the visual with the step-by-step guide.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/create-guide">
              <Sparkles className="h-3.5 w-3.5" /> How to create the post
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search captions, ideas, advisors (e.g. CPF, retirement, objection)"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FORMAT_FILTERS.map((f) => (
              <Chip
                key={f.value}
                active={formats.has(f.value)}
                onClick={() => toggleFormat(f.value)}
              >
                {f.label}
              </Chip>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} of {TOTAL_TOP_POSTS} posts
            </span>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No posts match that search.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <TopPostCard
                key={p.advisorId + "-" + p.shortCode}
                post={p}
                advisor={{ name: p.advisorName, handle: p.handle }}
                showAdvisor
              />
            ))}
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
    </div>
  );
}
