// Engage (/recruit/engage): drafts for the conversations around your posts.
// You paste comments or messages in and copy drafts out; the app never posts,
// comments or messages for you. Each tool is ?tool=<id>, so a link opens it.
// Logic: src/lib/engageDrafts.ts and supabase/functions/engage-assist.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SectionTabs, { RECRUIT_TABS } from "@/components/SectionTabs";
import Replies from "@/components/engage/Replies";
import Dms from "@/components/engage/Dms";
import Comments from "@/components/engage/Comments";
import Connect from "@/components/engage/Connect";
import Snippets from "@/components/engage/Snippets";
import { supabase } from "@/lib/supabase";

const TOOLS = [
  { id: "replies", label: "Comments on my post" },
  { id: "dms", label: "My DMs" },
  { id: "comments", label: "Comment on a post" },
  { id: "connect", label: "Connection note" },
  { id: "snippets", label: "Saved replies" },
] as const;
type ToolId = (typeof TOOLS)[number]["id"];

export default function EngagePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const tool: ToolId = TOOLS.find((t) => t.id === params.get("tool"))?.id ?? "replies";
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <SectionTabs tabs={RECRUIT_TABS} />
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">Engage</h1>
      <div role="group" aria-label="What to draft" className="flex flex-wrap gap-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            onClick={() => setParams(t.id === "replies" ? {} : { tool: t.id }, { replace: true })}
            className={`h-11 rounded-full border px-4 text-xs font-semibold transition-colors sm:h-9 [@media(pointer:coarse)]:h-11 ${
              tool === t.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {!userId && <div className="h-64 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading" />}
      {userId && tool === "replies" && <Replies userId={userId} />}
      {userId && tool === "dms" && <Dms userId={userId} />}
      {userId && tool === "comments" && <Comments userId={userId} />}
      {userId && tool === "connect" && <Connect userId={userId} />}
      {userId && tool === "snippets" && <Snippets userId={userId} />}
    </div>
  );
}
