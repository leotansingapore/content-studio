// The Telegram card on /accounts#telegram (Leo's sign-ins; docs/north-star/items/publish-telegram.md, on ns/phase7).
// Connect Telegram opens the Content Studio bot with a one-time code. The person taps Start, then Confirm, which is
// Telegram's login_url back to /accounts?telegram=<row> with Telegram's signed login. index.html's first script takes
// it off the address before anything else loads; this card sends it to `telegram` verify (in this signed-in session,
// so a code made by another account fails). Then
// they pick a group or channel in Telegram, and this card reads its own row every 3 s while the tab is visible, so
// "Connected to {name}." shows within seconds of the bot's webhook. A reload resumes the newest unexpired connect.
// Each chat shows who connected it beside Disconnect, so one tied by someone else is plain to see and quick to undo.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
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
  takeTelegramLogin,
  verifyTelegram,
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
    setLogin({ ok: true, text: "Checking with Telegram..." });
    verifyTelegram(back.chatRow, back.auth).then(
      (r) => {
        setLogin({ ok: true, text: r.picker ? "Telegram is linked. Back in Telegram, pick your group or channel." : "Telegram is linked. In Telegram, tap your Connect link again to pick your group or channel." });
        void load();
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

      {login && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${login.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
          {login.text}
        </p>
      )}

      {live && state?.kind === "waiting" && (
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
        (live && link ? (
          <Button asChild className="h-11 w-full sm:w-auto">
            <a href={link} target="_blank" rel="noopener noreferrer">
              Open Telegram
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={!!busy} onClick={() => void connect()}>
            {busy === "start" ? "Opening Telegram..." : chats.length ? "Add another Telegram chat" : "Connect Telegram"}
          </Button>
        ))}
    </section>
  );
}
