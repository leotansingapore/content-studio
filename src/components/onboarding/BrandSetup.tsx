import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PriceChip from "@/components/PriceChip";
import { ConnectStep } from "@/components/onboarding/ConnectStep";
import { FinishStep } from "@/components/onboarding/FinishStep";
import { NetworksStep } from "@/components/onboarding/NetworksStep";
import { OnboardingCanvas } from "@/components/onboarding/parts";
import { ReadingStep } from "@/components/onboarding/ReadingStep";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { SiteStep } from "@/components/onboarding/SiteStep";
import { WorkStep } from "@/components/onboarding/WorkStep";
import { blankDna, createBrand, fillBrand, keptBrand, PROFESSION_NEEDED, readBody, type BrandDna as Dna } from "@/lib/addBrand";
import { useUsesLeft } from "@/lib/aiUsage";
import { appDna, appFacts, appProfession, appStoreLink, isAppRead, proofLines, readComplaints, readListing, readRivals, type AppRead } from "@/lib/appStore";
import { BRAND_PRESETS, loadBrand } from "@/lib/carousel";
import type { SlideFont } from "@/lib/carouselLayout";
import { saveCreateTopic } from "@/lib/createTopic";
import { callFn, EdgeError } from "@/lib/edgeFn";
import type { PostLang } from "@/lib/links";
import { logoColours, logoForKit } from "@/lib/logoImage";
import { NEW_POST } from "@/lib/newPost";
import { reviewRows, scanOf } from "@/lib/productScan";
import { loadProducts, mergeScan, saveProducts, type Scan } from "@/lib/products";
import { markOnboarded } from "@/lib/onboarding";
import { ADDRESS_ERROR, APP_SECTIONS, distinctColours, KEPT_SECTIONS, PRODUCT_SECTIONS, foundNetworks, hexOf, hostOf, keptAnswers, keptNetworks, mainPlatform, nextSection, progressOf, READ_STEPS, shownStep, SITE_SECTIONS, slideFontFor, STEPS, webAddress, type Answers, type Mode, type Network, type Section, type Step, prefilledProfession } from "@/lib/onboardingFlow";
import { goalChips } from "@/lib/positioning";
import { reasonText } from "@/lib/prices";
import { activeProfileId, DEFAULT_PROFILE_ID, renameProfile, setActiveProfile } from "@/lib/profiles";
import { speakerFor } from "@/lib/remixBrand";
import { checkSocialConnect, clearConnectReturn, connectLink, PLATFORM_NAME, platformName, readRedirect, saveConnectReturn, socialConnectShown, socialStatus, type SocialStatus } from "@/lib/socialConnect";
import { asPostLang } from "@/lib/translate";
import { useUrlState } from "@/lib/urlState";

const APP_STEPS = ["Opening the App Store listing", "Its website: colour and social accounts", "Apps like it", "What their users complain about"];
const READ_FAILED = "We couldn't read that site. Check the address, or fill your brand in yourself.";
const NO_APP = "We couldn't read that App Store link. Check it opens in a browser, or paste the app's website instead.";
export const TITLE_ID = "onboard-title";
const SLIDE_FONTS: readonly SlideFont[] = ["classic", "modern", "serif"];
const ZERNIO_PARAMS = ["connected", "error", "error_message", "platform", "profileId", "accountId", "username"];

type ReadStatus = "idle" | "running" | "done" | "failed";
type Found = { status: ReadStatus; scan: Scan | null; ticks: Record<number, boolean>; error: string };
const NO_FOUND: Found = { status: "idle", scan: null, ticks: {}, error: "" };
type Read = { status: ReadStatus; host: string; target: string; error: string; started: number; finished: number; appStep: number };
const IDLE: Read = { status: "idle", host: "", target: "", error: "", started: 0, finished: 0, appStep: 0 };

const historyIndex = () => (typeof window === "undefined" ? 0 : ((window.history.state as { idx?: number } | null)?.idx ?? 0));

function cameFromApp(): boolean {
  try {
    return !!document.referrer && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function targetOf(address: string): string {
  const link = appStoreLink(address);
  if (link) return `app:${link.country}:${link.id}`;
  const u = webAddress(address);
  return u ? `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase() : address.trim().toLowerCase();
}

function suggestionsFor(d: Dna, fromLogo: string[]): { found: string[]; presets: string[] } {
  const found = distinctColours([d.colour, ...(d.colours ?? []), ...fromLogo, ...(d.neutrals ?? [])], 8);
  return { found, presets: found.length >= 2 ? [] : distinctColours(BRAND_PRESETS.map((p) => p.color), 8).filter((c) => !found.includes(c)) };
}

function startingColours(d: Dna, fromLogo: string[]): string[] {
  return distinctColours([d.colour, ...(d.colours ?? []), ...fromLogo, ...(d.neutrals ?? [])], 4);
}

interface Kept {
  address: string;
  noSite: boolean;
  profession: string;
  answers: Answers;
  dna: Dna | null;
  done: Section[];
  app: AppRead | null;
  colours: string[];
  fromLogo: string[];
  lang: PostLang | null;
  slideFont: SlideFont;
  networks: Network[];
  main: Network | null;
  found: Found;
  networksTouched: boolean;
  read: Read;
  resumeRead: boolean;
  resumeFind: boolean;
  step: Step | null;
  saved: boolean;
}

function keptFound(raw: unknown, read: boolean): Found {
  const f = raw as { scan?: unknown; ticks?: unknown } | null;
  const scan = read && f ? scanOf(f.scan, "") : null;
  if (!scan?.items.length) return NO_FOUND;
  const ticks = Object.fromEntries(Object.entries((f?.ticks as Record<string, unknown>) ?? {}).filter(([, t]) => typeof t === "boolean")) as Record<number, boolean>;
  return { ...NO_FOUND, status: "done", scan, ticks };
}

function restore(raw: string | null, mode: Mode): Kept {
  const base = keptBrand(raw, KEPT_SECTIONS);
  let extra: Record<string, unknown> = {};
  try {
    extra = (raw && JSON.parse(raw)) || {};
  } catch {
    extra = {};
  }
  const dna = base?.dna ?? null;
  const target = typeof extra.readTarget === "string" ? extra.readTarget : "";
  const address = base?.address ?? "";
  const step = typeof extra.step === "string" && (STEPS as readonly string[]).includes(extra.step) ? (extra.step as Step) : null;
  const read: Read =
    dna && !base?.justName && target
      ? { ...IDLE, status: "done", host: target.startsWith("app:") ? "App Store" : typeof extra.readHost === "string" ? extra.readHost : hostOf(address), target }
      : IDLE;
  const picked = Array.isArray(extra.colours) ? distinctColours(extra.colours as string[], 4, 1) : [];
  const resumeFind = extra.finding === true && read.status === "done" && !read.target.startsWith("app:") && read.target === targetOf(address);
  return {
    address,
    noSite: base?.justName ?? false,
    profession: base?.profession ?? "",
    answers: keptAnswers(extra.answers),
    dna,
    done: dna ? ((base?.done ?? []) as Section[]) : [],
    app: dna && isAppRead(extra.app) ? extra.app : null,
    colours: dna ? (picked.length ? picked : startingColours(dna, [])) : [],
    fromLogo: Array.isArray(extra.fromLogo) ? distinctColours(extra.fromLogo as string[], 3) : [],
    lang: asPostLang(extra.lang),
    slideFont: SLIDE_FONTS.includes(extra.slideFont as SlideFont) ? (extra.slideFont as SlideFont) : "modern",
    networks: keptNetworks(extra.networks),
    main: keptNetworks([extra.main])[0] ?? null,
    found: resumeFind ? { ...NO_FOUND, status: "running" } : keptFound(extra.found, !!dna),
    networksTouched: extra.networksTouched === true,
    read,
    resumeRead: mode === "first" && !dna && !base?.justName && extra.readStatus === "running" && (!!appStoreLink(address) || !!webAddress(address)),
    resumeFind,
    step,
    saved: mode === "first" && extra.saved === true,
  };
}

export interface BrandSetupProps {
  mode: Mode;
  uid: string;
  leo: boolean;
  kept: string | null;
  persist: (value: string | null) => void;
  prefill?: string | null;
}

export function BrandSetup({ mode, uid, leo, kept, persist, prefill }: BrandSetupProps) {
  const first = mode === "first";
  const start = useMemo(() => restore(kept, mode), [kept, mode]);
  const [params, setParams] = useSearchParams();
  const [step, setStep] = useUrlState<Step>("step", "site", { allowed: STEPS, push: true });
  const [, swapStep] = useUrlState<Step>("step", "site", { allowed: STEPS });
  const [address, setAddress] = useState(start.address);
  const [addressError, setAddressError] = useState("");
  const [noSite, setNoSite] = useState(start.noSite);
  const [profession, setProfession] = useState(start.profession);
  const [answers, setAnswers] = useState<Answers>(start.answers);
  const [dna, setDna] = useState<Dna | null>(start.dna);
  const [app, setApp] = useState<AppRead | null>(start.app);
  const [done, setDone] = useState<Set<Section>>(() => new Set(start.done));
  const [expanded, setExpanded] = useState<Set<Section>>(new Set());
  const [colours, setColours] = useState<string[]>(start.colours);
  const [fromLogo, setFromLogo] = useState<string[]>(start.fromLogo);
  const [lang, setLang] = useState<PostLang | null>(start.lang);
  const [slideFont, setSlideFont] = useState<SlideFont>(start.slideFont);
  const [networks, setNetworks] = useState<Network[]>(start.networks);
  const [main, setMain] = useState<Network | null>(start.main);
  const [found, setFound] = useState<Found>(start.found);
  const [read, setRead] = useState<Read>(start.read);
  const [saved, setSaved] = useState(start.saved);
  const [now, setNow] = useState(() => Date.now());
  const [enteredReading, setEnteredReading] = useState(0);
  const [triedEmpty, setTriedEmpty] = useState(false);
  const [doneElsewhere, setDoneElsewhere] = useState(false);
  const [canConnect, setCanConnect] = useState(() => first && socialConnectShown());
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const [connectError, setConnectError] = useState("");
  const [busy, setBusy] = useState("");
  const [leaving, setLeaving] = useState(false);
  const readId = useRef(0);
  const createdOnce = useRef(false);
  const networksTouched = useRef(start.networksTouched);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const fromApp = useMemo(cameFromApp, []);
  const startIdx = useRef(first ? historyIndex() : 0);
  const usesLeft = useUsesLeft(read.status === "running" || found.status === "running" || !leo);
  const left = usesLeft("brand-dna");
  const productsLeft = usesLeft("brand-products");
  const why = reasonText({ left, leo });

  const snapshot = useCallback(
    () =>
      (!address || (first && step === "site" && address === prefill)) && !profession && !dna && !networks.length
        ? null
        : JSON.stringify({
            v: 1,
            step,
            address,
            name: "",
            justName: noSite,
            profession,
            dna,
            done: [...done],
            app,
            answers,
            colours,
            fromLogo,
            lang,
            slideFont,
            networks,
            main,
            found: found.status === "done" ? { scan: found.scan, ticks: found.ticks } : null,
            finding: found.status === "running",
            networksTouched: networksTouched.current,
            readStatus: read.status,
            readTarget: read.status === "done" ? read.target : "",
            readHost: read.host,
            saved,
          }),
    [first, prefill, step, address, noSite, profession, dna, done, app, answers, colours, fromLogo, lang, slideFont, networks, main, found, read.status, read.target, read.host, saved],
  );
  const latest = useRef(snapshot);
  latest.current = snapshot;

  useEffect(() => {
    if (leaving) return;
    const t = window.setTimeout(() => persist(snapshot()), first ? 600 : 0);
    return () => window.clearTimeout(t);
  }, [snapshot, persist, first, leaving]);

  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);

  useEffect(() => {
    if (!first) return;
    const flush = () => {
      if (!createdOnce.current) persist(latest.current());
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [first, persist]);

  useEffect(() => {
    if (!first || address || !prefill) return;
    setAddress(prefill);
  }, [prefill]);

  useEffect(() => {
    if (!first) return;
    let alive = true;
    void checkSocialConnect().then((on) => alive && setCanConnect(on));
    const back = readRedirect(params);
    if (back) {
      setNote(back);
      if (back.ok) setJustConnected(params.get("connected"));
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const k of ZERNIO_PARAMS) p.delete(k);
          return p;
        },
        { replace: true },
      );
    }
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!first || !(step === "connect" || (step === "finish" && canConnect && !statusRef.current))) return;
    let alive = true;
    setStatusError("");
    socialStatus(DEFAULT_PROFILE_ID)
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setStatusError(e instanceof EdgeError ? e.message : "Couldn't check your accounts just now."));
    return () => {
      alive = false;
    };
  }, [first, step, canConnect]);

  useEffect(() => {
    if (step === "review" && !dna) swapStep("site");
    else if (step === "reading" && read.status === "idle" && !start.resumeRead) swapStep(profession.trim() ? "networks" : "site");
    else if ((step === "connect" || step === "finish") && (!first || !saved)) swapStep(dna ? "review" : "site");
    else if (first && saved && step !== "connect" && step !== "finish") swapStep(canConnect ? "connect" : "finish");
  }, [step, dna, read.status, profession, first, saved, canConnect, swapStep, start.resumeRead]);

  useEffect(() => setBusy(""), [step]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById("onboard-scroll")?.scrollTo({ top: 0 });
    if (step === "site") return;
    const t = window.setTimeout(() => document.getElementById(TITLE_ID)?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [step]);

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
      const logoHues = logo && !/^data:image\/jpeg/i.test(d.logo ?? "") ? await logoColours(logo) : [];
      if (myId !== readId.current) return;
      const next: Dna = { ...d, name: d.name.slice(0, 40), logo, audience: answersRef.current.audience ?? d.audience };
      setNoSite(false);
      setDna(next);
      setProfession((p) => prefilledProfession(p, d.profession));
      setFromLogo(logoHues);
      setColours(startingColours(next, logoHues));
      setLang(leo ? asPostLang((d as { lang?: unknown }).lang) : null);
      setSlideFont(slideFontFor(d.fonts));
      setDone(new Set());
      setExpanded(new Set());
      if (!networksTouched.current) setNetworks((n) => [...new Set([...n, ...foundNetworks(d.handles)])]);
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

  const findProducts = async (myId: number, target: string) => {
    setFound({ ...NO_FOUND, status: "running" });
    try {
      const scan = scanOf(await callFn<unknown>("brand-dna", { mode: "products", url: target }), new Date().toISOString());
      if (myId !== readId.current) return;
      setFound(scan?.items.length ? { ...NO_FOUND, status: "done", scan } : { ...NO_FOUND, status: "failed", error: `No products or services found on ${hostOf(target)}.` });
    } catch (e) {
      if (myId === readId.current) setFound({ ...NO_FOUND, status: "failed", error: e instanceof EdgeError ? e.message : `We couldn't list what ${hostOf(target)} sells.` });
    }
  };

  const clearRead = () => {
    if (!networksTouched.current) setNetworks([]);
    setFound(NO_FOUND);
    setDna(null);
    setApp(null);
    setDone(new Set());
    setExpanded(new Set());
    setColours([]);
    setFromLogo([]);
    setLang(null);
    setSlideFont("modern");
  };

  const beginRead = (next: Step | null): boolean => {
    const link = appStoreLink(address);
    if (!link && !webAddress(address)) return false;
    clearRead();
    setNoSite(false);
    const myId = ++readId.current;
    setRead({ ...IDLE, status: "running", host: link ? "App Store" : hostOf(address), target: targetOf(address), started: Date.now() });
    if (next) setStep(next);
    if (link) void readApp(myId, link);
    else {
      void readSite(myId, address.trim());
      if (leo && productsLeft !== 0) void findProducts(myId, address.trim());
    }
    return true;
  };

  useEffect(() => {
    if (start.resumeRead) beginRead(null);
  }, []);

  const findResumed = useRef(false);
  useEffect(() => {
    if (!start.resumeFind || !leo || findResumed.current) return;
    findResumed.current = true;
    void findProducts(readId.current, address.trim());
  }, [leo]);

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

  const afterNetworks = () => {
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

  const toggleNetwork = (n: Network) => {
    networksTouched.current = true;
    setNetworks((x) => (x.includes(n) ? x.filter((y) => y !== n) : [...x, n]));
  };

  const pickMain = (n: Network) => {
    networksTouched.current = true;
    setMain(n);
  };

  const sections = app ? APP_SECTIONS : leo && !noSite && (found.status === "running" || found.status === "done") ? PRODUCT_SECTIONS : SITE_SECTIONS;
  const productRows = () => (found.scan ? reviewRows(first ? loadProducts(uid).items : [], { scan: found.scan, ticks: found.ticks, pics: {} }) : []);

  const keepProducts = () => {
    if (!leo || found.status !== "done" || !found.scan) return;
    const list = loadProducts(uid);
    const ticked = reviewRows(list.items, { scan: found.scan, ticks: found.ticks, pics: {} }).filter((r) => r.ticked).map((r) => r.i);
    if (ticked.length) saveProducts(uid, mergeScan(list, found.scan, ticked).next);
  };
  const current = nextSection(done, sections);

  const extras = () => ({
    platform: mainPlatform(networks, main),
    networks,
    cadence: answers.cadence,
    goal: answers.goal ? { text: goalChips(first ? speakerFor(uid) : "business")[answers.goal], kind: answers.goal } : undefined,
    palette: colours.slice(1),
    ...(leo ? { slideFont } : {}),
  });

  const create = () => {
    if (!dna || !uid || createdOnce.current) return;
    const title = dna.name.trim().slice(0, 40);
    if (!title || !colours.length) return;
    const brand: Dna = { ...dna, name: title, colour: hexOf(colours[0]) };
    const facts = app ? appFacts(app) : [];
    if (first) {
      if (activeProfileId(uid) !== DEFAULT_PROFILE_ID) setActiveProfile(uid, DEFAULT_PROFILE_ID);
      if (loadBrand(uid)?.profession?.trim()) {
        setDoneElsewhere(true);
        return;
      }
      const result = fillBrand(uid, title, brand, profession, leo ? lang : null, facts, extras());
      if (!result.ok) {
        setTriedEmpty(true);
        return;
      }
      renameProfile(uid, DEFAULT_PROFILE_ID, title);
      keepProducts();
      setSaved(true);
      setStep(canConnect ? "connect" : "finish");
      return;
    }
    const result = createBrand(uid, title, brand, profession, leo ? lang : null, facts, extras());
    if (!result.ok) {
      setTriedEmpty(true);
      return;
    }
    keepProducts();
    createdOnce.current = true;
    setLeaving(true);
    markOnboarded(uid);
    persist(null);
    window.location.assign(`/brands/new?done=${encodeURIComponent(result.id)}`);
  };

  const leaveTo = (to: string, topic = "") => {
    if (createdOnce.current) return;
    createdOnce.current = true;
    setLeaving(true);
    if (first && activeProfileId(uid) !== DEFAULT_PROFILE_ID) setActiveProfile(uid, DEFAULT_PROFILE_ID);
    if (topic) saveCreateTopic(uid, topic);
    markOnboarded(uid);
    clearConnectReturn();
    persist(null);
    window.location.assign(to);
  };

  const connect = async (n: Network) => {
    setConnectError("");
    setNote(null);
    setBusy(n);
    persist(latest.current());
    try {
      const { authUrl } = await connectLink(DEFAULT_PROFILE_ID, n);
      saveConnectReturn("/welcome");
      window.location.assign(authUrl);
      window.setTimeout(() => setBusy(""), 15_000);
    } catch (e) {
      setBusy("");
      setConnectError(e instanceof EdgeError ? e.message : "Couldn't start connecting just now. Try again in a minute.");
    }
  };

  const readingActive = (() => {
    const n = steps.length;
    if (read.host === "App Store") return read.status === "done" ? n : Math.min(read.appStep, n - 1);
    if (read.status === "running") return shownStep(now - read.started, false, n);
    if (read.status !== "done") return 0;
    const from = read.finished >= enteredReading ? shownStep(read.finished - read.started, false, n) : 0;
    const begin = Math.max(read.finished, enteredReading);
    return Math.min(n, from + Math.floor((now - begin) / 180));
  })();

  useEffect(() => {
    if (step !== "reading" || read.status !== "done" || readingActive < steps.length) return;
    const t = window.setTimeout(() => swapStep("review"), 650);
    return () => window.clearTimeout(t);
  }, [step, read.status, readingActive, steps.length, swapStep]);

  const back =
    first && (step === "site" || step === "connect" || step === "finish")
      ? undefined
      : () => {
          if (step === "site") {
            const behind = historyIndex() - startIdx.current + 1;
            if (startIdx.current > 0 || fromApp) window.history.go(-behind);
            else window.location.assign("/home");
            return;
          }
          if (historyIndex() > startIdx.current) window.history.back();
          else swapStep(step === "work" ? "site" : step === "networks" ? "work" : "networks");
        };

  const finishFacts = () => ({
    name: dna?.name.trim() || "Your brand",
    logo: dna?.logo ?? null,
    colours,
    voice: dna?.voice ?? "",
    topics: dna?.topics ?? [],
    networks: networks.map((n) => PLATFORM_NAME[n]),
    connected: status
      ? status.accounts.map((a) => `${platformName(a.platform)}${a.username ? ` @${a.username.replace(/^@/, "")}` : ""}`)
      : justConnected
        ? [platformName(justConnected)]
        : [],
  });

  return (
    <OnboardingCanvas progress={step === "reading" ? null : progressOf(step, done.size, sections.length, mode)} onBack={back} backLabel={step === "site" ? "Leave Add a brand" : "Back"}>
      {step === "site" && (
        <SiteStep
          title={first ? "Let's set up your brand" : undefined}
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
          onSkip={first ? () => leaveTo("/home") : undefined}
          below={
            leo ? (
              <div className="flex flex-wrap items-center gap-2 px-1 pt-1.5">
                <PriceChip feature="brand-dna" left={left} />
                <PriceChip feature="brand-products" left={productsLeft} />
                {why && <span className="text-xs text-destructive">{why}</span>}
              </div>
            ) : null
          }
        />
      )}
      {step === "work" && <WorkStep titleId={TITLE_ID} value={profession} onChange={setProfession} onContinue={() => setStep("networks")} />}
      {step === "networks" && (
        <NetworksStep
          titleId={TITLE_ID}
          picked={networks}
          found={dna ? foundNetworks(dna.handles) : []}
          main={main}
          onToggle={toggleNetwork}
          onMain={pickMain}
          onContinue={afterNetworks}
          onUnsure={() => {
            networksTouched.current = true;
            setNetworks([]);
            afterNetworks();
          }}
        />
      )}
      {step === "reading" && (
        <ReadingStep
          titleId={TITLE_ID}
          title={read.status === "failed" ? `We couldn't read ${read.host === "App Store" ? "that App Store link" : read.host}` : read.host === "App Store" ? "Reading the App Store listing" : `Reading ${read.host || hostOf(address)}`}
          steps={steps}
          active={readingActive}
          failure={read.status === "failed" ? read.error : null}
          answers={answers}
          onAnswer={onAnswer}
          onRetry={() => {
            setAddressError(read.error);
            swapStep("site");
          }}
          onByHand={fillByHand}
        />
      )}
      {step === "review" && dna && (
        <ReviewStep
          titleId={TITLE_ID}
          mode={mode}
          manual={noSite}
          host={read.host === "App Store" ? "the App Store listing" : read.host || hostOf(address)}
          leo={leo}
          dna={dna}
          patch={(p) => setDna((d) => d && { ...d, ...p })}
          profession={profession}
          onProfession={() => swapStep("work")}
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
            doneElsewhere ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                This brand was already set up elsewhere, so nothing here was saved.{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => leaveTo("/home")}>
                  Go to Home
                </button>
              </p>
            ) : triedEmpty && !profession.trim() ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {PROFESSION_NEEDED}{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => swapStep("work")}>
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
          products={sections.includes("products") ? { busy: found.status === "running", host: read.host || hostOf(address), rows: productRows() } : null}
          productsNote={leo && found.status === "failed" ? `${found.error} You can add them on Brand > Products.` : ""}
          onProductTick={(i, on) => setFound((f) => ({ ...f, ticks: { ...f.ticks, [i]: on } }))}
          onTick={(key, v, on) => setApp((a) => a && { ...a, [key]: on ? [...a[key], v] : a[key].filter((x) => x !== v) })}
        />
      )}
      {first && step === "connect" && saved && (
        <ConnectStep titleId={TITLE_ID} networks={networks} status={status} statusError={statusError} justConnected={justConnected} note={note} error={connectError} busy={busy} onConnect={(n) => void connect(n)} onContinue={() => setStep("finish")} />
      )}
      {first && step === "finish" && saved && (
        <FinishStep titleId={TITLE_ID} facts={finishFacts()} firstTopic={dna?.topics.find((t) => t.trim()) ?? ""} busy={leaving} onWrite={() => leaveTo(NEW_POST, dna?.topics.find((t) => t.trim()) ?? "")} onHome={() => leaveTo("/home")} />
      )}
    </OnboardingCanvas>
  );
}
