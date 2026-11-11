// The agent dock (agent-chat, Leo only): the floating launcher and panel that replace today's assistant dock on Leo's
// sign-ins, hosting a compact AgentThread over the same synced chats as /agent, with "Open full chat" to the page.
// The launcher hides on /agent and /home, which carry their own composer. AssistantMount renders this for Leo and
// today's AssistantDock, untouched, for everyone else. Mounted on every studio page, it also resumes the agent once
// per sign-in: turns a closed tab left half-done read as interrupted, and jobs still running are followed again.
// The open dock lives in the address (?dock=<thread id>, or new; docs/deep-links.md): opening pushes, so Back closes it
// on a phone, switching chat replaces, and closing removes it.

import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, MessageSquare, Plus, X } from "lucide-react";
import AgentThread, { useThreads } from "@/components/agent/AgentThread";
import { feedbackFor, type DockIdentity } from "@/components/agent/dockActions";
import { resumeAgent, setFeedback, setNavigate } from "@/lib/agentRun";
import { links } from "@/lib/links";
import { useGoneItem, useUrlItem, useUrlUpdate } from "@/lib/urlState";

const resumed = new Set<string>();
const ICON = "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

/** Pages with their own composer, where the launcher stays hidden. */
export const ownComposer = (pathname: string) => pathname === "/home" || pathname === "/agent" || pathname.startsWith("/agent/");

/** The closed button's place and look: the top bar's free slot on phones (left 64, top 6), the bottom-right pill from lg. */
export const CLOSED =
  "fixed z-[60] left-16 top-1.5 text-muted-foreground hover:text-foreground lg:left-auto lg:top-auto lg:right-5 lg:bottom-5 lg:w-auto lg:bg-primary lg:px-4 lg:text-primary-foreground lg:shadow-lg lg:transition-transform lg:hover:-translate-y-0.5 lg:hover:text-primary-foreground lg:active:translate-y-0";

export default function AgentDock({ userId, identity }: { userId: string; identity?: DockIdentity }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const threads = useThreads(userId);
  const [dock, openDock, closeDock] = useUrlItem("dock");
  const update = useUrlUpdate();
  // /home and /agent have their own composer: a dock link there is ignored
  const open = !!dock && !ownComposer(pathname);
  const threadId = dock && dock !== "new" ? dock : null;
  const setOpen = (on: boolean) => (on ? openDock(threads.find((t) => !t.archived)?.id ?? "new") : closeDock());
  const setThreadId = (id: string | null) => update({ dock: id ?? "new" });
  // a chat deleted since the link was made; an empty list may still be syncing, so it decides nothing
  useGoneItem("dock", threadId && threads.length ? threads.some((t) => t.id === threadId) : undefined, "chat");

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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeDock();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeDock]);

  if (ownComposer(pathname)) return null;
  const title = threads.find((t) => t.id === threadId)?.title;
  const place = "fixed right-5 z-[60] bottom-[88px] lg:bottom-5";

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the agent"
        // below lg it sits in the phone top bar beside the logo (AssistantMount's MOBILE_BUTTON slot), a quiet icon that
        // covers no content; from lg it is the pill at the bottom right. The open panel still rises from the bottom.
        className={`${CLOSED} inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full text-sm font-semibold`}
      >
        <MessageSquare className="h-5 w-5 lg:h-4 lg:w-4" />
        <span className="hidden lg:inline">Agent</span>
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
