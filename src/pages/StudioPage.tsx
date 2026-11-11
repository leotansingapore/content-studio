// /studio (Create > Start, docs/nav-overhaul.md): one screen that answers "what do you want to make?". A topic box
// that opens the post writer on its last step (the agent's composer for Leo), six big choices one tap from their
// maker, and the rest behind More formats: the catalogue for Leo, the other makers for everyone else. Under them, ads
// running now, trending posts and your latest. Reads only what this device and the bundled drops hold; calls no AI.
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CREATE_FORMATS, MORE_FORMATS } from "@/lib/createFormats";
import ReelCard from "@/components/ReelCard";
import { CreationTile, recentCreations } from "@/components/home/HomeRows";
import { readThumbSources, useFontsReady } from "@/components/library/LibraryThumb";
import { FORMATS } from "@/data/formats";
import { ADS, daysRunning } from "@/lib/adsSwipe";
import { loadCarousels } from "@/lib/carousel";
import { loadDesigns } from "@/lib/design";
import { loadDrafts } from "@/lib/draftHistory";
import { loadImages } from "@/lib/images";
import { loadMedia } from "@/lib/mediaLibrary";
import { loadSlideshows } from "@/lib/slideshow";
import { loadProjects } from "@/lib/videoProjects";
import { loadCreateTopic, saveCreateTopic, tileHref } from "@/lib/createTopic";
import { links } from "@/lib/links";
import { buildCreatorAverages, enrich, sortPosts, type ScoredPost } from "@/lib/postInsights";
import { adviserBrand } from "@/lib/profession";
import { activeProfile } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { getAllTopPosts } from "@/lib/topPosts";
import { useLeoUser } from "@/lib/useLeoOnly";

// the agent engine loads for Leo only, as on Home
const Composer = lazy(() => import("@/components/agent/Composer"));

const ROW = 5;
const TOP = (() => {
  const all = getAllTopPosts();
  const averages = buildCreatorAverages(all);
  const scored: ScoredPost[] = all.map((post) => ({ post, insight: enrich(post, averages) }));
  return sortPosts(scored, "engagement", { averages, now: Date.now() }).slice(0, ROW);
})();
const TOP_ADS = [...ADS].sort((a, b) => (daysRunning(b) ?? 0) - (daysRunning(a) ?? 0)).slice(0, ROW);
const READY = FORMATS.filter((f) => f.ready).length;

function Row({ id, title, seeAll, children }: { id: string; title: string; seeAll?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-h`} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        {seeAll && (
          <Link to={seeAll.to} className="inline-flex min-h-9 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11">
            {seeAll.label} <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </section>
  );
}

const tile = "flex min-h-11 flex-col gap-1.5 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40";

/** Where "Write it" and the Post tile both go: the writer's last step with the topic typed, or null to ask for the topic first. */
export const writeTarget = (topic: string): string | null => (topic.trim() ? links.generate({ detail: topic.trim() }) : null);

export default function StudioPage() {
  const leo = useLeoUser();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);
  const brand = userId ? activeProfile(userId)?.name : "";
  // Your latest is the Library's newest five, drawn as the Library draws them (the stores it reads, on this device)
  const stores = useMemo(
    () => (userId ? { drafts: loadDrafts(userId), carousels: loadCarousels(userId), slideshows: loadSlideshows(userId), projects: loadProjects(userId), media: loadMedia(userId), designs: loadDesigns(userId), images: loadImages(userId) } : null),
    [userId],
  );
  const latest = useMemo(() => (stores ? recentCreations(stores, ROW) : []), [stores]);
  const fontsReady = useFontsReady(latest.some((c) => c.item.thumb?.kind === "show"));
  const sources = useMemo(() => (userId && stores ? readThumbSources(userId, stores, fontsReady) : undefined), [userId, stores, fontsReady]);
  const [topic, setTopicState] = useState("");
  // what was typed here is still here on the way back from any maker (this tab only)
  useEffect(() => {
    if (userId) setTopicState((t) => t || loadCreateTopic(userId));
  }, [userId]);
  const setTopic = (t: string) => {
    setTopicState(t);
    if (userId) saveCreateTopic(userId, t);
  };
  // New post lands here as /studio#topic: the box takes the cursor, so typing is the next thing (never on a plain
  // visit, where a phone would open its keyboard over the choices)
  const { hash, key } = useLocation();
  const topicBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (hash === "#topic") topicBox.current?.focus();
  }, [hash, key, leo]);
  // Write it and the Post tile are one path: with no topic yet, the box takes the cursor and says what it needs
  const [asked, setAsked] = useState(false);
  const write = () => {
    const to = writeTarget(topic);
    if (to) return navigate(to);
    setAsked(true);
    topicBox.current?.focus();
  };
  // the ads and top posts are Singapore personal finance: an adviser brand's rows only
  const adviser = adviserBrand(userId);

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">What do you want to make{brand ? ` for ${brand}` : ""}?</h1>
        {leo ? (
          <Suspense fallback={<div className="h-28 rounded-xl border border-border/70 bg-card" aria-busy="true" />}>
            <Composer userId={leo.id} threadId={null} slot="studio" onSent={(id) => navigate(links.agent({ thread: id }))} />
          </Suspense>
        ) : leo === null ? (
          // a topic typed here opens the writer on its last step: three fewer presses to a first post
          <form
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              write();
            }}
          >
            <Input ref={topicBox} id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="What your post is about" aria-describedby={asked && !topic.trim() ? "topic-ask" : undefined} placeholder="What's your post about?" maxLength={300} className="h-12 flex-1 text-base" />
            <Button type="submit" className="h-12 gap-2 px-5">
              Write it <ArrowRight className="h-4 w-4" />
            </Button>
            {asked && !topic.trim() && (
              <p id="topic-ask" role="status" className="text-sm text-muted-foreground sm:order-last sm:basis-full">
                Type a topic first, a few words will do.
              </p>
            )}
          </form>
        ) : (
          <div className="h-12" aria-busy="true" />
        )}
      </header>

      <section aria-label="Ways to make" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {CREATE_FORMATS.map((w) => (
            <Link
              key={w.to}
              to={w.to}
              className={tile}
              // customers: the Post tile is the topic box's twin, and every other tile takes the box's topic with it
              // (Leo's screen has the agent's composer instead of the box)
              onClick={leo !== null ? undefined : w.to === "/generate" ? (e) => (e.preventDefault(), write()) : topic.trim() ? (e) => (e.preventDefault(), navigate(tileHref(w.to, topic, userId))) : undefined}
            >
              <w.icon className="h-5 w-5 text-primary" />
              <span className="text-base font-semibold text-foreground">{w.name}</span>
              <span className="text-sm text-muted-foreground">{w.blurb}</span>
            </Link>
          ))}
        </div>
        {leo ? (
          <Link to="/make" className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:underline">
            More formats <span className="ml-1 font-normal tabular-nums text-muted-foreground">{READY}</span> <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-0.5 text-sm font-semibold text-primary hover:underline [&::-webkit-details-marker]:hidden">
              More formats <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {MORE_FORMATS.map((w) => (
                <Link key={w.to} to={w.to} className={tile}>
                  <w.icon className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{w.name}</span>
                  <span className="text-xs text-muted-foreground">{w.blurb}</span>
                </Link>
              ))}
            </div>
          </details>
        )}
      </section>

      {adviser && <>
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
      </>}

      <Row id="latest" title="Your latest" seeAll={{ to: links.library(), label: "Library" }}>
        {latest.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">
            Nothing made yet. <Link to="/generate" className="font-medium text-primary hover:underline">Write a post</Link>
          </p>
        ) : (
          latest.map((c) => <CreationTile key={c.key} c={c} sources={sources} />)
        )}
      </Row>
    </div>
  );
}
