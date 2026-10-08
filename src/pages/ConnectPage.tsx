// Connect Claude (/connect): make a private link that lets Claude read this
// profile's posts, calendar, results and brand, and save drafts to My posts
// (MCP server: supabase/functions/content-studio-mcp).

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import SectionTabs, { PLAYBOOK_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { activeProfile, DEFAULT_PROFILE_ID } from "@/lib/profiles";
import { createLink, linkIsLive, loadLinks, removeLink, saveLink, type ClaudeLink } from "@/lib/claudeConnect";

const TRY = ["What's on my calendar this week?", "Which of my posts did best, and why?", "Write a LinkedIn post about CPF top-ups in my voice and save it as a draft."];

export default function ConnectPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [links, setLinks] = useState<ClaudeLink[]>([]);
  const [fresh, setFresh] = useState<{ url: string; state: "checking" | "ready" | "offline" } | null>(null);
  const [making, setMaking] = useState(false);
  const [copied, setCopied] = useState<"" | "url" | "cli">("");

  useEffect(() => {
    document.title = "Connect Claude - Content Studio";
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
      const { url } = await createLink(uid);
      setLinks(loadLinks(uid));
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

  const copy = (text: string, which: "url" | "cli") =>
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
    toast({
      title: "Link turned off",
      description: "Claude can no longer reach your posts with it.",
      action: (
        <ToastAction altText="Undo" onClick={() => { saveLink(userId, link); setLinks(loadLinks(userId)); }}>
          Undo
        </ToastAction>
      ),
    });
  };

  const profile = activeProfile(userId);
  const cli = fresh ? `claude mcp add --transport http content-studio ${fresh.url}` : "";

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PLAYBOOK_TABS} />
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
              <span className="font-semibold">Claude app or claude.ai:</span> Settings, Connectors, Add custom connector. Name it Content Studio and paste the link.
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
      ) : (
        <Button onClick={make} disabled={making} className="h-11 gap-2">
          <Link2 className="h-4 w-4" /> {making ? "Making the link..." : "Make a connection link"}
        </Button>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Then try asking Claude</h2>
        <ul className="space-y-1.5">
          {TRY.map((t) => (
            <li key={t} className="rounded-lg border border-border/60 px-3 py-2 text-sm">{t}</li>
          ))}
        </ul>
      </section>

      {links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Links in use</h2>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {links.map((l) => (
              <li key={l.hash} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="mr-auto">
                  Made {l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "earlier"}
                </span>
                <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => remove(l)}>
                  <Trash2 className="h-3.5 w-3.5" /> Turn off
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
