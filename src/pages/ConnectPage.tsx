// Connect Claude (/connect): make a private link that lets Claude read this
// profile's posts, calendar, results and brand, and save drafts to My posts
// (MCP server: supabase/functions/content-studio-mcp).
// Leo's sign-ins also get (agent-mcp-api): a name for the link, the curl line for
// Zapier, Make, n8n or a script (#api), the tools his links list (#tools), "See
// what it added" on each link (#links) and the made and turned-off activity rows.
// Everyone else's page is pinned (ConnectPage.test.ts).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { activeProfile, DEFAULT_PROFILE_ID } from "@/lib/profiles";
import { createLink, linkIsLive, loadLinks, NAME_MAX, removeLink, restoreLink, type ClaudeLink } from "@/lib/claudeConnect";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useScrollToHash } from "@/lib/urlState";
import { links as to } from "@/lib/links";
import { logActivity } from "@/lib/activity";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";
import { LEO_TOOLS, TOOL_LINES } from "../../supabase/functions/content-studio-mcp/logic.ts";
import { adviserBrand } from "@/lib/profession";

const TRY = ["What's on my calendar this week?", "Which of my posts did best, and why?", "Write a LinkedIn post about CPF top-ups in my voice and save it as a draft."];
const TRY_ANY = [...TRY.slice(0, 2), "Write a LinkedIn post about a question a client asked me this week, in my voice, and save it as a draft."];

export default function ConnectPage() {
  const { toast } = useToast();
  const leo = useLeoUser();
  const [userId, setUserId] = useState<string | null>(null);
  const [links, setLinks] = useState<ClaudeLink[]>([]);
  const [fresh, setFresh] = useState<{ url: string; state: "checking" | "ready" | "offline" } | null>(null);
  const [making, setMaking] = useState(false);
  const [copied, setCopied] = useState<"" | "url" | "cli" | "api">("");
  const [name, setName] = useState("Claude");
  useScrollToHash(Boolean(leo) && userId !== null);

  useEffect(() => {
    document.title = "Connect Claude - Postmosis";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setLinks(loadLinks(id));
    });
  }, []);

  const make = async () => {
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return toast({ title: "Sign in again to connect Claude", variant: "destructive" });
    setMaking(true);
    try {
      const { url } = await createLink(uid, undefined, leo ? name.trim() || "Claude" : undefined);
      setLinks(loadLinks(uid));
      if (leo) logActivity(uid, { who: "you", kind: "connect", title: "Made a Claude connection link", link: to.connect() });
      setFresh({ url, state: "checking" });
      // the link goes live once this device has synced it, usually within a second or two
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (await linkIsLive(url)) return setFresh({ url, state: "ready" });
      }
      setFresh({ url, state: "offline" });
    } finally {
      setMaking(false);
    }
  };

  const copy = (text: string, which: "url" | "cli" | "api") =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied(""), 1600);
      },
      () => toast({ title: "Copy failed", description: "Select the text and copy it.", variant: "destructive" }),
    );

  const remove = (link: ClaudeLink) => {
    if (!userId) return;
    removeLink(userId, link.hash);
    setLinks(loadLinks(userId));
    setFresh(null);
    if (leo) logActivity(userId, { who: "you", kind: "connect", title: "Turned off a Claude connection link", link: to.connect() });
    toast({
      title: "Link turned off",
      description: "Claude can no longer reach your posts with it.",
      action: (
        <ToastAction altText="Undo" onClick={() => { restoreLink(userId, link); setLinks(loadLinks(userId)); }}>
          Undo
        </ToastAction>
      ),
    });
  };

  const profile = activeProfile(userId);
  const cli = fresh ? `claude mcp add --transport http content-studio ${fresh.url}` : "";
  const curl = fresh
    ? `curl -X POST ${fresh.url} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"add_draft","arguments":{"text":"..."}}}'`
    : "";
  const made = (l: ClaudeLink) => `Made ${l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "earlier"}`;
  const makeButton = (
    <Button onClick={make} disabled={making} className="h-11 gap-2">
      <Link2 className="h-4 w-4" /> {making ? "Making the link..." : "Make a connection link"}
    </Button>
  );
  const turnOff = (l: ClaudeLink) => (
    <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => remove(l)}>
      <Trash2 className="h-3.5 w-3.5" /> Turn off
    </Button>
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Connect Claude</h1>
        <InfoTip label="About Connect Claude">Claude reads your posts, calendar, results and brand, and saves drafts.</InfoTip>
      </header>

      {fresh ? (
        <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Your connection link{profile.id !== DEFAULT_PROFILE_ID ? ` for ${profile.name}` : ""}</p>
            <div className="flex gap-2">
              <input readOnly value={fresh.url} aria-label="Connection link" onFocus={(e) => e.currentTarget.select()}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs" />
              <Button onClick={() => copy(fresh.url, "url")} className="h-10 shrink-0 gap-1.5">
                {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === "url" ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {fresh.state === "checking" ? "Checking the link..." : fresh.state === "ready" ? "Ready." : "Not live yet. It goes live once this device is online."}
              {" "}Anyone with it can read your posts, so keep it private. It's shown only now.
            </p>
          </div>
          <ol className="space-y-3 text-sm">
            <li>
              <span className="font-semibold">Claude app or claude.ai:</span> Settings, Connectors, Add custom connector. Name it Postmosis and paste the link.
            </li>
            <li className="space-y-1.5">
              <span className="font-semibold">Claude Code:</span>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-background px-2 py-2 text-xs">{cli}</code>
                <Button size="sm" variant="outline" onClick={() => copy(cli, "cli")} className="h-9 shrink-0 gap-1.5">
                  {copied === "cli" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === "cli" ? "Copied" : "Copy"}
                </Button>
              </div>
            </li>
          </ol>
        </section>
      ) : leo ? (
        <div className="space-y-3">
          <label className="block max-w-sm space-y-1.5">
            <span className="text-sm font-semibold">
              Name this link <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} className="h-11" />
          </label>
          {makeButton}
        </div>
      ) : (
        makeButton
      )}

      {leo && fresh && (
        <section id="api" className="scroll-mt-20 space-y-2">
          <h2 className="text-sm font-semibold">Use it from Zapier, Make, n8n or a script</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md border border-border/60 bg-background px-2 py-2 text-xs">{curl}</code>
            <Button size="sm" variant="outline" onClick={() => copy(curl, "api")} className="h-9 shrink-0 gap-1.5 self-start">
              {copied === "api" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === "api" ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Each call is JSON-RPC 2.0 over POST. Use the tool names below. {DAILY_LIMITS["mcp-calls"]} calls a day.</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Then try asking Claude</h2>
        <ul className="space-y-1.5">
          {(adviserBrand() ? TRY : TRY_ANY).map((t) => (
            <li key={t} className="rounded-lg border border-border/60 px-3 py-2 text-sm">{t}</li>
          ))}
        </ul>
      </section>

      {leo && (
        <section id="tools" className="scroll-mt-20 space-y-2">
          <h2 className="text-sm font-semibold">What Claude can do</h2>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {LEO_TOOLS.map((t) => (
              <li key={t.name} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                <code className="font-mono text-xs sm:w-44 sm:shrink-0">{t.name}</code>
                <span className="text-muted-foreground">{TOOL_LINES[t.name]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {links.length > 0 && (
        <section id={leo ? "links" : undefined} className={leo ? "scroll-mt-20 space-y-2" : "space-y-2"}>
          <h2 className="text-sm font-semibold">Links in use</h2>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {links.map((l) =>
              leo ? (
                <li key={l.hash} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
                  <span className="mr-auto min-w-0">
                    {l.name && <span className="block truncate font-medium">{l.name}</span>}
                    <span className={l.name ? "block text-xs text-muted-foreground" : undefined}>{made(l)}</span>
                  </span>
                  <Link to={to.activity({ view: "claude" })} className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-primary hover:underline">
                    See what it added &gt;
                  </Link>
                  {turnOff(l)}
                </li>
              ) : (
                <li key={l.hash} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="mr-auto">
                    Made {l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "earlier"}
                  </span>
                  {turnOff(l)}
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
