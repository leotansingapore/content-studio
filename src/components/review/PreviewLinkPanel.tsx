import { useMemo, useState } from "react";
import { Copy, Link2, Loader2, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatWhen } from "@/components/team/shared";
import { loadBrand } from "@/lib/carousel";
import type { DraftEntry } from "@/lib/draftHistory";
import {
  PREVIEW_DAYS,
  createPreviewLink,
  isLinkLive,
  loadTokens,
  previewUrl,
  replyToPreview,
  revokePreviewLink,
  type PreviewComment,
  type PreviewLink,
} from "@/lib/previewLinks";
import { reviewTextForDraft } from "@/lib/teamReview";

// "Share for review" on a My posts card: make a preview link for someone
// without an account, copy it, read their comments, reply, or turn it off.
export default function PreviewLinkPanel({
  userId,
  draft,
  links,
  comments,
  onLink,
  onComment,
  onClose,
}: {
  userId: string;
  draft: DraftEntry;
  /** This draft's links, newest first. */
  links: PreviewLink[];
  comments: PreviewComment[];
  onLink: (link: PreviewLink) => void;
  onComment: (comment: PreviewComment) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState(() => loadTokens(userId));
  const [busy, setBusy] = useState<"share" | "off" | "reply" | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  const text = reviewTextForDraft(draft.draft);
  const latest = links[0];
  const live = latest && isLinkLive(latest) ? latest : null;
  const changed = live !== null && live.content !== text;
  const linkIds = useMemo(() => new Set(links.map((l) => l.id)), [links]);
  const thread = useMemo(
    () => comments.filter((c) => linkIds.has(c.link_id)).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    [comments, linkIds],
  );
  const liveUrl = live && tokens[live.id] ? previewUrl(window.location.origin, tokens[live.id]) : null;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Send it to your manager or compliance officer." });
    } catch {
      toast({ title: "Copy failed", description: "Select the link and copy it yourself.", variant: "destructive" });
    }
  };

  const share = async () => {
    setBusy("share");
    setError("");
    try {
      const senderName = loadBrand(userId)?.name?.trim() || null;
      const input = {
        draftId: draft.id,
        title: draft.hook?.trim() ?? "",
        platform: draft.platform || "unknown",
        format: draft.format || "unknown",
        content: text,
        senderName,
      };
      const made = await createPreviewLink(userId, input, window.location.origin);
      setTokens(loadTokens(userId));
      onLink({
        id: made.id,
        draft_id: draft.id,
        sender_name: senderName ?? "You",
        title: input.title,
        platform: input.platform,
        format: input.format,
        content: text,
        created_at: new Date().toISOString(),
        expires_at: made.expiresAt,
        revoked_at: null,
      });
      await copy(made.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the link. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    if (!live) return;
    if (!confirmOff) {
      setConfirmOff(true);
      return;
    }
    setBusy("off");
    setError("");
    try {
      await revokePreviewLink(live.id);
      onLink({ ...live, revoked_at: new Date().toISOString() });
      setConfirmOff(false);
      toast({ title: "Link turned off", description: "Anyone opening it now sees that it has ended." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn the link off. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const sendReply = async () => {
    if (!live || !reply.trim()) return;
    setBusy("reply");
    setError("");
    try {
      onComment(await replyToPreview(live.id, reply));
      setReply("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your reply. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="Preview link"
      className="mt-3 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          <Link2 className="h-3.5 w-3.5" /> Preview link
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview link"
          className="-m-2 p-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!text ? (
        <p className="text-xs text-muted-foreground">Write the post first, then share it for review.</p>
      ) : live ? (
        <div className="space-y-2">
          {liveUrl && (
            <div className="flex gap-2">
              <input
                readOnly
                value={liveUrl}
                aria-label="Preview link address"
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-[11px] text-foreground sm:h-9"
              />
              <Button size="sm" onClick={() => void copy(liveUrl)} className="h-10 shrink-0 gap-1.5 sm:h-9">
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Anyone with the link can read this post and comment until {formatWhen(live.expires_at)}.
          </p>
          {changed && (
            <p className="text-[11px] text-warning">You've edited the post since sharing it. Share the new version so they review what you'll post.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={changed ? "default" : "outline"}
              onClick={() => void share()}
              disabled={busy !== null}
              className="h-10 gap-1.5 sm:h-9"
            >
              {busy === "share" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Share new version
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void turnOff()}
              disabled={busy !== null}
              className={`h-10 text-xs sm:h-9 ${confirmOff ? "text-destructive" : "text-muted-foreground"}`}
            >
              {busy === "off" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {confirmOff ? "Confirm turn off" : "Turn off link"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button size="sm" onClick={() => void share()} disabled={busy !== null} className="h-10 gap-1.5 sm:h-9">
            {busy === "share" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            {latest ? "Make a new link" : "Make a preview link"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {latest
              ? "Your last link has ended. A new one shares the post as it is now."
              : `Anyone with the link can read this post and comment, without signing in, for ${PREVIEW_DAYS} days. The link is copied for you.`}
          </p>
        </div>
      )}

      {thread.length > 0 && (
        <ul className="space-y-2" aria-label="Comments from reviewers">
          {thread.map((c) => {
            const earlier = latest && c.link_id !== latest.id;
            return (
              <li
                key={c.id}
                className={`rounded-md border px-2.5 py-2 text-xs ${
                  c.from_owner ? "border-border/60 bg-background" : "border-primary/30 bg-card"
                }`}
              >
                <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.from_owner ? "You" : c.author_name}</span>
                  <span>{formatWhen(c.created_at)}</span>
                  {earlier && <span>On an earlier version</span>}
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-foreground [overflow-wrap:anywhere]">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {live && thread.some((c) => !c.from_owner) && (
        <div className="space-y-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to your reviewer"
            aria-label="Reply to your reviewer"
            maxLength={2000}
            autoResize
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void sendReply()}
            disabled={busy !== null || !reply.trim()}
            className="h-10 gap-1.5 sm:h-9"
          >
            {busy === "reply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send reply
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="break-words text-[11px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
