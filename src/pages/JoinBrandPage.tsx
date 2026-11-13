// /brands/join#<token>: where an invite email lands (docs/shared-brands.md). Public, because the invitee may have no
// account yet. The token leaves the address at once and waits on this device; signed out, the server makes the
// invited address an account if it has none and this browser asks for its sign-in link; signed in, the invite is
// taken and the brand's calendar opens with a full page load, so its sync's first pull runs before anything draws.
import { useEffect, useState, type FormEvent } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { OnboardingCanvas, PrimaryPill, QuietPill, StepTitle, fieldClass } from "@/components/onboarding/parts";
import { stopCloudSync } from "@/lib/cloudSync";
import { sendSignInLink, verifySignInCode } from "@/lib/magicLink";
import { markOnboarded } from "@/lib/onboarding";
import { setActiveProfile } from "@/lib/profiles";
import { acceptInvite, fetchMyBrands, INVITE_KEY, inviteToken, localId, startInvite, writeSharedBrands } from "@/lib/sharedBrands";
import { supabase } from "@/lib/supabase";
import { applyTheme, readTheme, resolveTheme } from "@/lib/theme";

type View =
  | { kind: "working"; text: string }
  | { kind: "sign-in"; email: string; brand: string; sent: boolean }
  | { kind: "refused"; text: string; signOut?: boolean };

const kept = () => {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
};
const keep = (token: string | null) => {
  try {
    if (token) localStorage.setItem(INVITE_KEY, token);
    else localStorage.removeItem(INVITE_KEY);
  } catch {
    // private mode: the token lives as long as this page
  }
};

export default function JoinBrandPage() {
  const [view, setView] = useState<View>({ kind: "working", text: "Opening your invite..." });
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    document.title = "Join a brand - Postmosis";
    applyTheme(resolveTheme(readTheme(), window.matchMedia("(prefers-color-scheme: dark)").matches));
    return () => applyTheme(null);
  }, []);

  const join = async (t: string) => {
    setView({ kind: "working", text: "Joining..." });
    try {
      const brand = await acceptInvite(t);
      keep(null);
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (uid) {
        const mine = await fetchMyBrands();
        if (mine) writeSharedBrands(uid, mine);
        markOnboarded(uid);
        setActiveProfile(uid, localId(brand));
      }
      window.location.assign(`/calendar?profile=${encodeURIComponent(localId(brand))}`);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Couldn't join just now. Try again in a minute.";
      setView({ kind: "refused", text, signOut: /another email/.test(text) });
    }
  };

  useEffect(() => {
    const t = inviteToken(window.location.hash, kept());
    // the token leaves the address at once; a sign-in link's ?code= stays until the client has read it
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (!t) return setView({ kind: "refused", text: "This invite link is broken. Open it again from the email." });
    keep(t);
    setToken(t);
    void supabase.auth.getSession().then(async ({ data }) => {
      window.history.replaceState(window.history.state, "", "/brands/join");
      if (data.session) return join(t);
      try {
        const { email, brand } = await startInvite(t);
        setView({ kind: "sign-in", email, brand, sent: false });
      } catch (e) {
        setView({ kind: "refused", text: e instanceof Error ? e.message : "Couldn't open this invite. Try again in a minute." });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (view.kind !== "sign-in") return;
    setBusy(true);
    setProblem("");
    const why = await sendSignInLink(view.email, `${window.location.origin}/brands/join`, false);
    setBusy(false);
    if (why) return setProblem(why);
    setView({ ...view, sent: true });
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (view.kind !== "sign-in" || !token) return;
    setBusy(true);
    setProblem("");
    const why = await verifySignInCode(view.email, code);
    setBusy(false);
    if (why) return setProblem(why);
    await join(token);
  };

  const signOut = async () => {
    await stopCloudSync().catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" });
    window.location.reload();
  };

  return (
    <OnboardingCanvas progress={null}>
      <div className="flex w-full max-w-[480px] flex-1 flex-col justify-center gap-8 pb-[2vh]">
        {view.kind === "working" && (
          <p role="status" className="flex items-center justify-center gap-2 text-base font-medium text-muted-foreground">
            <CircleNotchIcon size={18} className="animate-spin" /> {view.text}
          </p>
        )}
        {view.kind === "refused" && (
          <>
            <StepTitle title="This invite didn't work" lead={view.text} />
            {view.signOut && (
              <div className="flex justify-center">
                <PrimaryPill onClick={() => void signOut()}>Sign out</PrimaryPill>
              </div>
            )}
          </>
        )}
        {view.kind === "sign-in" && !view.sent && (
          <>
            <StepTitle title={`Join ${view.brand}`} lead={`You'll sign in as ${view.email}. We'll email you a link and a code.`} />
            <div className="flex flex-col items-center gap-3">
              <PrimaryPill onClick={() => void send()} disabled={busy}>
                {busy ? "Sending..." : "Email me a sign-in link"}
              </PrimaryPill>
              {problem && <p role="alert" className="text-sm font-medium text-destructive">{problem}</p>}
            </div>
          </>
        )}
        {view.kind === "sign-in" && view.sent && (
          <>
            <StepTitle title="Check your inbox" lead={`Open the link we sent to ${view.email}, or type the code from it here.`} />
            <form onSubmit={verify} className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="join-code" className="sr-only">
                Code from the email
              </label>
              <input
                id="join-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code from the email"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={fieldClass}
              />
              <PrimaryPill type="submit" disabled={busy || !code.trim()}>
                {busy ? "Checking..." : "Join"}
              </PrimaryPill>
            </form>
            <div className="flex flex-col items-center gap-2">
              {problem && <p role="alert" className="text-sm font-medium text-destructive">{problem}</p>}
              <QuietPill onClick={() => void send()} disabled={busy}>
                Send it again
              </QuietPill>
            </div>
          </>
        )}
      </div>
    </OnboardingCanvas>
  );
}
