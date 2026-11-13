import { useCallback, useEffect, useState } from "react";
import { BrandSetup } from "@/components/onboarding/BrandSetup";
import { OnboardingCanvas } from "@/components/onboarding/parts";
import { keptBrandKey } from "@/lib/addBrand";
import { loadProfiles } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { applyTheme, readTheme, resolveTheme } from "@/lib/theme";
import { useLeoOnly } from "@/lib/useLeoOnly";

export default function AddBrandPage() {
  const leo = useLeoOnly();
  const [uid, setUid] = useState("");
  const [kept, setKept] = useState<string | null>(null);
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
        // the old done page's links (?done=) land where a new brand now does, its calendar
        window.location.replace(`/calendar?profile=${encodeURIComponent(brand.id)}`);
        return;
      }
      try {
        setKept(id ? sessionStorage.getItem(keptBrandKey(id)) : null);
      } catch {
        setKept(null);
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

  return <BrandSetup mode="add" uid={uid} leo={leo} kept={kept} persist={persist} />;
}
