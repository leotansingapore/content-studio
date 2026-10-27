import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import ErrorBoundary from "@/components/ErrorBoundary";
import { supabase } from "@/lib/supabase";
import { useLeoUser } from "@/lib/useLeoOnly";
import { AssistantDock } from "./AssistantDock";
import { FEEDBACK_API, FEEDBACK_BOARD_KEY } from "./config";

// The in-app assistant: answers from Content Studio's own map on the feedback service
// and turns ideas, bugs and messages to the team into one-tap chips. Mounted inside the
// signed-in studio layout. The key names exactly one board on the service and nothing
// there lists boards, so this can only ever reach Content Studio's posts. Lifted above
// the bottom nav below the lg breakpoint. Before the chat answers, `act` asks whether the
// message wants something done in the app (move a post, rewrite one in Write, last week's
// numbers, paste into Engage): src/lib/assistantActs.ts, loaded on the first message.
// Leo's sign-ins get the agent dock instead (agent-chat, north star phase 6), loaded only for him; everyone else,
// and a sign-in still being read, gets AssistantDock with today's props (pinned in AssistantMount.test.ts).

const AgentDock = lazy(() => import("@/components/agent/AgentDock"));

export function AssistantMount() {
  const navigate = useNavigate();
  const leo = useLeoUser();
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
  const act = useCallback(
    async (text: string) => {
      // read at send time: getUser above can still be waiting on the network
      const uid = (await supabase.auth.getSession()).data.session?.user.id;
      if (!uid) return null;
      const { proposeAct } = await import("@/lib/assistantActs");
      return proposeAct(uid, text, (path, replace) => navigate(path, { replace }));
    },
    [navigate],
  );
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const identity = user ? { id: user.id, name: meta.full_name ?? meta.name ?? user.email?.split("@")[0] ?? null, email: user.email ?? null } : undefined;
  if (leo)
    return (
      // a crash or a chunk missing after a deploy stays inside the dock
      <ErrorBoundary>
        <Suspense fallback={null}>
          <AgentDock userId={leo.id} identity={identity ?? { id: leo.id, email: leo.email }} />
        </Suspense>
      </ErrorBoundary>
    );
  return (
    <AssistantDock
      apiUrl={FEEDBACK_API}
      boardKey={FEEDBACK_BOARD_KEY}
      appName="Postmosis"
      identity={identity}
      navigate={navigate}
      offsetY={20}
      mobileOffsetY={88}
      mobileBreakpoint={1024}
      act={act}
      intro="Ask how anything works or reach the team. It can also move a post, rewrite one in Write, show last week's numbers or paste text into Reply drafts. Nothing changes until you tap to confirm."
    />
  );
}
