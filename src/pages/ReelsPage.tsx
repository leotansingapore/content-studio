import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clapperboard, Columns3, Images, LayoutGrid, RefreshCw, Rows3, Users } from "lucide-react";
import SectionTabs, { BOARD_TABS } from "@/components/SectionTabs";
import ReelDrawer from "@/components/reels/ReelDrawer";
import ReelFeed from "@/components/reels/ReelFeed";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useUrlState, withParam } from "@/lib/urlState";
import { activeProfile, addProfile, linkBoardBrand, profileForBoardBrand, setActiveProfile } from "@/lib/profiles";
import { connectLink } from "@/lib/socialConnect";
import { links } from "@/lib/links";
import { boardWaitingChanged, countBoardWaiting, waitingByBrand } from "@/lib/needsYou";
import {
  NEXT,
  accessChanged,
  aspectOf,
  brandForProfile,
  brandOf,
  cardsIn,
  checkMe,
  currentVersion,
  errorText,
  feedCards,
  fetchBoard,
  findCard,
  IG_HANDLES,
  igHandle,
  loadConnectedIg,
  type IgConnection,
  ZERNIO_IG_BRANDS,
  igLine,
  isCarousel,
  openNotes,
  perms,
  seesBoard,
  sharedBoard,
  stageForLink,
  updateCard,
  type Board,
  type Me,
  type ReelCard,
  type StageId,
} from "@/lib/reelsBoard";

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function ReelsPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  // Leo sees the open brand's posts only (docs/brand-isolation.md): its posts-board brand is linked on the profile.
  // A ?brand= link to another board brand switches to the brand that owns it, or offers to link it.
  // Members keep a picker over the brands their role gives them (?brand=, all by default).
  const [uid, setUid] = useState("");
  const [ownBrand, setOwnBrand] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState("");
  const [profileName, setProfileName] = useState("");
  // the open brand's Instagram as connected here: undefined until asked, null when it isn't a brand connected here
  const [igConn, setIgConn] = useState<IgConnection | null | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);
  const brandParam = params.get("brand");
  const known = (b: string) => !board || board.brands.some((x) => x.id === b);
  const brand = me?.owner ? unlinked || ownBrand : brandParam === "all" ? "" : brandParam && known(brandParam) ? brandParam : "";
  const setBrand = (b: string) => setParams((prev) => withParam(prev, "brand", b || "all"), { replace: true });
  const [archived, setArchived] = useUrlState("archived", "hide", { allowed: ["hide", "show"] });
  const showArchived = archived === "show";
  // Posts (every post at its real shape, full caption, decide beside it) is the default; Board (kanban, drag between
  // stages) and Grid stay one tap away. Remembered per device under a new key so the Posts default reaches everyone once.
  const [view, pickView] = useUrlState<"feed" | "board" | "grid">("view", "feed", { allowed: ["feed", "board", "grid"], remember: "cs-reels-view-2" });
  const [stage, pickStage] = useUrlState<StageId | "all" | "notes">("stage", "review", { allowed: ["review", "changes", "approved", "scheduled", "posted", "archived", "all", "notes"] });
  const [loading, setLoading] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const openId = params.get("card");

  const reload = () => {
    setLoading(true);
    fetchBoard()
      .then((b) => { setBoard(b); setError(""); })
      .catch((e) => setError(errorText(e, "check your connection")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = "Posts board - Content Studio";
    supabase.auth.getUser().then(async ({ data }) => {
      // the server says who this is on the team; the board checks it again on every request
      const who = await checkMe(true).catch((e) => (setError(errorText(e, "check your connection")), null));
      if (!who) return;
      setMe(who);
      setAllowed(seesBoard(who));
      if (!seesBoard(who)) return;
      sharedBoard() // the shell asked a moment ago on a cold load; Refresh asks again
        .then((b) => {
          setBoard(b);
          // on arrival only: a link to one post shows its stage, so opening a post in the app never moves the chips
          const landOn = stageForLink(b.cards, new URLSearchParams(window.location.search));
          if (landOn) setParams((prev) => withParam(prev, "stage", landOn), { replace: true });
          const id = data.user?.id ?? "";
          if (!who.owner || !id) return;
          setUid(id);
          let prof = activeProfile(id);
          // first visit since brands were linked by id: link the board brand its name matches, once
          const guess = prof.boardBrand ? "" : brandForProfile(b.brands, prof.name);
          if (guess && !profileForBoardBrand(id, guess)) {
            linkBoardBrand(id, prof.id, guess);
            prof = { ...prof, boardBrand: guess };
          }
          setProfileName(prof.name);
          setOwnBrand(prof.boardBrand ?? "");
          const own = prof.boardBrand;
          if (own && ZERNIO_IG_BRANDS.includes(own)) loadConnectedIg(id).then((m) => setIgConn(m[own] ?? null), () => setIgConn(null));
          const asked = new URLSearchParams(window.location.search).get("brand");
          if (asked && asked !== "all" && asked !== prof.boardBrand && b.brands.some((x) => x.id === asked)) {
            const owner = profileForBoardBrand(id, asked);
            if (owner) {
              setActiveProfile(id, owner.id);
              window.location.reload();
              return;
            }
            setUnlinked(asked);
          }
        })
        .catch((e) => setError(errorText(e, "check your connection")));
    });
  }, []);

  // The nav badge follows every load, move and undo here at once.
  useEffect(() => {
    if (board) boardWaitingChanged(countBoardWaiting(board.cards));
  }, [board]);

  const replace = useCallback((c: ReelCard) => setBoard((b) => b && { ...b, cards: b.cards.map((x) => (x.id === c.id ? c : x)) }), []);
  // a move touches the stage only, so a note added a moment before (the drawer's move to Needs changes) is never undone
  const setStage = useCallback((id: string, stage: StageId) => setBoard((b) => b && { ...b, cards: b.cards.map((x) => (x.id === id ? { ...x, stage } : x)) }), []);

  const move = useCallback(
    (id: string, to: StageId, quiet = false) => {
      const c = board?.cards.find((x) => x.id === id);
      if (!c || c.stage === to) return;
      if (!perms(me, c).move(to)) {
        toast({ title: "Your role can't move this post there", description: "Leave a note instead, or ask Leo." });
        return;
      }
      const from = c.stage;
      setStage(id, to === "approved" ? "scheduled" : to); // optimistic: approve lands in Scheduled
      updateCard(id, { stage: to })
        .then((fresh) => {
          replace(fresh);
          if (quiet) return;
          const name = board?.stages.find((s) => s.id === fresh.stage)?.name ?? fresh.stage;
          toast({
            title:
              fresh.stage === "scheduled" && fresh.schedule
                ? `Scheduled for ${when(fresh.schedule)}${igHandle(brandOf(fresh)) ? `, posts to @${igHandle(brandOf(fresh))}` : ""}`
                : `Moved to ${name}`,
            action: <ToastAction altText="Undo" onClick={() => move(id, from, true)}>Undo</ToastAction>,
          });
        })
        .catch((e) => {
          setStage(id, from);
          toast({ title: errorText(e, "Couldn't save that move. Check your connection and try again."), variant: "destructive" });
          if (accessChanged(e)) void checkMe(true).then(setMe).catch(() => {});
        });
    },
    [board, me, replace, setStage, toast],
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

  if (allowed === false) {
    return (
      <div className="space-y-5">
        <SectionTabs tabs={BOARD_TABS} />
        <p className="text-sm text-muted-foreground">
          No reels board is connected to this account. <Link to="/calendar" className="font-semibold text-primary">Back to your calendar</Link>
        </p>
      </div>
    );
  }

  const openCard = board ? findCard(board.cards, openId) : undefined;
  // Leo on a brand with no posts board linked yet: ask which one, instead of showing every brand's posts
  const needsLink = !!me?.owner && ownBrand === "" && !unlinked;
  const brandName = (id: string) => board?.brands.find((b) => b.id === id)?.name ?? id;
  // Leo's other brands with posts waiting, from the board already loaded. Each is a full page load, since ?brand= is
  // read on arrival only; the brand that owns it opens first, so it lands without the switcher's second reload.
  const elsewhere = board && me?.owner ? waitingByBrand(board, brand ?? "") : [];
  const hrefFor = (w: (typeof elsewhere)[number]) => links.reels({ brand: w.id, stage: w.changes ? "all" : undefined });
  const openBrand = (e: MouseEvent, boardBrand: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab switches on arrival; this one keeps its brand
    const p = profileForBoardBrand(uid, boardBrand);
    if (p) setActiveProfile(uid, p.id);
  };
  const link = (boardBrand: string) => {
    linkBoardBrand(uid, activeProfile(uid).id, boardBrand);
    setOwnBrand(boardBrand);
    setUnlinked("");
    toast({ title: `${brandName(boardBrand)} posts now belong to ${profileName}` });
  };
  const ownBrandFor = (boardBrand: string) => {
    const p = addProfile(uid, brandName(boardBrand));
    linkBoardBrand(uid, p.id, boardBrand);
    setActiveProfile(uid, p.id);
    window.location.reload();
  };
  const stages = (board?.stages ?? []).filter((s) => showArchived || s.id !== "archived");
  const connectIg = () => {
    if (!igConn) return;
    setConnecting(true);
    const again = igConn.account?.needsReconnect ? igConn.account.id : undefined;
    connectLink(igConn.profileId, "instagram", again)
      .then(({ authUrl }) => window.location.assign(authUrl))
      .catch((e) => {
        setConnecting(false);
        toast({ title: errorText(e, "try again in a minute"), variant: "destructive" });
      });
  };
  const igMissing = !!igConn && (!igConn.account || igConn.account.needsReconnect);

  return (
    <div className="space-y-5">
      <SectionTabs tabs={BOARD_TABS} />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Posts board</h1>
        {me?.owner && (
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link to="/reels/team"><Users className="mr-1.5 h-3.5 w-3.5" /> Team</Link>
          </Button>
        )}
        {board && (
          <>
            {!me?.owner && board.brands.length > 1 && (
              <select
                value={brand ?? ""}
                onChange={(e) => setBrand(e.target.value)}
                aria-label="Brand"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All brands</option>
                {board.brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({counts[b.id] ?? 0})</option>
                ))}
              </select>
            )}
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={showArchived} onChange={(e) => setArchived(e.target.checked ? "show" : "hide")} />
              Archived
            </label>
            <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5" role="group" aria-label="Layout">
              {([["feed", "Posts", Rows3], ["board", "Board", Columns3], ["grid", "Grid", LayoutGrid]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => pickView(id)} aria-pressed={view === id}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${view === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      {board && !needsLink && view === "feed" && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
          {[...stages.map((s) => [s.id, s.name] as const), ["all", "All"] as const, ["notes", "Notes"] as const].map(([id, name]) => {
            const n = feedCards(board.cards, id as StageId | "all" | "notes", brand ?? "", me).length;
            if (id === "notes" && !n && stage !== "notes") return null;
            return (
              <button key={id} type="button" onClick={() => pickStage(id as StageId | "all" | "notes")} aria-pressed={stage === id}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold [@media(pointer:coarse)]:h-11 ${stage === id ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>
                {name} <span className={stage === id ? "opacity-80" : "opacity-70"}>{n}</span>
              </button>
            );
          })}
          <Button variant="ghost" size="sm" className="ml-auto h-9" onClick={reload} disabled={loading} aria-label="Refresh the board">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {brand && elsewhere.length > 0 && (
            <p className="basis-full text-xs text-muted-foreground">
              Also waiting:{" "}
              {elsewhere.map((w, i) => (
                <span key={w.id}>
                  {i > 0 && ", "}
                  <a href={hrefFor(w)} onClick={(e) => openBrand(e, w.id)} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
                    {w.name} {w.n}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          The reels board didn't load ({error}).{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      )}
      {!board && !error && <div className="h-64 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading reels" />}

      {board && unlinked && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm" role="status">
          <span className="mr-auto">{brandName(unlinked)} posts aren't linked to any of your brands yet.</span>
          <Button size="sm" onClick={() => ownBrandFor(unlinked)}>Make {brandName(unlinked)} a brand</Button>
          {ownBrand === "" && <Button size="sm" variant="outline" onClick={() => link(unlinked)}>Link to {profileName}</Button>}
        </div>
      )}
      {board && igMissing && !needsLink && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm" role="status">
          <span className="mr-auto">
            {igConn!.account ? `@${igConn!.account.username.replace(/^@/, "")} needs reconnecting.` : `${profileName}'s Instagram isn't connected.`} Approved posts won't go out by themselves until it is.
          </span>
          <Button size="sm" onClick={connectIg} disabled={connecting}>
            {connecting ? "Opening Instagram..." : igConn!.account ? "Reconnect Instagram" : "Connect Instagram"}
          </Button>
        </div>
      )}
      {board && needsLink && (
        <div className="space-y-3 rounded-xl border border-dashed border-border/70 p-6 text-center">
          <p className="text-sm font-semibold">Which posts belong to {profileName}?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {board.brands.filter((b) => !profileForBoardBrand(uid, b.id)).map((b) => (
              <Button key={b.id} size="sm" variant="outline" onClick={() => link(b.id)}>{b.name} ({counts[b.id] ?? 0})</Button>
            ))}
          </div>
          {board.brands.every((b) => profileForBoardBrand(uid, b.id)) &&
            (elsewhere.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {elsewhere.map((w) => (
                  <Button key={w.id} asChild size="sm" variant="outline" className="[@media(pointer:coarse)]:h-11">
                    <a href={hrefFor(w)} onClick={(e) => openBrand(e, w.id)}>{w.name} {w.n} to review</a>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Every posts board already belongs to another brand. Switch brand to see its posts.</p>
            ))}
        </div>
      )}

      {board && !needsLink && view === "feed" && (
        <ReelFeed cards={feedCards(board.cards, stage, brand ?? "", me)} board={board} me={me} onChange={replace} onMove={move} onOpen={open} focus={openCard?.id} />
      )}

      {board && !needsLink && view === "board" && (
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
                      const p = perms(me, c);
                      const next = NEXT[c.stage] && p.move(NEXT[c.stage]![0]) ? NEXT[c.stage] : undefined;
                      const notes = openNotes(c);
                      const ig = igLine(c);
                      return (
                        <li
                          key={c.id}
                          draggable={p.edit}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; }}
                          className={`grid grid-cols-[52px_1fr] gap-2 rounded-lg border border-border/60 bg-card p-2 shadow-sm ${p.edit ? "cursor-grab active:cursor-grabbing" : ""}`}
                        >
                          <button type="button" onClick={() => open(c.id)} className="block self-start overflow-hidden rounded-md bg-muted" style={{ aspectRatio: aspectOf(c) }} aria-label={`Open ${c.title}`}>
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

      {board && !needsLink && view === "grid" &&
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
                    const next = NEXT[c.stage] && perms(me, c).move(NEXT[c.stage]![0]) ? NEXT[c.stage] : undefined;
                    const notes = openNotes(c);
                    return (
                      <li key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
                        <button type="button" onClick={() => open(c.id)} className="group relative block text-left">
                          <span className="relative block bg-muted" style={{ aspectRatio: aspectOf(c) }}>
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
          me={me}
          onChange={replace}
          onMove={move}
          onClose={() => open(null)}
          start={{ t: Number(params.get("t")) || undefined, slide: Number(params.get("slide")) || undefined }}
        />
      )}
    </div>
  );
}
