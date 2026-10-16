import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { ROLE_HELP, ROLE_NAMES, claimInvite, errorText, fetchBoard, forgetMe, type Role } from "@/lib/reelsBoard";

// /join#<token>: someone Leo invited to his posts board signs in, or makes an account, and the invite becomes
// theirs (docs/team-roles.md). The token sits after # so it never reaches a server log; it moves to this
// tab's session storage and leaves the address bar at once.
const TOKEN_KEY = "cs-join-token";

function takeToken(): string {
  const fromHash = window.location.hash.slice(1);
  if (fromHash) {
    try {
      sessionStorage.setItem(TOKEN_KEY, fromHash);
    } catch {
      // private mode: the token lives in memory for this visit
    }
    history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function JoinPage() {
  const token = useRef(takeToken()).current;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // already signed in: ask before the invite becomes this account's (a forwarded link, a shared computer)
  const [asEmail, setAsEmail] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ role: Role; brands: string[] } | null>(null);

  const claim = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await claimInvite(token);
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // nothing stored
      }
      forgetMe(); // the nav asks again and shows Reels
      const names = await fetchBoard().then((b) => b.brands.map((x) => x.name)).catch(() => r.brands);
      setDone({ role: r.role, brands: names });
    } catch (e) {
      setError(errorText(e, "That didn't go through. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.title = "Join the posts board - Content Studio";
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setAsEmail(data.session?.user.email ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError("");
    const { data, error: authError } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (authError || !data.session) {
      setBusy(false);
      setError(authError?.message ?? "Check your email for a confirmation link, then open your invite link again.");
      return;
    }
    setSignedIn(true);
    setAsEmail("");
    await claim();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-base font-bold tracking-tight">Content Studio</span>
        </div>

        {done ? (
          <Card>
            <CardContent className="space-y-4 pt-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <h1 className="font-serif text-2xl font-semibold">You're on Leo's posts board</h1>
              <p className="text-sm text-muted-foreground">
                {ROLE_NAMES[done.role]}: {ROLE_HELP[done.role].toLowerCase()}, for {done.brands.join(", ")}.
              </p>
              <Button asChild size="lg" className="w-full">
                <Link to="/reels">Open the posts</Link>
              </Button>
            </CardContent>
          </Card>
        ) : !token ? (
          <Card>
            <CardContent className="space-y-3 pt-6 text-center">
              <h1 className="font-serif text-xl font-semibold">This invite link isn't complete</h1>
              <p className="text-sm text-muted-foreground">Open the whole link Leo sent you, or ask him for a new one.</p>
            </CardContent>
          </Card>
        ) : signedIn ? (
          <Card>
            <CardContent className="space-y-3 pt-6 text-center">
              {asEmail && !busy && !error && (
                <>
                  <h1 className="font-serif text-xl font-semibold">Join Leo's posts board</h1>
                  <p className="text-sm text-muted-foreground">You're signed in as <span className="font-semibold text-foreground">{asEmail}</span>.</p>
                  <div className="flex flex-col gap-2">
                    <Button size="lg" onClick={claim}>Join as {asEmail}</Button>
                    <Button variant="outline" onClick={() => supabase.auth.signOut().then(() => { setAsEmail(""); setSignedIn(false); })}>Use another account</Button>
                  </div>
                </>
              )}
              {busy ? <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Joining" /> : error && (
                <>
                  <p className="text-sm" role="alert">{error}</p>
                  <div className="flex justify-center gap-2">
                    <Button size="sm" onClick={claim}>Try again</Button>
                    <Button size="sm" variant="outline" onClick={() => supabase.auth.signOut().then(() => setSignedIn(false))}>Use another account</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : signedIn === false ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Join Leo's posts board</CardTitle>
              <CardDescription>{mode === "signin" ? "Sign in with your Content Studio or Academy account." : "Make an account with your own email."}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="join-email">Email</Label>
                  <Input id="join-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="join-password">Password</Label>
                  <Input id="join-password" name="password" type="password" required minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"} />
                  {mode === "signup" && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "Sign in and join" : "Create account and join"}
                </Button>
              </form>
              <button type="button" className="mt-4 text-sm font-semibold text-primary" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
                {mode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
              </button>
            </CardContent>
          </Card>
        ) : (
          <div className="h-48 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading" />
        )}
      </div>
    </div>
  );
}
