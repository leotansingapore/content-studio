// One agent chat (docs/north-star/items/agent-chat.md, "Screens and states"), on /agent and, compact, in the agent
// dock: the empty state with its starters, then the messages with their run state ("Thinking 3s"), cards, MADE
// blocks and receipts, "Jump to latest" and "Your <format> is ready" when scrolled up, and the composer. Every
// message, card and receipt comes from the thread store; the engine (agentRun) writes them, so leaving loses nothing.

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Loader2, Sparkles } from "lucide-react";
import ActionCard, { extra, hhmm } from "@/components/agent/ActionCard";
import Composer, { useAgentUsage, type ComposerHandle } from "@/components/agent/Composer";
import { chipAction, DONE, isAppPath, runAction, type DockIdentity } from "@/components/agent/dockActions";
import MadeBlock, { madeNoun } from "@/components/agent/MadeBlock";
import Receipt from "@/components/agent/Receipt";
import { Button } from "@/components/ui/button";
import { editCard, onAgent, send, turnOf, type Turn } from "@/lib/agentRun";
import { starterChips } from "@/lib/agentStarters";
import type { Nudge } from "@/lib/agentMemory";
import { GONE_LINE, loadThreads, onThreadsChanged, patchMsg, type AgentMsg } from "@/lib/agentThreads";
import { links } from "@/lib/links";
import { cn } from "@/lib/utils";

const RUNNING = new Set<Turn["state"]>(["starting", "thinking", "writing", "making"]);
const NEAR = 200;
type Go = { path: string; label: string };
/** Chips that act here rather than open a page; any other path that isn't the app's own is never drawn. */
export const ENGINE_CHIP = /^(say|format|forget|fb):/;

/** "Thinking 3s" for a live turn; the stored state's word for one this tab isn't running. */
export function runLabel(state: Turn["state"], seconds: number | null, line?: string): string {
  const n = seconds === null ? "" : ` ${seconds}s`;
  if (state === "starting") return "Starting";
  if (state === "thinking") return `Thinking${n}`;
  if (state === "writing") return `Writing${n}`;
  return line ? `Making | ${line}` : "Making";
}

/** "22:41 | 2 steps | 14.2s", or "22:41 | 1.2s" when the turn made no server call. */
export function metaLine(at: string, meta: { steps: number; ms: number }): string {
  const s = `${(meta.ms / 1000).toFixed(1)}s`;
  return meta.steps > 0 ? `${hhmm(at)} | ${meta.steps} ${meta.steps === 1 ? "step" : "steps"} | ${s}` : `${hhmm(at)} | ${s}`;
}

export function useThreads(userId: string) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const a = onThreadsChanged(redraw);
    const b = onAgent(redraw);
    return () => {
      a();
      b();
    };
  }, []);
  return loadThreads(userId);
}

export default function AgentThread({
  userId,
  threadId,
  compact,
  attach,
  ask,
  focusMsg,
  identity,
  onThread,
}: {
  userId: string;
  threadId: string | null;
  compact?: boolean;
  /** A remix source for a new chat (?remix=), attached to the composer. */
  attach?: string | null;
  /** Words for a new chat's composer (?ask=), filled once, never sent. */
  ask?: string | null;
  /** ?m=: scrolled to and ringed for 2 seconds. */
  focusMsg?: string | null;
  identity?: DockIdentity;
  /** A new chat got its thread: the page moves to /agent/<id>, the dock keeps it open. */
  onThread: (id: string) => void;
}) {
  const navigate = useNavigate();
  const threads = useThreads(userId);
  const usage = useAgentUsage();
  const thread = threadId ? (threads.find((t) => t.id === threadId) ?? null) : null;
  const messages = thread?.messages ?? [];
  const turn = threadId ? turnOf(threadId) : null;
  const live = !!turn && RUNNING.has(turn.state);
  const composer = useRef<ComposerHandle>(null);
  const list = useRef<HTMLDivElement>(null);
  const near = useRef(true);
  const [away, setAway] = useState(false);
  const [ringed, setRinged] = useState<string | null>(null);
  const [ready, setReady] = useState<{ id: string; noun: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chipLine, setChipLine] = useState<{ msg: string; line: string } | null>(null);
  const jobs = useRef(new Map<string, string>());

  // the run's timer ("Thinking 3s")
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  useEffect(() => {
    if (ask) composer.current?.fill(ask);
  }, [ask]);

  const toBottom = useCallback(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  const show = useCallback((id: string, ring: boolean) => {
    document.getElementById(`m-${id}`)?.scrollIntoView({ block: "center" });
    if (!ring) return;
    setRinged(id);
    window.setTimeout(() => setRinged((r) => (r === id ? null : r)), 2000);
  }, []);

  // first draw: the linked message, else the newest
  const landed = useRef(false);
  useLayoutEffect(() => {
    if (landed.current || !messages.length) return;
    landed.current = true;
    if (focusMsg && messages.some((m) => m.id === focusMsg)) {
      near.current = false; // stay on the linked message, not the newest
      show(focusMsg, true);
    } else toBottom();
  }, [messages.length, focusMsg, show, toBottom]); // eslint-disable-line react-hooks/exhaustive-deps

  // new words follow the bottom while it is in view; a make that lands while scrolled up gets the "ready" chip
  const tail = messages.map((m) => `${m.id}:${m.turn ?? ""}:${m.card?.status ?? ""}:${m.job?.state ?? ""}:${m.receipt ? 1 : 0}`).join("|");
  useLayoutEffect(() => {
    for (const m of messages) {
      const was = jobs.current.get(m.id);
      if (m.job && was === "running" && m.job.state === "done" && !near.current) setReady({ id: m.id, noun: madeNoun(m.job) });
      if (m.job) jobs.current.set(m.id, m.job.state);
    }
    if (near.current) toBottom();
  }, [tail]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    near.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
    setAway(!near.current);
    if (near.current) setReady(null);
  };

  const sendHere = (text: string, o: { source?: string } = {}) => {
    const id = send(userId, threadId, text, o);
    near.current = true;
    if (id && id !== threadId) onThread(id);
  };

  /** A chip that isn't a page: the feedback service's post or message ("fb:"), or the engine's own ("say:", "format:", "forget:"). */
  const runChip = async (m: AgentMsg, g: Go) => {
    if (!threadId) return;
    const a = chipAction(g.path);
    if (a) {
      const line = await runAction(a, { identity });
      // the outcome takes the chip's place and stays with the message, so a reload never offers to post it twice
      if (line) patchMsg(userId, threadId, m.id, { go: (m.go ?? []).map((x) => (x === g ? { path: DONE, label: line } : x)) });
      return;
    }
    near.current = true;
    const line = extra.choose
      ? extra.choose(userId, threadId, m.id, g.path)
      : g.path.startsWith("say:")
        ? (send(userId, threadId, g.path.slice(4)), null)
        : g.path.startsWith("format:")
          ? editCard(userId, threadId, m.id, { format: g.path.slice(7) })
          : null;
    setChipLine(line ? { msg: m.id, line } : null);
  };

  if (threadId && !thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{GONE_LINE}</p>
        <Button asChild variant="outline" className="h-11">
          <Link to={links.agent()}>New chat</Link>
        </Button>
      </div>
    );
  }

  const composerEl = (
    <Composer
      ref={composer}
      userId={userId}
      threadId={threadId}
      attach={threadId ? null : attach}
      compact={compact}
      autoFocus={!compact}
      onSent={(id) => {
        near.current = true;
        if (id !== threadId) onThread(id);
      }}
    />
  );

  if (!messages.length) {
    const starters = starterChips(userId).slice(0, 6);
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", compact ? "p-3" : "justify-center px-1 py-6")}>
        <div className={cn("mx-auto w-full", compact ? "space-y-3" : "max-w-2xl space-y-5")}>
          <div className={cn("flex flex-col items-center gap-3 text-center", compact && "items-start text-left")}>
            {!compact && (
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary" aria-hidden>
                <Sparkles className="h-5 w-5" />
              </span>
            )}
            <h2 className={cn("font-serif font-semibold tracking-tight", compact ? "text-lg" : "text-2xl sm:text-3xl")}>What are we making?</h2>
          </div>
          {composerEl}
          {starters.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Or start with one of these</p>
              <div className="flex flex-wrap gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => composer.current?.fill(s)}
                    className="min-h-11 rounded-full border border-border bg-background px-3.5 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent sm:min-h-9 sm:py-1.5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={list} onScroll={onScroll} className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "space-y-3 p-3" : "space-y-5 px-1 py-4 sm:px-2")} aria-live="polite">
        {messages.map((m, i) => {
          const ring = ringed === m.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";
          if (m.role === "user")
            return (
              <div key={m.id} id={`m-${m.id}`} className="flex justify-end">
                <div className={cn("max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground transition-shadow", ring)}>
                  <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
                  <p className="mt-0.5 text-right text-[10px] tabular-nums text-primary-foreground/75">{hhmm(m.at)}</p>
                </div>
              </div>
            );
          const mine = turn && turn.msg === m.id && RUNNING.has(turn.state) ? turn : null;
          const stored = !mine && m.turn && RUNNING.has(m.turn) ? m.turn : null;
          const state = mine
            ? runLabel(mine.state, Math.max(0, Math.floor((now - mine.startedAt) / 1000)), mine.line)
            : stored
              ? runLabel(stored, null)
              : null;
          const prev = [...messages.slice(0, i)].reverse().find((x) => x.role === "user");
          return (
            <div key={m.id} id={`m-${m.id}`} className={cn("flex flex-col items-start gap-2 rounded-xl transition-shadow", ring)}>
              <p className="flex items-center gap-2 text-xs">
                <span className="font-semibold">Agent</span>
                {state ? (
                  <span className="inline-flex items-center gap-1.5 tabular-nums text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    {/* the ticking seconds stay out of the live region; a screen reader hears the state once */}
                    <span aria-hidden>{state}</span>
                    <span className="sr-only">{runLabel((mine?.state ?? stored)!, null, mine?.line)}</span>
                  </span>
                ) : (
                  m.meta && <span className="tabular-nums text-muted-foreground">{metaLine(m.at, m.meta)}</span>
                )}
              </p>
              {m.text && (
                <p className={cn("max-w-[92%] whitespace-pre-wrap break-words text-sm leading-relaxed", m.error && "text-destructive")}>{m.text}</p>
              )}
              {m.card && threadId && <ActionCard userId={userId} threadId={threadId} msg={m as AgentMsg & { card: NonNullable<AgentMsg["card"]> }} usage={usage} onSend={(t) => sendHere(t)} />}
              {m.job?.state === "running" && !m.card && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                  <Loader2 className="h-3 w-3 animate-spin" /> {turn?.msg === m.id && turn.line ? turn.line : "Making"}
                </p>
              )}
              {m.job?.state === "running" && m.card?.status === "approved" && turn?.msg === m.id && turn.line && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                  <Loader2 className="h-3 w-3 animate-spin" /> {turn.line}
                </p>
              )}
              {m.job?.state === "done" && <MadeBlock userId={userId} job={m.job} />}
              {m.receipt && threadId && <Receipt userId={userId} threadId={threadId} msgId={m.id} receipt={m.receipt} nudge={m.card?.plan.nudge as Nudge | undefined} />}
              {(!!m.go?.length || (m.error && prev?.text)) && (
                <div className="flex max-w-[92%] flex-wrap gap-1.5">
                  {m.error && prev?.text && (
                    <Button type="button" size="sm" variant="outline" className="h-11 sm:h-9" disabled={live} onClick={() => sendHere(prev.text!, prev.source ? { source: prev.source } : {})}>
                      {m.text === "This was interrupted." ? "Send again" : "Try again"}
                    </Button>
                  )}
                  {(m.go ?? []).map((g, gi) =>
                    g.path === DONE ? (
                      <span key={gi} className="rounded-full bg-success/15 px-3 py-2 text-xs text-success">{g.label}</span>
                    ) : isAppPath(g.path) ? (
                      <Button key={gi} asChild size="sm" variant="outline" className="h-11 sm:h-9">
                        <Link to={g.path}>{g.label}</Link>
                      </Button>
                    ) : ENGINE_CHIP.test(g.path) ? (
                      <Button key={gi} type="button" size="sm" variant="outline" className="h-11 sm:h-9" disabled={live} onClick={() => void runChip(m, g)}>
                        {g.label}
                      </Button>
                    ) : null,
                  )}
                </div>
              )}
              {chipLine?.msg === m.id && <p className="text-xs text-destructive" role="alert">{chipLine.line}</p>}
            </div>
          );
        })}
      </div>
      <div className={cn("relative border-t border-border/70 bg-background", compact ? "p-2" : "pt-3")}>
        {(ready || away) && (
          <div className="pointer-events-none absolute inset-x-0 -top-14 flex justify-center">
            {ready ? (
              <button
                type="button"
                onClick={() => {
                  show(ready.id, true);
                  setReady(null);
                }}
                className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/40 bg-background px-4 text-sm font-medium shadow-lg"
              >
                <ArrowUp className="h-4 w-4" /> Your {ready.noun} is ready
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = list.current;
                  el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                }}
                className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium shadow-lg"
              >
                <ArrowDown className="h-4 w-4" /> Jump to latest
              </button>
            )}
          </div>
        )}
        {composerEl}
      </div>
    </div>
  );
}
