// Competitors (/competitors, Leo's sign-ins only; docs/north-star/items/find-competitors.md): the businesses this
// brand watches. The shell holds the add bar, "n of 12" and the view tabs: Their ads (the default once a competitor
// exists), Their posts and Who you watch. Every view, filter and open item is in the URL (docs/deep-links.md).
import { useEffect, useState } from "react";
import WhoYouWatch from "@/components/competitors/WhoYouWatch";
import AddBar from "@/components/competitors/AddBar";
import TheirAds from "@/components/competitors/TheirAds";
import TheirPosts from "@/components/competitors/TheirPosts";
import { useToast } from "@/hooks/use-toast";
import { adsTally, loadCompetitorAds, onCompetitorAdsChanged } from "@/lib/competitorAds";
import { feedPosts, loadCompetitorPosts, onCompetitorPostsChanged } from "@/lib/competitorPosts";
import { loadCompetitors, onCompetitors, onCompetitorsChanged, readState, takeNotices } from "@/lib/competitors";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

const VIEWS = ["ads", "posts", "list"] as const;
type View = (typeof VIEWS)[number];

export default function CompetitorsPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Competitors userId={leo.id} />;
}

function Competitors({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [state, setState] = useState(() => loadCompetitors(userId));
  const [ads, setAds] = useState(() => loadCompetitorAds(userId));
  const [posts, setPosts] = useState(() => loadCompetitorPosts(userId));
  const [, tick] = useState(0);
  // ads once a competitor exists, else the list; read once, so adding the first one doesn't swap the view under you
  const [fallback] = useState<View>(() => (state.list.length ? "ads" : "list"));
  const [view] = useUrlState<View>("view", fallback, { allowed: VIEWS });
  const [edit, , closeEdit] = useUrlItem("edit");
  const update = useUrlUpdate();
  const openEdit = (id: string) => update({ view: "list", edit: id }, { push: true });
  // each view's own params go with it; the competitor pill (c) stays
  const setView = (v: View) => update({ view: v === fallback ? null : v, edit: null, running: null, platform: null, sort: null, post: null, ad: null });

  useEffect(() => onCompetitorsChanged(() => setState(loadCompetitors(userId))), [userId]);
  useEffect(() => onCompetitorAdsChanged(() => setAds(loadCompetitorAds(userId))), [userId]);
  useEffect(() => onCompetitorPostsChanged(() => setPosts(loadCompetitorPosts(userId))), [userId]);
  useEffect(() => {
    // the jobs' toasts and "open this row" asks, shown once, including any queued while the page was closed
    const drain = () => {
      tick((n) => n + 1);
      for (const n of takeNotices()) {
        if (n.title) toast({ title: n.title });
        if (n.edit) update({ view: "list", edit: n.edit }, { push: true });
      }
    };
    drain();
    return onCompetitors(drain);
  }, [toast, update]);

  const reading = state.list.some((c) => readState(userId, c.id)?.status === "running");
  const adCount = adsTally(state.list, ads).reduce((n, t) => n + t.n, 0);
  const postCount = feedPosts(state.list, posts).length;
  const tabs: { id: View; label: string; n: number }[] = [
    { id: "ads", label: "Their ads", n: adCount },
    { id: "posts", label: "Their posts", n: postCount },
    { id: "list", label: "Who you watch", n: state.list.length },
  ];

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Competitors</h1>
      <AddBar userId={userId} count={state.list.length} busy={reading} onAdded={(id, needsName) => needsName && openEdit(id)} />

      <div role="tablist" aria-label="Competitors" className="flex w-full gap-1 rounded-lg border border-border/60 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)}
            className={`flex-1 rounded-md px-2 py-2 text-sm font-medium transition-colors sm:flex-none sm:px-4 [@media(pointer:coarse)]:min-h-11 ${
              view === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label} <span className="text-xs tabular-nums text-muted-foreground">{t.n}</span>
          </button>
        ))}
      </div>

      {view === "ads" ? (
        <TheirAds userId={userId} list={state.list} store={ads} openEdit={openEdit} />
      ) : view === "posts" ? (
        <TheirPosts userId={userId} list={state.list} store={posts} openEdit={openEdit} />
      ) : (
        <WhoYouWatch userId={userId} state={state} edit={edit} openEdit={openEdit} closeEdit={closeEdit} />
      )}
    </div>
  );
}
