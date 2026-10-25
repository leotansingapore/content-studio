// /studio (Studio > Overview, after Fastlane's Studio, docs/fastlane-nav-gap.md): where making starts. The agent's
// composer for Leo, then a row each of formats, ads running now, trending posts and your latest, each opening the page
// that already does the work. Reads only what this device and the bundled drops hold; calls no AI.
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Clapperboard, FileText, Image as ImageIcon, Layers, PenLine, Type, Video, type LucideIcon } from "lucide-react";
import ReelCard from "@/components/ReelCard";
import { FORMATS, formatHref, type FormatKind } from "@/data/formats";
import { ADS, daysRunning } from "@/lib/adsSwipe";
import { draftsOfBrand, draftStatus } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { buildCreatorAverages, enrich, sortPosts, type ScoredPost } from "@/lib/postInsights";
import { activeProfile } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { getAllTopPosts, TOTAL_TOP_POSTS } from "@/lib/topPosts";
import { useLeoUser } from "@/lib/useLeoOnly";

// the agent engine loads for Leo only, as on Home
const Composer = lazy(() => import("@/components/agent/Composer"));

const ROW = 5;
const KIND_ICONS: Record<FormatKind, LucideIcon> = { video: Clapperboard, slides: Layers, text: Type, image: ImageIcon };
// Everyone else's ways to make, the pages under Create they can open.
const WRITE: { to: string; name: string; blurb: string; icon: LucideIcon }[] = [
  { to: "/generate", name: "Post", blurb: "A post in your voice, from a topic", icon: PenLine },
  { to: "/generate/batch", name: "Batch", blurb: "Several posts in one go", icon: FileText },
  { to: "/carousel", name: "Carousel", blurb: "Slides from a post or your notes", icon: Layers },
  { to: "/edit", name: "Video", blurb: "Cut and caption a video you filmed", icon: Video },
];

const TOP = (() => {
  const all = getAllTopPosts();
  const averages = buildCreatorAverages(all);
  const scored: ScoredPost[] = all.map((post) => ({ post, insight: enrich(post, averages) }));
  return sortPosts(scored, "engagement", { averages, now: Date.now() }).slice(0, ROW);
})();
const TOP_ADS = [...ADS].sort((a, b) => (daysRunning(b) ?? 0) - (daysRunning(a) ?? 0)).slice(0, ROW);
const READY = FORMATS.filter((f) => f.ready).sort((a, b) => a.group - b.group);

function Row({ id, title, seeAll, children }: { id: string; title: string; seeAll?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-h`} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        {seeAll && (
          <Link to={seeAll.to} className="inline-flex min-h-9 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
            {seeAll.label} <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </section>
  );
}

const tile = "flex min-h-11 flex-col gap-1.5 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40";

export default function StudioPage() {
  const leo = useLeoUser();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);
  const brand = userId ? activeProfile(userId)?.name : "";
  const mine = userId ? draftsOfBrand(userId, activeProfile(userId).id) : [];
  const latest = mine.slice(0, ROW);
  const formats = leo ? READY.slice(0, 10) : null;

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What should {leo ? "the agent" : "you"} make{brand ? ` for ${brand}` : ""}?
          </h1>
          <p className="text-sm text-muted-foreground">
            {leo ? "Tell it, or pick a format, an ad or a trending post below. Anything paid shows its price first." : "Pick a way to make it, or start from an ad or a trending post below."}
          </p>
        </div>
        {leo && (
          <Suspense fallback={<div className="h-28 rounded-xl border border-border/70 bg-card" aria-busy="true" />}>
            <Composer userId={leo.id} threadId={null} slot="studio" onSent={(id) => navigate(links.agent({ thread: id }))} />
          </Suspense>
        )}
        <nav aria-label="On this page" className="flex flex-wrap gap-2">
          {/* each chip counts everything behind its row, as Fastlane's do; the row shows the first few */}
          {[
            ["#formats", "Formats", formats ? READY.length : WRITE.length],
            ["#ads", "Ads running now", ADS.length],
            ["#trending", "Trending", TOTAL_TOP_POSTS],
            ["#latest", "Your latest", mine.length],
          ].map(([href, label, n]) => (
            <a key={href} href={String(href)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/70 px-3 text-sm text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11">
              {label} <span className="tabular-nums">{n}</span>
            </a>
          ))}
        </nav>
      </header>

      <Row id="formats" title="Formats" seeAll={formats ? { to: "/make", label: "All formats" } : undefined}>
        {formats
          ? formats.map((f) => {
              const Icon = KIND_ICONS[f.kind];
              return (
                <Link key={f.slug} to={formatHref(f)} className={tile}>
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{f.name}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{f.blurb}</span>
                </Link>
              );
            })
          : WRITE.map((w) => (
              <Link key={w.to} to={w.to} className={tile}>
                <w.icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{w.name}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{w.blurb}</span>
              </Link>
            ))}
      </Row>

      <Row id="ads" title="Ads running now" seeAll={{ to: links.swipe({ tab: "ads" }), label: `All ${ADS.length} ads` }}>
        {TOP_ADS.map((ad) => (
          <Link key={ad.adId} to={links.swipe({ tab: "ads", ad: ad.adId })} className="group min-w-0 space-y-1.5">
            <span className="block aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-border/60">
              <img src={ad.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
            </span>
            <span className="block truncate text-sm font-medium text-foreground">{ad.advertiser}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{ad.headline || ad.body}</span>
          </Link>
        ))}
      </Row>

      <Row id="trending" title="Trending in your niche" seeAll={{ to: links.swipe(), label: "All top posts" }}>
        {TOP.map((item) => (
          <ReelCard key={item.post.advisorId + item.post.shortCode} item={item} href={links.swipe({ post: `${item.post.advisorId}-${item.post.shortCode}` })} />
        ))}
      </Row>

      <Row id="latest" title="Your latest" seeAll={{ to: leo ? "/library" : "/drafts", label: leo ? "Library" : "All posts" }}>
        {latest.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">
            Nothing made yet. <Link to="/generate" className="font-medium text-primary hover:underline">Write a post</Link>
          </p>
        ) : (
          latest.map((d) => (
            <Link key={d.id} to={`/generate?draft=${encodeURIComponent(d.id)}`} className={tile}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{draftStatus(d)}</span>
              <span className="line-clamp-3 text-sm font-medium text-foreground">{(d.hook || d.draft.split("\n")[0] || "Untitled post").slice(0, 120)}</span>
            </Link>
          ))
        )}
      </Row>
    </div>
  );
}
