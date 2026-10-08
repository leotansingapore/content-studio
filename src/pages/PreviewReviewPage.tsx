// /review/:token - public. A manager or compliance officer reads a post an
// adviser shared and comments on it without signing in. Data comes from the
// preview-link edge function; the token in the URL is the only credential.
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FORMAT_LABEL, PLATFORM_LABEL, formatWhen } from "@/components/team/shared";
import { fetchPublicPreview, postPublicComment, type PublicPreview } from "@/lib/previewLinks";

const NAME_KEY = "cs-review-name"; // device-only convenience

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The token is a credential: keep it out of search engines and Referer headers. */
function useTokenPageMeta() {
  useEffect(() => {
    const added = [
      ["robots", "noindex, nofollow"],
      ["referrer", "no-referrer"],
    ].map(([name, content]) => {
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      document.head.appendChild(m);
      return m;
    });
    const title = document.title;
    document.title = "Post for review - Content Studio";
    return () => {
      added.forEach((m) => m.remove());
      document.title = title;
    };
  }, []);
}

export default function PreviewReviewPage() {
  useTokenPageMeta();
  const { token = "" } = useParams();
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");
  const [error, setError] = useState("");
  const [post, setPost] = useState<PublicPreview | null>(null);
  const [name, setName] = useState(readName);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  const load = async () => {
    setState("loading");
    const r = await fetchPublicPreview(token);
    if (r.ok && r.data) {
      setPost(r.data);
      setState("ready");
    } else if (r.gone) {
      setState("gone");
    } else {
      setError(r.message ?? "");
      setState("error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setSendError("Add your name so the adviser knows who commented.");
    if (!body.trim()) return setSendError("Write a comment first.");
    setSending(true);
    setSendError("");
    setSent(false);
    const r = await postPublicComment(token, { name, body, website });
    setSending(false);
    if (!r.ok) {
      if (r.gone) setState("gone");
      setSendError(r.message ?? "");
      return;
    }
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      // private mode: the name just isn't remembered
    }
    if (r.data && post) setPost({ ...post, comments: [...post.comments, r.data] });
    setBody("");
    setSent(true);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Content Studio - post for review
        </p>

        {state === "loading" ? (
          <div role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the post…
          </div>
        ) : state === "gone" ? (
          <section className="space-y-2 rounded-xl border border-border/70 bg-card p-5 shadow-card">
            <h1 className="font-serif text-xl font-semibold">This link has ended</h1>
            <p className="text-sm text-muted-foreground">
              It expired or the adviser turned it off. Ask them to share the post again.
            </p>
          </section>
        ) : state === "error" || !post ? (
          <section role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="text-sm">{error || "Couldn't load the post."}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </section>
        ) : (
          <>
            <header className="space-y-2">
              <h1 className="break-words font-serif text-2xl font-semibold leading-tight sm:text-3xl">
                {post.title || `A post from ${post.sender_name}`}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>Shared by {post.sender_name}</span>
                <span aria-hidden>·</span>
                <span>{PLATFORM_LABEL[post.platform] ?? "Social"} {FORMAT_LABEL[post.format] ?? "post"}</span>
                <span aria-hidden>·</span>
                <span>Open until {formatWhen(post.expires_at)}</span>
              </p>
            </header>

            {post.superseded && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                {post.sender_name} has shared a newer version of this post. Ask them for the new link before approving.
              </p>
            )}

            <article className="whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-card p-4 text-sm leading-relaxed shadow-card [overflow-wrap:anywhere] sm:p-5">
              {post.content}
            </article>

            <section className="space-y-3" aria-labelledby="comments-heading">
              <h2 id="comments-heading" className="text-sm font-semibold">
                Comments{post.comments.length ? ` (${post.comments.length})` : ""}
              </h2>
              {post.comments.length > 0 && (
                <ul className="space-y-2">
                  {post.comments.map((c) => (
                    <li
                      key={c.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        c.from_owner ? "border-primary/30 bg-primary/5" : "border-border/70 bg-card"
                      }`}
                    >
                      <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {c.author_name}
                          {c.from_owner ? " (adviser)" : ""}
                        </span>
                        <span>{formatWhen(c.created_at)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line break-words [overflow-wrap:anywhere]">{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submit} className="space-y-3 rounded-xl border border-border/70 bg-card p-4 shadow-card">
                <div className="space-y-1.5">
                  <Label htmlFor="review-name">Your name</Label>
                  <Input
                    id="review-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="e.g. Carol Lim, Compliance"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="review-body">Comment</Label>
                  <Textarea
                    id="review-body"
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setSent(false);
                    }}
                    maxLength={2000}
                    autoResize
                    placeholder="What should change before this goes out?"
                  />
                </div>
                {/* Honeypot: hidden from people and screen readers; bots fill it. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label>
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>
                <Button type="submit" disabled={sending} className="h-11 w-full gap-1.5 sm:h-10 sm:w-auto">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send comment
                </Button>
                {sent && (
                  <p role="status" className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" /> Sent. {post.sender_name} sees it in Content Studio.
                  </p>
                )}
                {sendError && (
                  <p role="alert" className="break-words text-sm text-destructive">
                    {sendError}
                  </p>
                )}
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
