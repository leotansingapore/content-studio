import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BrandSetup } from "@/components/onboarding/BrandSetup";
import { OnboardingCanvas } from "@/components/onboarding/parts";
import { keepForm, keptBrandKey, keptFor, loadDrafts } from "@/lib/brandDrafts";
import { loadProfiles } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { applyTheme, readTheme, resolveTheme } from "@/lib/theme";
import { useLeoOnly } from "@/lib/useLeoOnly";

export default function AddBrandPage() {
  const leo = useLeoOnly();
  const [params, setParams] = useSearchParams();
  const [uid, setUid] = useState("");
  const [kept, setKept] = useState<string | null>(null);
  // the unfinished brand this form is (brandDrafts.ts), once something is typed or picked
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
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
      const query = new URLSearchParams(window.location.search);
      const doneId = query.get("done");
      const brand = doneId && id ? loadProfiles(id).find((p) => p.id === doneId) : undefined;
      if (brand) {
        // the old done page's links (?done=) land where a new brand now does, its calendar
        window.location.replace(`/calendar?profile=${encodeURIComponent(brand.id)}`);
        return;
      }
      let tab: string | null = null;
      try {
        tab = id ? sessionStorage.getItem(keptBrandKey(id)) : null;
      } catch {
        tab = null;
      }
      const start = keptFor(tab, id ? loadDrafts(id) : [], query.get("draft"));
      draftRef.current = start.draft;
      setDraft(start.draft);
      setKept(start.kept);
      setReady(true);
    });
  }, []);

  // the open draft's id stays in the address, so a reload or a copied link resumes it; a stale one comes off
  useEffect(() => {
    if (!ready || params.get("draft") === draft) return;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (draft) p.set("draft", draft);
        else p.delete("draft");
        return p;
      },
      { replace: true },
    );
  }, [ready, draft, params, setParams]);

  const persist = useCallback(
    (value: string | null) => {
      if (!uid) return;
      let tab: Storage;
      try {
        tab = sessionStorage;
      } catch {
        return;
      }
      draftRef.current = keepForm(uid, draftRef.current, value, tab);
      // null (Create, or everything cleared) leaves the address alone: Create is already on its way to the calendar,
      // and a reload on a removed draft opens a new form
      if (draftRef.current) setDraft(draftRef.current);
    },
    [uid],
  );

  if (!ready) return <OnboardingCanvas progress={null}>{null}</OnboardingCanvas>;

  return <BrandSetup mode="add" uid={uid} leo={leo} kept={kept} persist={persist} />;
}
