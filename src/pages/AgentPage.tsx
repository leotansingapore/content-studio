// /agent and /agent/:thread (agent-chat, Leo only; docs/north-star/items/agent-chat.md): the agent's chats. The
// thread list sits in the sidebar from lg up (SidebarThreads) and behind "Chats" (?panel=chats) on phones. From lg the
// page is Fastlane's three columns: the sidebar, the open chat centred in the panel with its composer pinned at the
// bottom, and "Your work" (WorkPanel) against the panel's right edge from xl up, behind the "Your work" button
// (?panel=work) below that. ?m=
// rings one message, and ?ask= and ?remix= hand a new chat its words or its post once, then leave the address (so the
// Remix sheet never opens over the page). A page can also hand over words that send on arrival, with where they came
// from (navigation state, agentStarters.ts handoff). Everyone else gets the 404.
// Make skills (makeSkills.ts, Leo 13 Nov: every maker folded into the agent): ?make=open&kind=&q= is the Make picker;
// ?skill=<id>&step=<n> asks that skill's questions in the thread; the last one sends the agent's priced card, or opens
// the maker beside the chat (?step=make&at=<its address>), whose saves land in the thread as Made lines (makeMade.ts).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChatsIcon } from "@phosphor-icons/react";
import AgentThread, { useThreads } from "@/components/agent/AgentThread";
import MakePicker from "@/components/agent/MakePicker";
import MakerPanel, { panelPath } from "@/components/agent/MakerPanel";
import SkillQuestions from "@/components/agent/SkillQuestions";
import ThreadList from "@/components/agent/ThreadList";
import WorkPanel from "@/components/agent/WorkPanel";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { send, turnOf } from "@/lib/agentRun";
import { handoff } from "@/lib/agentStarters";
import { workOf } from "@/lib/agentWork";
import { appendMsg, newMsg, newThread, type AgentMsg } from "@/lib/agentThreads";
import { noteAddress, watchMade } from "@/lib/makeMade";
import { KIND_TABS, agentAsk, answersFor, loadFlow, openHref, pickFrom, questionsFor, saveFlow, skillById, type Answers, type KindSlug, type MakeSkill } from "@/lib/makeSkills";
import { links } from "@/lib/links";
import { useUrlItem } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import NotFoundPage from "@/pages/NotFoundPage";

const CAPABILITIES_ASK = "What can you make?";

export default function AgentPage() {
  const leo = useLeoUser();
  const { thread } = useParams();
  const location = useLocation();
  // a page that hands the agent words to send (a maker in the panel, too) starts a fresh chat, so they are read once;
  // the key stays when the handoff leaves the address, so the chat that read it keeps its state
  const handed = useRef("agent");
  if ((location.state as { send?: unknown } | null)?.send === true) handed.current = location.key;
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
  return <Agent key={handed.current} userId={leo.id} email={leo.email} threadId={thread ?? null} />;
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
  const [params, setParams] = useSearchParams();
  const [panel, openPanel, closePanel] = useUrlItem("panel");
  const navigate = useNavigate();
  // ?ask= and ?remix= belong to a new chat and are read once (replace)
  const [handover] = useState(() => ({ ask: threadId ? null : params.get("ask"), remix: threadId ? null : params.get("remix") }));
  const location = useLocation();
  // read once, as ?ask= is: the words a page handed over to send on arrival
  const [sends, setSends] = useState(() => handoff(location.state, handover.ask).send);
  const [layout] = useState(() => handoff(location.state, handover.ask).layout);
  const from = handoff(location.state, null).from;
  // once per arrival: a second effect run, or New chat on this same page, never sends it again
  const sent = useRef(false);
  useLayoutEffect(() => {
    if (sent.current) return;
    // a page handed over its request: it sends once and the chat opens, with the way back to that page
    if (sends && !threadId && handover.ask) {
      sent.current = true;
      const id = send(userId, null, handover.ask, layout ?? undefined);
      if (id) return navigate(links.agent({ thread: id }), { replace: true, state: from ? { from } : null });
      // the chat couldn't be saved: the words go in the composer instead, never dropped
      setSends(false);
    }
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
  }, [params, setParams]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // ---- make skills: the picker, the questions in the thread, and the maker beside the chat ----
  const set = useCallback(
    (changes: Record<string, string | null>, replace = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) if (v === null) next.delete(k); else next.set(k, v);
          return next;
        },
        { replace },
      ),
    [setParams],
  );
  const kinds = KIND_TABS.map((t) => t.slug);
  const kind = (kinds.includes(params.get("kind") as KindSlug) ? params.get("kind") : "all") as KindSlug;
  const skill = skillById(params.get("skill"));
  const step = params.get("step");
  const making = !!skill && step === "make";
  const [flowBusy, setFlowBusy] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const startSkill = (s: MakeSkill) => {
    // the answers kept for this skill carry on; another skill's are replaced
    if (loadFlow(userId)?.skill !== s.id) saveFlow(userId, { skill: s.id, answers: {}, at: new Date().toISOString() });
    set({ make: null, kind: null, q: null, skill: s.id, step: null, at: null });
  };
  const stopSkill = () => {
    saveFlow(userId, null);
    set({ skill: null, step: null, at: null });
  };
  const finish = (s: MakeSkill, a: Answers) => {
    setFlowBusy(true);
    setFlowError(null);
    if (s.agentFormat) {
      // the agent's own card, priced, with nothing made before Approve
      const ask = agentAsk(s, a);
      const id = send(userId, threadId, ask.text, { make: { format: s.agentFormat, ...ask } });
      setFlowBusy(false);
      if (!id) return setFlowError(SAVE_FAILED);
      saveFlow(userId, null);
      return navigate(links.agent({ thread: id }), { replace: true });
    }
    // the maker beside the chat, its address carrying the answers; the chat records what was opened
    const about = a.about?.trim();
    const at = openHref(s, a);
    const now = new Date();
    const said = [newMsg("user", { text: about ? `${s.name}: ${about}` : s.name }, now), newMsg("agent", { text: `${s.name} is open beside the chat.`, turn: "done" }, now)];
    const saved = threadId ? appendMsg(userId, threadId, said, now) : newThread(userId, said, now);
    setFlowBusy(false);
    if (saved.ok === false) return setFlowError(saved.error);
    saveFlow(userId, null);
    watchMade(userId, saved.item.id, s, now);
    navigate(`${links.agent({ thread: saved.item.id })}?${new URLSearchParams({ skill: s.id, step: "make", at })}`, { replace: true });
  };
  // a skill with nothing to ask opens at once
  const nothingToAsk = !!skill && !making && questionsFor(skill, userId).length === 0;
  const opened = useRef<string | null>(null);
  useEffect(() => {
    // once per arrival: a second effect run (StrictMode) never opens it twice
    if (!skill) opened.current = null;
    if (!nothingToAsk || !skill || opened.current === skill.id) return;
    opened.current = skill.id;
    finish(skill, {});
  }, [nothingToAsk, skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelStart = making ? (panelPath(params.get("at")) ?? openHref(skill!, answersFor(userId, skill!.id))) : null;
  // a deep link straight to the maker watches for its saves too
  useEffect(() => {
    if (making && skill) watchMade(userId, threadId, skill);
  }, [making, skill?.id, threadId, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeMaker = useCallback(() => set({ skill: null, step: null, at: null }), [set]);
  const onPanelPath = useCallback(
    (path: string) => {
      if (panelStart) noteAddress(userId, panelStart, path);
      set({ at: path }, true);
    },
    [panelStart, userId, set],
  );
  const pick = (m: AgentMsg, n: number | "surprise") => {
    if (!threadId) return;
    const s = pickFrom(userId, threadId, m, n);
    if (s) set({ skill: s.id, step: null, at: null });
  };
  const flow =
    skill && !making && !nothingToAsk ? (
      <SkillQuestions
        key={skill.id}
        userId={userId}
        skill={skill}
        asked={step && /^\d+$/.test(step) ? Number(step) : null}
        busy={flowBusy}
        error={flowError}
        onStep={(n) => set({ step: String(n) })}
        onDone={(a) => finish(skill, a)}
        onCancel={stopSkill}
      />
    ) : undefined;

  const toThread = (id: string) => navigate(links.agent({ thread: id }));
  const turn = threadId ? turnOf(threadId) : null;
  const busy = !!turn && ["starting", "thinking", "writing", "making"].includes(turn.state);
  const [askFailed, setAskFailed] = useState<string | null>(null);
  const identity = { id: userId, email, name: email.split("@")[0] || null };

  return (
    <div ref={ref} style={height ? { height } : undefined} className="-mb-40 flex min-h-[360px] gap-6 lg:mb-0 lg:gap-0">
      <section className="flex min-w-0 flex-1 flex-col lg:px-8 lg:pt-6" aria-label="Chat">
        {/* the thread's own column, centred in the panel as Fastlane's is */}
        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col lg:max-w-2xl">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 pb-3 lg:border-b-0">
          <Button type="button" variant="outline" onClick={() => openPanel("chats")} className="h-11 shrink-0 gap-1.5 lg:hidden">
            <ChatsIcon /> Chats
          </Button>
          <h1 className="order-last min-w-0 basis-full truncate font-serif text-xl font-semibold tracking-tight sm:order-none sm:flex-1 sm:basis-auto sm:text-2xl">{thread?.title ?? "Agent"}</h1>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const id = send(userId, threadId, CAPABILITIES_ASK);
              setAskFailed(id ? null : (threadId ?? ""));
              if (id && id !== threadId) toThread(id);
            }}
            className={`ml-auto h-11 shrink-0 px-3 sm:ml-0 sm:h-9 ${thread ? "hidden sm:inline-flex" : ""}`}
          >
            {CAPABILITIES_ASK}
          </Button>
          <Button type="button" variant="outline" onClick={() => openPanel("work")} className="h-11 shrink-0 gap-1.5 sm:h-9 xl:hidden">
            Your work
            {waiting > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground" aria-label={`${waiting} waiting on your yes`}>{waiting}</span>}
          </Button>
          {thread && <CopyLinkButton path={links.agent({ thread: thread.id })} />}
        </header>
        {askFailed === (threadId ?? "") && (
          <p className="pt-2 text-xs text-destructive" role="alert">
            {SAVE_FAILED}
          </p>
        )}
        {from && (
          // shortcut: the way back rides in navigation state, so a reload drops the chip; keep it on the thread if Leo wants it to stay
          <p className="pt-2 text-xs text-muted-foreground">
            From{" "}
            <Link to={from.path} className="inline-flex min-h-9 items-center font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
              {from.label}
            </Link>
          </p>
        )}
        <AgentThread
          key={threadId ?? "new"}
          userId={userId}
          threadId={threadId}
          attach={handover.remix}
          ask={sends ? null : handover.ask}
          focusMsg={params.get("m")}
          identity={identity}
          onThread={toThread}
          flow={flow}
          flowKey={skill && !making ? `${skill.id}:${step ?? ""}` : undefined}
          onPick={pick}
        />
        </div>
      </section>
      {making && skill && panelStart ? <MakerPanel key={skill.id} name={skill.name} start={panelStart} onPath={onPanelPath} onClose={closeMaker} /> : <WorkPanel threads={threads} />}
      <MakePicker
        open={params.get("make") === "open"}
        kind={kind}
        q={params.get("q") ?? ""}
        onKind={(k) => set({ kind: k === "all" ? null : k }, true)}
        onSearch={(q) => set({ q: q || null }, true)}
        onPick={startSkill}
        onClose={() => set({ make: null, kind: null, q: null })}
      />
      <dialog
        ref={workSheet}
        aria-label="Your work"
        onClose={() => work && closePanel()}
        // a row lands on its chat's path without ?panel, which closes the sheet
        onClick={(e) => e.target === e.currentTarget && closePanel()}
        className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-[min(340px,88vw)] max-w-none border-l border-border/70 bg-background p-4 shadow-xl backdrop:bg-foreground/40 xl:hidden"
      >
        <WorkPanel threads={threads} sheet onClose={closePanel} />
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
