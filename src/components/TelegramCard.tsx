// The Telegram card on /accounts#telegram (Leo's sign-ins; docs/north-star/items/publish-telegram.md, on ns/phase7).
// Connect Telegram opens the Content Studio bot with a one-time code. The person taps Start, then Confirm, which is
// Telegram's login_url back to /accounts?telegram=<row> with Telegram's signed login. index.html's first script takes
// it off the address before anything else loads. This card checks it with `telegram` (in this signed-in session and
// this browser's nonce from Connect Telegram, so a code made by another account or another browser fails), asks
// "Connect Telegram as <name> (@username)?", and only Connect confirms it. Then
// they pick a group or channel in Telegram, and this card reads its own row every 3 s while the tab is visible, so
// "Connected to {name}." shows within seconds of the bot's webhook. A reload resumes the newest unexpired connect.
// Each chat shows who connected it beside Disconnect, so one tied by someone else is plain to see and quick to undo.
// "Use your brand's own bot" (027) swaps the shared bot for one the owner made in BotFather: the token is pasted once,
// checked and kept in Vault by `telegram`, and this card only ever shows "Posting as @<bot>".

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { clearConnectReturn, isNotEnabled, readConnectReturn } from "@/lib/socialConnect";
import {
  WAITING_HELP,
  chatRows,
  connectState,
  disconnectTelegram,
  readTelegramRow,
  readTelegramRows,
  rowDetail,
  saveTelegramChannels,
  startTelegram,
  checkTelegram,
  clearNonce,
  confirmTelegram,
  identityQuestion,
  readNonce,
  saveNonce,
  takeTelegramLogin,
  OWN_BOT_STEPS,
  addOwnBot,
  looksLikeBotToken,
  ownBotLine,
  readOwnBot,
  removeOwnBot,
  replaceOwnBotToken,
  type OwnBot,
  type TelegramRow,
} from "@/lib/telegramConnect";

const POLL_MS = 3000;
// This tab's link for a connect it started, so a reload can still offer Open Telegram. Per tab, outside the sync
// prefix; the code in it dies in 15 minutes and works for one Telegram user.
const LINK_KEY = "cs-telegram-link";

function savedLink(rowId: string): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(LINK_KEY) ?? "null");
    return v?.rowId === rowId && typeof v.link === "string" && v.link.startsWith("https://t.me/") ? v.link : null;
  } catch {
    return null;
  }
}

function saveLink(rowId: string, link: string): void {
  try {
    sessionStorage.setItem(LINK_KEY, JSON.stringify({ rowId, link }));
  } catch {
    // private mode: Open Telegram shows until a reload
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't go through. Try again in a minute.");

export default function TelegramCard({ userId, profileId }: { userId: string; profileId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TelegramRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [watchId, setWatchId] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // what came of Telegram's login returning here
  const [login, setLogin] = useState<{ ok: boolean; text: string } | null>(null);
  // Telegram's verified login, waiting for Connect or Cancel
  const [ask, setAsk] = useState<{ chatRow: string; auth: Record<string, string>; nonce: string; question: string } | null>(null);
  // the brand's own bot: undefined while read, null on the shared bot
  const [ownBot, setOwnBot] = useState<OwnBot | null | undefined>(undefined);
  const [botOpen, setBotOpen] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [botBusy, setBotBusy] = useState<"" | "check" | "remove">("");
  const [botError, setBotError] = useState("");

  useEffect(() => {
    let live = true;
    readOwnBot(profileId).then(
      (b) => live && setOwnBot(b),
      () => live && setOwnBot(null),
    );
    return () => {
      live = false;
    };
  }, [profileId]);

  const load = useCallback(async () => {
    try {
      const r = await readTelegramRows(profileId);
      setRows(r);
      setError("");
      saveTelegramChannels(userId, profileId, r);
      return r;
    } catch (e) {
      setError(message(e));
      return null;
    }
  }, [userId, profileId]);

  useEffect(() => {
    void load().then((r) => {
      // a connect started before a reload: keep waiting on it
      const newest = r?.[0];
      if (newest?.status === "pending" && Date.parse(newest.code_expires_at) > Date.now()) {
        setWatchId(newest.id);
        setLink(savedLink(newest.id));
      }
    });
  }, [load]);

  useEffect(() => {
    const back = takeTelegramLogin();
    if (!back) return;
    setWatchId(back.chatRow);
    const nonce = readNonce(back.chatRow);
    if (!nonce) {
      setLogin({ ok: false, text: "Open Confirm in the browser where you pressed Connect Telegram, signed in there." });
      return;
    }
    setLogin({ ok: true, text: "Checking with Telegram..." });
    checkTelegram(back.chatRow, back.auth, nonce).then(
      (who) => {
        setLogin(null);
        setAsk({ ...back, nonce, question: identityQuestion(who) });
      },
      (e) => setLogin({ ok: false, text: isNotEnabled(e) ? "Telegram isn't switched on for you yet." : message(e) }),
    );
    // once, on arrival from Telegram
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watched = rows?.find((r) => r.id === watchId) ?? null;
  const live = !!watched && watched.status === "pending" && Date.parse(watched.code_expires_at) > now;

  useEffect(() => {
    if (!live || !watchId) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      void readTelegramRow(watchId).then((r) => {
        if (!r) return;
        setRows((rs) => rs && rs.map((x) => (x.id === r.id ? r : x)));
        // tied (or cancelled in Telegram): read the list again, which also refreshes Channels
        if (r.status !== "pending") void load();
      });
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [live, watchId, load]);

  const connect = async () => {
    setBusy("start");
    setError("");
    try {
      const out = await startTelegram(profileId);
      saveLink(out.rowId, out.link);
      saveNonce(out.rowId, out.nonce);
      setLink(out.link);
      setWatchId(out.rowId);
      setNow(Date.now());
      // a blocked new tab leaves the Open Telegram button below
      window.open(out.link, "_blank", "noopener,noreferrer");
      await load();
    } catch (e) {
      setError(isNotEnabled(e) ? "Telegram isn't switched on for you yet." : message(e));
    } finally {
      setBusy("");
    }
  };

  const answer = async (yes: boolean) => {
    if (!ask) return;
    setBusy(yes ? "yes" : "no");
    try {
      if (yes) {
        const r = await confirmTelegram(ask.chatRow, ask.auth, ask.nonce);
        setLogin({ ok: true, text: r.picker ? "Telegram is linked. Back in Telegram, pick your group or channel." : "Telegram is linked. In Telegram, tap your Connect link again to pick your group or channel." });
      } else {
        await disconnectTelegram(profileId, ask.chatRow);
        setLogin({ ok: true, text: "Cancelled. Nothing was connected." });
      }
      clearNonce();
      setAsk(null);
      await load();
    } catch (e) {
      setAsk(null);
      setLogin({ ok: false, text: message(e) });
    } finally {
      setBusy("");
    }
  };

  const addBot = async () => {
    setBotBusy("check");
    setBotError("");
    try {
      const r = await addOwnBot(profileId, botToken);
      setBotToken("");
      setBotOpen(false);
      setOwnBot({ id: "", bot_id: 0, username: r.botUsername, display_name: r.botName, status: "active" });
      void readOwnBot(profileId).then((b) => b && setOwnBot(b), () => undefined);
    } catch (e) {
      setBotError(isNotEnabled(e) ? "Telegram isn't switched on for you yet." : message(e));
    } finally {
      setBotBusy("");
    }
  };

  // the bot's token stopped working (Telegram answered 401): a new token for the same bot, chats kept
  const replaceToken = async () => {
    setBotBusy("check");
    setBotError("");
    try {
      await replaceOwnBotToken(profileId, botToken);
      setBotToken("");
      setOwnBot((b) => b && { ...b, status: "active" });
    } catch (e) {
      setBotError(isNotEnabled(e) ? "Telegram isn't switched on for you yet." : message(e));
    } finally {
      setBotBusy("");
    }
  };

  const switchBack = async () => {
    if (!ownBot) return;
    if (!window.confirm(`Switch back to the shared bot? Chats connected through @${ownBot.username} are disconnected and their waiting posts cancelled.`)) return;
    setBotBusy("remove");
    try {
      await removeOwnBot(profileId);
      setOwnBot(null);
      toast({ title: "Switched back to the shared bot" });
      await load();
    } catch (e) {
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setBotBusy("");
    }
  };

  const disconnect = async (r: TelegramRow) => {
    const { name } = rowDetail(r);
    if (!window.confirm(`Disconnect ${name}? The bot leaves it, and posts waiting for it are cancelled.`)) return;
    setBusy(`x${r.id}`);
    try {
      await disconnectTelegram(profileId, r.id);
      toast({ title: `Disconnected ${name}` });
      await load();
    } catch (e) {
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const chats = rows ? chatRows(rows) : [];
  const state = watched ? connectState(watched, now) : null;
  const backTo = state?.kind === "connected" ? readConnectReturn() : null;

  return (
    <section id="telegram" aria-labelledby="accounts-telegram" className="scroll-mt-20 space-y-2 rounded-xl border border-border/60 p-4 shadow-card">
      <div className="flex items-center gap-1">
        <h2 id="accounts-telegram" className="text-sm font-semibold">Telegram</h2>
        <InfoTip label="About Telegram">Content Studio's bot posts for you. It reads nothing else.</InfoTip>
      </div>

      {ownBot && (
        <div className={`space-y-2 rounded-lg border px-3 py-2 ${ownBot.status === "revoked" ? "border-destructive/40" : "border-border/60"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className={`mr-auto text-sm font-semibold ${ownBot.status === "revoked" ? "text-destructive" : ""}`}>{ownBotLine(ownBot)}</p>
            <Button variant="ghost" className="h-11 text-muted-foreground hover:text-foreground" disabled={!!botBusy} onClick={() => void switchBack()}>
              {botBusy === "remove" ? "Switching back..." : "Switch back to the shared bot"}
            </Button>
          </div>
          {ownBot.status === "revoked" && (
            <div className="space-y-2">
              <label htmlFor="telegram-bot-new-token" className="block text-sm font-semibold">
                New token for @{ownBot.username}, from BotFather
              </label>
              <Input
                id="telegram-bot-new-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && looksLikeBotToken(botToken) && !botBusy && void replaceToken()}
                placeholder="123456789:AA..."
                className="h-11"
              />
              {botBusy === "check" && (
                <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your bot...
                </p>
              )}
              {botError && <p role="alert" className="text-sm text-destructive">{botError}</p>}
              <Button className="h-11" disabled={!looksLikeBotToken(botToken) || !!botBusy} onClick={() => void replaceToken()}>
                Use this token
              </Button>
            </div>
          )}
        </div>
      )}

      {rows === null && !error && <p className="text-sm text-muted-foreground">Loading your Telegram chats...</p>}

      {chats.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {chats.map((r) => {
            const d = rowDetail(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="mr-auto min-w-0">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>{d.kind}</span>
                    {d.topic && <span>{d.topic}</span>}
                    <span className={`font-semibold ${d.tone === "ok" ? "text-success" : "text-destructive"}`}>{d.state}</span>
                    {d.by && <span>{d.by}</span>}
                  </p>
                </div>
                {r.status !== "connected" && (
                  <Button size="sm" className="h-11 sm:h-9" disabled={!!busy || live} onClick={() => void connect()}>
                    Connect again
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-11 gap-1.5 text-muted-foreground hover:text-destructive sm:h-9" disabled={!!busy} onClick={() => void disconnect(r)}>
                  <Unplug className="h-3.5 w-3.5" /> {busy === `x${r.id}` ? "Disconnecting..." : "Disconnect"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {ask && (
        <div role="alertdialog" aria-labelledby="telegram-ask" className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <p id="telegram-ask" className="text-sm font-semibold">
            {ask.question}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 sm:h-9" disabled={!!busy} onClick={() => void answer(true)}>
              {busy === "yes" ? "Connecting..." : "Connect"}
            </Button>
            <Button variant="ghost" className="h-11 sm:h-9" disabled={!!busy} onClick={() => void answer(false)}>
              {busy === "no" ? "Cancelling..." : "Cancel"}
            </Button>
          </div>
        </div>
      )}

      {login && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${login.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
          {login.text}
        </p>
      )}

      {!ask && live && state?.kind === "waiting" && (
        <div role="status" className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <p>{state.linked ?? WAITING_HELP}</p>
          {state.refused && <p className="text-destructive">{state.refused}</p>}
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for Telegram...
          </p>
        </div>
      )}
      {state?.kind === "connected" && (
        <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
          {state.text}
          {state.forum && <span className="block text-muted-foreground">{state.forum}</span>}
          {backTo && (
            <Link to={backTo} onClick={clearConnectReturn} className="mt-1 block font-semibold text-primary underline-offset-2 hover:underline">
              Back to your post
            </Link>
          )}
        </p>
      )}
      {state?.kind === "expired" && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.text}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {rows !== null &&
        !ask &&
        (live && watched?.confirmed_at ? null : live && link ? (
          <Button asChild className="h-11 w-full sm:w-auto">
            <a href={link} target="_blank" rel="noopener noreferrer">
              Open Telegram
            </a>
          </Button>
        ) : (
          // during a wait this tab has no link for, a new code replaces the waiting one
          <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={!!busy} onClick={() => void connect()}>
            {busy === "start" ? "Opening Telegram..." : live ? "Start again" : chats.length ? "Add another Telegram chat" : "Connect Telegram"}
          </Button>
        ))}

      {ownBot === null && !ask && !live && !botOpen && (
        <Button variant="ghost" className="h-11 w-full justify-start px-0 text-primary hover:bg-transparent hover:underline sm:w-auto" onClick={() => setBotOpen(true)}>
          Use your brand's own bot
        </Button>
      )}
      {ownBot === null && botOpen && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <h3 className="text-sm font-semibold">Use your brand's own bot</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {OWN_BOT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <label htmlFor="telegram-bot-token" className="block text-sm font-semibold">
            Bot token
          </label>
          <Input
            id="telegram-bot-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && looksLikeBotToken(botToken) && !botBusy && void addBot()}
            placeholder="123456789:AA..."
            className="h-11"
          />
          {botBusy === "check" && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your bot...
            </p>
          )}
          {botError && <p role="alert" className="text-sm text-destructive">{botError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" disabled={!looksLikeBotToken(botToken) || !!botBusy} onClick={() => void addBot()}>
              Use this bot
            </Button>
            <Button
              variant="ghost"
              className="h-11"
              disabled={!!botBusy}
              onClick={() => {
                setBotOpen(false);
                setBotToken("");
                setBotError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
