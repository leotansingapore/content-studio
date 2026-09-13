import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AssistantDock } from "./AssistantDock";

// The in-app assistant: answers from Content Studio's own map on the feedback service
// and turns ideas, bugs and messages to the team into one-tap chips. Mounted inside the
// signed-in studio layout. The key names exactly one board on the service and nothing
// there lists boards, so this can only ever reach Content Studio's posts. Lifted above
// the bottom nav below the lg breakpoint.
const FEEDBACK_API = "https://leotan-feedback.vercel.app/api/v1";
const FEEDBACK_BOARD_KEY = "fb_160b1f216061333a6eab92896d5619858b9e0a1a547effb0";

export function AssistantMount() {
  const navigate = useNavigate();
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
    <AssistantDock
      apiUrl={FEEDBACK_API}
      boardKey={FEEDBACK_BOARD_KEY}
      appName="Content Studio"
      identity={user ? { id: user.id, name: meta.full_name ?? meta.name ?? user.email?.split("@")[0] ?? null, email: user.email ?? null } : undefined}
      navigate={navigate}
      offsetY={20}
      mobileOffsetY={88}
      mobileBreakpoint={1024}
    />
  );
}
