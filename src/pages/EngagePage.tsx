// Engage (/recruit/engage): drafts for the conversations around your posts.
// You paste comments or messages in and copy drafts out; the app never posts,
// comments or messages for you. Logic: src/lib/engage.ts and
// supabase/functions/engage-assist.
import { useEffect, useState } from "react";
import SectionTabs, { RECRUIT_TABS } from "@/components/SectionTabs";
import Replies from "@/components/engage/Replies";
import { supabase } from "@/lib/supabase";

export default function EngagePage() {
  const [userId, setUserId] = useState<string | null>(null);
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
      {userId ? <Replies userId={userId} /> : <div className="h-64 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading" />}
    </div>
  );
}
