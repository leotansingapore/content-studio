import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, CheckIcon, ArrowSquareOutIcon, GlobeIcon, CircleNotchIcon, PencilSimpleIcon, StarIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PriceChip from "@/components/PriceChip";
import ProfessionField from "@/components/ProfessionField";
import { useUsesLeft } from "@/lib/aiUsage";
import { reasonText } from "@/lib/prices";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { callFn, EdgeError } from "@/lib/edgeFn";
import type { PlanAudience } from "@/lib/positioning";
import { loadProfiles } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { AUDIENCE_NAMES, blankDna, createBrand, keptBrand, keptBrandKey, NETWORKS, parseTopics, PROFESSION_NEEDED, readBody, shownTopics, type BrandDna as Dna } from "@/lib/addBrand";
import { appDna, appFacts, appProfession, appStoreLink, isAppRead, MAX_PAINS, proofLines, readComplaints, readListing, readRivals, type AppRead } from "@/lib/appStore";
import { asPostLang, LANG_NAMES } from "@/lib/translate";

// /brands/new: add a brand from its website (docs/brand-isolation.md, phase 2; Holo's Brand DNA flow), or an app from
// its App Store link (src/lib/appStore.ts: the listing, the app's own site, and complaints about apps like it).
// One address, a short wait with named steps, then pre-filled cards to confirm instead of typing. The brand's
// own stores (brand kit, positioning, social accounts, voice) are filled when it is created.

const STEPS = ["Opening the site", "Name and logo", "Brand colour", "Social accounts", "What you do and for whom", "How you sound"];
const APP_STEPS = ["Opening the App Store listing", "Its website: colour and social accounts", "Apps like it", "What their users complain about"];
const CARDS = ["identity", "colour", "social", "offer", "topics", "voice"] as const;
// an App Store read adds two cards: the store's own facts, and complaints about apps like it
const ALL_CARDS = [...CARDS, "proof", "pains"] as const;
type Card = (typeof ALL_CARDS)[number];

// Leo's read names the site's language from <html lang> (brand-dna); everyone else's read has none (edit-translate)
const siteLang = (d: Dna | null, leo: boolean) => (leo ? asPostLang((d as { lang?: unknown } | null)?.lang) : null);

export default function AddBrandPage() {
  const [uid, setUid] = useState("");
  const [address, setAddress] = useState("");
  const [phase, setPhase] = useState<"url" | "reading" | "confirm" | "done">("url");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [dna, setDna] = useState<Dna | null>(null);
  const [app, setApp] = useState<AppRead | null>(null);
  const [done, setDone] = useState<Set<Card>>(new Set());
  const [justName, setJustName] = useState(false);
  const [name, setName] = useState("");
  const [profession, setProfession] = useState("");
  // Create was pressed before "What do you do?" had an answer: the line saying so shows until it has one
  const [triedEmpty, setTriedEmpty] = useState(false);
  const [created, setCreated] = useState("");
  const [topicsTyped, setTopicsTyped] = useState("");
  const timer = useRef<number>();
  const createdOnce = useRef(false);
  const leo = useLeoOnly();
  // the chip is Leo's only, so only his sessions read today's uses: everyone else's left stays null
  const left = useUsesLeft(phase === "reading" || !leo)("brand-dna");
  const why = reasonText({ left, leo });

  useEffect(() => {
    document.title = "Add a brand - Postmosis";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? "";
      setUid(id);
      // back from creating one (?done=<id>): the page reloaded so every module, the switcher too, is on the new brand
      const made = new URLSearchParams(window.location.search).get("done");
      const brand = made && id ? loadProfiles(id).find((p) => p.id === made) : undefined;
      if (brand) {
        setCreated(brand.name);
        setPhase("done");
        return;
      }
      // a form left half done in this tab: the address, or the site read and the cards already checked
      let raw: string | null = null;
      try {
        raw = id ? sessionStorage.getItem(keptBrandKey(id)) : null;
      } catch {
        // storage blocked: start empty
      }
      const kept = keptBrand(raw, ALL_CARDS);
      if (!kept) return;
      try {
        const a = JSON.parse(raw ?? "null")?.app;
        if (kept.dna && isAppRead(a)) setApp(a);
      } catch {
        // keptBrand read it already: an unreadable form never gets here
      }
      setAddress(kept.address);
      setName(kept.name);
      setJustName(kept.justName);
      setProfession(kept.profession);
      if (kept.dna) {
        setDna(kept.dna);
        setDone(new Set(kept.done as Card[]));
        setPhase("confirm");
      }
    });
    return () => window.clearInterval(timer.current);
  }, []);

  // Kept for the tab until the brand is created, so leaving the page or reloading loses nothing.
  useEffect(() => {
    if (!uid || phase === "reading" || phase === "done") return;
    try {
      if (!address && !name && !dna && !profession) sessionStorage.removeItem(keptBrandKey(uid));
      else sessionStorage.setItem(keptBrandKey(uid), JSON.stringify({ address, name, justName, profession, dna, done: [...done], app }));
    } catch {
      // storage full or blocked: the form just isn't kept
    }
  }, [uid, phase, address, name, justName, profession, dna, done, app]);

  const appLink = appStoreLink(address);
  const NO_APP = "We couldn't read that App Store link. Check it opens in a browser, or paste the app's website instead.";
  // the steps move as each read lands, so a slow one shows where it is
  const readApp = async (link: NonNullable<typeof appLink>) => {
    setError("");
    setApp(null);
    setPhase("reading");
    setStep(0);
    try {
      const l = await readListing(link);
      if (!l) throw new Error("no such app");
      setStep(1);
      // the app's own site gives colour, social accounts and voice; a failed or capped read just leaves them empty
      const site = l.sellerUrl && left !== 0 ? callFn<Dna>("brand-dna", readBody(l.sellerUrl, leo)).catch(() => null) : Promise.resolve(null);
      const rivals = await readRivals(l);
      setStep(2);
      const complaints = readComplaints(rivals, l).finally(() => setStep(3));
      const [d, found] = await Promise.all([site, complaints]);
      setDna(appDna(l, d && leo ? { ...d, readAt: new Date().toISOString() } : d));
      setApp({ listing: l, rivals, complaints: found, proof: proofLines(l), pains: [] });
      setProfession((p) => p.trim() || appProfession(l));
      setPhase("confirm");
    } catch {
      setError(NO_APP);
      setPhase("url");
    }
  };

  const read = async (e: React.FormEvent) => {
    e.preventDefault();
    if (appLink) return readApp(appLink);
    setError("");
    setApp(null);
    setPhase("reading");
    setStep(0);
    // the steps tick over while the one request runs; the last waits for the answer
    timer.current = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    try {
      const d = await callFn<Dna>("brand-dna", readBody(address, leo), "We couldn't read that site. Try again, or start with just a name.");
      setDna(leo ? { ...d, readAt: new Date().toISOString() } : d);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof EdgeError ? err.message : "We couldn't read that site. Try again, or start with just a name.");
      setPhase("url");
    } finally {
      window.clearInterval(timer.current);
    }
  };

  // a link it couldn't read: the same cards, empty, to fill in by hand
  const byHand = () => {
    setError("");
    setApp(null);
    setDna(blankDna(address));
    setDone(new Set());
    setPhase("confirm");
  };
  const patch = (p: Partial<Dna>) => setDna((d) => d && { ...d, ...p });
  const startOver = () => {
    setDna(null);
    setApp(null);
    setDone(new Set());
    setPhase("url");
  };
  const confirm = (c: Card) => setDone((s) => new Set(s).add(c));
  const reopen = (c: Card) => setDone((s) => {
    const n = new Set(s);
    n.delete(c);
    return n;
  });

  const create = (brand: Dna | null) => {
    const title = (brand?.name ?? name).trim().slice(0, 40);
    // a double click lands twice before the page leaves: one brand, not two
    if (!uid || !title || createdOnce.current) return;
    const made = createBrand(uid, title, brand, profession, brand ? siteLang(brand, leo) : null, brand && app ? appFacts(app) : []);
    if (!made.ok) {
      setTriedEmpty(true);
      if (brand) reopen("offer");
      return;
    }
    createdOnce.current = true;
    try {
      sessionStorage.removeItem(keptBrandKey(uid));
    } catch {
      // nothing was kept
    }
    window.location.assign(`/brands/new?done=${encodeURIComponent(made.id)}`);
  };
  const needLine = triedEmpty && !profession.trim() ? <p className="text-sm text-destructive" role="alert">{PROFESSION_NEEDED}</p> : null;

  const cards: readonly Card[] = app ? ALL_CARDS : CARDS;
  const pct = Math.round((done.size / cards.length) * 100);
  const steps = appLink ? APP_STEPS : STEPS;
  const tick = (key: "proof" | "pains", v: string, on: boolean) =>
    setApp((a) => a && { ...a, [key]: on ? [...a[key], v] : a[key].filter((x) => x !== v) });
  const lang = siteLang(dna, leo);
  const row = (c: Card, title: string, summary: string, body: React.ReactNode) => (
    <section key={c} className={`rounded-xl border p-3 ${done.has(c) ? "border-border/60 bg-muted/30" : "border-primary/40 bg-card shadow-card"}`}>
      {done.has(c) ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckIcon className="h-4 w-4 shrink-0 text-success" />
          <span className="font-semibold">{title}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => reopen(c)} aria-label={`Change ${title}`}><PencilSimpleIcon className="h-3.5 w-3.5" /></Button>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {body}
          <Button size="sm" onClick={() => confirm(c)}>Looks right</Button>
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <Link to="/home" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11">
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Back
        </Link>
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Add a brand</h1>
      </header>

      {phase === "url" && !justName && (
        <form onSubmit={read} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
          <label className="block space-y-1.5 text-sm font-semibold">
            The brand's website or App Store link
            <div className="flex gap-2">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="acme.sg or apps.apple.com/..." inputMode="url" autoFocus className="font-normal" />
              <Button type="submit" disabled={!address.trim() || left === 0}><GlobeIcon className="mr-1.5 h-4 w-4" /> Read it</Button>
            </div>
          </label>
          {leo && <p><PriceChip feature="brand-dna" left={left} /></p>}
          {why && <p className="text-xs text-destructive">{why}</p>}
          <p className="text-xs text-muted-foreground">{appLink ? "Takes under a minute. We read the listing, the app's website and reviews of apps like it, and nothing is posted." : leo ? "Takes under a minute. We read the home page and up to 4 more pages, and nothing is posted." : "Takes under a minute. We read the home page only, and nothing is posted."}</p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {error && <Button type="button" variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={byHand}><PencilSimpleIcon className="mr-1.5 h-3.5 w-3.5" /> Fill it in yourself</Button>}
          <button type="button" className="block text-sm font-semibold text-primary [@media(pointer:coarse)]:min-h-11" onClick={() => setJustName(true)}>No website? Start with just a name</button>
        </form>
      )}

      {phase === "url" && justName && (
        <form onSubmit={(e) => { e.preventDefault(); create(null); }} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
          <ProfessionField value={profession} onChange={setProfession} emptyIsAdviser={false} />
          <label className="block space-y-1.5 text-sm font-semibold">
            Brand name
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="MoneyBees" autoFocus className="font-normal" />
              <Button type="submit" disabled={!name.trim()}>Add brand</Button>
            </div>
          </label>
          {needLine}
          <button type="button" className="text-sm font-semibold text-primary [@media(pointer:coarse)]:min-h-11" onClick={() => setJustName(false)}>Read its website instead</button>
        </form>
      )}

      {phase === "reading" && (
        <ol className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-card" aria-live="polite">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 text-sm ${i > step ? "text-muted-foreground" : ""}`}>
              {i < step ? <CheckIcon className="h-4 w-4 text-success" /> : i === step ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4" />}
              {s}
            </li>
          ))}
        </ol>
      )}

      {phase === "confirm" && dna && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Brand set up">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{done.size} of {cards.length} checked</span>
          </div>

          {row("identity", "Name and logo", dna.name, (
            <div className="flex items-center gap-3">
              {dna.logo ? <img src={dna.logo} alt="" className="h-14 w-14 rounded-lg border border-border/60 bg-white object-contain p-1" /> : <span className="grid h-14 w-14 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">No logo</span>}
              <Input value={dna.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} aria-label="Brand name" />
              {dna.logo && <Button size="sm" variant="ghost" onClick={() => patch({ logo: null })}>Remove logo</Button>}
            </div>
          ))}
          {row("colour", "Brand colour", dna.colour ?? "none found", (
            <label className="flex items-center gap-3 text-sm">
              <input type="color" value={dna.colour ?? "#2563eb"} onChange={(e) => patch({ colour: e.target.value })} className="h-10 w-14 rounded border border-border/60 [@media(pointer:coarse)]:h-11" aria-label="Brand colour" />
              {dna.colour ? dna.colour : "None on the site. Pick one, or keep the default."}
            </label>
          ))}
          {row("social", "Social accounts", NETWORKS.filter((n) => dna.handles[n.key]).map((n) => `${n.label} ${dna.handles[n.key]}`).join(", ") || "none", (
            <div className="grid gap-2 sm:grid-cols-2">
              {NETWORKS.map((n) => (
                <label key={n.key} className="space-y-1 text-xs font-semibold text-muted-foreground">
                  {n.label}
                  <Input value={dna.handles[n.key] ?? ""} onChange={(e) => patch({ handles: { ...dna.handles, [n.key]: e.target.value } })} placeholder="none" className="text-sm font-normal text-foreground" />
                </label>
              ))}
            </div>
          ))}
          {row("offer", "What you do and for whom", [profession.trim(), dna.oneLiner || AUDIENCE_NAMES[dna.audience]].filter(Boolean).join(", "), (
            <div className="space-y-2">
              <ProfessionField value={profession} onChange={setProfession} emptyIsAdviser={false} />
              <Textarea rows={2} value={dna.oneLiner} onChange={(e) => patch({ oneLiner: e.target.value })} placeholder="We help ... so they can ..." className="text-sm" aria-label="One-line description" />
              <div className="flex flex-wrap gap-2">
                <select value={dna.audience} onChange={(e) => patch({ audience: e.target.value as PlanAudience })} className="h-9 rounded-md border border-input bg-background px-2 text-sm [@media(pointer:coarse)]:h-11" aria-label="Who it serves">
                  {(Object.keys(AUDIENCE_NAMES) as PlanAudience[]).map((a) => <option key={a} value={a}>{AUDIENCE_NAMES[a]}</option>)}
                </select>
                <Input value={dna.audienceDetail} onChange={(e) => patch({ audienceDetail: e.target.value })} placeholder="Exactly who" className="flex-1 text-sm" aria-label="Exactly who" />
              </div>
            </div>
          ))}
          {row("topics", "Topics and edge", dna.topics.join(", ") || dna.edge, (
            <div className="space-y-2">
              <Input value={shownTopics(topicsTyped, dna.topics)} onChange={(e) => { setTopicsTyped(e.target.value); patch({ topics: parseTopics(e.target.value) }); }} placeholder="Topics, separated by commas" className="text-sm" aria-label="Topics" />
              <Input value={dna.edge} onChange={(e) => patch({ edge: e.target.value })} placeholder="Why people pick this brand" className="text-sm" aria-label="Edge" />
            </div>
          ))}
          {row("voice", "How it sounds", dna.voice || "not set", (
            <Textarea rows={2} value={dna.voice} onChange={(e) => patch({ voice: e.target.value })} placeholder="Warm and plain. Short sentences." className="text-sm" aria-label="Voice" />
          ))}
          {app && row("proof", "From the App Store", `${app.proof.length} ${app.proof.length === 1 ? "fact" : "facts"} to save`, (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {app.listing.icon && <img src={app.listing.icon} alt="" className="h-12 w-12 rounded-xl border border-border/60" />}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{app.listing.name}</p>
                  <p className="flex items-center gap-1 text-muted-foreground">
                    {app.listing.rating !== null && <><StarIcon className="h-3.5 w-3.5" /> {app.listing.rating.toFixed(1)} from {app.listing.ratings.toLocaleString("en-US")} ratings, </>}
                    {app.listing.price || "No price shown"}
                  </p>
                </div>
                <a href={app.listing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary [@media(pointer:coarse)]:min-h-11">Listing <ArrowSquareOutIcon className="h-3 w-3" /></a>
              </div>
              {app.listing.screenshots.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {app.listing.screenshots.map((src) => <img key={src} src={src} alt="" loading="lazy" className="h-28 shrink-0 rounded-md border border-border/60" />)}
                </div>
              )}
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-semibold text-muted-foreground">Facts the writers may state</legend>
                {proofLines(app.listing).map((line) => (
                  <label key={line} className="flex items-start gap-2 text-sm [@media(pointer:coarse)]:min-h-11">
                    <input type="checkbox" className="mt-1" checked={app.proof.includes(line)} onChange={(e) => tick("proof", line, e.target.checked)} />
                    {line}
                  </label>
                ))}
              </fieldset>
            </div>
          ))}
          {app && row("pains", "What users of apps like it complain about", app.pains.length ? `${app.pains.length} picked` : "none picked", (
            <div className="space-y-2">
              {app.complaints.length === 0 ? (
                <p className="text-sm text-muted-foreground">No 1 or 2 star reviews came back for apps like it. You can add problems later in Your voice.</p>
              ) : (
                <fieldset className="space-y-1.5">
                  <legend className="text-xs text-muted-foreground">
                    Pick up to {MAX_PAINS}. Writers can open a post on these problems. From reviews of {app.rivals.map((r) => r.name).join(", ")}.
                  </legend>
                  {app.complaints.map((c) => {
                    const on = app.pains.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-start gap-2 rounded-lg border border-border/60 p-2 text-sm [@media(pointer:coarse)]:min-h-11">
                        <input type="checkbox" className="mt-1" checked={on} disabled={!on && app.pains.length >= MAX_PAINS} onChange={(e) => tick("pains", c.id, e.target.checked)} />
                        <span className="min-w-0 flex-1">
                          {`"${c.text}"`}
                          <span className="block text-xs text-muted-foreground">{c.app}, {c.stars} {c.stars === 1 ? "star" : "stars"}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </div>
          ))}
          {app && (app.proof.length > 0 || app.pains.length > 0) && <p className="text-xs text-muted-foreground">These are saved to Your voice as facts, where you can turn any off.</p>}
          {lang && <p className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm" data-testid="site-language">Your website is in {LANG_NAMES[lang]}, so posts will be too. Change it in Brand kit.</p>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button size="lg" disabled={!dna.name.trim()} onClick={() => create(dna)}>Create {dna.name.trim() || "brand"}</Button>
            {needLine}
            {done.size < cards.length && <span className="text-xs text-muted-foreground">Anything you haven't checked is kept as shown.</span>}
            <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={startOver}>Read a different link</Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-6 text-center shadow-card">
          <CheckIcon className="mx-auto h-10 w-10 text-success" />
          <h2 className="font-serif text-2xl font-semibold">{created} is ready</h2>
          <p className="text-sm text-muted-foreground">It has its own posts, plan, calendar and links, kept apart from your other brands.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={() => window.location.assign("/generate")}>Write its first post</Button>
            <Button size="lg" variant="outline" onClick={() => window.location.assign("/calendar")}>Open its calendar</Button>
          </div>
        </section>
      )}
    </div>
  );
}
