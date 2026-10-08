import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clapperboard, Columns3, Images, LayoutGrid } from "lucide-react";
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
  IG_HANDLES,
  igLine,
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
  // Board (kanban columns, drag between stages) on wide screens, grid on phones; remembered per device.
  const [view, setView] = useState<"board" | "grid">(() => {
    try {
      const v = localStorage.getItem("cs-reels-view");
      if (v === "board" || v === "grid") return v;
    } catch {
      // storage blocked: fall through to the screen-size default
    }
    return typeof window !== "undefined" && window.innerWidth >= 1024 ? "board" : "grid";
  });
  const [over, setOver] = useState<string | null>(null);
  const pickView = (v: "board" | "grid") => {
    setView(v);
    try {
      localStorage.setItem("cs-reels-view", v);
    } catch {
      // per-device convenience only
    }
  };
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
            title:
              fresh.stage === "scheduled" && fresh.schedule
                ? `Scheduled for ${when(fresh.schedule)}${IG_HANDLES[brandOf(fresh)] ? `, posts to @${IG_HANDLES[brandOf(fresh)]}` : ""}`
                : `Moved to ${name}`,
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
            <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5" role="group" aria-label="Layout">
              {([["board", "Board", Columns3], ["grid", "Grid", LayoutGrid]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => pickView(id)} aria-pressed={view === id}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${view === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
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

      {board && view === "board" && (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div className="flex items-start gap-3">
            {stages.map((s) => {
              const cards = cardsIn(board.cards, s.id, brand ?? "");
              return (
                <section
                  key={s.id}
                  aria-label={s.name}
                  onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
                  onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) move(id, s.id);
                  }}
                  className={`flex w-60 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors ${over === s.id ? "border-primary bg-primary/5 ring-2 ring-primary/25" : "border-border/60"}`}
                >
                  <h2 className="flex items-baseline justify-between px-3 pb-1 pt-2.5 text-sm font-semibold">
                    {s.name} <span className="text-xs font-normal text-muted-foreground">{cards.length}</span>
                  </h2>
                  <ul className="flex max-h-[72vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                    {cards.length === 0 && (
                      <li className="rounded-lg border border-dashed border-border/70 py-5 text-center text-[11px] text-muted-foreground">Drop a reel here</li>
                    )}
                    {cards.map((c) => {
                      const v = currentVersion(c);
                      const next = NEXT[c.stage];
                      const notes = openNotes(c);
                      const ig = igLine(c);
                      return (
                        <li
                          key={c.id}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; }}
                          className="grid cursor-grab grid-cols-[52px_1fr] gap-2 rounded-lg border border-border/60 bg-card p-2 shadow-sm active:cursor-grabbing"
                        >
                          <button type="button" onClick={() => open(c.id)} className="block aspect-[9/16] overflow-hidden rounded-md bg-black" aria-label={`Open ${c.title}`}>
                            {v.thumbUrl && <img src={v.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
                          </button>
                          <div className="min-w-0 space-y-1">
                            <button type="button" onClick={() => open(c.id)} className="block text-left text-xs font-semibold leading-snug line-clamp-2 hover:text-primary">{c.title}</button>
                            <p className="flex flex-wrap gap-1 text-[10px]">
                              <span className="rounded-full bg-muted px-1.5 py-0.5">{board.brands.find((b) => b.id === brandOf(c))?.name}</span>
                              {isCarousel(c) && <span className="rounded-full bg-muted px-1.5 py-0.5">Carousel</span>}
                              {notes > 0 && <span className="rounded-full bg-warning/20 px-1.5 py-0.5 font-semibold">{notes} note{notes > 1 ? "s" : ""}</span>}
                              {c.schedule && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">{when(c.schedule)}</span>}
                            </p>
                            {ig && <p className={`text-[10px] font-semibold ${ig.href ? "text-primary" : "text-muted-foreground"}`}>{ig.text}</p>}
                            {next && (
                              <Button size="sm" variant="outline" className="h-7 w-full text-[11px]" onClick={() => move(c.id, next[0])}>{next[1]}</Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {board && view === "grid" &&
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
                          {igLine(c) && (
                            <span className={`block px-2.5 text-[11px] font-semibold ${igLine(c)!.href ? "text-primary" : "text-muted-foreground"}`}>
                              {igLine(c)!.text}
                            </span>
                          )}
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
