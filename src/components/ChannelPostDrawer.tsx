import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import CopyLinkButton from "@/components/CopyLinkButton";
import { STATUS_LABEL, parseCaption, type CalendarFeedItem } from "@/lib/channelFeeds";

const STATUS_NOTE: Record<CalendarFeedItem["status"], string> = {
  posted: "This went out to the channel.",
  locked: "You were sent this preview. It goes out exactly as shown.",
  planned: "The words and pictures are made at 22:30 the night before, when you get the preview. Fresh news that comes in first can move it.",
};

const STATUS_STYLE: Record<CalendarFeedItem["status"], string> = {
  posted: "bg-success/15 text-success",
  locked: "bg-primary/15 text-primary",
  planned: "bg-muted text-muted-foreground",
};

function Caption({ html }: { html: string }) {
  return (
    <p className="text-sm leading-relaxed text-foreground">
      {parseCaption(html).map((p, i) =>
        p.t === "br" ? (
          <br key={i} />
        ) : p.t === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className={`text-primary underline ${p.bold ? "font-semibold" : ""}`}>
            {p.s}
          </a>
        ) : (
          <span key={i} className={p.bold ? "font-semibold" : undefined}>
            {p.s}
          </span>
        ),
      )}
    </p>
  );
}

/** One scheduled channel post, whole: every picture in order, the caption as it posts, or the quiz. */
export default function ChannelPostDrawer({ item, onClose }: { item: CalendarFeedItem | null; onClose: () => void }) {
  const open = item !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open]);

  if (!item) return null;
  const when = new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  // Portalled to <body> like PostDetailDrawer: inside the page the sidebar's stacking context sits over the backdrop.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={item.title}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-border/70">
        <div className="flex items-start gap-3 border-b border-border/60 p-4 pr-28">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-700 dark:text-sky-300">{item.business}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                <Send className="h-3 w-3" /> {item.channel}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {when}
              {item.time ? `, ${item.time}` : ""} {item.handle ? `to ${item.handle}` : ""} · {item.format}
            </p>
            <p className="font-serif text-lg font-semibold leading-snug text-foreground">{item.title}</p>
          </div>
          <CopyLinkButton label="Copy link to this post" className="absolute right-14 top-3 rounded-full bg-muted text-foreground hover:bg-muted/70" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">{STATUS_NOTE[item.status]}</p>

          {item.media.length > 0 && (
            <div className="space-y-3">
              {item.media.map((src, i) => (
                <figure key={src} className="space-y-1">
                  {item.media.length > 1 && (
                    <figcaption className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Picture {i + 1} of {item.media.length}
                    </figcaption>
                  )}
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    <img src={src} alt={`${item.title}, picture ${i + 1}`} loading="lazy" className="w-full rounded-lg border border-border/60" />
                  </a>
                </figure>
              ))}
            </div>
          )}

          {item.quiz && (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-sm font-semibold text-foreground">{item.quiz.question}</p>
              <ul className="space-y-1">
                {item.quiz.options.map((o, i) => (
                  <li key={i} className={`rounded-md px-2 py-1 text-sm ${i === item.quiz!.answer ? "bg-success/15 font-medium text-success" : "bg-muted/40 text-foreground"}`}>
                    {o}
                  </li>
                ))}
              </ul>
              {item.quiz.explain && <p className="text-xs text-muted-foreground">{item.quiz.explain}</p>}
            </div>
          )}

          {item.caption ? (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Caption</p>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <Caption html={item.caption} />
              </div>
            </div>
          ) : (
            !item.quiz && item.status !== "planned" && <p className="text-sm text-muted-foreground">No caption.</p>
          )}

          {item.link && (
            <Button asChild variant="outline" className="w-full gap-2">
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Open the article
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
