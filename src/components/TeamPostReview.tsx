import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, Copy, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { keyToDate } from "@/lib/dueDates";
import { safeExternalUrl } from "@/lib/embed";
import {
  addComment,
  approve,
  skip,
  skippedBy,
  statusOf,
  threadOf,
  unapprove,
  unskip,
  type TeamPost,
  type TeamReviews,
  type TeamStatus,
} from "@/lib/teamPosts";

export const TEAM_STATUS: Record<TeamStatus, { label: string; tone: string }> = {
  waiting: { label: "Waiting for you", tone: "bg-warning/15 text-warning" },
  approved: { label: "Approved", tone: "bg-success/15 text-success" },
  revising: { label: "Revising", tone: "bg-brand/15 text-brand" },
  posted: { label: "Posted", tone: "bg-muted text-muted-foreground" },
  skipped: { label: "Skipped", tone: "bg-muted/60 text-muted-foreground" },
};

const PRODUCT = { gac: "Growing Age Calculator", at: "ActivityTracker" } as const;

const dayLabel = (key: string) =>
  keyToDate(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** A team post on the calendar: thumbnail, title, status colour (label spelled out when roomy). */
export function TeamPostChip({
  post,
  status,
  roomy,
  onOpen,
}: {
  post: TeamPost;
  status: TeamStatus;
  roomy: boolean;
  onOpen: () => void;
}) {
  const s = TEAM_STATUS[status];
  const img = safeExternalUrl(post.image);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Team post: ${post.title} (${s.label})`}
      className={`flex w-full items-center gap-1.5 rounded px-1 text-left font-medium ${s.tone} ${
        roomy ? "py-1 text-xs sm:text-[11px]" : "py-0.5 text-[10px]"
      }`}
    >
      {img && <img src={img} alt="" loading="lazy" className={`${roomy ? "h-8 w-8" : "h-4 w-4"} shrink-0 rounded-sm object-cover`} />}
      <span className="min-w-0 flex-1">
        <span className={roomy ? "line-clamp-2" : "block truncate"}>{post.title}</span>
        {roomy ? <span className="block text-[10px] opacity-80">{s.label}</span> : <span className="sr-only">, {s.label}</span>}
      </span>
    </button>
  );
}

// Typed, unsent comments per post: they outlive the panel closing.
const unsent = new Map<string, string>();

/** Review panel: the picture and text as they will post, Approve or Skip, and the comment thread. */
export function TeamPostPanel({
  uid,
  post,
  reviews,
  onReviews,
  onClose,
}: {
  uid: string;
  post: TeamPost;
  reviews: TeamReviews;
  onReviews: (next: TeamReviews) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState(() => unsent.get(post.id) ?? "");
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Same modal behaviour as PostDetailDrawer: Escape closes, the page stops scrolling, focus returns.
  useEffect(() => {
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
  }, []);

  const review = reviews[post.id];
  const status = statusOf(post, review);
  const done = status === "posted" || status === "skipped";
  const approvedHere = review?.approvedRev === post.rev;
  const img = safeExternalUrl(post.image);
  const link = safeExternalUrl(post.postLink);
  const thread = threadOf(post, review);

  const type = (v: string) => {
    setText(v);
    unsent.set(post.id, v);
  };
  const send = () => {
    if (!text.trim() || done) return;
    onReviews(addComment(uid, post, text));
    type("");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(post.message);
      toast({ title: "Message copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Team post: ${post.title}`}
    >
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-border/70">
        <div className="flex items-start gap-2 border-b border-border/60 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              Team post · {PRODUCT[post.product] ?? post.product} · version {post.rev}
            </p>
            <h2 className="text-base font-semibold leading-snug text-foreground">{post.title}</h2>
          </div>
          <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TEAM_STATUS[status].tone}`}>
            {TEAM_STATUS[status].label}
          </span>
          <CopyLinkButton label="Copy link to this team post" className="-mt-1" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {img && (
            <a href={img} target="_blank" rel="noopener noreferrer" title="Open full size" className="block">
              <img src={img} alt={post.title} className="w-full rounded-lg border border-border/60 bg-muted" />
            </a>
          )}

          <p className="text-sm text-foreground">
            {post.postedAt ? (
              <>
                Posted {whenLabel(post.postedAt)}
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    Open in Telegram <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </>
            ) : status === "skipped" ? (
              "Skipped, it will not go out"
            ) : (
              `Goes out ${dayLabel(post.day)} at ${post.time}`
            )}
          </p>

          <div className="space-y-2">
            <p className="whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
              {post.message}
            </p>
            <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>

          {status === "skipped" ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Ban className="h-4 w-4" /> {skippedBy(post, review) === "telegram" ? "Skipped on Telegram" : "Skipped"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onReviews(unskip(uid, post))} className="text-muted-foreground">
                Undo
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {approvedHere ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-success">
                    <Check className="h-4 w-4" /> Approved
                  </span>
                  {!done && (
                    <Button variant="ghost" size="sm" onClick={() => onReviews(unapprove(uid, post))} className="text-muted-foreground">
                      Undo
                    </Button>
                  )}
                </div>
              ) : status === "approved" ? (
                <p className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> Approved on Telegram
                </p>
              ) : (
                <Button onClick={() => onReviews(approve(uid, post))} disabled={done} className="flex-1 sm:flex-none">
                  <Check className="h-4 w-4" /> Approve
                </Button>
              )}
              {!post.postedAt && (
                <Button variant="outline" onClick={() => onReviews(skip(uid, post))}>
                  Skip
                </Button>
              )}
            </div>
          )}

          <section aria-label="Comments" className="space-y-2 border-t border-border/60 pt-4">
            {thread.map((c) => (
              <div key={c.id} className="rounded-lg bg-muted/40 p-2.5">
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{c.text}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {whenLabel(c.at)} · about version {c.rev}
                  {c.source === "telegram" && " · Telegram"}
                </p>
              </div>
            ))}
            {!done && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="space-y-2"
              >
                <Textarea
                  value={text}
                  onChange={(e) => type(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  autoResize
                  rows={2}
                  placeholder="What should change?"
                  aria-label="Comment"
                  className="min-h-[64px]"
                />
                <div className="flex items-start gap-3">
                  <p className="flex-1 text-xs text-muted-foreground">
                    Claude reworks the post from your comment and it comes back here for approval.
                  </p>
                  <Button type="submit" variant="outline" size="sm" disabled={!text.trim()}>
                    Send
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
