import { NEW_POST } from "@/lib/newPost";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrandSetup } from "@/components/onboarding/BrandSetup";
import { OnboardingCanvas } from "@/components/onboarding/parts";
import { cloudSyncPulled } from "@/lib/cloudSync";
import { draftsRaw } from "@/lib/draftHistory";
import { isVoiceProfileUsable, loadVoiceProfile } from "@/lib/voiceProfile";
import { isFoldKey } from "@/lib/navFold";
import { flowKey, keptSaved, keptStep, shouldSetUp } from "@/lib/onboardingFlow";
import { loadPositioning } from "@/lib/positioning";
import { activeProfileId, DEFAULT_PROFILE_ID, loadProfiles } from "@/lib/profiles";
import { clearConnectReturn, readRedirect, storedUserId } from "@/lib/socialConnect";
import { checkoutSite } from "@/lib/subscription";
import { withParam } from "@/lib/urlState";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { Button } from "@/components/ui/button";
import ProfessionField from "@/components/ProfessionField";
import { DEFAULT_BRAND, loadBrand, saveBrand } from "@/lib/carousel";
import { supabase } from "@/lib/supabase";
import { markOnboarded } from "@/lib/onboarding";
import { useTourUser } from "@/lib/useTourUser";
import { startTour } from "@/lib/tour";
import { PencilSimpleIcon, SparkleIcon } from "@phosphor-icons/react";

// The other ways in, as quiet links under the one button (UX law 1: one way forward).
const OTHER = [
  { label: "Set my voice first", to: "/voice" },
  { label: "Plan a week", to: "/plan" },
];
const QUIET = "inline-flex min-h-9 items-center text-sm font-medium text-muted-foreground hover:text-foreground hover:underline [@media(pointer:coarse)]:min-h-11";

/** A tap before the sign-in lookup answers still marks the account, from the session kept on this device, so /home
 * never sends a first-run account back here. */
export async function onboardThenGo(
  known: string | null,
  to: string,
  navigate: (to: string) => void,
  session: () => Promise<string | null> = async () => (await supabase.auth.getSession()).data.session?.user?.id ?? null,
): Promise<void> {
  markOnboarded(known ?? (await session().catch(() => null)));
  navigate(to);
}

function setUpFor(): { uid: string; kept: string | null } | null {
  const uid = storedUserId();
  if (!uid) return null;
  try {
    const kept = localStorage.getItem(flowKey(uid));
    const drafts: unknown = JSON.parse(draftsRaw(uid) ?? "[]");
    const facts = {
      savedKept: keptSaved(kept),
      synced: cloudSyncPulled(),
      onMe: activeProfileId(uid) === DEFAULT_PROFILE_ID,
      onboarded: localStorage.getItem(`content-studio-onboarded-${uid}`) === "1",
      hasProfession: !!loadBrand(uid)?.profession?.trim(),
      used:
        (Array.isArray(drafts) && drafts.length > 0) ||
        isVoiceProfileUsable(loadVoiceProfile(uid)) ||
        !!loadPositioning(uid)?.oneLiner?.trim() ||
        loadBrand(uid) !== null ||
        loadProfiles(uid).length > 1,
      kept: !!kept,
    };
    return shouldSetUp(facts) ? { uid, kept } : null;
  } catch {
    return null;
  }
}

const jumpKey = (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";

function FirstRun({ uid, kept }: { uid: string; kept: string | null }) {
  const leo = useLeoOnly();
  const [prefill, setPrefill] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [settled, setSettled] = useState(() => !!params.get("step") || (keptStep(kept) ?? "site") === "site");

  useEffect(() => {
    if (settled) return;
    setParams((p) => withParam(p, "step", keptStep(kept), "site"), { replace: true });
    setSettled(true);
  }, []);

  useEffect(() => {
    const hold = (e: KeyboardEvent) => {
      if (jumpKey(e) || isFoldKey(e)) e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", hold, true);
    return () => window.removeEventListener("keydown", hold, true);
  }, []);

  useEffect(() => {
    document.title = "Set up your brand - Postmosis";
    let alive = true;
    checkoutSite()
      .then((site) => alive && setPrefill(site))
      .catch(() => undefined);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    return () => {
      alive = false;
      document.body.style.overflow = before;
      root?.removeAttribute("inert");
    };
  }, []);

  const persist = useCallback(
    (value: string | null) => {
      try {
        if (value !== null) localStorage.setItem(flowKey(uid), value);
        else if (localStorage.getItem(flowKey(uid)) !== null) localStorage.removeItem(flowKey(uid));
      } catch {
        return;
      }
    },
    [uid],
  );

  const body = (
    <div id="onboard-scroll" className="fixed inset-0 z-[75] overflow-y-auto overscroll-contain bg-background">
      {settled ? <BrandSetup mode="first" uid={uid} leo={leo} kept={kept} persist={persist} prefill={prefill} /> : <OnboardingCanvas progress={null}>{null}</OnboardingCanvas>}
    </div>
  );
  return typeof document === "undefined" ? body : createPortal(body, document.body);
}

export default function WelcomePage() {
  const [setUp] = useState(setUpFor);
  const [fromConnect] = useState(() => typeof window !== "undefined" && !!readRedirect(new URLSearchParams(window.location.search)));
  useEffect(() => {
    if (fromConnect) clearConnectReturn();
  }, [fromConnect]);
  return setUp ? <FirstRun uid={setUp.uid} kept={setUp.kept} /> : <GettingStarted />;
}

function GettingStarted() {
  const navigate = useNavigate();
  const tour = useTourUser();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  // "What do you do?", asked first while the open brand has no answer: unanswered, every writer writes as a financial
  // adviser. Null once the sign-in is read and the brand has one (and on the first frame, which stays as pinned).
  const [profession, setProfession] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Welcome - Postmosis";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid && !loadBrand(uid)?.profession?.trim()) setProfession("");
      const email = data.user?.email ?? "";
      const prefix = email.split("@")[0].replace(/[._-]+/g, " ").trim();
      // Only greet by name when the email prefix actually reads like one —
      // "tan.junsing88" or 20+ chars greets awkwardly, so skip it.
      setName(/^[a-zA-Z ]{2,18}$/.test(prefix) ? prefix : "");
    });
    return () => {
      active = false;
    };
  }, []);

  const go = (to: string) => void onboardThenGo(userId, to, navigate);

  const answer = (v: string) => {
    setProfession(v);
    if (userId) saveBrand(userId, { ...(loadBrand(userId) ?? DEFAULT_BRAND), profession: v });
  };

  return (
    <div className="max-w-2xl space-y-6 py-4">
      <header className="space-y-3 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elegant">
          <SparkleIcon className="h-7 w-7" />
        </span>
        <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground">
          Welcome{name ? <span className="capitalize">, {name}</span> : ""}
        </h1>
      </header>

      {profession !== null && (
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
          <ProfessionField value={profession} onChange={answer} emptyIsAdviser={false} />
        </section>
      )}

      <div className="flex flex-col items-center gap-2">
        <Button size="lg" onClick={() => go(NEW_POST)} className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95 sm:w-auto">
          <PencilSimpleIcon className="h-4 w-4" /> Write my first post
        </Button>
        <nav aria-label="Other ways to start" className="flex flex-wrap justify-center gap-x-5">
          {OTHER.map((o) => (
            <button key={o.to} type="button" onClick={() => go(o.to)} className={QUIET}>
              {o.label}
            </button>
          ))}
          {tour && (
            // the tour (the agent's on Leo's sign-ins): go() marks the account onboarded first, so /home does not send it back here
            <button
              type="button"
              onClick={() => {
                startTour(tour.id, null, tour.steps);
                go("/home");
              }}
              className={QUIET}
            >
              Show me around
            </button>
          )}
          <button type="button" onClick={() => go("/home")} className={QUIET}>
            Skip to Home
          </button>
        </nav>
      </div>
    </div>
  );
}
