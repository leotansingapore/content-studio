// /feedback: Content Studio's own public feedback board. Ask for what you need, see
// what others asked for, vote. The UI is the shared component copied verbatim from
// github.com/leotansingapore/feedback-board/client/FeedbackBoard.tsx; the key in
// components/feedback/config.ts names exactly one board on the service.

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { FeedbackBoard } from "@/components/feedback/FeedbackBoard";
import { FEEDBACK_API, FEEDBACK_BOARD_KEY } from "@/components/feedback/config";

export default function FeedbackPage() {
  const [user, setUser] = useState<User | null>(null);
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
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Feedback
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Ask for what would make the studio more useful, vote on what others
          asked for, and follow what's being built.
        </p>
      </header>
      <FeedbackBoard
        apiUrl={FEEDBACK_API}
        boardKey={FEEDBACK_BOARD_KEY}
        appName="Content Studio"
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
