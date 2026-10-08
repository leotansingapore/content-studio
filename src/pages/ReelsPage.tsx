import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clapperboard, Images } from "lucide-react";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import ReelDrawer from "@/components/reels/ReelDrawer";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { activeProfile } from "@/lib/profiles";
import {
  NEXT,
  REELS_BOARD_OWNERS,
  brandForProfile,
  brandOf,
  cardsIn,
  currentVersion,
  fetchBoard,
  isCarousel,
  openNotes,
  updateCard,
  type Board,
  type ReelCard,
  type StageId,
} from "@/lib/reelsBoard";

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function ReelsPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [owner, setOwner] = useState<boolean | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [brand, setBrand] = useState<string | null>(params.get("brand"));
  const [showArchived, setShowArchived] = useState(false);
  const openId = params.get("card");

  useEffect(() => {
    document.title = "Reels - Content Studio";
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email?.toLowerCase() ?? "";
      const isOwner = REELS_BOARD_OWNERS.includes(email);
      setOwner(isOwner);
      if (!isOwner) return;
      fetchBoard()
        .then((b) => {
          setBoard(b);
          // Open on the board brand that matches the open profile.
          setBrand((cur) => cur ?? brandForProfile(b.brands, activeProfile(data.user?.id).name));
        })
        .catch((e) => setError(String(e.message || e)));
    });
  }, []);

  const replace = useCallback((c: ReelCard) => setBoard((b) => b && { ...b, cards: b.cards.map((x) => (x.id === c.id ? c : x)) }), []);

  const move = useCallback(
    (id: string, to: StageId, quiet = false) => {
      const c = board?.cards.find((x) => x.id === id);
      if (!c || c.stage === to) return;
      const from = c.stage;
      replace({ ...c, stage: to === "approved" ? "scheduled" : to }); // optimistic: approve lands in Scheduled
      updateCard(id, { stage: to })
        .then((fresh) => {
          replace(fresh);
          if (quiet) return;
          const name = board?.stages.find((s) => s.id === fresh.stage)?.name ?? fresh.stage;
          toast({
            title: fresh.stage === "scheduled" && fresh.schedule ? `Scheduled for ${when(fresh.schedule)}` : `Moved to ${name}`,
            action: <ToastAction altText="Undo" onClick={() => move(id, from, true)}>Undo</ToastAction>,
          });
        })
        .catch(() => {
          replace(c);
          toast({ title: "Couldn't save that move", description: "Check your connection and try again.", variant: "destructive" });
        });
    },
    [board, replace, toast],
  );

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("card", id);
    else ["card", "t", "slide", "c"].forEach((k) => next.delete(k));
    setParams(next, { replace: !id });
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of board?.cards ?? []) if (c.stage !== "archived") m[brandOf(c)] = (m[brandOf(c)] ?? 0) + 1;
    return m;
  }, [board]);

  if (owner === false) {
    return (
      <div className="space-y-5">
        <SectionTabs tabs={PIPELINE_TABS} />
        <p className="text-sm text-muted-foreground">
          No reels board is connected to this account. <Link to="/calendar" className="font-semibold text-primary">Back to your calendar</Link>
        </p>
      </div>
    );
  }

  const openCard = board?.cards.find((c) => c.id === openId);
  const stages = (board?.stages ?? []).filter((s) => showArchived || s.id !== "archived");

  return (
    <div className="space-y-5">
      <SectionTabs tabs={PIPELINE_TABS} />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Reels</h1>
        {board && (
          <>
            <select
              value={brand ?? ""}
              onChange={(e) => setBrand(e.target.value)}
              aria-label="Profile"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All profiles</option>
              {board.brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({counts[b.id] ?? 0})</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archived
            </label>
          </>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          The reels board didn't load ({error}).{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      )}
      {!board && !error && <div className="h-64 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading reels" />}

      {board &&
        stages.map((s) => {
          const cards = cardsIn(board.cards, s.id, brand ?? "");
          return (
            <section key={s.id} className="space-y-2">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                {s.name} <span className="font-normal text-muted-foreground">{cards.length}</span>
              </h2>
              {cards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 py-4 text-center text-xs text-muted-foreground">Empty</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {cards.map((c) => {
                    const v = currentVersion(c);
                    const next = NEXT[c.stage];
                    const notes = openNotes(c);
                    return (
                      <li key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
                        <button type="button" onClick={() => open(c.id)} className="group relative block text-left">
                          <span className="relative block aspect-[9/16] bg-black">
                            {v.thumbUrl && <img src={v.thumbUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-90" />}
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                              {isCarousel(c) ? <Images className="h-3 w-3" /> : <Clapperboard className="h-3 w-3" />}
                              {board.brands.find((b) => b.id === brandOf(c))?.name}
                            </span>
                            {notes > 0 && (
                              <span className="absolute right-2 top-2 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-white">
                                {notes} note{notes > 1 ? "s" : ""}
                              </span>
                            )}
                          </span>
                          <span className="block px-2.5 pt-2 text-sm font-semibold leading-snug line-clamp-2">{c.title}</span>
                          <span className="block px-2.5 text-[11px] text-muted-foreground">
                            {c.styleName ?? c.style}{c.schedule ? ` - ${when(c.schedule)}` : ""}
                          </span>
                        </button>
                        {next && (
                          <div className="mt-auto p-2.5 pt-2">
                            <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => move(c.id, next[0])}>
                              {next[1]}
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

      {board && openCard && (
        <ReelDrawer
          key={openCard.id}
          card={openCard}
          board={board}
          onChange={replace}
          onMove={move}
          onClose={() => open(null)}
          start={{ t: Number(params.get("t")) || undefined, slide: Number(params.get("slide")) || undefined }}
        />
      )}
    </div>
  );
}
