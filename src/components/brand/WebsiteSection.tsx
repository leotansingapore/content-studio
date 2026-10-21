// Your brand from your website (brand-from-website, wave 2). First on /brand, #website, Leo only (BrandPage mounts it).
// One address and Read it; the read runs outside React (src/lib/brandRead.ts), so leaving /brand keeps it going.
// Its answer waits on this device for review at ?website=review: one card per field, what the brand has beside what
// the site says, "Keep mine" or "Use this". Save writes only the Use this cards; the kit goes through setBrand.

import { useEffect, useReducer, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Globe, Loader2, Sparkles } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  currentOf, discardRead, FIELD_TITLES, type Field, hostOf, loadWaiting, onBrandRead, type Pick, readFailed, readingNow,
  reviewRows, type Row, saveRead, setPick, startRead, type Waiting,
} from "@/lib/brandRead";
import type { CarouselBrand } from "@/lib/carousel";
import {
  addCompetitor, dismissName, fromSuggestion, isSuggesting, loadCompetitors, loadSuggestions, MAX_COMPETITORS, nameKey, onCompetitors,
  onCompetitorsChanged, runSuggest, type Suggestion, takeNotices,
} from "@/lib/competitors";
import { loadMarket } from "@/lib/market";
import { reasonText } from "@/lib/prices";
import { activeProfile, DEFAULT_PROFILE_ID } from "@/lib/profiles";
import { withParam } from "@/lib/urlState";

const STEPS = ["Opening the site", "Finding your about, services and pricing pages", "Reading up to 5 pages", "What you do and for whom", "How you sound"];
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/** setBrand goes through BrandPage's own save, so two writers never race on the kit (phase4-build-brief.md, decision 14). */
export default function WebsiteSection({ userId, brand, setBrand }: { userId: string; brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = [onBrandRead(redraw), onCompetitors(redraw), onCompetitorsChanged(redraw)];
    return () => off.forEach((f) => f());
  }, []);
  const reading = readingNow(userId);
  const failed = readFailed(userId);
  const waiting = loadWaiting(userId);
  const saved = brand.website ? hostOf(brand.website) : "";
  const [address, setAddress] = useState(() => reading?.address || saved || loadMarket(userId).site);
  const left = useUsesLeft(Boolean(reading))("brand-dna");
  const why = reasonText({ left, leo: true });

  // the steps tick over every 2.5 s from when the read started, so coming back mid-read lands on the right one
  useEffect(() => {
    if (!reading) return;
    const t = window.setInterval(redraw, 500);
    return () => window.clearInterval(t);
  }, [reading]);

  // ?website=review mirrors a waiting review; with nothing waiting (and nothing reading) the param goes (replace)
  const nav = useNavigate();
  const { search, hash } = useLocation();
  const review = new URLSearchParams(search).get("website");
  const want = waiting ? "review" : reading ? review : null;
  useEffect(() => {
    if (review === want) return;
    const p = withParam(new URLSearchParams(search), "website", want);
    nav({ search: p.toString() ? `?${p}` : "", hash }, { replace: true });
  }, [review, want, search, hash, nav]);

  const read = (e: React.FormEvent) => {
    e.preventDefault();
    void startRead(userId, address);
  };

  return (
    <section id="website" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="website">
      <div className="flex items-center gap-1">
        <h2 className="font-serif text-lg font-semibold">Website</h2>
        <InfoTip label="About Website">We read your home page and up to 4 more of your pages.</InfoTip>
      </div>
      {waiting ? (
        <Review userId={userId} brand={brand} setBrand={setBrand} waiting={waiting} />
      ) : reading ? (
        <ol className="space-y-2" aria-live="polite">
          {STEPS.map((s, i) => {
            const step = Math.min(Math.floor((Date.now() - reading.startedAt) / 2500), STEPS.length - 1);
            return (
              <li key={s} className={`flex items-center gap-2 text-sm ${i > step ? "text-muted-foreground" : ""}`}>
                {i < step ? <Check className="h-4 w-4 text-success" /> : i === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4" />}
                {s}
              </li>
            );
          })}
        </ol>
      ) : (
        <form onSubmit={read} className="space-y-2">
          {saved && <p className="text-sm text-muted-foreground">{saved}{brand.websiteReadAt ? `, read ${day(brand.websiteReadAt)}` : ""}</p>}
          <div className="flex gap-2">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="acme.sg" inputMode="url" autoCapitalize="none" autoCorrect="off" aria-label="Your website" className="min-w-0" />
            <Button type="submit" className={`shrink-0 gap-1.5 ${TOUCH}`} disabled={!address.trim() || left === 0}>
              <Globe className="h-4 w-4" /> {saved && hostOf(address) === saved ? "Read it again" : "Read it"}
            </Button>
          </div>
          <p><PriceChip feature="brand-dna" left={left} /></p>
          {why && <p className="text-xs text-destructive">{why}</p>}
          {failed && <p className="text-sm text-destructive" role="alert">{failed}</p>}
        </form>
      )}
    </section>
  );
}

function Value({ field, value }: { field: Field; value: string }) {
  if (!value) return <span className="text-sm text-muted-foreground">Not set</span>;
  if (field === "logo") return <img src={value} alt="" className="h-12 w-20 rounded-md border border-border/60 bg-white object-contain p-1" />;
  if (field === "colour")
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="h-6 w-6 rounded-full border border-border/60" style={{ background: value }} />
        {value}
      </span>
    );
  return <span className="line-clamp-4 break-words text-sm">{value}</span>;
}

function Review({ userId, brand, setBrand, waiting }: { userId: string; brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void; waiting: Waiting }) {
  const { toast } = useToast();
  const rows = reviewRows(currentOf(userId, brand), waiting.read);
  const open = rows.filter((r) => !r.same);
  const same = rows.filter((r) => r.same);
  const checked = same.length + open.filter((r) => waiting.picks[r.field]).length;
  const profile = activeProfile(userId);
  const brandName = profile.id === DEFAULT_PROFILE_ID ? brand.name.trim() || "your brand" : profile.name;

  const save = () => {
    saveRead(userId, brand, setBrand);
    toast({ title: `Saved to ${brandName}. Your next post uses it.` });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={checked} aria-valuemin={0} aria-valuemax={rows.length} aria-label="Fields checked">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((checked / rows.length) * 100)}%` }} />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{checked} of {rows.length} checked</span>
      </div>
      {waiting.read.pagesRead.length <= 1 && <p className="text-xs text-muted-foreground">Read the home page only. The other pages didn't open.</p>}
      <ul className="space-y-3">
        {open.map((r) => <Card key={r.field} userId={userId} row={r} pick={waiting.picks[r.field]} />)}
      </ul>
      {same.length > 0 && <p className="text-xs text-muted-foreground">Same as before: {same.map((r) => FIELD_TITLES[r.field]).join(", ")}</p>}
      <Competitors userId={userId} waiting={waiting} />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button className={TOUCH} onClick={save}>Save to {brandName}</Button>
        <Button variant="ghost" className={`text-muted-foreground ${TOUCH}`} onClick={() => discardRead(userId)}>Discard</Button>
      </div>
    </div>
  );
}

function Card({ userId, row, pick }: { userId: string; row: Row; pick?: Pick }) {
  const on = pick ?? row.start;
  const title = FIELD_TITLES[row.field];
  return (
    <li className="space-y-2 rounded-xl border border-border/60 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        {title}
        {pick && <Check className="h-3.5 w-3.5 text-success" aria-label="Checked" />}
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={title}>
        {(["keep", "use"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on === p}
            onClick={() => setPick(userId, row.field, p)}
            className={`min-h-11 space-y-1 rounded-lg border p-2.5 text-left transition-colors ${on === p ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/60 hover:bg-muted/40"}`}
          >
            <span className={`block text-xs font-semibold ${on === p ? "text-primary" : "text-muted-foreground"}`}>{p === "keep" ? "Keep mine" : "Use this"}</span>
            <Value field={row.field} value={p === "keep" ? row.mine : row.found} />
          </button>
        ))}
      </div>
    </li>
  );
}

/** Last in the review: competitors suggested from this read's facts, added through find-competitors' own list. */
function Competitors({ userId, waiting }: { userId: string; waiting: Waiting }) {
  const { toast } = useToast();
  const busy = isSuggesting();
  const left = useUsesLeft(busy)("competitor-suggest");
  const why = reasonText({ left, leo: true });
  const [error, setError] = useState("");
  const read = waiting.read;
  const state = loadCompetitors(userId);
  const hidden = new Set([...state.list.map((c) => nameKey(c.name)), ...state.dismissed]);
  // only an answer for this read, not one from the Competitors page before it
  const result = loadSuggestions(userId);
  const fresh = result && result.at >= read.readAt ? result : null;
  const shown = (fresh?.suggestions ?? []).filter((s) => !hidden.has(nameKey(s.name)));

  const suggest = async () => {
    setError("");
    const pressed = new Date().toISOString();
    await runSuggest(userId, { name: read.name, site: hostOf(read.url), sells: read.oneLiner, serves: read.audienceDetail, topics: read.topics });
    if ((loadSuggestions(userId)?.at ?? "") < pressed) setError(takeNotices().find((n) => n.title)?.title ?? "Couldn't suggest anything right now. Try again in a few minutes.");
  };
  const add = (s: Suggestion) => {
    const r = addCompetitor(userId, { ...fromSuggestion(s), source: "website" });
    if ("reason" in r) toast({ title: r.reason === "duplicate" ? `You already watch ${r.existing?.name ?? s.name}.` : `${MAX_COMPETITORS} of ${MAX_COMPETITORS}. Remove one to add another.` });
    else toast({ title: `Added ${r.c.name} to your competitors.` });
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-3">
      <p className="text-sm font-semibold">Competitors</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="outline" size="sm" className={`h-9 gap-1.5 ${TOUCH}`} onClick={suggest} disabled={busy || left === 0}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? "Suggesting..." : "Suggest competitors"}
        </Button>
        {!busy && <PriceChip feature="competitor-suggest" left={left} />}
      </div>
      {why && <p className="text-xs text-destructive">{why}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {fresh && !busy && (fresh.suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{fresh.note ?? "No clear competitors found. Add one you know."}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => (
            <li key={s.name} className="space-y-1.5 border-t border-border/60 pt-2 first:border-0 first:pt-0">
              <p className="text-sm"><span className="font-semibold">{s.name}</span>{s.site ? `, ${s.site}` : ""}. <span className="text-muted-foreground">{s.why}</span></p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className={`h-9 ${TOUCH}`} onClick={() => add(s)}>Add</Button>
                <Button size="sm" variant="ghost" className={`h-9 ${TOUCH}`} onClick={() => dismissName(userId, s.name)}>Not them</Button>
              </div>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
