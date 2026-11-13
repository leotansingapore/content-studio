// Blitz (/blitz, Leo's sign-ins only; docs/north-star/items/plan-blitz.md), after Fastlane's Studio > Blitz: a deck
// of ready drafts, one card at a time, each labelled with its format, its source and Why this, with Skip (S), Edit
// (E) and Keep (K). The day's first visit starts the deck (blitzJob.ts, outside React, so leaving keeps it going);
// cards appear as each one lands. card=<id> opens one card (replace), configure=1 opens Configure (push).
// Everyone else gets the 404 page.

import { useEffect, useReducer, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckIcon, StackIcon, CircleNotchIcon, PencilSimpleIcon, ArrowCounterClockwiseIcon, SlidersHorizontalIcon, SwordIcon, XIcon } from "@phosphor-icons/react";
import BlitzConfigure from "@/components/blitz/BlitzConfigure";
import BlitzPreview from "@/components/blitz/BlitzPreview";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  CAPPED_LINE, FORMAT_LABELS, keptCount, keyAction, loadBlitz, onBlitzChanged, openCards, pending, sourceChip, type BlitzCard,
} from "@/lib/blitz";
import { alsoMake, blitzBusy, editHref, keepCard, nothingToDraw, onBlitzJob, retryCard, skipCard, startDeck, undoKeep, whyEmpty } from "@/lib/blitzJob";
import { links } from "@/lib/links";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlUpdate } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const ROUND = "flex h-14 w-14 items-center justify-center rounded-full border shadow-card transition-colors disabled:opacity-40";

export default function BlitzPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Blitz userId={leo.id} />;
}

function Key({ k }: { k: string }) {
  return <kbd className="hidden rounded border border-border px-1 font-sans text-[10px] text-muted-foreground lg:inline [@media(pointer:coarse)]:hidden">{k}</kbd>;
}

/** The source beside the card, as Fastlane shows the post it remixed. */
function RemixedFrom({ card }: { card: BlitzCard }) {
  const s = card.source;
  const [broken, setBroken] = useState(false);
  return (
    <aside className="hidden w-52 shrink-0 space-y-2 self-start rounded-xl border border-border/60 p-3 lg:block" aria-label={s ? "Remixed from" : "Written from"}>
      <p className={HEAD}>{s ? "Remixed from" : "Written from"}</p>
      {s?.cover && !broken && <img src={s.cover} alt="" onError={() => setBroken(true)} className="aspect-[4/5] w-full rounded-lg bg-muted object-cover" />}
      <p className="text-sm font-medium">{s ? s.author || "A trending post" : "Your ideas"}</p>
      <p className="line-clamp-4 text-sm text-muted-foreground">{s ? s.title || s.caption : card.topic?.title}</p>
      {s?.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
          See the original
        </a>
      )}
    </aside>
  );
}

function NothingToDeal({ userId, onConfigure }: { userId: string; onConfigure: () => void }) {
  const { line, action } = whyEmpty(userId);
  return (
    <EmptyState
      icon={SwordIcon}
      title={line}
      actions={
        action === "configure" ? <Button onClick={onConfigure}>Open Configure</Button>
        : action === "ideas" ? <Button asChild><Link to={links.ideas()}>Get today's ideas</Link></Button>
        : <Button asChild><Link to={links.competitors({ view: "list" })}>Add a competitor</Link></Button>
      }
    />
  );
}

function Blitz({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [onBlitzJob(redraw), onBlitzChanged(redraw)];
    return () => offs.forEach((off) => off());
  }, []);
  const [cardParam, , closeCard] = useUrlItem("card");
  const update = useUrlUpdate();
  const [configure, openConfigure, closeConfigure] = useUrlItem("configure");
  const [why, setWhy] = useState(false);

  const s = loadBlitz(userId);
  // only when nothing at all can be dealt; a source switched on in Configure, or a first idea, ends it
  const nothing = !s.cards.length && nothingToDraw(userId);
  // the day's first visit starts the deck; a deck a reload stopped goes on
  useEffect(() => {
    const now = loadBlitz(userId);
    if (!nothing && (!now.cards.length || pending(now.cards))) startDeck(userId);
  }, [userId, nothing]);

  const running = blitzBusy();
  const open = openCards(s.cards);
  const card = open.find((c) => c.id === cardParam) ?? open[0] ?? null;
  const made = s.cards.filter((c) => c.state !== "waiting" && c.state !== "making").length;
  const kept = keptCount(s.cards);
  useEffect(() => setWhy(false), [card?.id]);

  const leave = () => {
    if (cardParam) closeCard();
  };
  const keep = (c: BlitzCard) => {
    const id = keepCard(userId, c.id);
    if (!id) return toast({ title: "This one isn't here any more.", variant: "destructive" });
    leave();
    toast({
      title: "Kept. It's in My posts.",
      description: <Link to={links.drafts({ schedule: id })} className="text-primary hover:underline">Schedule it</Link>,
      action: <ToastAction altText="Undo keep" onClick={() => undoKeep(userId, c.id)}>Undo</ToastAction>,
    });
  };
  const skip = (c: BlitzCard) => {
    const undo = skipCard(userId, c.id);
    leave();
    toast({ title: "Skipped.", duration: 5000, action: <ToastAction altText="Undo skip" onClick={undo}>Undo</ToastAction> });
  };
  const edit = (c: BlitzCard) => {
    const href = editHref(userId, c.id);
    if (!href) return;
    // Back from the editor comes here, to this card (replace: one history entry, not two)
    update({ card: c.id });
    navigate(href);
  };

  // K, S and E act on the open card; the newest handler is read on each key
  const onKey = useRef<(e: KeyboardEvent) => void>();
  onKey.current = (e: KeyboardEvent) => {
    if (!card) return;
    const act = keyAction(e);
    if (!act) return;
    if (act === "skip") skip(card);
    else if (card.state !== "new") return;
    else if (act === "keep") keep(card);
    else edit(card);
    e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // the deck is being made: the line beside the heading says so once, and the card area is a quiet skeleton
  const dealing = !nothing && (running || (!s.cards.length && !s.capped));
  const status = dealing ? (s.cards.length ? `Making today's ${s.cards.length}, ${made} ready` : "Making today's deck") : open.length ? `${open.length} left today` : "";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Blitz</h1>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
          {running && <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {status}
        </span>
        <Button variant="outline" className="ml-auto" aria-expanded={configure === "1"} aria-controls="configure" onClick={() => (configure === "1" ? closeConfigure() : openConfigure("1"))}>
          <SlidersHorizontalIcon /> Configure
        </Button>
      </header>

      {configure === "1" && <BlitzConfigure userId={userId} onClose={closeConfigure} />}

      {s.capped && <p className="text-sm text-warning" role="status">{CAPPED_LINE}</p>}

      {nothing ? (
        <NothingToDeal userId={userId} onConfigure={() => openConfigure("1")} />
      ) : card ? (
        <div className="flex justify-center gap-6">
          <RemixedFrom card={card} />
          <div className="w-full max-w-sm space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-border/60 px-3 py-1 text-xs font-medium">{FORMAT_LABELS[card.format]}</span>
              <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">{sourceChip(card)}</span>
              <button type="button" aria-expanded={why} aria-controls="bz-why" onClick={() => setWhy(!why)}
                className="rounded-full px-3 py-1 text-xs font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                Why this?
              </button>
            </div>
            {why && <p id="bz-why" className="text-center text-sm text-muted-foreground">{card.why}</p>}
            {/* on a phone the card is sized to the screen, so Skip, Edit and Keep stay above the bottom bar */}
            <div
              key={card.id}
              className="mx-auto [--bz-h:calc(100svh-470px)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 sm:[--bz-h:2000px]"
              style={{ maxWidth: card.format === "wall" ? "min(260px, max(170px, calc(var(--bz-h) * 9 / 16)))" : "min(320px, max(200px, calc(var(--bz-h) * 4 / 5)))" }}
            >
              {card.state === "failed" ? (
                <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium">{card.error || "Couldn't make this one."}</p>
                  <Button variant="outline" onClick={() => retryCard(userId, card.id)}>
                    <ArrowCounterClockwiseIcon /> Try again
                  </Button>
                </div>
              ) : (
                <BlitzPreview userId={userId} card={card} />
              )}
            </div>
            <div className="flex items-start justify-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <button type="button" className={cn(ROUND, "border-border bg-background hover:bg-muted")} onClick={() => skip(card)} aria-label="Skip" aria-keyshortcuts="S">
                  <XIcon className="h-6 w-6" />
                </button>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">Skip <Key k="S" /></span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button type="button" className={cn(ROUND, "border-border bg-background hover:bg-muted")} onClick={() => edit(card)} disabled={card.state !== "new"} aria-label="Edit" aria-keyshortcuts="E">
                  <PencilSimpleIcon className="h-5 w-5" />
                </button>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">Edit <Key k="E" /></span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button type="button" className={cn(ROUND, "border-primary bg-primary text-primary-foreground hover:bg-primary/90")} onClick={() => keep(card)} disabled={card.state !== "new"} aria-label="Keep" aria-keyshortcuts="K">
                  <CheckIcon className="h-6 w-6" />
                </button>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">Keep <Key k="K" /></span>
              </div>
            </div>
            {card.state === "new" && alsoMake(card).length > 0 && (
              <p className="flex flex-wrap justify-center gap-x-4 text-xs">
                {alsoMake(card).map((a) => (
                  <Link key={a.href} to={a.href} className="inline-flex min-h-9 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline [@media(pointer:coarse)]:min-h-11">
                    {a.label}
                  </Link>
                ))}
              </p>
            )}
          </div>
        </div>
      ) : dealing ? (
        <div className="mx-auto aspect-[4/5] w-full max-w-[320px] animate-pulse rounded-xl bg-muted" aria-busy="true" />
      ) : made > 0 ? (
        <EmptyState
          icon={StackIcon}
          title={`That's today's ${made}. You kept ${kept}.`}
          actions={
            <>
              <Button asChild variant={kept ? "outline" : "default"}><Link to={links.drafts()}>Open My posts</Link></Button>
              {kept > 0 && <Button asChild><Link to={links.drafts({ status: "draft", fill: 1 })}>Schedule the {kept}</Link></Button>}
            </>
          }
        />
      ) : null}
    </div>
  );
}
