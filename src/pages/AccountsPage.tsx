// Connections (/accounts, was Social accounts): one page of compact rows in groups, open to every sign-in.
// Social accounts: the open brand profile's Instagram, Facebook, TikTok, LinkedIn, YouTube and Threads accounts
// through Zernio (server: supabase/functions/social; docs/zernio-connection.md). Until the server says it is
// switched on, the group says only that. One row per platform or account: Connect, Reconnect, Disconnect. Leo's
// sign-in also sees the count and price lines, a default per platform, and "Back to your post" after a connect
// started from a post. Telegram (#telegram, TelegramCard.tsx, Leo's sign-ins: the server refuses everyone else)
// connects through the Content Studio bot. Links and tools: rows to their own pages, as nav.ts lists them.

import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowClockwiseIcon, AtIcon, CaretRightIcon, PlugsIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { CHANNEL_ICON } from "@/components/ChannelsBlock";
import TelegramCard from "@/components/TelegramCard";
import { useToast } from "@/hooks/use-toast";
import { section, visiblePages } from "@/lib/nav";
import { supabase } from "@/lib/supabase";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useScrollToHash } from "@/lib/urlState";
import { activeProfile, DEFAULT_PROFILE_ID } from "@/lib/profiles";
import { loadDrafts } from "@/lib/draftHistory";
import { isOnboarded } from "@/lib/onboarding";
import { heldOn } from "@/lib/zernioOutbox";
import { ZERNIO_IG_BRANDS } from "@/lib/reelsBoard";
import {
  capLine,
  clearConnectReturn,
  connectLink,
  countLine,
  disconnectOne,
  groupAccounts,
  healthLabel,
  isNotEnabled,
  loadSocialDefaults,
  platformName,
  readConnectReturn,
  readRedirect,
  rememberSocialConnect,
  removedLine,
  saveSocialDefault,
  SOCIAL_PLATFORMS,
  socialStatus,
  storedUserId,
  ZERNIO_PRICE_LINE,
  type AccountView,
  type SocialDefaults,
  type SocialPlatform,
  type SocialStatus,
} from "@/lib/socialConnect";

const HEALTH_TONE: Record<AccountView["health"], string> = {
  healthy: "text-success",
  warning: "text-warning",
  error: "text-destructive",
  unknown: "text-muted-foreground",
};

const isPlatform = (p: string): p is SocialPlatform => (SOCIAL_PLATFORMS as readonly string[]).includes(p);
const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't go through. Try again in a minute.");

const ROWS = "divide-y divide-border/60 rounded-lg border border-border/60";
const ROW = "flex min-h-11 items-center gap-3 px-3 py-2";
const MARK = "h-5 w-5 shrink-0 text-muted-foreground";
// the pages the Links and tools rows open; nav.ts keeps their names, icons and who sees them (AdLauncher is Leo's)
const TOOLS = ["/bio", "/links", "/connect", "/adlauncher"];

type RowActions = {
  busy: string;
  connect: (p: SocialPlatform, again?: string) => void;
  disconnect: (a: AccountView) => void;
};

/** One connected account: its network, who it is connected as, and Disconnect (Reconnect first when it stopped working); `extra` sits before the buttons (Leo's Default). */
function AccountRow({ a, id, busy, extra, connect, disconnect }: RowActions & { a: AccountView; id?: string; extra?: ReactNode }) {
  const Icon = CHANNEL_ICON[a.platform] ?? AtIcon;
  const who = a.username ? `@${a.username}` : a.name;
  const well = !a.needsReconnect && a.health === "healthy";
  return (
    <li id={id} className={`${ROW} scroll-mt-20 flex-wrap`}>
      <Icon aria-hidden className={MARK} />
      <div className="mr-auto min-w-0">
        <p className="truncate text-sm font-semibold">{platformName(a.platform)}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span className="truncate">{who ? `Connected as ${who}` : "Connected"}</span>
          {!well && <span className={`font-semibold ${HEALTH_TONE[a.needsReconnect ? "error" : a.health]}`}>{healthLabel(a)}</span>}
          {a.issues[0] && <span>{a.issues[0]}</span>}
        </p>
      </div>
      {extra}
      {(a.needsReconnect || a.health === "error") && isPlatform(a.platform) && (
        <Button size="sm" variant="outline" className="h-11 sm:h-9" disabled={!!busy} onClick={() => connect(a.platform as SocialPlatform, a.id)}>
          {busy === a.id ? "Opening..." : "Reconnect"}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-11 gap-1.5 text-muted-foreground hover:text-destructive sm:h-9"
        disabled={!!busy}
        onClick={() => disconnect(a)}
      >
        <PlugsIcon className="h-3.5 w-3.5" /> {busy === `x${a.id}` ? "Disconnecting..." : "Disconnect"}
      </Button>
    </li>
  );
}

/**
 * The Social accounts rows once the server has answered: a row per platform ("Not connected", Connect) or per
 * connected account, then a quiet "Add another" under a platform that has one. Leo's sign-in sees the count and the
 * price above them and picks a default where a platform has two; everyone else sees the cap line only once full.
 */
export function SocialRows({ status, leo, defaults, pickDefault, ...act }: RowActions & {
  status: SocialStatus;
  leo: boolean;
  defaults: SocialDefaults;
  pickDefault: (platform: string, accountId: string) => void;
}) {
  const full = capLine(status);
  const { busy, connect } = act;
  return (
    <>
      {status.removed.length > 0 && (
        <ul role="status" className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {status.removed.map((n) => (
            <li key={`${n.platform}-${n.username}-${n.at}`}>{removedLine(n)}</li>
          ))}
        </ul>
      )}
      {leo ? (
        <div className="space-y-0.5 text-sm">
          <p className="font-semibold">{countLine(status)}</p>
          <p className="text-muted-foreground">{ZERNIO_PRICE_LINE}</p>
        </div>
      ) : (
        full && <p className="text-sm text-muted-foreground">{full}</p>
      )}
      <ul className={ROWS}>
        {groupAccounts(status.accounts, defaults).map((g) => {
          const Icon = CHANNEL_ICON[g.platform] ?? AtIcon;
          const known = isPlatform(g.platform);
          if (!g.accounts.length)
            return (
              <li key={g.platform} id={g.platform} className={`${ROW} scroll-mt-20`}>
                <Icon aria-hidden className={MARK} />
                <div className="mr-auto min-w-0">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  <p className="text-xs text-muted-foreground">Not connected</p>
                </div>
                {known && (
                  <Button size="sm" variant="outline" className="h-11 sm:h-9" aria-label={g.button ?? undefined} disabled={!!busy || !!full} onClick={() => connect(g.platform as SocialPlatform)}>
                    {busy === g.platform ? "Opening..." : "Connect"}
                  </Button>
                )}
              </li>
            );
          return [
            ...g.accounts.map((a, i) => (
              <AccountRow
                key={a.id}
                a={a}
                id={i === 0 ? g.platform : undefined}
                {...act}
                extra={
                  leo && g.showDefault && (
                    <label className="flex min-h-9 cursor-pointer items-center gap-1.5 px-1 text-xs font-medium [@media(pointer:coarse)]:min-h-11">
                      <input
                        type="radio"
                        name={`default-${g.platform}`}
                        checked={g.defaultId === a.id}
                        onChange={() => pickDefault(g.platform, a.id)}
                        className="h-4 w-4 accent-primary"
                      />
                      Default
                    </label>
                  )
                }
              />
            )),
            known && g.button && (
              <li key={`${g.platform}-add`} className="px-3 py-1 pl-11">
                <Button size="sm" variant="ghost" className="h-11 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground sm:h-9" disabled={!!busy || !!full} onClick={() => connect(g.platform as SocialPlatform)}>
                  {busy === g.platform ? `Opening ${g.name}...` : g.button}
                </Button>
              </li>
            ),
          ];
        })}
      </ul>
    </>
  );
}

export default function AccountsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "off" | "ready" | "error">("loading");
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [error, setError] = useState("");
  // the platform or account a button is working on
  const [busy, setBusy] = useState("");
  const [back, setBack] = useState<{ ok: boolean; text: string } | null>(null);
  // Instagram just connected for a brand whose approved posts then go out by themselves (the posts board)
  const [igBack, setIgBack] = useState(false);
  // Leo's sign-in (publish-accounts): the post a connect started from, and a default account per platform
  const leo = useLeoUser();
  const [backTo, setBackTo] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<SocialDefaults>({});
  // /accounts#tiktok lands on that platform's row once the rows are drawn
  useScrollToHash(state === "ready" && leo !== undefined);

  const load = async (uid: string) => {
    try {
      const s = await socialStatus(activeProfile(uid).id);
      rememberSocialConnect(true);
      setStatus(s);
      setState("ready");
    } catch (e) {
      if (isNotEnabled(e)) {
        rememberSocialConnect(false);
        setState("off");
      } else {
        setError(message(e));
        setState("error");
      }
    }
  };

  useEffect(() => {
    // Zernio sends the browser back here with ?connected= (and ?error= when it didn't work)
    const result = readRedirect(params);
    const returnTo = result ? readConnectReturn() : null;
    if (result && returnTo?.startsWith("/welcome")) {
      if (!isOnboarded(storedUserId())) {
        navigate(`/welcome?${params.toString()}`, { replace: true });
        return;
      }
      clearConnectReturn();
    }
    if (result) {
      setBack(result);
      setIgBack(result.ok && params.get("connected") === "instagram");
      setBackTo(readConnectReturn());
      setParams({}, { replace: true });
    }
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) setDefaults(loadSocialDefaults(id));
      if (id) void load(id);
      else setState("off");
    });
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = activeProfile(userId);

  const connect = async (platform: SocialPlatform, reconnectAccountId?: string) => {
    setBusy(reconnectAccountId ?? platform);
    try {
      const { authUrl } = await connectLink(profile.id, platform, reconnectAccountId);
      window.location.assign(authUrl);
    } catch (e) {
      setBusy("");
      toast({ title: message(e), variant: "destructive" });
      if (userId) void load(userId);
    }
  };

  const disconnect = async (a: AccountView) => {
    const label = a.username ? `@${a.username} on ${platformName(a.platform)}` : `this ${platformName(a.platform)} account`;
    const held = heldOn(loadDrafts(userId), a.platform);
    const posts = held.length ? `\n\nScheduled auto-posts on ${platformName(a.platform)}: ${held.slice(0, 3).map((t) => `"${t}"`).join(", ")}${held.length > 3 ? ` and ${held.length - 3} more` : ""}. Cancel them first if they shouldn't go out.` : "";
    if (!window.confirm(`Disconnect ${label}? You can connect it again later.${posts}`)) return;
    setBusy(`x${a.id}`);
    try {
      await disconnectOne(profile.id, a.id);
      toast({ title: `Disconnected ${label}` });
      if (userId) await load(userId);
    } catch (e) {
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const pickDefault = (platform: string, accountId: string) => {
    if (!userId) return;
    if (!saveSocialDefault(userId, platform, accountId)) toast({ title: "Couldn't save the default: this device's storage is full.", variant: "destructive" });
    setDefaults(loadSocialDefaults(userId));
  };

  const tools = visiblePages(section("settings").pages, leo?.email ?? "").filter((p) => TOOLS.includes(p.to));

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Connections</h1>

      {back && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${back.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
          {back.text}
          {igBack && profile.boardBrand && ZERNIO_IG_BRANDS.includes(profile.boardBrand) && (
            <>
              {" "}Approved posts for {profile.name} now go out to Instagram by themselves.{" "}
              <Link to="/reels" className="font-semibold text-primary underline-offset-2 hover:underline">Back to the posts board</Link>
            </>
          )}
          {leo && backTo && (
            <>
              {" "}
              <Link to={backTo} onClick={clearConnectReturn} className="font-semibold text-primary underline-offset-2 hover:underline">Back to your post</Link>
            </>
          )}
        </p>
      )}

      <section aria-labelledby="accounts-social" className="space-y-2">
        <div className="flex items-center gap-1">
          <h2 id="accounts-social" className="text-sm font-semibold">Social accounts{profile.id !== DEFAULT_PROFILE_ID ? ` for ${profile.name}` : ""}</h2>
          <InfoTip label="About social accounts">Each brand connects its own accounts, and posts only to those.</InfoTip>
        </div>
        {(state === "loading" || (state === "ready" && leo === undefined)) && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Loading your accounts...
          </p>
        )}
        {/* the next step while posting is off (law 10): How to post's last step schedules with the networks' own free tools */}
        {state === "off" && (
          <p className="text-sm text-muted-foreground">
            Social accounts aren't switched on for you yet.{" "}
            <Link to="/create-guide#schedule" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">
              Schedule without them
            </Link>
          </p>
        )}
        {state === "error" && (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="h-11 gap-2" onClick={() => {
                if (!userId) return;
                setState("loading");
                void load(userId);
              }}>
              <ArrowClockwiseIcon className="h-4 w-4" /> Try again
            </Button>
          </>
        )}
        {state === "ready" && status && leo !== undefined && (
          <>
            <SocialRows status={status} leo={!!leo} defaults={defaults} pickDefault={pickDefault} busy={busy} connect={connect} disconnect={disconnect} />
            <p className="text-sm text-muted-foreground">
              Missing a platform?{" "}
              <Link to="/feedback?tab=feedback" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">
                Request it
              </Link>
            </p>
          </>
        )}
      </section>

      {leo && userId && <TelegramCard userId={userId} profileId={profile.id} />}

      <section aria-labelledby="accounts-tools" className="space-y-2">
        <h2 id="accounts-tools" className="text-sm font-semibold">Links and tools</h2>
        <ul className={ROWS}>
          {tools.map((p) => {
            const Icon = p.icon ?? AtIcon;
            return (
              <li key={p.to}>
                <Link to={p.to} className={`${ROW} transition-colors hover:bg-accent/50`}>
                  <Icon aria-hidden className={MARK} />
                  <span className="mr-auto min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.label}</span>
                    {p.hint && <span className="block truncate text-xs text-muted-foreground">{p.hint}</span>}
                  </span>
                  <CaretRightIcon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
