// The agent's chats (docs/north-star/items/agent-chat.md, "Thread list"): New chat, then Today, Yesterday and
// Earlier. Each row has the title, the time (a pulsing dot while its turn or a job runs) and the last message's first
// 60 characters; its "..." menu renames in place or deletes after asking. Deleting keeps what the chat made.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { turnOf } from "@/lib/agentRun";
import { deleteThread, renameThread, type AgentMsg, type AgentThread } from "@/lib/agentThreads";
import { links } from "@/lib/links";
import { cn } from "@/lib/utils";

const RUNNING = new Set(["starting", "thinking", "writing", "making"]);
const HEAD = "px-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** Today, Yesterday or Earlier, by the chat's last change on this device's clock. */
export function whenGroup(iso: string, now = new Date()): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  return dayKey(d) === dayKey(y) ? "Yesterday" : "Earlier";
}

/** The row's time: the clock today, the weekday within the week, else the date (Fastlane's thread list). */
export function whenShort(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The last message's words, 60 characters at most. */
export function lastLine(t: AgentThread): string {
  const m = [...t.messages].reverse().find((x: AgentMsg) => x.text?.trim() || x.card || x.receipt);
  const text = (m?.text ?? m?.card?.title ?? m?.receipt?.title ?? "").replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export const isBusy = (t: AgentThread) =>
  RUNNING.has(turnOf(t.id)?.state ?? "") || t.messages.some((m) => m.job?.state === "running");

export default function ThreadList({
  userId,
  threads,
  current,
  replace,
  newChat = true,
}: {
  userId: string;
  threads: AgentThread[];
  current: string | null;
  /** Inside the phone sheet: a pick replaces the sheet's history entry, so Back doesn't reopen it. */
  replace?: boolean;
  /** The sidebar has its own Start a chat button above the list. */
  newChat?: boolean;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; text: string; error?: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const now = new Date();
  const groups = (["Today", "Yesterday", "Earlier"] as const)
    .map((g) => ({ g, items: threads.filter((t) => whenGroup(t.updatedAt, now) === g) }))
    .filter((x) => x.items.length);

  const saveName = () => {
    if (!renaming) return;
    const r = renameThread(userId, renaming.id, renaming.text);
    if (r.ok === false) setRenaming({ ...renaming, error: r.error });
    else setRenaming(null);
  };

  return (
    <nav aria-label="Chats" className="flex min-h-0 flex-col">
      {newChat && (
        <Button asChild variant="outline" className="h-11 w-full justify-start gap-2">
          <Link to={links.agent()} replace={replace}>
            <Plus /> New chat
          </Link>
        </Button>
      )}
      {failed && <p className="mt-2 px-2 text-xs text-destructive" role="alert">{failed}</p>}
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {groups.map(({ g, items }) => (
          <section key={g} aria-label={g}>
            <h2 className={HEAD}>{g}</h2>
            <ul className="mt-1 space-y-0.5">
              {items.map((t) => (
                <li key={t.id} className="group relative">
                  {renaming?.id === t.id ? (
                    <div className="space-y-1 rounded-lg bg-accent/60 p-2">
                      <RenameBox
                        value={renaming.text}
                        onChange={(text) => setRenaming({ id: t.id, text })}
                        onSave={saveName}
                        onCancel={() => setRenaming(null)}
                      />
                      {renaming.error && <p className="text-xs text-destructive">{renaming.error}</p>}
                    </div>
                  ) : (
                    <Link
                      to={links.agent({ thread: t.id })}
                      replace={replace}
                      aria-current={t.id === current ? "page" : undefined}
                      className={cn(
                        "block rounded-lg py-2 pl-2 pr-11 transition-colors [@media(pointer:coarse)]:min-h-11",
                        t.id === current ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                      )}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                        {isBusy(t) ? (
                          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-label="Running" />
                        ) : (
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {whenShort(t.updatedAt, now)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{lastLine(t)}</span>
                    </Link>
                  )}
                  {renaming?.id !== t.id && (
                    <button
                      type="button"
                      onClick={() => setMenu(menu === t.id ? null : t.id)}
                      aria-label={`More for ${t.title}`}
                      aria-expanded={menu === t.id}
                      className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                  {menu === t.id && (
                    <div role="menu" className="absolute right-1 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(null);
                          setRenaming({ id: t.id, text: t.title });
                        }}
                        className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm hover:bg-accent [@media(pointer:coarse)]:min-h-11"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(null);
                          setAsking(t.id);
                        }}
                        className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm text-destructive hover:bg-accent [@media(pointer:coarse)]:min-h-11"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                  {asking === t.id && (
                    <div role="alertdialog" aria-label="Delete this chat?" className="mt-1 space-y-2 rounded-lg border border-border bg-card p-3 shadow-card">
                      <p className="text-sm">Delete this chat? What it made stays in My posts.</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-11 sm:h-9"
                          onClick={() => {
                            setAsking(null);
                            setFailed(deleteThread(userId, t.id) ? null : "Couldn't delete that. Try again.");
                          }}
                        >
                          Delete
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setAsking(null)} autoFocus>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

function RenameBox({ value, onChange, onSave, onCancel }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <input
      ref={ref}
      value={value}
      aria-label="Chat name"
      maxLength={80}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onSave}
      className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
    />
  );
}
