// Competitors (/competitors, Leo's sign-ins only; docs/north-star/items/find-competitors.md): the businesses this
// brand watches. The shell holds the add bar, "n of 12" and the view tabs; this wave has one view, Who you watch
// (?view=list). find-competitor-ads and find-competitor-posts add Their ads and Their posts beside it.
import { useEffect, useState } from "react";
import WhoYouWatch from "@/components/competitors/WhoYouWatch";
import AddBar from "@/components/competitors/AddBar";
import { useToast } from "@/hooks/use-toast";
import { loadCompetitors, onCompetitors, onCompetitorsChanged, readState, takeNotices } from "@/lib/competitors";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

// competitor-feeds adds "ads" and "posts" (and ads as the default once a competitor exists)
const VIEWS = ["list"] as const;

export default function CompetitorsPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Competitors userId={leo.id} />;
}

function Competitors({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [state, setState] = useState(() => loadCompetitors(userId));
  const [, tick] = useState(0);
  const [view, setView] = useUrlState<(typeof VIEWS)[number]>("view", "list", { allowed: VIEWS });
  const [edit, , closeEdit] = useUrlItem("edit");
  const update = useUrlUpdate();
  const openEdit = (id: string) => update({ view: "list", edit: id }, { push: true });

  useEffect(() => onCompetitorsChanged(() => setState(loadCompetitors(userId))), [userId]);
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

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Competitors</h1>
      <AddBar userId={userId} count={state.list.length} busy={reading} onAdded={(id, needsName) => needsName && openEdit(id)} />

      <div role="tablist" aria-label="Competitors" className="flex w-full gap-1 rounded-lg border border-border/60 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
        {[{ id: "list" as const, label: "Who you watch", n: state.list.length }].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none [@media(pointer:coarse)]:min-h-11 ${
              view === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label} <span className="text-xs text-muted-foreground">{t.n}</span>
          </button>
        ))}
      </div>

      <WhoYouWatch userId={userId} state={state} edit={edit} openEdit={openEdit} closeEdit={closeEdit} />
    </div>
  );
}
