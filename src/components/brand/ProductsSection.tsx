// What you sell (brand-products, wave 3). After offers on /brand, #products, Leo only (BrandPage mounts it).
// The list of products or services (src/lib/products.ts), a scan of the brand's site that runs outside React
// (src/lib/productScan.ts) and waits on this device for review at ?products=review, and the editor at ?product=<id>.
// Each item opens Write with its brief or the AI panel's product template with its first picture in the slot.

import { useEffect, useReducer, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, Loader2, Package } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import ProductEditor, { PictureTile } from "@/components/brand/ProductEditor";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import type { CarouselBrand } from "@/lib/carousel";
import { links } from "@/lib/links";
import { reasonText } from "@/lib/prices";
import {
  addFromScan, addPlan, discardScan, fetchReviewPictures, hostOf, loadWaiting, onProducts, PICTURE_FAILED, pictureState, reviewPictureId,
  reviewRows, scanFailedLine, scanningNow, setTick, startScan, type ReviewRow, type Waiting,
} from "@/lib/productScan";
import { kindOf, loadProducts, MAX_PRODUCTS, type Product, productBrief, productLabel, PRODUCTS_CHANGED, type ProductKind, saveProducts } from "@/lib/products";
import { useGoneItem, useUrlItem, withParam } from "@/lib/urlState";

const STEPS = ["Opening the site", "Finding product and service pages", "Reading up to 5 pages", "Listing what you sell", "Checking each one"];
const STEP_MS = 4000;
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const FULL = `${MAX_PRODUCTS} is the most a brand can keep. Remove one to add another.`;
const NAMED_TIP = "Posts describe it in general terms, like 'a whole life plan'.";
// the product template's id in ai-video/templates.ts: one product photo, no person
const VIDEO_TEMPLATE = "product-commercial-shotlist";

function NamedChip() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
      Names an insurer product <InfoTip label="About named products" className="h-4 w-4">{NAMED_TIP}</InfoTip>
    </span>
  );
}

/** setBrand goes through BrandPage's own save, so two writers never race on the kit (phase4-build-brief.md, decision 14). */
export default function ProductsSection({ userId, brand }: { userId: string; brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = onProducts(redraw);
    window.addEventListener(PRODUCTS_CHANGED, redraw);
    return () => {
      off();
      window.removeEventListener(PRODUCTS_CHANGED, redraw);
    };
  }, []);
  const list = loadProducts(userId);
  const kind = kindOf(list);
  const scanning = scanningNow(userId);
  const failed = scanFailedLine(userId);
  const waiting = loadWaiting(userId);
  const website = brand.website ? hostOf(brand.website) : "";
  const [address, setAddress] = useState(() => scanning?.address || (list.site ? hostOf(list.site) : ""));
  const left = useUsesLeft(Boolean(scanning))("brand-products");
  const why = reasonText({ left, leo: true });
  const full = list.items.length >= MAX_PRODUCTS;

  // the steps tick over from when the scan started, so coming back mid-scan lands on the right one
  useEffect(() => {
    if (!scanning) return;
    const t = window.setInterval(redraw, 500);
    return () => window.clearInterval(t);
  }, [scanning]);
  // a review reopened after a reload carries on fetching its pictures
  const waitingAt = waiting?.scan.readAt;
  useEffect(() => {
    if (waitingAt) fetchReviewPictures(userId);
  }, [userId, waitingAt]);

  // ?products=review mirrors a waiting review; with nothing waiting (and nothing scanning) the param goes (replace)
  const nav = useNavigate();
  const { search, hash } = useLocation();
  const review = new URLSearchParams(search).get("products");
  const want = waiting ? "review" : scanning ? review : null;
  useEffect(() => {
    if (review === want) return;
    const p = withParam(new URLSearchParams(search), "products", want);
    nav({ search: p.toString() ? `?${p}` : "", hash }, { replace: true });
  }, [review, want, search, hash, nav]);

  // ?product=<id> opens the editor (push); new opens a blank one; an id that is gone says so and leaves
  const [editing, openEditor, closeEditor] = useUrlItem("product");
  useGoneItem("product", editing ? editing === "new" || list.items.some((p) => p.id === editing) : undefined, "product");
  const open = editing && (editing === "new" || list.items.some((p) => p.id === editing)) ? editing : null;

  const setKind = (k: ProductKind) => saveProducts(userId, { ...loadProducts(userId), kind: k });
  const scan = (e?: React.FormEvent) => {
    e?.preventDefault();
    void startScan(userId, website || address);
  };
  const noun = kind === "service" ? "services" : "products";

  return (
    <section id="products" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="products">
      <div className="flex items-center gap-1">
        <h2 className="font-serif text-lg font-semibold">Products and services</h2>
        <InfoTip label="About products and services">Remixes put your real offer in posts. The first picture is used first.</InfoTip>
      </div>
      {waiting ? (
        <Review userId={userId} list={list.items} waiting={waiting} onAdd={() => openEditor("new")} />
      ) : scanning ? (
        <ol className="space-y-2" aria-live="polite">
          {STEPS.map((s, i) => {
            const step = Math.min(Math.floor((Date.now() - scanning.startedAt) / STEP_MS), STEPS.length - 1);
            return (
              <li key={s} className={`flex items-center gap-2 text-sm ${i > step ? "text-muted-foreground" : ""}`}>
                {i < step ? <Check className="h-4 w-4 text-success" /> : i === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4" />}
                {s}
              </li>
            );
          })}
        </ol>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span id="products-kind" className="text-sm font-medium">What you sell</span>
            <div role="radiogroup" aria-labelledby="products-kind" className="flex gap-1.5">
              {([["products", "Products"], ["service", "A service"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors ${TOUCH} ${kind === k ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
            {list.items.length > 0 && <span className="ml-auto text-xs font-semibold text-muted-foreground">{list.items.length} of {MAX_PRODUCTS} {noun}</span>}
          </div>
          {list.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {list.items.map((p) => <Item key={p.id} userId={userId} p={p} onEdit={() => openEditor(p.id)} />)}
            </ul>
          )}
          <div className="space-y-2 border-t border-border/60 pt-3">
            {website ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button className={TOUCH} onClick={() => scan()} disabled={left === 0}>Find them on my website</Button>
                <Button variant="outline" className={TOUCH} onClick={() => openEditor("new")} disabled={full}>Add one</Button>
              </div>
            ) : (
              <>
                <Button className={TOUCH} onClick={() => openEditor("new")} disabled={full}>Add one</Button>
                <form onSubmit={scan} className="flex flex-wrap gap-2">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="acme.sg" inputMode="url" autoCapitalize="none" autoCorrect="off" aria-label="Your website" className="min-w-[10rem] flex-1" />
                  <Button type="submit" variant="outline" className={`shrink-0 ${TOUCH}`} disabled={!address.trim() || left === 0}>Find them on my website</Button>
                </form>
              </>
            )}
            <p><PriceChip feature="brand-products" left={left} /></p>
            {why && <p className="text-xs text-destructive">{why}</p>}
            {full && <p className="text-xs text-muted-foreground">{FULL}</p>}
            {failed && <p className="text-sm text-destructive" role="alert">{failed}</p>}
          </div>
        </>
      )}
      {open && <ProductEditor key={open} userId={userId} id={open} onClose={closeEditor} />}
    </section>
  );
}

/** One saved product: its picture, words and chip, and what to make with it. */
function Item({ userId, p, onEdit }: { userId: string; p: Product; onEdit: () => void }) {
  const failed = !!p.pictures[0] && pictureState(p.pictures[0]) === "failed";
  const setUse = (use: boolean) => {
    const now = loadProducts(userId);
    saveProducts(userId, { ...now, items: now.items.map((x) => (x.id === p.id ? { ...x, use } : x)) });
  };
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      {p.pictures[0] ? <PictureTile userId={userId} pictureKey={p.pictures[0]} source={p.sources[0]} name={p.name} /> : <Blank />}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold">{p.name}{p.price && <span className="font-normal text-muted-foreground">, {p.price}</span>}</p>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            Use in posts
            <button type="button" role="switch" aria-checked={p.use} aria-label={`Use ${p.name} in posts`} onClick={() => setUse(!p.use)} className={`flex h-9 items-center ${TOUCH}`}>
              <span aria-hidden className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${p.use ? "bg-primary" : "bg-muted-foreground/30"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${p.use ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
            </button>
          </label>
        </div>
        {(p.what || p.forWho) && <p className="line-clamp-2 text-xs text-muted-foreground">{[p.what, p.forWho && `For ${p.forWho.replace(/^for\s+/i, "")}`].filter(Boolean).join(" ")}</p>}
        {p.namedProduct && <NamedChip />}
        {failed && <p className="text-xs text-muted-foreground">{PICTURE_FAILED}</p>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="ghost" className={`h-9 px-2.5 ${TOUCH}`} onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="outline" className={`h-9 ${TOUCH}`} asChild>
            <Link to={links.generate({ pillar: "topic", detail: productLabel(p), ctx: productBrief(p) })}>Write a post about it</Link>
          </Button>
          <Button size="sm" variant="outline" className={`h-9 ${TOUCH}`} asChild>
            <Link to={links.edit({ panel: ["ai"], kind: "template", template: VIDEO_TEMPLATE, product: p.id })}>Use in a video</Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

const Blank = () => (
  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground" aria-hidden>
    <Package className="h-5 w-5" />
  </span>
);

/** The scan waiting on this device: tick what to add, then Add or Discard. */
function Review({ userId, list, waiting, onAdd }: { userId: string; list: Product[]; waiting: Waiting; onAdd: () => void }) {
  const { toast } = useToast();
  const rows = reviewRows(list, waiting);
  const plan = addPlan(list, rows);
  const host = hostOf(waiting.scan.site);
  const pages = waiting.scan.pagesRead.map((u) => {
    try {
      const x = new URL(u);
      return x.pathname === "/" ? x.host.replace(/^www\./, "") : x.pathname;
    } catch {
      return u;
    }
  });
  const add = () => {
    const r = addFromScan(userId);
    if (!r) return;
    if ("error" in r) return toast({ title: r.error, variant: "destructive" });
    toast({ title: `${r.added} added. Remixes will use ${r.added === 1 ? "it" : "them"}.` });
  };
  const read = pages.length > 0 && <p className="text-xs text-muted-foreground">Read {pages.join(", ")}</p>;

  if (rows.length === 0)
    return (
      <div className="space-y-3">
        <p className="text-sm">No products or services found on {host}. Add one and remixes will use it.</p>
        {read}
        <div className="flex flex-wrap items-center gap-2">
          <Button className={TOUCH} onClick={() => (discardScan(userId), onAdd())} disabled={list.length >= MAX_PRODUCTS}>Add one</Button>
          <Button variant="ghost" className={`text-muted-foreground ${TOUCH}`} onClick={() => discardScan(userId)}>Close</Button>
        </div>
      </div>
    );

  const groups: [ReviewRow["group"], string | null][] = [["yours", null], ["maybe", "Maybe not yours"], ["unsorted", "Check each one: we couldn't sort these."]];
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Found {rows.length} on {host}. Untick any that aren't yours.</p>
      {read}
      {groups.map(([g, title]) => {
        const these = rows.filter((r) => r.group === g);
        if (these.length === 0) return null;
        return (
          <div key={g} className="space-y-2">
            {title && <p className="pt-1 text-xs font-semibold text-muted-foreground">{title}</p>}
            <ul className="space-y-2">{these.map((r) => <FoundRow key={r.i} userId={userId} r={r} waiting={waiting} />)}</ul>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button className={TOUCH} onClick={add} disabled={plan.count === 0 || !!plan.line}>Add {plan.count}</Button>
        <Button variant="ghost" className={`text-muted-foreground ${TOUCH}`} onClick={() => discardScan(userId)}>Discard</Button>
      </div>
      {plan.line && <p className="text-xs text-destructive">{plan.line}</p>}
    </div>
  );
}

function FoundRow({ userId, r, waiting }: { userId: string; r: ReviewRow; waiting: Waiting }) {
  const url = r.row.picture;
  const got = url ? waiting.pics[url] : undefined;
  const state = url ? pictureState(reviewPictureId(waiting, url)) : undefined;
  const id = `found-${r.i}`;
  return (
    <li className={`flex gap-3 rounded-xl border border-border/60 p-2.5 ${r.added ? "opacity-60" : ""}`}>
      <input id={id} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={r.ticked} disabled={r.added} onChange={(e) => setTick(userId, r.i, e.target.checked)} />
      {got && got !== "failed" ? (
        <PictureTile userId={userId} pictureKey={got.key} name={r.row.name} className="h-12 w-12" fetchMissing={false} />
      ) : url && got !== "failed" && state !== "failed" ? (
        <span className="block h-12 w-12 shrink-0 animate-pulse rounded-lg border border-border/60 bg-muted" aria-label={`Getting the picture of ${r.row.name}`} />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground" aria-hidden><Package className="h-4 w-4" /></span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={id} className="block cursor-pointer break-words text-sm font-semibold">{r.row.name}{r.row.price && <span className="font-normal text-muted-foreground">, {r.row.price}</span>}</label>
        {r.row.what && <p className="line-clamp-2 text-xs text-muted-foreground">{r.row.what}</p>}
        <div className="flex flex-wrap gap-1.5">
          {r.added && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Already added</span>}
          {r.named && <NamedChip />}
        </div>
        {url && (got === "failed" || state === "failed") && <p className="text-xs text-muted-foreground">{PICTURE_FAILED}</p>}
      </div>
    </li>
  );
}
