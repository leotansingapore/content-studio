import { createClient } from "@supabase/supabase-js";
import { shareCall } from "@/lib/shareCall";

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://hgdbflprrficdoyxmdxe.supabase.co";
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnZGJmbHBycmZpY2RveXhtZHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NjY0NDAsImV4cCI6MjA2NzM0MjQ0MH0.2qwUbh0nkFyOLzzZgXk7bedINzHSf2ULMBUECOqWmIw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    // an emailed sign-in link only finishes in the browser that asked for it; elsewhere the code in the email does
    flowType: "pkce",
  },
});

// Every page asks who is signed in as it opens: callers made while a request runs share it, and a lost auth lock is
// asked again once (shareCall.ts), so a slow connection no longer opens a page with no user. A call with a token
// (getUser(jwt)) is its own question and goes straight through.
const auth = supabase.auth;
const ownGetUser = auth.getUser.bind(auth);
const sharedUser = shareCall(() => ownGetUser());
auth.getUser = ((jwt?: string) => (jwt === undefined ? sharedUser() : ownGetUser(jwt))) as typeof auth.getUser;
auth.getSession = shareCall(auth.getSession.bind(auth)) as typeof auth.getSession;

