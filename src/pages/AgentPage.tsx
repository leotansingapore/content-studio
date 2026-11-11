// /agent and /agent/:thread (agent-chat, Leo only; docs/north-star/items/agent-chat.md): the agent's chats. The
// thread list sits in the sidebar from lg up (SidebarThreads) and behind "Chats" (?panel=chats) on phones; the open
// chat fills the rest, with its composer pinned at the bottom and "Your work" (WorkPanel) beside it from xl up and
// behind the "Your work" button (?panel=work) below that. ?m=
// rings one message, and ?ask= and ?remix= hand a new chat its words or its post once, then leave the address (so the
// Remix sheet never opens over the page). Everyone else gets the 404.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import AgentThread, { useThreads } from "@/components/agent/AgentThread";
import ThreadList from "@/components/agent/ThreadList";
import WorkPanel from "@/components/agent/WorkPanel";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { send, turnOf } from "@/lib/agentRun";
import { workOf } from "@/lib/agentWork";
import { links } from "@/lib/links";
import { useUrlItem } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const CAPABILITIES_ASK = "What can you make?";

export default function AgentPage() {
  const leo = useLeoUser();
  const { thread } = useParams();
  if (leo === undefined) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-9 w-48 rounded-md bg-muted" />
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-14 animate-pulse rounded-2xl bg-muted ${i % 2 ? "ml-auto w-2/3" : "w-3/4"}`} />
        ))}
      </div>
    );
  }
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Agent userId={leo.id} email={leo.email} threadId={thread ?? null} />;
}

/** The page's height: the window below its top, above the phone's bottom bar, so only the chat scrolls. */
function useFillHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const nav = (document.querySelector("nav[data-bottom-nav]") as HTMLElement | null)?.offsetHeight ?? 0;
      setH(Math.max(360, window.innerHeight - top - nav - 12));
    };
    fit();
    // again once the route's entry and the layout's late rows (banners, the phone bar) have settled
    const frame = requestAnimationFrame(fit);
    const late = window.setTimeout(fit, 400);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(late);
      window.removeEventListener("resize", fit);
    };
  }, []);
  return [ref, h] as const;
}

function Agent({ userId, email, threadId }: { userId: string; email: string; threadId: string | null }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [panel, openPanel, closePanel] = useUrlItem("panel");
  // ?ask= and ?remix= belong to a new chat and are read once (replace)
  const [handover] = useState(() => ({ ask: threadId ? null : params.get("ask"), remix: threadId ? null : params.get("remix") }));
  useLayoutEffect(() => {
    if (!params.has("ask") && !params.has("remix")) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("ask");
        next.delete("remix");
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);
  const threads = useThreads(userId);
  const thread = threadId ? threads.find((t) => t.id === threadId) : undefined;
  const [ref, height] = useFillHeight();
  const sheet = useRef<HTMLDialogElement>(null);
  const workSheet = useRef<HTMLDialogElement>(null);
  const chats = panel === "chats";
  const work = panel === "work";
  // each sheet is for the widths its panel isn't on the page: chats below lg, Your work below xl
  useEffect(() => {
    for (const [d, on, max] of [[sheet.current, chats, 1023], [workSheet.current, work, 1279]] as const) {
      if (!d) continue;
      const narrow = window.matchMedia(`(max-width: ${max}px)`).matches;
      if (on && narrow && !d.open) d.showModal?.();
      if ((!on || !narrow) && d.open) d.close();
    }
  }, [chats, work]);
  const waiting = workOf(threads).waiting.length;

  const toThread = (id: string) => navigate(links.agent({ thread: id }));
  const turn = threadId ? turnOf(threadId) : null;
  const busy = !!turn && ["starting", "thinking", "writing", "making"].includes(turn.state);
  const identity = { id: userId, email, name: email.split("@")[0] || null };

  return (
    <div ref={ref} style={height ? { height } : undefined} className="-mb-40 flex min-h-[360px] gap-6 lg:-mb-24">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Chat">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 pb-3">
          <Button type="button" variant="outline" onClick={() => openPanel("chats")} className="h-11 shrink-0 gap-1.5 lg:hidden">
            <MessagesSquare /> Chats
          </Button>
          <h1 className="order-last min-w-0 basis-full truncate font-serif text-xl font-semibold tracking-tight sm:order-none sm:flex-1 sm:basis-auto sm:text-2xl">{thread?.title ?? "Agent"}</h1>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const id = send(userId, threadId, CAPABILITIES_ASK);
              if (id && id !== threadId) toThread(id);
            }}
            className="ml-auto h-11 shrink-0 px-3 sm:ml-0 sm:h-9"
          >
            {CAPABILITIES_ASK}
          </Button>
          <Button type="button" variant="outline" onClick={() => openPanel("work")} className="h-11 shrink-0 gap-1.5 sm:h-9 xl:hidden">
            Your work
            {waiting > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground" aria-label={`${waiting} waiting on your yes`}>{waiting}</span>}
          </Button>
          {thread && <CopyLinkButton path={links.agent({ thread: thread.id })} />}
        </header>
        <AgentThread
          key={threadId ?? "new"}
          userId={userId}
          threadId={threadId}
          attach={handover.remix}
          ask={handover.ask}
          focusMsg={params.get("m")}
          identity={identity}
          onThread={toThread}
        />
      </section>
      <WorkPanel threads={threads} />
      <dialog
        ref={workSheet}
        aria-label="Your work"
        onClose={() => work && closePanel()}
        // a row lands on its chat's path without ?panel, which closes the sheet
        onClick={(e) => e.target === e.currentTarget && closePanel()}
        className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-[min(340px,88vw)] max-w-none border-l border-border/70 bg-background p-4 shadow-xl backdrop:bg-foreground/40 xl:hidden"
      >
        <WorkPanel threads={threads} sheet />
      </dialog>
      <dialog
        ref={sheet}
        aria-label="Chats"
        onClose={() => chats && closePanel()}
        onClick={(e) => e.target === e.currentTarget && closePanel()}
        className="fixed inset-y-0 left-0 m-0 h-full max-h-none w-[min(320px,85vw)] max-w-none border-r border-border/70 bg-background p-4 shadow-xl backdrop:bg-foreground/40 lg:hidden"
      >
        {/* a pick lands on a path without ?panel, which closes the sheet */}
        <ThreadList userId={userId} threads={threads} current={threadId} replace />
      </dialog>
    </div>
  );
}
