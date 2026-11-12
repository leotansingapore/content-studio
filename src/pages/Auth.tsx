import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CircleNotchIcon, EnvelopeIcon, SparkleIcon } from "@phosphor-icons/react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { LINK_FAILED, checkoutArrival, resendWait, sendSignInLink, verifySignInCode } from "@/lib/magicLink";

export default function Auth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  // Deep link the user tried to reach before being bounced here.
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from: string }).from !== "/auth"
      ? (location.state as { from: string }).from
      : "/";
  const failedLink = (location.state as { linkFailed?: boolean } | null)?.linkFailed === true;
  // /auth?email= comes from /start/done (docs/postmosis-billing.md): the address the account is under
  const [email, setEmail] = useState(() => new URLSearchParams(location.search).get("email") ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // An emailed sign-in link first (Leo, 2026-10-16), its code as the fallback, a password for those who have one
  // remembered per device, so someone who signs in with a password isn't sent to the email form each time
  const [mode, setModeState] = useState<"email" | "code" | "password">(() => {
    try {
      return localStorage.getItem("cs-auth-mode") === "password" ? "password" : "email";
    } catch {
      return "email";
    }
  });
  const setMode = (m: "email" | "code" | "password") => {
    setModeState(m);
    try {
      if (m !== "code") localStorage.setItem("cs-auth-mode", m);
    } catch {
      // private mode: it just isn't remembered
    }
  };
  const [sentTo, setSentTo] = useState("");
  // arrived from a finished checkout: the link lands on /welcome
  const [paid, setPaid] = useState(false);
  // one email a minute from this page: when the last went, and a clock for the wait shown on "Send it again"
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const wait = resendWait(sentAt, now);
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(t);
  }, [wait, now]);
  const sendLink = async (to: string, redirectTo: string): Promise<boolean> => {
    setLoading(true);
    const problem = await sendSignInLink(to, redirectTo, false);
    setLoading(false);
    if (problem) {
      toast({ title: "Couldn't send the link", description: problem, variant: "destructive" });
      return false;
    }
    setSentTo(to);
    setMode("code");
    setSentAt(Date.now());
    setNow(Date.now());
    return true;
  };
  const linkTarget = () => window.location.origin + (paid ? "/welcome" : from.split("#")[0]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    if (mode === "email") {
      await sendLink(String(form.get("email") ?? email).trim(), linkTarget());
      return;
    }
    setLoading(true);
    const problem = await verifySignInCode(sentTo || String(form.get("email") ?? email).trim(), String(form.get("code") ?? ""));
    setLoading(false);
    if (problem) return toast({ title: "Couldn't sign in", description: problem, variant: "destructive" });
    navigate(from, { replace: true });
  };

  useEffect(() => {
    // /auth?email=..&checkout=done is where /start/done sends a new customer (docs/postmosis-billing.md): this
    // browser asks for their sign-in link, exactly as the form does, so paying never signs anyone in by itself.
    // Read from window and removed at once, so a reload or a second run of this effect sends nothing more.
    const arrival = checkoutArrival(window.location.search);
    if (arrival) window.history.replaceState(window.history.state, "", arrival.cleaned);
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) return navigate(from, { replace: true });
      if (!arrival) return;
      setPaid(true);
      await sendLink(arrival.email, window.location.origin + "/welcome");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    // Read what is in the fields: autofill and some password managers fill them
    // without the input events that update state, which sent an empty email.
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const typedEmail = String(form.get("email") ?? email).trim();
    const typedPassword = String(form.get("password") ?? password);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: typedEmail,
        password: typedPassword,
      });
      if (error) throw error;
      toast({ title: "Signed in", description: "Loading your studio." });
      // Return to the page they were heading to; new users get routed to the
      // welcome walkthrough from the dashboard.
      navigate(from, { replace: true });
    } catch (err) {
      toast({
        title: "Couldn't sign in",
        description:
          err instanceof Error ? err.message : "Check email + password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
              <SparkleIcon className="h-5 w-5" />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-base font-bold tracking-tight text-foreground">
                Postmosis
              </span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                content studio
              </span>
            </span>
          </div>
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight">
            Sign in to your studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Use the email your account is under.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Sign in</CardTitle>
            {mode !== "password" && (
              <CardDescription>
                {mode === "code" && !sentTo ? "Type your email and the code from the sign-in email."
                  : mode === "code" ? <>{paid && "Your payment went through. "}If an account uses <span className="font-semibold text-foreground">{sentTo}</span>, a sign-in link is on its way. Tap it in this browser, or type the code from the email.</>
                  : "We'll email you a sign-in link. No password needed."}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {failedLink && <p className="mb-4 text-sm text-destructive" role="alert">{LINK_FAILED}</p>}
            {mode === "password" ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
                  size="lg"
                >
                  {loading ? (
                    <CircleNotchIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <SparkleIcon className="h-4 w-4" />
                  )}
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleEmail} className="space-y-4" key={mode}>
                {(mode === "email" || !sentTo) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required autoComplete="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                )}
                {mode === "code" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Code from the email</Label>
                    <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9 ]{6,12}" placeholder="123456" />
                  </div>
                )}
                <Button type="submit" disabled={loading} size="lg"
                  className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95">
                  {loading ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <EnvelopeIcon className="h-4 w-4" />}
                  {mode === "email" ? "Email me a sign-in link" : "Sign in"}
                </Button>
              </form>
            )}
            <div className={`mt-4 flex flex-wrap gap-x-4 text-sm font-semibold text-primary ${mode === "code" && sentTo ? "[&>button]:min-h-11" : "gap-y-2"}`}>
              {mode === "code" && sentTo && <button type="button" disabled={wait > 0 || loading} onClick={() => void sendLink(sentTo, linkTarget())} className="tabular-nums disabled:font-normal disabled:text-muted-foreground">{wait > 0 ? `Send it again in ${wait}s` : "Send it again"}</button>}
              {mode === "code" && <button type="button" onClick={() => setMode("email")}>{sentTo ? "Use a different email" : "Email me a link instead"}</button>}
              {mode === "email" && <button type="button" onClick={() => setMode("code")}>I have a code</button>}
              {mode !== "password" && <button type="button" onClick={() => setMode("password")}>Use a password instead</button>}
              {mode === "password" && <button type="button" onClick={() => setMode("email")}>Email me a link instead</button>}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Joined through the FINternship Academy? If you have never signed
              in there, sign in to the Academy first so your account is set up,
              then come back here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
