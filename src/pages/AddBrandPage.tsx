import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PriceChip from "@/components/PriceChip";
import { DoneStep } from "@/components/onboarding/DoneStep";
import { OnboardingCanvas } from "@/components/onboarding/parts";
import { ReadingStep } from "@/components/onboarding/ReadingStep";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { SiteStep } from "@/components/onboarding/SiteStep";
import { WorkStep } from "@/components/onboarding/WorkStep";
import { blankDna, createBrand, keptBrand, keptBrandKey, PROFESSION_NEEDED, readBody, type BrandDna as Dna } from "@/lib/addBrand";
import { useUsesLeft } from "@/lib/aiUsage";
import { appDna, appFacts, appProfession, appStoreLink, isAppRead, proofLines, readComplaints, readListing, readRivals, type AppRead } from "@/lib/appStore";
import { BRAND_PRESETS, loadBrand } from "@/lib/carousel";
import type { SlideFont } from "@/lib/carouselLayout";
import { callFn, EdgeError } from "@/lib/edgeFn";
import type { PostLang } from "@/lib/links";
import { logoColours, logoForKit } from "@/lib/logoImage";
import { markOnboarded } from "@/lib/onboarding";
import {
  ADDRESS_ERROR, APP_SECTIONS, distinctColours, hexOf, hostOf, keptAnswers, nextSection, progressOf, READ_STEPS, shownStep, SITE_SECTIONS, slideFontFor, STEPS, webAddress,
  type Answers, type Section, type Step,
} from "@/lib/onboardingFlow";
import { goalChips, loadPositioning } from "@/lib/positioning";
import { reasonText } from "@/lib/prices";
import { activeProfileId, loadProfiles, setActiveProfile } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { applyTheme, readTheme, resolveTheme } from "@/lib/theme";
import { asPostLang } from "@/lib/translate";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { useUrlState } from "@/lib/urlState";

const APP_STEPS = ["Opening the App Store listing", "Its website: colour and social accounts", "Apps like it", "What their users complain about"];
const READ_FAILED = "We couldn't read that site. Check the address, or fill your brand in yourself.";
const NO_APP = "We couldn't read that App Store link. Check it opens in a browser, or paste the app's website instead.";
const TITLE_ID = "onboard-title";
const SLIDE_FONTS: readonly SlideFont[] = ["classic", "modern", "serif"];

type Read = { status: "idle" | "running" | "done" | "failed"; host: string; target: string; error: string; started: number; finished: number; appStep: number };
const IDLE: Read = { status: "idle", host: "", target: "", error: "", started: 0, finished: 0, appStep: 0 };
type Made = { name: string; logo: string | null; colours: string[]; line: string };

const historyIndex = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0);

function cameFromApp(): boolean {
  try {
    return !!document.referrer && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

function targetOf(address: string): string {
  const link = appStoreLink(address);
  if (link) return `app:${link.country}:${link.id}`;
  const u = webAddress(address);
  return u ? `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase() : address.trim().toLowerCase();
}

function suggestionsFor(d: Dna, fromLogo: string[]): { found: string[]; presets: string[] } {
  const found = distinctColours([d.colour, ...(d.colours ?? []), ...fromLogo], 8);
  return { found, presets: found.length >= 2 ? [] : distinctColours(BRAND_PRESETS.map((p) => p.color), 8).filter((c) => !found.includes(c)) };
}

function startingColours(d: Dna, fromLogo: string[], leo: boolean): string[] {
  if (leo) return distinctColours([d.colour, ...(d.colours ?? []), ...fromLogo], 4);
  return distinctColours([d.colour ?? fromLogo[0]], 1);
}

export default function AddBrandPage() {
  const leo = useLeoOnly();
  const [uid, setUid] = useState("");
  const [restored, setRestored] = useState(false);
  const [step, setStep] = useUrlState<Step>("step", "site", { allowed: STEPS, push: true });
  const [, swapStep] = useUrlState<Step>("step", "site", { allowed: STEPS });
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [noSite, setNoSite] = useState(false);
  const [profession, setProfession] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [dna, setDna] = useState<Dna | null>(null);
  const [app, setApp] = useState<AppRead | null>(null);
  const [done, setDone] = useState<Set<Section>>(new Set());
  const [expanded, setExpanded] = useState<Set<Section>>(new Set());
  const [colours, setColours] = useState<string[]>([]);
  const [fromLogo, setFromLogo] = useState<string[]>([]);
  const [lang, setLang] = useState<PostLang | null>(null);
  const [slideFont, setSlideFont] = useState<SlideFont>("modern");
  const [read, setRead] = useState<Read>(IDLE);
  const [now, setNow] = useState(() => Date.now());
  const [enteredReading, setEnteredReading] = useState(0);
  const [triedEmpty, setTriedEmpty] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const readId = useRef(0);
  const createdOnce = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const fromApp = useMemo(cameFromApp, []);
  const left = useUsesLeft(read.status === "running" || !leo)("brand-dna");
  const why = reasonText({ left, leo });

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
          name: brand.name,
          logo: kit?.logo ?? null,
          colours: distinctColours([kit?.color, ...(kit?.palette ?? []).map((p) => p.hex)], 4, 1),
          line: loadPositioning(id)?.oneLiner ?? "",
        });
        setRestored(true);
        return;
      }
      let raw: string | null = null;
      try {
        raw = id ? sessionStorage.getItem(keptBrandKey(id)) : null;
      } catch {
        raw = null;
      }
      const kept = keptBrand(raw, APP_SECTIONS);
      if (kept) {
        let extra: Record<string, unknown> = {};
        try {
          extra = JSON.parse(raw ?? "{}") ?? {};
        } catch {
          extra = {};
        }
        setAddress(kept.address);
        setNoSite(kept.justName);
        setProfession(kept.profession);
        setAnswers(keptAnswers(extra.answers));
        if (kept.dna) {
          setDna(kept.dna);
          setDone(new Set(kept.done as Section[]));
          if (isAppRead(extra.app)) setApp(extra.app);
          const picked = Array.isArray(extra.colours) ? distinctColours(extra.colours as string[], 4, 1) : [];
          setColours(picked.length ? picked : startingColours(kept.dna, [], false));
          setFromLogo(Array.isArray(extra.fromLogo) ? distinctColours(extra.fromLogo as string[], 3) : []);
          setLang(asPostLang(extra.lang));
          if (SLIDE_FONTS.includes(extra.slideFont as SlideFont)) setSlideFont(extra.slideFont as SlideFont);
          const target = typeof extra.readTarget === "string" ? extra.readTarget : "";
          if (!kept.justName && target) setRead({ ...IDLE, status: "done", host: target.startsWith("app:") ? "App Store" : typeof extra.readHost === "string" ? extra.readHost : hostOf(kept.address), target });
        }
      }
      setRestored(true);
    });
  }, []);

  useEffect(() => {
    if (!uid || !restored || made) return;
    try {
      if (!address && !profession && !dna) sessionStorage.removeItem(keptBrandKey(uid));
      else
        sessionStorage.setItem(
          keptBrandKey(uid),
          JSON.stringify({ address, name: "", justName: noSite, profession, dna, done: [...done], app, answers, colours, fromLogo, lang, slideFont, readTarget: read.status === "done" ? read.target : "", readHost: read.host }),
        );
    } catch {
      return;
    }
  }, [uid, restored, made, address, noSite, profession, dna, done, app, answers, colours, fromLogo, lang, slideFont, read.status, read.target, read.host]);

  useEffect(() => {
    if (!restored || made) return;
    if (step === "review" && !dna) swapStep("site");
    if (step === "reading" && read.status === "idle") swapStep(profession.trim() ? "work" : "site");
  }, [restored, made, step, dna, read.status, profession, swapStep]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (step === "site") return;
    const t = window.setTimeout(() => document.getElementById(TITLE_ID)?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [step, made]);

  useEffect(() => {
    if (step !== "reading" || read.status !== "failed") return;
    const t = window.setTimeout(() => document.getElementById(TITLE_ID)?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [step, read.status]);

  useEffect(() => {
    if (step !== "reading") return;
    setEnteredReading(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(t);
  }, [step]);

  const appLink = appStoreLink(address);
  const steps = read.host === "App Store" ? APP_STEPS : READ_STEPS;

  const landRead = useCallback(
    async (myId: number, d: Dna, listing: AppRead | null) => {
      const logo = await logoForKit(d.logo);
      const logoHues = logo ? await logoColours(logo) : [];
      if (myId !== readId.current) return;
      const next: Dna = { ...d, name: d.name.slice(0, 40), logo, audience: answersRef.current.audience ?? d.audience };
      setNoSite(false);
      setDna(next);
      setFromLogo(logoHues);
      setColours(startingColours(next, logoHues, leo));
      setLang(leo ? asPostLang((d as { lang?: unknown }).lang) : null);
      setSlideFont(slideFontFor(d.fonts));
      setDone(new Set());
      setExpanded(new Set());
      if (listing) setApp(listing);
      setRead((r) => ({ ...r, status: "done", finished: Date.now() }));
    },
    [leo],
  );

  const readSite = async (myId: number, target: string) => {
    try {
      const d = await callFn<Dna>("brand-dna", readBody(target, leo), READ_FAILED);
      if (myId !== readId.current) return;
      await landRead(myId, leo ? { ...d, readAt: new Date().toISOString() } : d, null);
    } catch (err) {
      if (myId !== readId.current) return;
      const why = err instanceof EdgeError ? (err.status === 422 ? "The site didn't open for us. Check the address, or fill your brand in yourself." : err.message) : READ_FAILED;
      setRead((r) => ({ ...r, status: "failed", error: why, finished: Date.now() }));
    }
  };

  const readApp = async (myId: number, link: NonNullable<ReturnType<typeof appStoreLink>>) => {
    const at = (appStep: number) => myId === readId.current && setRead((r) => ({ ...r, appStep }));
    try {
      const l = await readListing(link);
      if (!l) throw new Error("no such app");
      at(1);
      const site = l.sellerUrl && left !== 0 ? callFn<Dna>("brand-dna", readBody(l.sellerUrl, leo)).catch(() => null) : Promise.resolve(null);
      const rivals = await readRivals(l);
      at(2);
      const complaints = readComplaints(rivals, l).finally(() => at(3));
      const [d, found] = await Promise.all([site, complaints]);
      if (myId !== readId.current) return;
      setProfession((p) => p.trim() || appProfession(l));
      await landRead(myId, appDna(l, d && leo ? { ...d, readAt: new Date().toISOString() } : d), { listing: l, rivals, complaints: found, proof: proofLines(l), pains: [] });
    } catch {
      if (myId !== readId.current) return;
      setRead((r) => ({ ...r, status: "failed", error: NO_APP, finished: Date.now() }));
    }
  };

  const clearRead = () => {
    setDna(null);
    setApp(null);
    setDone(new Set());
    setExpanded(new Set());
    setColours([]);
    setFromLogo([]);
    setLang(null);
    setSlideFont("modern");
  };

  const beginRead = (next: Step): boolean => {
    const link = appStoreLink(address);
    if (!link && !webAddress(address)) return false;
    clearRead();
    setNoSite(false);
    const myId = ++readId.current;
    setRead({ ...IDLE, status: "running", host: link ? "App Store" : hostOf(address), target: targetOf(address), started: Date.now() });
    setStep(next);
    if (link) void readApp(myId, link);
    else void readSite(myId, address.trim());
    return true;
  };

  const startRead = () => {
    if (!appStoreLink(address) && !webAddress(address)) {
      setAddressError(ADDRESS_ERROR);
      return;
    }
    setAddressError("");
    const same = read.target === targetOf(address) && !noSite;
    if (same && (read.status === "running" || (read.status === "done" && dna))) {
      setStep("work");
      return;
    }
    beginRead("work");
  };

  const goNoSite = () => {
    readId.current++;
    setRead(IDLE);
    setAddressError("");
    clearRead();
    setNoSite(true);
    setStep("work");
  };

  const fillByHand = () => {
    const d = { ...blankDna(read.host === "App Store" ? "" : address), audience: answers.audience ?? "general" };
    readId.current++;
    setRead(IDLE);
    clearRead();
    setNoSite(true);
    setDna(d);
    swapStep("review");
  };

  const afterWork = () => {
    if (!noSite && read.status === "idle" && !dna && beginRead("reading")) return;
    if (noSite || read.status === "idle") {
      if (!dna) {
        setNoSite(true);
        setDna({ ...blankDna(""), audience: answers.audience ?? "general" });
        setColours([]);
      }
      setStep("review");
      return;
    }
    setStep("reading");
  };

  const onAnswer = (a: Answers) => {
    setAnswers(a);
    if (a.audience && dna) setDna((d) => d && { ...d, audience: a.audience! });
  };

  const sections = app ? APP_SECTIONS : SITE_SECTIONS;
  const current = nextSection(done, sections);

  const create = () => {
    if (!dna || !uid || createdOnce.current) return;
    const title = dna.name.trim().slice(0, 40);
    if (!title || !colours.length) return;
    const brand: Dna = { ...dna, name: title, colour: hexOf(colours[0]) };
    const result = createBrand(uid, title, brand, profession, leo ? lang : null, app ? appFacts(app) : [], {
      platform: answers.platform,
      cadence: answers.cadence,
      goal: answers.goal ? { text: goalChips("business")[answers.goal], kind: answers.goal } : undefined,
      ...(leo ? { palette: colours.slice(1), slideFont } : {}),
    });
    if (!result.ok) {
      setTriedEmpty(true);
      return;
    }
    createdOnce.current = true;
    markOnboarded(uid);
    try {
      sessionStorage.removeItem(keptBrandKey(uid));
    } catch {
      createdOnce.current = true;
    }
    window.location.assign(`/brands/new?done=${encodeURIComponent(result.id)}`);
  };

  const readingActive = (() => {
    const n = steps.length;
    if (read.host === "App Store") return read.status === "done" ? n : Math.min(read.appStep, n - 1);
    if (read.status === "running") return shownStep(now - read.started, false, n);
    if (read.status !== "done") return 0;
    const from = read.finished >= enteredReading ? shownStep(read.finished - read.started, false, n) : 0;
    const start = Math.max(read.finished, enteredReading);
    return Math.min(n, from + Math.floor((now - start) / 180));
  })();

  useEffect(() => {
    if (step !== "reading" || read.status !== "done" || readingActive < steps.length) return;
    const t = window.setTimeout(() => swapStep("review"), 650);
    return () => window.clearTimeout(t);
  }, [step, read.status, readingActive, steps.length, swapStep]);

  if (!restored) return <OnboardingCanvas progress={null}>{null}</OnboardingCanvas>;

  if (made) {
    return (
      <OnboardingCanvas progress={100} onBack={() => window.location.assign("/home")} backLabel="Go to Home">
        <DoneStep titleId={TITLE_ID} name={made.name} logo={made.logo} colours={made.colours} line={made.line} />
      </OnboardingCanvas>
    );
  }

  const back = () => {
    if (step === "site") {
      if (historyIndex() > 0 || fromApp) window.history.back();
      else window.location.assign("/home");
      return;
    }
    if (historyIndex() > 0) window.history.back();
    else swapStep(step === "work" ? "site" : "work");
  };

  const toWork = () => {
    if (historyIndex() > 0 && step === "review") window.history.back();
    else setStep("work");
  };

  return (
    <OnboardingCanvas progress={step === "reading" ? null : progressOf(step, done.size, sections.length)} onBack={back} backLabel={step === "site" ? "Leave Add a brand" : "Back"}>
      {step === "site" && (
        <SiteStep
          address={address}
          error={addressError}
          blocked={left === 0}
          appLink={!!appLink}
          onAddress={(v) => {
            setAddress(v);
            if (addressError) setAddressError("");
          }}
          onRead={startRead}
          onNoSite={goNoSite}
          below={
            leo ? (
              <div className="flex flex-wrap items-center gap-2 px-1 pt-1.5">
                <PriceChip feature="brand-dna" left={left} />
                {why && <span className="text-xs text-destructive">{why}</span>}
              </div>
            ) : null
          }
        />
      )}
      {step === "work" && <WorkStep titleId={TITLE_ID} value={profession} onChange={setProfession} onContinue={afterWork} />}
      {step === "reading" && (
        <ReadingStep
          titleId={TITLE_ID}
          title={read.status === "failed" ? `We couldn't read ${read.host === "App Store" ? "that App Store link" : read.host}` : read.host === "App Store" ? "Reading the App Store listing" : `Reading ${read.host}`}
          steps={steps}
          active={readingActive}
          failure={read.status === "failed" ? read.error : null}
          answers={answers}
          onAnswer={onAnswer}
          onRetry={() => {
            setAddressError(read.error);
            if (historyIndex() >= 2) window.history.go(-2);
            else swapStep("site");
          }}
          onByHand={fillByHand}
        />
      )}
      {step === "review" && dna && (
        <ReviewStep
          titleId={TITLE_ID}
          manual={noSite}
          host={read.host === "App Store" ? "the App Store listing" : read.host || hostOf(address)}
          leo={leo}
          dna={dna}
          patch={(p) => setDna((d) => d && { ...d, ...p })}
          profession={profession}
          onProfession={toWork}
          sections={sections}
          done={done}
          current={current}
          expanded={expanded}
          onToggle={(s) =>
            setExpanded((x) => {
              const n = new Set(x);
              if (n.has(s)) n.delete(s);
              else n.add(s);
              return n;
            })
          }
          onConfirm={(s) => {
            setDone((x) => new Set(x).add(s));
            setExpanded((x) => {
              const n = new Set(x);
              n.delete(s);
              return n;
            });
          }}
          onCreate={create}
          createNote={
            triedEmpty && !profession.trim() ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {PROFESSION_NEEDED}{" "}
                <button type="button" className="underline underline-offset-2" onClick={toWork}>
                  Pick it
                </button>
              </p>
            ) : null
          }
          colours={colours}
          suggested={suggestionsFor(dna, fromLogo).found}
          presets={suggestionsFor(dna, fromLogo).presets}
          onColours={setColours}
          lang={lang}
          onLang={setLang}
          slideFont={slideFont}
          onSlideFont={setSlideFont}
          app={app}
          onTick={(key, v, on) => setApp((a) => a && { ...a, [key]: on ? [...a[key], v] : a[key].filter((x) => x !== v) })}
        />
      )}
    </OnboardingCanvas>
  );
}
