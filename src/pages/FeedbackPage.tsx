// /feedback: Content Studio's own public feedback board. Ask for what you need, see
// what others asked for, vote. The UI is the shared component copied verbatim from
// github.com/leotansingapore/feedback-board/client/FeedbackBoard.tsx; the key in
// components/feedback/config.ts names exactly one board on the service.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { tabClass } from "@/components/SectionTabs";
import { supabase } from "@/lib/supabase";
import { FeedbackBoard } from "@/components/feedback/FeedbackBoard";
import { FEEDBACK_API, FEEDBACK_BOARD_KEY } from "@/components/feedback/config";

// The board's own tab bar goes with its header (chrome={false}), so the page draws its three tabs in the app's style.
const TABS = [
  { tab: "roadmap", label: "Roadmap" },
  { tab: "feedback", label: "Feedback" },
  { tab: "changelog", label: "Changelog" },
] as const;

export default function FeedbackPage() {
  const [user, setUser] = useState<User | null>(null);
  const [params] = useSearchParams();
  // the board reads ?tab= when it mounts and keeps the address itself after that, so a tab press remounts it.
  // shortcut: a view the board opens from inside (a post, Roadmap > Filters) does not move the highlight until the next
  // tab press, since the board writes the address past the router; upgrade if the shared board gains an onView callback
  const [opened, setOpened] = useState(0);
  const open = params.get("post") ? null : (TABS.find((t) => t.tab === params.get("tab"))?.tab ?? "roadmap");
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUser(data.user ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Feedback
        </h1>
      </header>
      <nav aria-label="Feedback" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {TABS.map((t) => (
          <Link key={t.tab} to={`?tab=${t.tab}`} onClick={() => setOpened((n) => n + 1)} aria-current={open === t.tab ? "page" : undefined} className={tabClass(open === t.tab)}>
            {t.label}
          </Link>
        ))}
      </nav>
      <FeedbackBoard
        key={opened}
        apiUrl={FEEDBACK_API}
        boardKey={FEEDBACK_BOARD_KEY}
        appName="Postmosis"
        identity={
          user
            ? { id: user.id, name: meta.full_name ?? meta.name ?? user.email?.split("@")[0] ?? null, email: user.email ?? null }
            : undefined
        }
        chrome={false}
      />
    </div>
  );
}
