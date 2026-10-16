import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  NEXT,
  addNote,
  aspectOf,
  brandOf,
  currentVersion,
  igLine,
  isCarousel,
  openNotes,
  type Board,
  type ReelCard,
  type StageId,
} from "@/lib/reelsBoard";

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No date yet";

/** The whole post as it will look: every slide or the reel itself, the full caption, and the decision beside it. */
function Post({ card, board, onChange, onMove, onOpen }: {
  card: ReelCard;
  board: Board;
  onChange: (c: ReelCard) => void;
  onMove: (id: string, to: StageId) => void;
  onOpen: (id: string) => void;
}) {
  const { toast } = useToast();
  const v = currentVersion(card);
  const car = isCarousel(card);
  const slides = v.slideUrls ?? [];
  const strip = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(1);
  // A "needs changes" note is typed right here and kept per post until sent, so a reload never loses it.
  const key = `cs-reelnote-draft-${card.id}`;
  const [noting, setNoting] = useState(() => !!localStorage.getItem(key));
  const [note, setNote] = useState(() => localStorage.getItem(key) ?? "");
  const [sending, setSending] = useState(false);
  const next = NEXT[card.stage];
  const ig = igLine(card);
  const notes = openNotes(card);

  const go = (k: number) => {
    const s = strip.current;
    if (!s) return;
    s.scrollTo({ left: (k - 1) * s.clientWidth, behavior: "smooth" });
    setSlide(k);
  };

  const sendNote = async () => {
    const text = note.trim();
    if (!text) return;
    setSending(true);
    try {
      onChange(await addNote(card.id, car ? { text, slide } : { text, t: null }));
      localStorage.removeItem(key);
      setNote("");
      setNoting(false);
      if (card.stage !== "changes") onMove(card.id, "changes");
    } catch {
      toast({ title: "Couldn't save the note", description: "Your text is still here; check your connection and try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <article className="grid gap-4 rounded-2xl border border-border/60 bg-card p-3 shadow-card sm:p-4 lg:grid-cols-[minmax(0,420px)_1fr]" aria-label={card.title}>
      <div className="mx-auto w-full" style={{ maxWidth: car ? 420 : 300 }}>
        {car ? (
          <div className="space-y-2">
            <div className="relative">
              <div
                ref={strip}
                className="flex snap-x snap-mandatory overflow-x-auto rounded-xl bg-muted [scrollbar-width:none]"
                style={{ aspectRatio: aspectOf(card) }}
                onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth) + 1)}
              >
                {slides.map((u, i) => (
                  <img key={u || i} src={u} alt={`${card.title}, slide ${i + 1} of ${slides.length}`} loading="lazy"
                    className="h-full w-full shrink-0 snap-center object-contain" />
                ))}
              </div>
              {slides.length > 1 && (
                <>
                  <button type="button" onClick={() => go(slide - 1)} disabled={slide <= 1} aria-label="Previous slide"
                    className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow disabled:opacity-0">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => go(slide + 1)} disabled={slide >= slides.length} aria-label="Next slide"
                    className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow disabled:opacity-0">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            {slides.length > 1 && (
              <div className="flex items-center justify-center gap-1.5" aria-label={`Slide ${slide} of ${slides.length}`}>
                {slides.map((_, i) => (
                  <button key={i} type="button" onClick={() => go(i + 1)} aria-label={`Go to slide ${i + 1}`}
                    className={`h-2 rounded-full transition-all ${i + 1 === slide ? "w-5 bg-primary" : "w-2 bg-muted-foreground/40"}`} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <video key={v.file} src={v.src} poster={v.thumbUrl} controls playsInline preload="metadata"
            className="w-full rounded-xl bg-black" style={{ aspectRatio: aspectOf(card) }} />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="space-y-1">
          <h3 className="font-serif text-lg font-semibold leading-snug">{card.title}</h3>
          <p className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-muted px-2 py-0.5">{board.brands.find((b) => b.id === brandOf(card))?.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5">{car ? (slides.length > 1 ? `Carousel, ${slides.length} slides` : "Picture post") : "Reel"}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{when(card.schedule)}</span>
            {notes > 0 && <span className="rounded-full bg-warning/20 px-2 py-0.5 font-semibold">{notes} open note{notes > 1 ? "s" : ""}</span>}
          </p>
          {ig && <p className={`text-xs font-semibold ${ig.href ? "text-primary" : "text-muted-foreground"}`}>{ig.text}</p>}
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed">{card.caption || <span className="text-muted-foreground">No caption yet.</span>}</p>

        <div className="mt-auto space-y-2">
          {noting && (
            <div className="space-y-2">
              <Textarea rows={2} autoFocus value={note} placeholder={car && slides.length > 1 ? `What should change? (pinned to slide ${slide})` : "What should change?"}
                onChange={(e) => { setNote(e.target.value); localStorage.setItem(key, e.target.value); }}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && sendNote()} className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" disabled={!note.trim() || sending} onClick={sendNote}>{sending ? "Sending..." : "Send note"}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setNoting(false); setNote(""); localStorage.removeItem(key); }}>Cancel</Button>
              </div>
            </div>
          )}
          {!noting && (
            <div className="flex flex-wrap gap-2">
              {next && <Button size="sm" className="min-w-28" onClick={() => onMove(card.id, next[0])}>{next[1]}</Button>}
              {card.stage !== "posted" && card.stage !== "archived" && (
                <Button size="sm" variant="outline" onClick={() => setNoting(true)}>
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Needs changes
                </Button>
              )}
              {card.stage !== "archived" && <Button size="sm" variant="ghost" onClick={() => onMove(card.id, "archived")}>Archive</Button>}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpen(card.id)}>Details</Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ReelFeed({ cards, board, onChange, onMove, onOpen }: {
  cards: ReelCard[];
  board: Board;
  onChange: (c: ReelCard) => void;
  onMove: (id: string, to: StageId) => void;
  onOpen: (id: string) => void;
}) {
  if (cards.length === 0) return <p className="rounded-xl border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">Nothing here.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {cards.map((c) => <Post key={c.id} card={c} board={board} onChange={onChange} onMove={onMove} onOpen={onOpen} />)}
    </div>
  );
}
