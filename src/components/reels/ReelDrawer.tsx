import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  FLOW,
  NEXT,
  addNote,
  brandOf,
  currentVersion,
  igLine,
  isCarousel,
  mmss,
  openNotes,
  resolveNote,
  updateCard,
  type Board,
  type ReelCard,
  type StageId,
} from "@/lib/reelsBoard";

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function ReelDrawer({
  card,
  board,
  onChange,
  onMove,
  onClose,
  start,
}: {
  card: ReelCard;
  board: Board;
  onChange: (c: ReelCard) => void;
  onMove: (id: string, to: StageId) => void;
  onClose: () => void;
  start?: { t?: number; slide?: number };
}) {
  const { toast } = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const slides = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const [slide, setSlide] = useState(1);
  const [note, setNote] = useState(() => localStorage.getItem(`cs-reelnote-draft-${card.id}`) ?? "");
  const [caption, setCaption] = useState(card.caption ?? "");
  const [capState, setCapState] = useState("");
  const [sending, setSending] = useState(false);
  const capTimer = useRef<number>();
  const v = currentVersion(card);
  const car = isCarousel(card);
  const stageName = (id: string) => board.stages.find((s) => s.id === id)?.name ?? id;
  const next = NEXT[card.stage];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (start?.slide) setTimeout(() => goSlide(start.slide!), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goSlide = (k: number) => {
    const s = slides.current;
    if (!s) return;
    s.scrollTo({ left: (k - 1) * s.clientWidth, behavior: "smooth" });
    setSlide(k);
  };

  const fail = (what: string) => toast({ title: `Couldn't save ${what}`, description: "Check your connection and try again.", variant: "destructive" });

  const patch = (p: Parameters<typeof updateCard>[1], what: string) =>
    updateCard(card.id, p).then(onChange).catch(() => fail(what));

  const onCaption = (text: string) => {
    setCaption(text);
    setCapState("Saving...");
    window.clearTimeout(capTimer.current);
    capTimer.current = window.setTimeout(() => {
      updateCard(card.id, { caption: text })
        .then((c) => {
          onChange(c);
          setCapState(`Saved - ${text.length}/2200`);
        })
        .catch(() => setCapState("Not saved. Your text is still here; check your connection."));
    }, 500);
  };

  const sendNote = async () => {
    const text = note.trim();
    if (!text) return;
    setSending(true);
    try {
      const c = await addNote(card.id, car ? { text, slide } : { text, t: video.current ? Math.round(video.current.currentTime * 10) / 10 : null });
      onChange(c);
      setNote("");
      localStorage.removeItem(`cs-reelnote-draft-${card.id}`);
    } catch {
      fail("the note");
    } finally {
      setSending(false);
    }
  };

  const copyLink = (extra: Record<string, string | number | undefined> = {}) => {
    const u = new URL(window.location.origin + "/reels");
    u.searchParams.set("card", card.id);
    for (const [k, val] of Object.entries(extra)) if (val !== undefined && val !== "") u.searchParams.set(k, String(val));
    navigator.clipboard.writeText(u.toString().replace(/%7E/g, "~")).then(
      () => toast({ title: "Link copied" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={card.title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[600px] flex-col bg-background shadow-elegant">
        <div className="flex items-start gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-lg font-semibold leading-snug">{card.title}</h2>
            <p className="text-xs text-muted-foreground">
              {board.brands.find((b) => b.id === brandOf(card))?.name} - {card.styleName ?? card.style} - {stageName(card.stage)}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => copyLink()} aria-label="Copy link to this reel">
            <Link2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
            {car ? (
              <div className="space-y-2">
                <div ref={slides} className="flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto rounded-xl bg-black"
                  onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth) + 1)}>
                  {(v.slideUrls ?? []).map((u, i) => (
                    <img key={u || i} src={u} alt={`Slide ${i + 1}`} className="h-full w-full shrink-0 snap-center object-contain" />
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <Button variant="outline" size="sm" className="h-8" disabled={slide <= 1} onClick={() => goSlide(slide - 1)} aria-label="Previous slide">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>{slide} / {v.slideUrls?.length ?? 0}</span>
                  <Button variant="outline" size="sm" className="h-8" disabled={slide >= (v.slideUrls?.length ?? 0)} onClick={() => goSlide(slide + 1)} aria-label="Next slide">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <video
                key={v.file}
                ref={video}
                src={v.src}
                poster={v.thumbUrl}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => start?.t && (e.currentTarget.currentTime = start.t)}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                className="mx-auto aspect-[9/16] w-full max-w-[240px] rounded-xl bg-black"
              />
            )}

            <div className="space-y-3">
              <ol className="flex flex-wrap gap-1 text-[11px]" aria-label="Where this reel is">
                {FLOW.map((s, i) => {
                  const cur = FLOW.indexOf(card.stage);
                  return (
                    <li key={s} className={`rounded-full border px-2 py-0.5 ${
                      s === card.stage ? "border-primary bg-primary text-primary-foreground font-semibold" : cur > i ? "border-success/50 text-success" : "border-border/60 text-muted-foreground"
                    }`}>{stageName(s)}</li>
                  );
                })}
                {(card.stage === "changes" || card.stage === "archived") && (
                  <li className="rounded-full border border-warning/60 bg-warning/15 px-2 py-0.5 font-semibold">{stageName(card.stage)}</li>
                )}
              </ol>
              {(() => {
                const ig = igLine(card);
                if (!ig) return null;
                return ig.href ? (
                  <a href={ig.href} target="_blank" rel="noopener noreferrer" className="block text-xs font-semibold text-primary hover:underline">{ig.text}</a>
                ) : (
                  <p className="text-xs font-semibold text-muted-foreground">{ig.text}{card.schedule ? `, ${when(card.schedule)}` : ""}</p>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                {next && <Button size="sm" onClick={() => onMove(card.id, next[0])}>{next[1]}</Button>}
                {card.stage !== "changes" && card.stage !== "posted" && (
                  <Button size="sm" variant="outline" onClick={() => onMove(card.id, "changes")}>Needs changes</Button>
                )}
                {card.stage !== "archived" && (
                  <Button size="sm" variant="ghost" onClick={() => onMove(card.id, "archived")}>Archive</Button>
                )}
              </div>
              <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
                Version
                <select value={card.version} onChange={(e) => patch({ version: e.target.value }, "the version")}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground">
                  {card.versions.map((x) => (
                    <option key={x.file} value={x.file}>{x.label} ({new Date(x.mtime * 1000).toLocaleDateString([], { day: "numeric", month: "short" })})</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
                Profile
                <select value={brandOf(card)} onChange={(e) => patch({ brand: e.target.value }, "the profile")}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground">
                  {board.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
                Post at
                <input type="datetime-local" value={card.schedule ?? ""} onChange={(e) => patch({ schedule: e.target.value }, "the date")}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground" />
              </label>
            </div>
          </div>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Caption</h3>
              <span className="text-[11px] text-muted-foreground" aria-live="polite">{capState}</span>
            </div>
            <Textarea rows={7} value={caption} maxLength={2200} onChange={(e) => onCaption(e.target.value)} className="text-sm" />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Notes{card.comments.length > 0 && <span className="font-normal text-muted-foreground"> ({openNotes(card)} open)</span>}
            </h3>
            <ul className="space-y-1.5">
              {card.comments.map((m) => (
                <li key={m.id} className={`flex items-start gap-2 rounded-lg border border-border/60 p-2 text-sm ${m.resolved ? "opacity-60" : ""}`}>
                  {m.slide ? (
                    <button type="button" onClick={() => goSlide(m.slide!)} className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">S{m.slide}</button>
                  ) : m.t != null ? (
                    <button type="button" onClick={() => { if (video.current) { video.current.currentTime = m.t!; void video.current.play(); } }}
                      className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">{mmss(m.t)}</button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className={m.resolved ? "line-through" : ""}>{m.text}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {when(m.at)}{m.version !== card.version ? ` - on ${card.versions.find((x) => x.file === m.version)?.label ?? "an older version"}` : ""}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Resolved"
                    title="Resolved"
                    checked={m.resolved}
                    onChange={(e) => resolveNote(card.id, m.id, e.target.checked).then(onChange).catch(() => fail("that"))}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                </li>
              ))}
            </ul>
            <Textarea
              rows={2}
              value={note}
              placeholder={car ? `Note on slide ${slide}` : `Note at ${mmss(now)}`}
              onChange={(e) => {
                setNote(e.target.value);
                localStorage.setItem(`cs-reelnote-draft-${card.id}`, e.target.value);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && sendNote()}
              className="text-sm"
            />
            <Button size="sm" disabled={!note.trim() || sending} onClick={sendNote}>
              {sending ? "Adding..." : car ? `Pin to slide ${slide}` : `Pin to ${mmss(now)}`}
            </Button>
          </section>

          {card.history.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-sm font-semibold">History</h3>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {[...card.history].reverse().map((h, i) => (
                  <li key={i}>{when(h.at)}: {h.from ? `${stageName(h.from)} to ` : ""}{stageName(h.to)}{h.note ? ` (${h.note})` : ""}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
