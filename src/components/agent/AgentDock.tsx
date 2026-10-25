// The agent dock (agent-chat, Leo only): the floating launcher and panel that replace today's assistant dock on Leo's
// sign-ins, hosting a compact AgentThread over the same synced chats as /agent, with "Open full chat" to the page.
// The launcher hides on /agent and /home, which carry their own composer. AssistantMount renders this for Leo and
// today's AssistantDock, untouched, for everyone else. Mounted on every studio page, it also resumes the agent once
// per sign-in: turns a closed tab left half-done read as interrupted, and jobs still running are followed again.

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, MessageSquare, Plus, X } from "lucide-react";
import AgentThread, { useThreads } from "@/components/agent/AgentThread";
import { feedbackFor, type DockIdentity } from "@/components/agent/dockActions";
import { resumeAgent, setFeedback, setNavigate } from "@/lib/agentRun";
import { links } from "@/lib/links";

const resumed = new Set<string>();
const ICON = "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

/** Pages with their own composer, where the launcher stays hidden. */
export const ownComposer = (pathname: string) => pathname === "/home" || pathname === "/agent" || pathname.startsWith("/agent/");

export default function AgentDock({ userId, identity }: { userId: string; identity?: DockIdentity }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const threads = useThreads(userId);
  const [threadId, setThreadId] = useState<string | null>(() => threads[0]?.id ?? null);

  useEffect(() => {
    if (resumed.has(userId)) return;
    resumed.add(userId);
    resumeAgent(userId);
  }, [userId]);
  // the engine asks the feedback service, and opens Write, through this sign-in's dock
  const { id, name, email } = identity ?? { id: userId };
  useEffect(() => {
    setFeedback(feedbackFor({ id, name, email }));
    setNavigate(navigate);
    return () => {
      setFeedback(null);
      setNavigate(null);
    };
  }, [id, name, email, navigate]);
  // the open panel says so on <html>, so the tour's popover and pill move clear of it (live-p6replay D9, TourPopover)
  useEffect(() => {
    if (!open || ownComposer(pathname)) return;
    document.documentElement.dataset.agentDock = "open";
    return () => void delete document.documentElement.dataset.agentDock;
  }, [open, pathname]);
  useEffect(() => {
    if (!open) return;
    // an Esc the composer used (closing its slash menu) leaves the dock open
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (ownComposer(pathname)) return null;
  const title = threads.find((t) => t.id === threadId)?.title;
  const place = "fixed right-5 z-[60] bottom-[88px] lg:bottom-5";

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the agent"
        className={`${place} inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 sm:w-auto sm:px-4`}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Agent</span>
      </button>
    );

  return (
    <div
      role="dialog"
      aria-label="Agent"
      className={`${place} flex h-[min(640px,calc(100dvh-104px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl lg:h-[min(640px,calc(100dvh-40px))]`}
    >
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Agent</p>
          <p className="truncate text-[11px] text-muted-foreground">{title ?? "New chat"}</p>
        </div>
        <Link
          to={threadId ? links.agent({ thread: threadId }) : links.agent()}
          onClick={() => setOpen(false)}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent [@media(pointer:coarse)]:h-11"
        >
          Open full chat <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        {threadId && (
          <button type="button" onClick={() => setThreadId(null)} aria-label="New chat" title="New chat" className={ICON}>
            <Plus className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={ICON}>
          <X className="h-4 w-4" />
        </button>
      </header>
      <AgentThread key={threadId ?? "new"} compact userId={userId} threadId={threadId} identity={identity} onThread={setThreadId} />
    </div>
  );
}
