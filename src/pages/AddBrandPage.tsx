import { useCallback, useEffect, useState } from "react";
import { BrandSetup, TITLE_ID } from "@/components/onboarding/BrandSetup";
import { DoneStep } from "@/components/onboarding/DoneStep";
import { OnboardingCanvas } from "@/components/onboarding/parts";
import { keptBrandKey } from "@/lib/addBrand";
import { loadBrand } from "@/lib/carousel";
import { distinctColours } from "@/lib/onboardingFlow";
import { loadPositioning } from "@/lib/positioning";
import { activeProfileId, loadProfiles, setActiveProfile } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { applyTheme, readTheme, resolveTheme } from "@/lib/theme";
import { useLeoOnly } from "@/lib/useLeoOnly";

type Made = { id: string; name: string; logo: string | null; colours: string[]; line: string };

export default function AddBrandPage() {
  const leo = useLeoOnly();
  const [uid, setUid] = useState("");
  const [kept, setKept] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = "Add a brand - Postmosis";
    const pick = readTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(resolveTheme(pick, mq.matches));
    apply();
    if (pick === "system") mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      applyTheme(null);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? "";
      setUid(id);
      const doneId = new URLSearchParams(window.location.search).get("done");
      const brand = doneId && id ? loadProfiles(id).find((p) => p.id === doneId) : undefined;
      if (brand) {
        if (activeProfileId(id) !== brand.id) setActiveProfile(id, brand.id);
        const kit = loadBrand(id);
        setMade({
          id: brand.id,
          name: brand.name,
          logo: kit?.logo ?? null,
          colours: distinctColours([kit?.color, ...(kit?.palette ?? []).map((p) => p.hex)], 4, 1),
          line: loadPositioning(id)?.oneLiner ?? "",
        });
      } else {
        try {
          setKept(id ? sessionStorage.getItem(keptBrandKey(id)) : null);
        } catch {
          setKept(null);
        }
      }
      setReady(true);
    });
  }, []);

  const persist = useCallback(
    (value: string | null) => {
      if (!uid) return;
      try {
        if (value === null) sessionStorage.removeItem(keptBrandKey(uid));
        else sessionStorage.setItem(keptBrandKey(uid), value);
      } catch {
        return;
      }
    },
    [uid],
  );

  if (!ready) return <OnboardingCanvas progress={null}>{null}</OnboardingCanvas>;

  if (made) {
    return (
      <OnboardingCanvas progress={100} onBack={() => window.location.assign("/home")} backLabel="Go to Home">
        <DoneStep titleId={TITLE_ID} id={made.id} name={made.name} logo={made.logo} colours={made.colours} line={made.line} />
      </OnboardingCanvas>
    );
  }

  return <BrandSetup mode="add" uid={uid} leo={leo} kept={kept} persist={persist} />;
}
