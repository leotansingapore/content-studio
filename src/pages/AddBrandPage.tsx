import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Globe, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PriceChip from "@/components/PriceChip";
import { useUsesLeft } from "@/lib/aiUsage";
import { reasonText } from "@/lib/prices";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { saveBrand } from "@/lib/carousel";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { EMPTY_POSITIONING, savePositioning, type PlanAudience } from "@/lib/positioning";
import { addProfile, loadProfiles, setActiveProfile } from "@/lib/profiles";
import { saveSocialAccounts, type SocialAccounts } from "@/lib/socialAccounts";
import { saveVoiceProfile } from "@/lib/voiceProfile";
import { supabase } from "@/lib/supabase";
import { AUDIENCE_NAMES, keptBrand, keptBrandKey, NETWORKS, newBrandKit, readBody, type BrandDna as Dna } from "@/lib/addBrand";

// /brands/new: add a brand from its website (docs/brand-isolation.md, phase 2; Holo's Brand DNA flow).
// One address, a short wait with named steps, then pre-filled cards to confirm instead of typing. The brand's
// own stores (brand kit, positioning, social accounts, voice) are filled when it is created.

const STEPS = ["Opening the site", "Name and logo", "Brand colour", "Social accounts", "What you do and for whom", "How you sound"];
const CARDS = ["identity", "colour", "social", "offer", "topics", "voice"] as const;
type Card = (typeof CARDS)[number];

export default function AddBrandPage() {
  const [uid, setUid] = useState("");
  const [address, setAddress] = useState("");
  const [phase, setPhase] = useState<"url" | "reading" | "confirm" | "done">("url");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [dna, setDna] = useState<Dna | null>(null);
  const [done, setDone] = useState<Set<Card>>(new Set());
  const [justName, setJustName] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState("");
  const timer = useRef<number>();
  const leo = useLeoOnly();
  // the chip is Leo's only, so only his sessions read today's uses: everyone else's left stays null
  const left = useUsesLeft(phase === "reading" || !leo)("brand-dna");
  const why = reasonText({ left, leo });

  useEffect(() => {
    document.title = "Add a brand - Content Studio";
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
      const kept = keptBrand(raw, CARDS);
      if (!kept) return;
      setAddress(kept.address);
      setName(kept.name);
      setJustName(kept.justName);
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
      if (!address && !name && !dna) sessionStorage.removeItem(keptBrandKey(uid));
      else sessionStorage.setItem(keptBrandKey(uid), JSON.stringify({ address, name, justName, dna, done: [...done] }));
    } catch {
      // storage full or blocked: the form just isn't kept
    }
  }, [uid, phase, address, name, justName, dna, done]);

  const read = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPhase("reading");
    setStep(0);
    // the steps tick over while the one request runs; the last waits for the answer
    timer.current = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    try {
      const d = await callFn<Dna>("brand-dna", readBody(address), "We couldn't read that site. Try again, or start with just a name.");
      setDna(d);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof EdgeError ? err.message : "We couldn't read that site. Try again, or start with just a name.");
      setPhase("url");
    } finally {
      window.clearInterval(timer.current);
    }
  };

  const patch = (p: Partial<Dna>) => setDna((d) => d && { ...d, ...p });
  const startOver = () => {
    setDna(null);
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
    if (!uid || !title) return;
    try {
      sessionStorage.removeItem(keptBrandKey(uid));
    } catch {
      // nothing was kept
    }
    const p = addProfile(uid, title);
    // the stores below key on the open brand, so it opens first
    setActiveProfile(uid, p.id);
    if (brand) {
      const ig = brand.handles.instagram?.replace(/^@/, "") ?? "";
      saveBrand(uid, newBrandKit(brand, title));
      savePositioning(uid, {
        ...EMPTY_POSITIONING,
        oneLiner: brand.oneLiner,
        audience: brand.audience,
        audienceDetail: brand.audienceDetail,
        topics: brand.topics,
        edge: brand.edge,
        platform: ig ? "instagram" : EMPTY_POSITIONING.platform,
        updatedAt: new Date().toISOString(),
      });
      const now = new Date().toISOString();
      const accounts: SocialAccounts = {};
      for (const n of NETWORKS) {
        const h = brand.handles[n.key]?.trim();
        if (h) accounts[n.key] = { handle: n.base + h.replace(/^@/, ""), connectedAt: now };
      }
      saveSocialAccounts(uid, accounts);
      if (brand.voice) saveVoiceProfile(uid, { posts: [], voiceSummary: brand.voice, updatedAt: now });
    }
    window.location.assign(`/brands/new?done=${encodeURIComponent(p.id)}`);
  };

  const pct = Math.round((done.size / CARDS.length) * 100);
  const row = (c: Card, title: string, summary: string, body: React.ReactNode) => (
    <section key={c} className={`rounded-xl border p-3 ${done.has(c) ? "border-border/60 bg-muted/30" : "border-primary/40 bg-card shadow-card"}`}>
      {done.has(c) ? (
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 shrink-0 text-success" />
          <span className="font-semibold">{title}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => reopen(c)} aria-label={`Change ${title}`}><Pencil className="h-3.5 w-3.5" /></Button>
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
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Add a brand</h1>
      </header>

      {phase === "url" && !justName && (
        <form onSubmit={read} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
          <label className="block space-y-1.5 text-sm font-semibold">
            The brand's website
            <div className="flex gap-2">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="acme.sg" inputMode="url" autoFocus className="font-normal" />
              <Button type="submit" disabled={!address.trim() || left === 0}><Globe className="mr-1.5 h-4 w-4" /> Read it</Button>
            </div>
          </label>
          {leo && <p><PriceChip feature="brand-dna" left={left} /></p>}
          {why && <p className="text-xs text-destructive">{why}</p>}
          <p className="text-xs text-muted-foreground">Takes under a minute. We read the home page only, and nothing is posted.</p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <button type="button" className="text-sm font-semibold text-primary [@media(pointer:coarse)]:min-h-11" onClick={() => setJustName(true)}>No website? Start with just a name</button>
        </form>
      )}

      {phase === "url" && justName && (
        <form onSubmit={(e) => { e.preventDefault(); create(null); }} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
          <label className="block space-y-1.5 text-sm font-semibold">
            Brand name
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="MoneyBees" autoFocus className="font-normal" />
              <Button type="submit" disabled={!name.trim()}>Add brand</Button>
            </div>
          </label>
          <button type="button" className="text-sm font-semibold text-primary [@media(pointer:coarse)]:min-h-11" onClick={() => setJustName(false)}>Read its website instead</button>
        </form>
      )}

      {phase === "reading" && (
        <ol className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-card" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 text-sm ${i > step ? "text-muted-foreground" : ""}`}>
              {i < step ? <Check className="h-4 w-4 text-success" /> : i === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4" />}
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
            <span className="text-xs font-semibold text-muted-foreground">{done.size} of {CARDS.length} checked</span>
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
          {row("offer", "What you do and for whom", dna.oneLiner || AUDIENCE_NAMES[dna.audience], (
            <div className="space-y-2">
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
              <Input value={dna.topics.join(", ")} onChange={(e) => patch({ topics: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6) })} placeholder="Topics, separated by commas" className="text-sm" aria-label="Topics" />
              <Input value={dna.edge} onChange={(e) => patch({ edge: e.target.value })} placeholder="Why people pick this brand" className="text-sm" aria-label="Edge" />
            </div>
          ))}
          {row("voice", "How it sounds", dna.voice || "not set", (
            <Textarea rows={2} value={dna.voice} onChange={(e) => patch({ voice: e.target.value })} placeholder="Warm and plain. Short sentences." className="text-sm" aria-label="Voice" />
          ))}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button size="lg" disabled={!dna.name.trim()} onClick={() => create(dna)}>Create {dna.name.trim() || "brand"}</Button>
            {done.size < CARDS.length && <span className="text-xs text-muted-foreground">Anything you haven't checked is kept as shown.</span>}
            <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={startOver}>Read a different site</Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-6 text-center shadow-card">
          <Check className="mx-auto h-10 w-10 text-success" />
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
