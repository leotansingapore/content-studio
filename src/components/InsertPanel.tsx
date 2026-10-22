// Write's Insert panel (Leo only, edit-snippets): your saved lines, hashtag sets, endings, hooks and post
// templates, the 21 hook formulas and five starter endings, put into the post being edited. Opens from
// ?panel=insert (pushed) on the tab in ?kind= (line left out). Brand values fill in at insert time; a hashtag set
// that would go over the brand kit's or the platform's limit asks first. Free: nothing leaves the device.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Snippets from "@/components/engage/Snippets";
import { hashtagMax, HASHTAG_MAX } from "@/lib/brandRules";
import type { CarouselBrand } from "@/lib/carousel";
import { HOOK_BANK } from "@/lib/hookBank";
import { HOOK_FORMULAS, provenFormulas, type HookFormula } from "@/lib/hookFormulas";
import { links, type BrandSection } from "@/lib/links";
import { BRAND_VALUE_NAME, fillVariables, KIND_NAME, loadSnippets, ofKind, type BrandValue, type SnippetKind } from "@/lib/replySnippets";
import { formulaTemplate, hashtagAsk, insertHashtagMax, insertPlace, startersFor, type Caret, type HashtagAsk } from "@/lib/snippetInsert";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { capHashtags } from "../../supabase/functions/video-assist/captions.ts";

type InsertKind = Exclude<SnippetKind, "reply">;
const TABS: { kind: InsertKind; label: string }[] = [
  { kind: "line", label: "Lines" },
  { kind: "hashtags", label: "Hashtags" },
  { kind: "ending", label: "Endings" },
  { kind: "hook", label: "Hooks" },
  { kind: "post", label: "Post templates" },
];
const KINDS = TABS.map((t) => t.kind);
const BRAND_SECTION: Record<BrandValue, BrandSection> = { name: "you", handle: "you", role: "you", offer: "offers", offer_link: "offers", whatsapp: "dm-links", instagram: "dm-links" };
// Each formula's best real line from the weekly hook bank, shown as evidence only (empty until the first drop)
const PROVEN = provenFormulas(HOOK_BANK, HOOK_FORMULAS.length);

const TOUCH = "[@media(pointer:coarse)]:h-11";
const pill = (on: boolean) =>
  `flex h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors sm:h-9 ${TOUCH} ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
  }`;
const chip = `h-11 max-w-full truncate rounded-full border border-border/60 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 sm:h-8 ${TOUCH}`;
const card = "flex min-h-11 w-full flex-col items-start rounded-lg border border-border/60 bg-background px-3 py-1.5 text-left transition-colors hover:border-primary/40";
const heading = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

/** "Insert" in Write's Rewrite row: opens ?panel=insert (pushed), and closes it with its tab. */
export function InsertButton({ disabled }: { disabled?: boolean }) {
  const [panel, openPanel] = useUrlItem("panel");
  const update = useUrlUpdate();
  const open = panel === "insert";
  return (
    <button type="button" disabled={disabled} aria-expanded={open} onClick={() => (open ? update({ panel: null, kind: null }) : openPanel("insert"))} className={`gap-1 disabled:opacity-50 ${pill(open)}`}>
      <Plus className="h-3.5 w-3.5" /> Insert
    </button>
  );
}

function Chips({ items, label, onPick }: { items: { id: string; name: string; text: string }[]; label: string; onPick: (text: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((s) => (
        <li key={s.id} className="min-w-0 max-w-full">
          <button type="button" onClick={() => onPick(s.text)} title={s.text} className={chip}>
            {s.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Formula({ f, onPick, children }: { f: HookFormula; onPick: (text: string) => void; children?: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(formulaTemplate(f))} title={f.example} className={card}>
        <span className="text-xs font-semibold text-foreground">{f.name}</span>
        <span className="text-[11px] text-muted-foreground">Trap: {f.trap}</span>
      </button>
      {children}
    </li>
  );
}

export default function InsertPanel({
  userId,
  draft,
  platform,
  ctaType,
  brand,
  caret,
  onInsert,
}: {
  userId: string;
  /** The post as it is in the editor. */
  draft: string;
  platform: string;
  /** The draft's call to action: its starter ending comes first. */
  ctaType: string;
  brand: CarouselBrand | null;
  /** The editor's selection when the cursor was placed in it. */
  caret: () => Caret | undefined;
  /** The new post and where the cursor goes; Write keeps the old one for Undo. */
  onInsert: (text: string, caret: number) => void;
}) {
  const [kind, setKind] = useUrlState<InsertKind>("kind", "line", { allowed: KINDS });
  const update = useUrlUpdate();
  const [list, setList] = useState(() => loadSnippets(userId));
  const [ask, setAsk] = useState<{ text: string; missing: BrandValue[]; q: HashtagAsk } | null>(null);
  const [missing, setMissing] = useState<BrandValue[]>([]);
  const [manage, setManage] = useState<"new" | "manage" | null>(null);
  const accounts = useMemo(() => loadSocialAccounts(userId), [userId]);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const reload = () => setList(loadSnippets(userId));
    window.addEventListener("content-studio-snippets-changed", reload);
    return () => window.removeEventListener("content-studio-snippets-changed", reload);
  }, [userId]);

  const close = () => update({ panel: null, kind: null });
  const pickTab = (k: InsertKind) => {
    setKind(k);
    setAsk(null);
    setMissing([]);
    setManage(null);
  };
  const finish = (text: string, miss: BrandValue[]) => {
    const r = insertPlace(kind, draft, text, caret());
    onInsert(r.text, r.caret);
    setAsk(null);
    // a missing brand value keeps the panel open on the line that says where to add it
    if (miss.length) setMissing(miss);
    else close();
  };
  const pick = (raw: string) => {
    const filled = fillVariables(raw, brand, accounts);
    const q = kind === "hashtags" ? hashtagAsk(filled.text, draft, insertHashtagMax(hashtagMax(brand, platform), platform)) : null;
    if (q) {
      setMissing([]);
      return setAsk({ text: filled.text, missing: filled.missing, q });
    }
    finish(filled.text, filled.missing);
  };

  const mine = ofKind(list, kind);
  const name = KIND_NAME[kind];
  const policy = brand?.hashtagPolicy ? HASHTAG_MAX[brand.hashtagPolicy] : undefined;
  // the platform is named when its limit, not the kit's, is the one that holds (as Write's counter words LinkedIn's)
  const limit = !ask ? ""
    : policy === ask.q.max ? `Your Brand kit allows ${ask.q.max} hashtags`
    : platform === "linkedin" ? `LinkedIn works best with ${ask.q.max} hashtags or fewer`
    : `${platform === "tiktok" ? "TikTok" : "Instagram"} allows ${ask.q.max} hashtags`;

  return (
    <section ref={root} id="insert-panel" aria-label="Insert" data-testid="insert-panel" className="mt-1.5 scroll-mt-24 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div role="tablist" aria-label="What to insert" className="flex min-w-0 flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.kind} type="button" role="tab" aria-selected={kind === t.kind} onClick={() => pickTab(t.kind)} className={pill(kind === t.kind)}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close insert"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {ask && (
        <div role="alert" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
          <p className="text-xs text-foreground">
            {ask.q.max === 0
              ? "Your Brand kit says no hashtags."
              : `${limit}. This set has ${ask.q.n}${ask.q.have ? ` and your post has ${ask.q.have}` : ""}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {ask.q.keep > 0 && (
              <Button size="sm" onClick={() => finish(capHashtags(ask.text, ask.q.keep), ask.missing)} className="h-11 sm:h-9">
                Insert the first {ask.q.keep}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => finish(ask.text, ask.missing)} className="h-11 sm:h-9">
              {ask.q.max === 0 ? "Insert anyway" : "Insert all"}
            </Button>
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <ul role="status" className="space-y-1">
          {missing.map((m) => (
            <li key={m}>
              <Link to={links.brand({ section: BRAND_SECTION[m] })} className="inline-flex items-center text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                Add your {BRAND_VALUE_NAME[m]} in Brand kit
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div role="tabpanel" aria-label={TABS.find((t) => t.kind === kind)!.label} className="space-y-3">
        {kind === "hook" ? (
          <>
            {mine.length > 0 && (
              <div className="space-y-1.5">
                <h3 className={heading}>Your hooks</h3>
                <Chips items={mine} label="Your hooks" onPick={pick} />
              </div>
            )}
            <div className="space-y-1.5">
              <h3 className={heading}>Formulas</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {HOOK_FORMULAS.map((f) => (
                  <Formula key={f.id} f={f} onPick={pick} />
                ))}
              </ul>
            </div>
            {PROVEN.length > 0 && (
              <div className="space-y-1.5">
                <h3 className={heading}>Proven hooks</h3>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {PROVEN.map(({ formula, line }) => (
                    <Formula key={formula.id} f={formula} onPick={pick}>
                      <p className="mt-1 px-1 text-[11px] italic text-muted-foreground [overflow-wrap:anywhere]">
                        "{line.text}" {line.from}
                      </p>
                    </Formula>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : kind === "ending" ? (
          <>
            {mine.length > 0 && (
              <div className="space-y-1.5">
                <h3 className={heading}>Your endings</h3>
                <Chips items={mine} label="Your endings" onPick={pick} />
              </div>
            )}
            <div className="space-y-1.5">
              <h3 className={heading}>Starters</h3>
              <ul className="flex flex-wrap gap-1.5" aria-label="Starters">
                {startersFor(ctaType).map((e) => (
                  <li key={e.cta} className="min-w-0 max-w-full">
                    <button type="button" onClick={() => pick(e.text)} title={e.text} className={chip}>
                      {e.name}
                      {e.cta === ctaType && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Matches your ask</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : mine.length ? (
          <Chips items={mine} label={`Your ${name.many}`} onPick={pick} />
        ) : (
          <p className="text-xs text-muted-foreground">No saved {name.many} yet.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" aria-expanded={manage === "new"} onClick={() => setManage(manage === "new" ? null : "new")} className="h-11 gap-1 sm:h-9">
          <Plus className="h-3.5 w-3.5" /> New {name.one}
        </Button>
        <Button type="button" size="sm" variant="ghost" aria-expanded={manage === "manage"} onClick={() => setManage(manage === "manage" ? null : "manage")} className="h-11 sm:h-9">
          Manage
        </Button>
      </div>
      {manage && <Snippets key={`${kind}-${manage}`} userId={userId} kind={kind} focusName={manage === "new"} />}
    </section>
  );
}
