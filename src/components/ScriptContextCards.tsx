// The script desk's Me and Product as two cards (wave 1, Leo only): Me on /voice, Product on /brand.
// Fields save as they are typed (src/lib/scriptContext.ts, synced per brand). Re-script swaps the original
// creator's details for these, and a fact they don't give becomes a [placeholder], never an invented one.

import { useState } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { loadPositioning } from "@/lib/positioning";
import { loadProducts, mainProduct } from "@/lib/products";
import { FIELD_MAX, loadScriptContext, saveScriptContext, type MeFields, type ProductFields } from "@/lib/scriptContext";

type Field<T> = { k: keyof T & string; label: string; placeholder: string; long?: boolean; hint?: string };

const ME_FIELDS: Field<MeFields>[] = [
  { k: "name", label: "Your name", placeholder: "Priya Nair" },
  { k: "handle", label: "Your handle", placeholder: "@priyabooks" },
  { k: "what", label: "What you do", placeholder: "I run Counterbook, bookkeeping for cafes." },
  { k: "niche", label: "Your niche", placeholder: "Money habits for cafe owners" },
  { k: "story", label: "Your story", placeholder: "Kept the books for my parents' cafe for ten years, then opened my own firm.", long: true },
  { k: "results", label: "Results and proof", placeholder: "48 cafes on monthly plans\n12K followers on Instagram", long: true, hint: "One a line, only true ones: they are the only claims written for you." },
  { k: "beliefs", label: "What you believe", placeholder: "Monthly books beat a yearly scramble", long: true, hint: "One a line." },
];

const PRODUCT_FIELDS: Field<ProductFields>[] = [
  { k: "name", label: "Product name", placeholder: "Counterbook" },
  { k: "website", label: "Website", placeholder: "counterbook.co" },
  { k: "what", label: "What it is", placeholder: "Monthly bookkeeping for cafes" },
  { k: "who", label: "Who it's for", placeholder: "Independent cafe owners" },
  { k: "problem", label: "The problem it solves", placeholder: "A shoebox of receipts every tax season", long: true },
  { k: "how", label: "How it works", placeholder: "Snap each receipt\nBooks close by the 5th", long: true, hint: "One a line." },
  { k: "gets", label: "What customers get", placeholder: "Books that are always up to date", long: true },
  { k: "proof", label: "Proof", placeholder: "48 cafes, books closed by the 5th every month", long: true },
  { k: "replaces", label: "What it replaces", placeholder: "A yearly rush with the accountant" },
  { k: "price", label: "Price and offer", placeholder: "$120 a month, first month free" },
  { k: "cta", label: "Call to action", placeholder: "Comment BOOKS for the price list" },
];

function ContextCard<T extends MeFields | ProductFields>(p: {
  userId: string;
  side: "me" | "product";
  title: string;
  tip: string;
  fields: Field<T>[];
  /** What an empty field stands in for (the brand kit's main product, the positioning's topics): shown in its place. */
  fallback?: Partial<Record<keyof T, string>>;
}) {
  const [f, setF] = useState<T>(() => loadScriptContext(p.userId)[p.side] as T);
  const [state, setState] = useState<"" | "saved" | "full">("");
  const set = (patch: Partial<T>) => {
    const next = { ...f, ...patch };
    setF(next);
    setState(saveScriptContext(p.userId, { [p.side]: next }) ? "saved" : "full");
  };
  const id = (k: string) => `sc-${p.side}-${k}`;
  return (
    <section aria-labelledby={id("title")} className="space-y-4 rounded-xl border border-border/60 p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <h2 id={id("title")} className="font-serif text-lg font-semibold">{p.title}</h2>
          <InfoTip label={`About ${p.title}`}>{p.tip}</InfoTip>
        </div>
        <span aria-live="polite" className="flex items-center gap-1 text-xs font-medium text-success">
          {state === "saved" && <><CheckIcon className="h-3.5 w-3.5" /> Saved</>}
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm [@media(pointer:coarse)]:min-h-11">
          <input type="checkbox" role="switch" checked={f.on} onChange={(e) => set({ on: e.target.checked } as Partial<T>)} className="h-4 w-4 accent-primary" />
          Use in scripts
        </label>
      </div>
      {state === "full" && <p role="alert" className="text-sm text-destructive">This device is out of room, so that wasn't saved.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {p.fields.map((x) => (
          <div key={x.k} className={`space-y-1.5 ${x.long ? "sm:col-span-2" : ""}`}>
            <Label htmlFor={id(x.k)}>{x.label}</Label>
            {x.long ? (
              <Textarea id={id(x.k)} rows={3} maxLength={FIELD_MAX} value={String(f[x.k] ?? "")} placeholder={p.fallback?.[x.k] || x.placeholder} onChange={(e) => set({ [x.k]: e.target.value } as Partial<T>)} />
            ) : (
              <Input id={id(x.k)} maxLength={300} value={String(f[x.k] ?? "")} placeholder={p.fallback?.[x.k] || x.placeholder} onChange={(e) => set({ [x.k]: e.target.value } as Partial<T>)} />
            )}
            {x.hint && <p className="text-xs text-muted-foreground">{x.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function MeCard({ userId }: { userId: string }) {
  const topics = (loadPositioning(userId)?.topics ?? []).join(", ");
  return (
    <ContextCard<MeFields> userId={userId} side="me" title="Me, for scripts" tip="Re-script swaps the original creator's details for these." fields={ME_FIELDS}
      fallback={topics ? { niche: topics } : undefined} />
  );
}

export function ProductCard({ userId }: { userId: string }) {
  const kit = mainProduct(loadProducts(userId).items);
  return (
    <ContextCard<ProductFields> userId={userId} side="product" title="Product, for scripts" tip="Empty fields use your main product above." fields={PRODUCT_FIELDS}
      fallback={kit ? { name: kit.name, what: kit.what, who: kit.forWho, price: kit.price ?? "", website: kit.url ?? "" } : undefined} />
  );
}
