import { NEW_POST } from "@/lib/newPost";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function WelcomePage() {
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
