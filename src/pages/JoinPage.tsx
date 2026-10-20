import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { sendSignInLink, verifySignInCode } from "@/lib/magicLink";
import { ROLE_HELP, ROLE_NAMES, claimInvite, errorText, fetchBoard, forgetMe, type Role } from "@/lib/reelsBoard";

// /join#<token>: someone Leo invited to his posts board signs in by an email link (or its code, or a password)
// and the invite becomes theirs (docs/team-roles.md). The token stays on this device (never in the email):
// the sign-in link only finishes in this browser (PKCE), and the code works in this tab from any phone.
const TOKEN_KEY = "cs-join-token";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function takeToken(): string {
  const fromHash = window.location.hash.slice(1);
  try {
    if (TOKEN.test(fromHash)) localStorage.setItem(TOKEN_KEY, fromHash);
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return TOKEN.test(fromHash) ? fromHash : "";
  }
}
// back from our own email link: PKCE puts ?code= on the address, and only this browser can finish it
const fromEmail = () => new URLSearchParams(window.location.search).has("code");
const linkFailed = () => /error/.test(window.location.search + window.location.hash);

export default function JoinPage() {
  const token = useRef(takeToken()).current;
  const viaEmail = useRef(fromEmail()).current;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [asEmail, setAsEmail] = useState("");
  const [mode, setMode] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // a fixed message: the wording in the address could say anything
  const [error, setError] = useState(() => (linkFailed() ? "That sign-in link has expired or was already used. Send yourself a new one." : ""));
  const [done, setDone] = useState<{ role: Role; brands: string[] } | null>(null);

  const claim = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await claimInvite(token);
      try {
        localStorage.removeItem(TOKEN_KEY);
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
    // getSession waits for supabase-js to read a sign-in from the email link, so the address is tidied after it
    supabase.auth.getSession().then(({ data }) => {
      history.replaceState(null, "", "/join");
      setSignedIn(!!data.session);
      setAsEmail(data.session?.user.email ?? "");
      // back from their own email link: they just proved who they are, so join straight away
      if (data.session && token && viaEmail) void claim();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedInNow = async () => {
    setSignedIn(true);
    setAsEmail("");
    await claim();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    if (mode === "email") {
      const to = String(form.get("email") ?? "").trim();
      const problem = await sendSignInLink(to, `${window.location.origin}/join`, true);
      setBusy(false);
      if (problem) return setError(problem);
      setEmail(to);
      setMode("code");
      return;
    }
    if (mode === "code") {
      const problem = await verifySignInCode(email, String(form.get("code") ?? ""));
      if (problem) {
        setBusy(false);
        return setError(problem);
      }
      return signedInNow();
    }
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") });
    if (authError || !data.session) {
      setBusy(false);
      return setError(authError?.message ?? "Couldn't sign in.");
    }
    return signedInNow();
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
                <Link to="/reels">Open the posts board</Link>
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
                    <Button size="sm" variant="outline" onClick={() => supabase.auth.signOut().then(() => { setError(""); setSignedIn(false); })}>Use another account</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : signedIn === false ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Join Leo's posts board</CardTitle>
              <CardDescription>
                {mode === "code" ? <>We sent a sign-in link to <span className="font-semibold text-foreground">{email}</span>. Tap it, or type the code from the email here.</>
                  : mode === "password" ? "Sign in with your Content Studio or Academy password."
                  : "Enter your email and we'll send you a sign-in link. No password needed."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4" key={mode}>
                {mode !== "code" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="join-email">Email</Label>
                    <Input id="join-email" name="email" type="email" required autoComplete="email" defaultValue={email} placeholder="you@example.com" />
                  </div>
                )}
                {mode === "code" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="join-code">Code from the email</Label>
                    <Input id="join-code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9 ]{6,12}" placeholder="123456" />
                  </div>
                )}
                {mode === "password" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="join-password">Password</Label>
                    <Input id="join-password" name="password" type="password" required autoComplete="current-password" />
                  </div>
                )}
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : mode === "email" && <Mail className="mr-1.5 h-4 w-4" />}
                  {mode === "email" ? "Email me a sign-in link" : mode === "code" ? "Sign in and join" : "Sign in and join"}
                </Button>
              </form>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-primary">
                {mode === "code" && <button type="button" onClick={() => { setMode("email"); setError(""); }}>Use a different email</button>}
                {mode !== "password" && <button type="button" onClick={() => { setMode("password"); setError(""); }}>Use a password instead</button>}
                {mode === "password" && <button type="button" onClick={() => { setMode("email"); setError(""); }}>Email me a link instead</button>}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="h-48 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading" />
        )}
      </div>
    </div>
  );
}
