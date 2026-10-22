// The agent's composer (docs/north-star/items/agent-chat.md, "Screens and states"), shared by /agent, the agent dock
// and Home (agent-home): a text box that keeps its words on this device until sent, the four format chips (one at a
// time, sent as `chip`), the slash menu, an attached remix source, Send that turns into a square Stop while this
// thread's turn runs, and the agent meter. Sending goes through agentRun's `send`, which writes the Starting row
// before it returns, so the thread shows the message at once.

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useReducer, useRef, useState } from "react";
import { ArrowUp, Square, X } from "lucide-react";
import { FilterChip } from "@/components/ui/filter-chip";
import { Button } from "@/components/ui/button";
import SlashMenu, { slashItems, type SlashItem } from "@/components/agent/SlashMenu";
import { meterLine, leftOf } from "@/lib/agentBudget";
import { onAgent, send, stop, turnOf, type Chip } from "@/lib/agentRun";
import { readUsage, type Usage } from "@/lib/aiUsage";
import { BUILT_IN_SKILLS, loadMySkills } from "@/lib/chatSkills";
import { AVATAR_MAX, priceText } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import type { RemixSource } from "@/lib/remixSource";
import { cn } from "@/lib/utils";

export const PLACEHOLDER = "Ask for a post, a remix, a video or a campaign";
const REMIX_PLACEHOLDER = "What should the remix keep or change? For example: keep the hook, make it about CPF LIFE";
const CHIPS: { id: Chip; label: string; noun: string }[] = [
  { id: "post", label: "Post", noun: "post" },
  { id: "carousel", label: "Carousel", noun: "carousel" },
  { id: "video", label: "Video", noun: "talking video" },
  { id: "campaign", label: "Campaign", noun: "campaign" },
];
const RUNNING = new Set(["starting", "thinking", "writing", "making"]);

// ---- today's uses, one read shared by every composer and card on screen ----

let usage: Usage | null = null;
let reading: Promise<void> | null = null;
let again = 0;
const usageSubs = new Set<() => void>();
function readToday() {
  reading ??= readUsage()
    .then((u) => {
      usage = u;
    })
    .catch(() => undefined)
    .finally(() => {
      reading = null;
      usageSubs.forEach((f) => f());
    });
}

/** Today's counts (null until read, or when they can't be): read on mount and again shortly after the agent changes. */
export function useAgentUsage(): Usage | null {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    usageSubs.add(redraw);
    readToday();
    const off = onAgent(() => {
      window.clearTimeout(again);
      again = window.setTimeout(readToday, 1500);
    });
    return () => {
      usageSubs.delete(redraw);
      off();
    };
  }, []);
  return usage;
}

// ---- typed work on this device ----

const draftKey = (userId: string, slot: string) => `cs-agent-draft-${scoped(userId)}-${slot}`;
function readKey(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeKey(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* blocked storage: the words stay in the box for this visit */
  }
}

export interface ComposerHandle {
  /** Puts `text` in the box and focuses it; never sends (starters and Home's tiles). */
  fill(text: string): void;
}

export interface ComposerProps {
  userId: string;
  /** The open thread, or null for a new chat. */
  threadId: string | null;
  /** Where the unsent words live on this device: the thread id, "new" or "home". */
  slot?: string;
  placeholder?: string;
  /** A remix source key handed over once (the page's ?remix=): it stays attached, on this device, until sent or removed. */
  attach?: string | null;
  onSent?: (threadId: string) => void;
  compact?: boolean;
  autoFocus?: boolean;
}

const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { userId, threadId, slot, placeholder = PLACEHOLDER, attach, onSent, compact, autoFocus },
  ref,
) {
  const key = draftKey(userId, slot ?? threadId ?? "new");
  const [text, setText] = useState(() => readKey(key));
  const [source, setSource] = useState<string | null>(() => attach || readKey(`${key}-source`) || null);
  const [chip, setChip] = useState<Chip | null>(null);
  const [menuShut, setMenuShut] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const box = useRef<HTMLTextAreaElement>(null);
  const menuId = useId();
  const used = useAgentUsage();

  useEffect(() => onAgent(redraw), []);
  // another slot (a new chat becoming a thread): its own words
  useEffect(() => {
    setText(readKey(key));
    setSource(readKey(`${key}-source`) || null);
  }, [key]);
  useEffect(() => {
    if (!attach) return;
    setSource(attach);
    writeKey(`${key}-source`, attach);
  }, [attach, key]);
  useEffect(() => {
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) box.current?.focus();
  }, [autoFocus]);

  // the box grows with the words, up to its max height
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const edit = (v: string) => {
    setText(v);
    setMenuShut(false);
    setActive(0);
    writeKey(key, v);
  };
  const detach = () => {
    setSource(null);
    writeKey(`${key}-source`, "");
  };
  useImperativeHandle(ref, () => ({
    fill(t: string) {
      edit(t);
      requestAnimationFrame(() => {
        const el = box.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(t.length, t.length);
      });
    },
  }));

  const turn = threadId ? turnOf(threadId) : null;
  const running = !!turn && RUNNING.has(turn.state);
  const skills: SlashItem[] = [...BUILT_IN_SKILLS, ...loadMySkills(userId)];
  const items = menuShut ? [] : slashItems(text, skills);

  const submit = useCallback(() => {
    const words = text.trim();
    if (running || (!words && !source)) return;
    let id = "";
    try {
      id = send(userId, threadId, words || "Remix this.", { ...(chip ? { chip } : {}), ...(source ? { source } : {}) });
    } catch {
      id = "";
    }
    // storage refused the message: the words stay in the box
    setFailed(!id);
    if (!id) return;
    setText("");
    writeKey(key, "");
    if (source) detach();
    setChip(null);
    onSent?.(id);
  }, [text, running, source, userId, threadId, chip, key, onSent]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (s: SlashItem) => {
    edit(`/${s.slash} `);
    setMenuShut(true);
    box.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (items.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(items[Math.min(active, items.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuShut(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const meter = meterLine(leftOf(used, "agent-act"));
  const noun = chip ? CHIPS.find((c) => c.id === chip)!.noun : null;

  return (
    <div className={cn("min-w-0", compact ? "space-y-1.5" : "space-y-2")} data-tour="agent-composer">
      {source && <SourceCard userId={userId} sourceKey={source} noun={noun} video={chip === "video"} onDetach={detach} />}
      <div className="relative">
        {items.length > 0 && (
          <div className="absolute inset-x-0 bottom-full z-10">
            <SlashMenu id={menuId} items={items} active={Math.min(active, items.length - 1)} onPick={pick} />
          </div>
        )}
        <div className="rounded-xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
          {/* Send sits beside the words, so the chips never push it to a row of its own on a phone */}
          <div className="flex items-end gap-2 p-1.5 pl-0">
            <textarea
              ref={box}
              value={text}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              maxLength={2000}
              placeholder={source ? REMIX_PLACEHOLDER : placeholder}
              aria-label="Message to the agent"
              aria-controls={items.length ? menuId : undefined}
              aria-activedescendant={items.length ? `${menuId}-${Math.min(active, items.length - 1)}` : undefined}
              className="block max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:shadow-none focus-visible:outline-none"
            />
            {running ? (
              <Button type="button" size="icon" variant="outline" onClick={() => threadId && stop(threadId)} aria-label="Stop" title="Stop" className="h-11 w-11 shrink-0 rounded-lg">
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={!text.trim() && !source} className="h-11 shrink-0 gap-1.5 rounded-lg px-4">
                <ArrowUp /> {source ? "Remix" : "Send"}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
            {CHIPS.map((c) => (
              <FilterChip key={c.id} active={chip === c.id} onClick={() => setChip(chip === c.id ? null : c.id)}>
                {c.label}
              </FilterChip>
            ))}
            {!compact && <span className="ml-auto hidden text-[11px] text-muted-foreground lg:inline">Enter to send | Shift and Enter for a new line</span>}
          </div>
        </div>
      </div>
      {failed && (
        <p className="text-xs text-destructive" role="alert">
          {SAVE_FAILED}
        </p>
      )}
      {meter && <p className={cn("text-[11px] tabular-nums", meter.warn ? "font-medium text-warning" : "text-muted-foreground")}>{meter.text}</p>}
    </div>
  );
});

export default Composer;

// ---- the attached remix source ----

function SourceCard({ userId, sourceKey, noun, video, onDetach }: { userId: string; sourceKey: string; noun: string | null; video: boolean; onDetach: () => void }) {
  const [s, setS] = useState<{ source: RemixSource | null; format: string } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    // the source readers carry the data drops: loaded only when a post is attached
    void Promise.all([import("@/lib/resolveSource"), import("@/lib/remixSource"), import("@/lib/remix")]).then(([r, rs, rx]) => {
      if (!live) return;
      const source = r.resolveSource(sourceKey, userId) ?? rs.seenSources(userId).find((x) => x.key === sourceKey) ?? null;
      setS({ source, format: source ? rx.defaultOutput(source) : "post" });
    });
    return () => {
      live = false;
    };
  }, [sourceKey, userId]);
  const src = s?.source;
  const meta = src ? [src.format, src.author, src.platform].filter(Boolean).join(" | ") : "";
  const upTo = priceText(AVATAR_MAX).replace(/^U/, "u");
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3" aria-label="Attached post">
      <div className="flex items-start gap-3">
        {src?.cover && <img src={src.cover} alt="" className="h-14 w-11 shrink-0 rounded-md object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Remix</p>
          <p className="truncate text-sm font-medium">{s ? (src?.title ?? "A post you picked") : "..."}</p>
          {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
          {src?.caption && (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-xs font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
              {open ? "Hide the original" : "Show the original"}
            </button>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onDetach} aria-label="Remove the post" className="h-9 w-9 shrink-0">
          <X />
        </Button>
      </div>
      {open && src?.caption && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{src.caption}</p>}
      {s && (
        <p className="mt-2 text-xs text-muted-foreground">
          This remix makes a {noun ?? s.format}, like the original. Remove it to make something else.
          {video && ` You see the script and its price, ${upTo}, before anything is paid.`}
        </p>
      )}
    </div>
  );
}
