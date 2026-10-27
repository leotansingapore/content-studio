// /adlauncher (Settings > Connections; docs/adlauncher-ads.md): connect AdLauncher, which launches the ads made in
// Image, always paused. One of: not connected (Connect), coming back from AdLauncher (?code=&state=: finish, then
// the address is cleaned), connected (the account, its default Page and ad account, Disconnect after asking),
// AdLauncher no longer taking the connection (Reconnect), or an error with Try again.
// Leo's sign-ins only (useLeoUser, so ?asLeo=1 works on localhost); anyone else gets NotFound.
// Server: supabase/functions/adlauncher. AdLauncher sends the browser back here with ?code=&state= (or ?error=).

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ExternalLink, Loader2, RotateCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { adlDisconnect, adlFinish, adlStart, adlStatus, clearReturn, readReturn, type AdlStatus } from "@/lib/adlauncher";
import { links } from "@/lib/links";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't go through. Try again in a minute.");

export default function AdLauncherPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Connection />;
}

function Connection() {
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const [state, setState] = useState<"loading" | "finishing" | "ready" | "error">("loading");
  const [status, setStatus] = useState<AdlStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "connect" | "disconnect">("");
  // a code is single use: a second effect run in development must not spend it twice
  const arrived = useRef(false);

  const load = async () => {
    setState("loading");
    try {
      setStatus(await adlStatus());
      setState("ready");
    } catch (e) {
      setError(message(e));
      setState("error");
    }
  };

  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    const code = params.get("code");
    const back = params.get("state");
    const refused = params.get("error");
    if (code || back || refused) setParams({}, { replace: true });
    if (refused) {
      setNotice(refused === "access_denied" ? "You didn't allow the connection, so nothing changed." : "AdLauncher didn't connect. Press Connect to try again.");
      void load();
      return;
    }
    if (code && back) {
      setState("finishing");
      adlFinish(code, back)
        .then((s) => {
          setStatus(s);
          setState("ready");
          toast({ title: "AdLauncher connected" });
        })
        .catch((e) => {
          setError(message(e));
          setState("error");
        });
      return;
    }
    void load();
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy("connect");
    setNotice("");
    try {
      const { url } = await adlStart();
      window.location.assign(url);
    } catch (e) {
      setBusy("");
      toast({ title: message(e), variant: "destructive" });
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect AdLauncher? Ads already made stay in AdLauncher. You can connect again later.")) return;
    setBusy("disconnect");
    try {
      await adlDisconnect();
      setStatus({ connected: false, account: null });
      toast({ title: "AdLauncher disconnected" });
    } catch (e) {
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const a = status?.account;
  // the ad that sent Leo here to connect
  const back = status?.connected ? readReturn() : null;
  const connectButton = (label: string) => (
    <Button className="h-11 gap-2 sm:h-10" disabled={!!busy} onClick={() => void connect()}>
      {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
      {busy === "connect" ? "Opening AdLauncher..." : label}
    </Button>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">AdLauncher</h1>

      {notice && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {(state === "loading" || state === "finishing") && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {state === "finishing" ? "Finishing the connection..." : "Loading..."}
        </p>
      )}

      {state === "error" && (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="h-11 gap-2 sm:h-10" onClick={() => void load()}>
            <RotateCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      )}

      {state === "ready" && status && !status.connected && (
        <section className="space-y-4 rounded-xl border border-border/60 p-4 shadow-card">
          {status.reconnect ? (
            <p className="text-sm">
              AdLauncher stopped taking this connection{a?.organization ? ` to ${a.organization}` : ""}. Connect again to keep making ads.
            </p>
          ) : (
            <p className="text-sm">Connect AdLauncher to run the pictures you make here as Facebook and Instagram ads. Every ad is made paused, and you switch it on in AdLauncher.</p>
          )}
          {connectButton(status.reconnect ? "Reconnect AdLauncher" : "Connect AdLauncher")}
        </section>
      )}

      {state === "ready" && status?.connected && (
        <section className="space-y-4 rounded-xl border border-border/60 p-4 shadow-card" aria-label="Connected account">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Connected
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Account</dt>
              <dd className="break-words font-medium">{[a?.organization, a?.client].filter(Boolean).join(", ") || "Your AdLauncher account"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Default Page</dt>
              <dd className="break-words font-medium">{a?.pageName ?? "None set"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Default ad account</dt>
              <dd className="break-words font-medium">
                {a?.adAccountName ?? a?.adAccountId ?? "None set"}
                {a?.currency ? <span className="text-muted-foreground">, {a.currency}</span> : null}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="h-11 sm:h-10">
              {back ? (
                <Link to={back} onClick={clearReturn}>
                  Back to your ad
                </Link>
              ) : (
                <Link to={links.image()}>Make an ad in Image</Link>
              )}
            </Button>
            <Button variant="ghost" className="h-11 gap-1.5 text-muted-foreground hover:text-destructive sm:h-10" disabled={!!busy} onClick={() => void disconnect()}>
              {busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              {busy === "disconnect" ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Ads are made paused. You switch each one on in AdLauncher.</p>
        </section>
      )}
    </div>
  );
}
