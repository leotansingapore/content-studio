// Social accounts (/accounts): connect the open brand profile's Instagram, Facebook, TikTok, LinkedIn,
// YouTube and Threads accounts through Zernio, see whether each still works, reconnect or disconnect it.
// Server: supabase/functions/social. Until the server says it is switched on, the page says only that.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RotateCw, Unplug } from "lucide-react";
import SectionTabs, { PLAYBOOK_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { activeProfile, DEFAULT_PROFILE_ID } from "@/lib/profiles";
import {
  capLine,
  connectLink,
  disconnectOne,
  healthLabel,
  isNotEnabled,
  PLATFORM_NAME,
  platformName,
  readRedirect,
  rememberSocialConnect,
  removedLine,
  SOCIAL_PLATFORMS,
  socialStatus,
  type AccountView,
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

export default function AccountsPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "off" | "ready" | "error">("loading");
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [error, setError] = useState("");
  // the platform or account a button is working on
  const [busy, setBusy] = useState("");
  const [back, setBack] = useState<{ ok: boolean; text: string } | null>(null);

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
    if (result) {
      setBack(result);
      setParams({}, { replace: true });
    }
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
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
    if (!window.confirm(`Disconnect ${label}? You can connect it again later.`)) return;
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

  const full = status ? capLine(status) : null;

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PLAYBOOK_TABS} />
      <header className="flex items-center gap-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Social accounts</h1>
        <InfoTip label="About social accounts">Each brand profile connects its own accounts, through Zernio.</InfoTip>
      </header>

      {back && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${back.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
          {back.text}
        </p>
      )}

      {state === "loading" && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading your accounts...
        </p>
      )}
      {state === "off" && <p className="text-sm text-muted-foreground">Social accounts aren't switched on for you yet.</p>}
      {state === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="h-11 gap-2" onClick={() => {
              if (!userId) return;
              setState("loading");
              void load(userId);
            }}>
            <RotateCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      )}

      {state === "ready" && status && (
        <>
          {status.removed.length > 0 && (
            <ul role="status" className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              {status.removed.map((n) => (
                <li key={`${n.platform}-${n.username}-${n.at}`}>{removedLine(n)}</li>
              ))}
            </ul>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Connected{profile.id !== DEFAULT_PROFILE_ID ? ` to ${profile.name}` : ""}</h2>
            {status.accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {status.accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="mr-auto min-w-0">
                      <p className="truncate text-sm font-semibold">{a.username ? `@${a.username}` : a.name || platformName(a.platform)}</p>
                      <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{platformName(a.platform)}</span>
                        <span className={`font-semibold ${HEALTH_TONE[a.needsReconnect ? "error" : a.health]}`}>{healthLabel(a)}</span>
                        {a.issues[0] && <span>{a.issues[0]}</span>}
                      </p>
                    </div>
                    {(a.needsReconnect || a.health === "error") && isPlatform(a.platform) && (
                      <Button size="sm" className="h-11 sm:h-9" disabled={!!busy} onClick={() => connect(a.platform as SocialPlatform, a.id)}>
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
                      <Unplug className="h-3.5 w-3.5" /> {busy === `x${a.id}` ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Connect an account</h2>
            {full && <p className="text-sm text-muted-foreground">{full}</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SOCIAL_PLATFORMS.map((p) => (
                <Button key={p} variant="outline" className="h-11" disabled={!!busy || !!full} onClick={() => connect(p)}>
                  {busy === p ? `Opening ${PLATFORM_NAME[p]}...` : PLATFORM_NAME[p]}
                </Button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
