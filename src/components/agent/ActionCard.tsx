// A card in the agent's thread (docs/north-star/items/agent-approvals.md, "Screens and states"): the one place a
// priced or saved change waits for a press. Its price sits on Approve (PriceChip), its uses left on the price line,
// and Approve is disabled with the reason when today's uses are short or the maker is busy; the engine checks again
// on the press, since a card can wait a day. A script or prompt being changed lives in sessionStorage
// (cs-agent-card-<card id>) until Save or Cancel, so leaving the page keeps it.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { canEdit, priceLine, type AgentCard } from "@/lib/agentCards";
import { cheaperFor, leftOf, limitOf, type Plan } from "@/lib/agentBudget";
import { approveLabel, blockedReason, editCard, press } from "@/lib/agentRun";
import { fieldsOf, MAX_SCRIPT_WORDS } from "@/lib/agentPlans";
import type { AgentMsg } from "@/lib/agentThreads";
import type { Usage } from "@/lib/aiUsage";
import { links } from "@/lib/links";
import { speakers } from "@/lib/talkingHead";
import { VOICES, VOICE_IDS } from "@/lib/textVoice";
import { MAX_LEARNINGS } from "@/lib/voiceMemory";
import { cn } from "@/lib/utils";

export const hhmm = (iso: string | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

const TAG: Record<AgentCard["status"], { text: string; cls: string }> = {
  proposed: { text: "PROPOSED", cls: "text-primary" },
  starting: { text: "PROPOSED", cls: "text-primary" },
  approved: { text: "APPROVED", cls: "text-success" },
  declined: { text: "NOT MADE", cls: "text-muted-foreground" },
  failed: { text: "DIDN'T GO THROUGH", cls: "text-destructive" },
};
const APPROVED_TITLE = "Approved. Ask for a new one to change it.";

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const stepIs = (c: AgentCard, s: AgentCard["step"]) => c.step === s;
const isVideo = (c: AgentCard) => c.kind === "video" || c.kind === "explainer";

/** The budget's plan for a card: the ladder cheaperFor offers from. */
function planOf(c: AgentCard): Plan {
  if (c.kind === "video") return "speaking";
  if (c.kind === "make") return (str(c.plan.format) as Plan) ?? "post";
  if (c.kind === "learning") return "learning";
  return c.kind;
}

const typedKey = (cardId: string) => `cs-agent-card-${cardId}`;
function readTyped(cardId: string): string | null {
  try {
    return sessionStorage.getItem(typedKey(cardId));
  } catch {
    return null;
  }
}
function writeTyped(cardId: string, v: string | null) {
  try {
    if (v === null) sessionStorage.removeItem(typedKey(cardId));
    else sessionStorage.setItem(typedKey(cardId), v);
  } catch {
    /* blocked storage: kept in the box for this visit */
  }
}

export default function ActionCard({
  userId,
  threadId,
  msg,
  usage,
  onSend,
}: {
  userId: string;
  threadId: string;
  msg: AgentMsg & { card: AgentCard };
  usage: Usage | null;
  /** Sends a cheaper offer as a new message in this thread. */
  onSend: (text: string) => void;
}) {
  const card = msg.card;
  const editable = canEdit(card);
  const field: "script" | "prompt" | null = card.kind === "image" ? "prompt" : isVideo(card) && !stepIs(card, "script") ? "script" : null;
  const current = field === "prompt" ? (card.prompt ?? "") : (card.script ?? []).join(" ");
  const [typed, setTyped] = useState<string | null>(() => (editable ? readTyped(card.id) : null));
  // the competitor box: what was typed here, else the link or @handle the engine took from the message
  const [name, setName] = useState(() => readTyped(card.id) ?? fieldsOf(card).input ?? "");
  const [details, setDetails] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the press lands when the engine writes the card's next state
  useEffect(() => setPending(false), [card.status, card.step]);

  const run = (button: Parameters<typeof press>[3]) => {
    setPending(true);
    setError(null);
    press(userId, threadId, msg.id, button)
      .catch((e) => setError(e instanceof Error ? e.message : "That didn't go through. Try again."))
      // a press the engine refused leaves the card as it was: Approve comes back
      .finally(() => setPending(false));
  };
  const change = (patch: Parameters<typeof editCard>[3]): boolean => {
    const line = editCard(userId, threadId, msg.id, patch);
    setError(line);
    return line === null;
  };
  const startEdit = () => {
    setTyped(current);
    writeTyped(card.id, current);
  };
  const typing = (v: string) => {
    setTyped(v);
    writeTyped(card.id, v);
  };
  const stopEdit = () => {
    setTyped(null);
    writeTyped(card.id, null);
  };
  const save = () => {
    if (typed === null || !field) return;
    if (change(field === "script" ? { script: typed } : { prompt: typed })) stopEdit();
  };
  const approve = () => {
    // the competitor box: the name as typed goes on the card before the press
    if (card.kind === "competitor" && name.trim() !== (fieldsOf(card).input ?? "")) {
      if (!change({ name: name.trim() })) return;
      writeTyped(card.id, null);
    }
    run("approve");
  };

  const status = card.status;
  const starting = status === "starting" || (pending && status === "proposed");
  const reason = blockedReason(userId, card, usage);
  const left = card.needs[0] ? leftOf(usage, card.needs[0].feature) : null;
  const line = priceLine(card, left);
  const tag = TAG[status];
  const after = status !== "proposed" && status !== "starting";
  const disabledTitle = after ? APPROVED_TITLE : undefined;
  const editing = typed !== null && editable && !!field;
  const n = editing ? words(typed) : 0;
  const voice = str(card.plan.voice);
  const who = str(card.plan.who);
  const s = card.kind === "video" && who !== undefined ? speakers(userId) : null;
  const rows = (card.details ?? []).filter((d) => !(voice !== undefined && d.label === "Voice") && !(s && d.label === "Who appears"));
  const offers = reason && !reason.startsWith("Another") ? cheaperFor(planOf(card), usage) : [];
  const quiet = "h-11 sm:h-9";

  return (
    <section aria-label={card.title} className="w-full max-w-xl rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <span className={cn("text-[11px] font-semibold tracking-[0.14em]", tag.cls)}>{tag.text}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{hhmm(card.proposedAt)}</span>
      </header>
      <div className="space-y-3 px-4 py-3">
        <div>
          <h3 className="break-words font-medium">{card.title}</h3>
          {card.line && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{card.line}</p>}
        </div>

        {card.kind === "competitor" && editable && (
          <label className="block text-xs font-medium text-muted-foreground">
            Link or @handle
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                writeTyped(card.id, e.target.value);
              }}
              maxLength={200}
              className="mt-1 block h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
            />
          </label>
        )}

        {line && <p className="text-xs tabular-nums text-muted-foreground">{line}</p>}
        {isVideo(card) && !stepIs(card, "script") && status !== "declined" && (
          <p className="text-xs text-muted-foreground">It takes a few minutes and opens in the video editor.</p>
        )}

        {card.preview && <blockquote className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 px-3 py-2 text-sm">"{card.preview}"</blockquote>}
        {!!card.flags?.length && (
          <ul className="space-y-1">
            {card.flags.map((f) => (
              <li key={f} className="flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> {f}
              </li>
            ))}
          </ul>
        )}

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={typed}
              onChange={(e) => typing(e.target.value)}
              rows={field === "script" ? 5 : 3}
              aria-label={field === "script" ? "The script" : "The picture prompt"}
              autoFocus
              className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center gap-2">
              {field === "script" && (
                <span className={cn("mr-auto text-xs tabular-nums", n > MAX_SCRIPT_WORDS ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {n} of {MAX_SCRIPT_WORDS} words
                </span>
              )}
              <Button type="button" size="sm" variant="outline" onClick={save} disabled={!typed.trim() || (field === "script" && n > MAX_SCRIPT_WORDS)} className={quiet}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={stopEdit} className={quiet}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {!!card.script?.length && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Script</p>
                <ol className="mt-1 space-y-1 text-sm">
                  {card.script.map((l, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 break-words">{l}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {card.prompt && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 px-3 py-2 text-sm">{card.prompt}</p>}
          </>
        )}

        {(rows.length > 0 || voice !== undefined || s) && (
          <div>
            <button
              type="button"
              onClick={() => setDetails(!details)}
              aria-expanded={details}
              className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
            >
              {details ? "Hide details" : "Show details"} {details ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {details && (
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {s && (
                  <>
                    <dt className="text-muted-foreground">Who appears</dt>
                    <dd className="min-w-0">
                      <select
                        value={who}
                        disabled={!editable}
                        title={disabledTitle}
                        onChange={(e) => change({ who: e.target.value })}
                        aria-label="Who appears"
                        className="h-11 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm sm:h-8"
                      >
                        {s.face && <option value="mine">Your face</option>}
                        {s.presenters.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="new">A new AI presenter, labelled on the post</option>
                      </select>
                    </dd>
                  </>
                )}
                {voice !== undefined && (
                  <>
                    <dt className="text-muted-foreground">Voice</dt>
                    <dd className="min-w-0">
                      <select
                        value={voice}
                        disabled={!editable}
                        title={disabledTitle}
                        onChange={(e) => change({ voice: e.target.value })}
                        aria-label="Voice"
                        className="h-11 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm sm:h-8"
                      >
                        {VOICE_IDS.map((v) => (
                          <option key={v} value={v}>{VOICES[v].label}, {VOICES[v].note}</option>
                        ))}
                      </select>
                    </dd>
                  </>
                )}
                {rows.map((d) => (
                  <div key={d.label} className="contents">
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd className="min-w-0 break-words">{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {status === "approved" && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" /> Approved by you {hhmm(card.decidedAt)}
          </p>
        )}
        {status === "declined" && <p className="text-sm text-muted-foreground">Nothing was made or charged.</p>}
        {status === "failed" && (
          <div className="space-y-1 text-sm">
            {card.error && <p className="text-destructive">{card.error}</p>}
            <p className="text-muted-foreground">Your use was given back.</p>
          </div>
        )}

        {status === "failed" ? (
          <Button type="button" onClick={() => run("retry")} disabled={pending} className="h-11">
            Try again
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {!after && (
              <Button
                type="button"
                onClick={approve}
                disabled={starting || !!reason || editing || (card.kind === "competitor" && !name.trim())}
                className="h-auto min-h-11 gap-2 whitespace-normal py-2 text-left"
              >
                {starting ? (
                  <>
                    <Loader2 className="animate-spin" /> Starting...
                  </>
                ) : (
                  <>
                    <span>{approveLabel(card)}</span>
                    {card.price && (
                      <span className="text-[11px] [&>span]:text-primary-foreground/85">
                        <PriceChip price={card.price} left={left} uses={card.needs[0]?.n} />
                      </span>
                    )}
                  </>
                )}
              </Button>
            )}
            {field && !editing && (status === "proposed" || status === "starting" || status === "approved") && (
              <Button type="button" variant="outline" size="sm" onClick={startEdit} disabled={!editable || starting} title={disabledTitle} className={quiet}>
                {field === "script" ? "Change the script" : "Change the prompt"}
              </Button>
            )}
            {card.kind === "video" && !stepIs(card, "script") && !editing && (status === "proposed" || status === "starting" || status === "approved") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => run("another-format")}
                disabled={!editable || starting}
                title={disabledTitle ?? `Writes it again: 1 of your ${limitOf("remix-make")} remixes today.`}
                className={quiet}
              >
                Try another format
              </Button>
            )}
            {!after && (
              <Button type="button" variant="ghost" size="sm" onClick={() => run("decline")} disabled={starting} className={quiet}>
                {card.kind === "edit" && stepIs(card, "apply") ? "Cancel" : "Not now"}
              </Button>
            )}
          </div>
        )}

        {reason && <p className="text-xs text-muted-foreground" role="status">{reason}</p>}
        {card.kind === "learning" && reason?.startsWith(`${MAX_LEARNINGS} is`) && (
          <Link to={links.voice({ section: "learned" })} className="inline-flex min-h-9 items-center text-xs font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
            Open Your voice
          </Link>
        )}
        {offers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {offers.map((o) =>
              o.plan === "write" ? (
                <Button key={o.chip} asChild variant="outline" size="sm" className={quiet}>
                  <Link to={links.generate({ detail: card.title, format: o.format })}>{o.chip}</Link>
                </Button>
              ) : (
                <Button key={o.chip} type="button" variant="outline" size="sm" onClick={() => onSend(o.chip)} className={quiet}>
                  {o.chip}
                </Button>
              ),
            )}
          </div>
        )}
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>
    </section>
  );
}
