// Original beside your version (docs/north-star/items/remix-compare.md), on Write and the carousel maker for a draft
// that carries a source (Leo's sign-ins only; the pages gate it and load this lazily). Phones get three tabs, large
// screens the original beside the draft. Everything comes from data on this device: no call when it opens or a tab
// changes. ?compare=original|more is the open tab (replace; your version is the default and left out).

import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import RemixButton from "@/components/remix/RemixButton";
import type { DraftEntry } from "@/lib/draftHistory";
import { COMPARE_TABS, links } from "@/lib/links";
import { kindLabel, numberParts, OriginalPane } from "@/components/OriginalPane";
import { fullText } from "@/lib/remix";
import { moreLikeThis, whatChanged } from "@/lib/remixCompare";
import type { RemixSource } from "@/lib/remixSource";
import { loadTeardown } from "@/lib/remixTeardown";
import { useUrlState } from "@/lib/urlState";

const TABS: { id: (typeof COMPARE_TABS)[number]; label: string }[] = [
  { id: "version", label: "Your version" },
  { id: "original", label: "Original" },
  { id: "more", label: "More like this" },
];

// formats pages reuse the pane: import it from @/components/OriginalPane, which carries none of the drops this file reads
export { OriginalPane };

const CHIP = "flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200";

function MoreCard({ source }: { source: RemixSource }) {
  const numbers = numberParts(source.numbers).slice(0, 2);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border/60 bg-background p-2">
      {source.cover ? (
        <img src={source.cover} alt="" loading="lazy" className="h-40 w-full rounded-lg bg-muted object-cover" />
      ) : (
        <p className="line-clamp-6 h-40 overflow-hidden break-words rounded-lg bg-muted/50 p-2 text-xs leading-relaxed text-foreground/85">
          {source.title || source.caption || kindLabel(source)}
        </p>
      )}
      {source.author && <p className="truncate text-[11px] font-semibold text-foreground">{source.author}</p>}
      {numbers.length > 0 && <p className="text-[11px] text-muted-foreground">{numbers.join("  ")}</p>}
      <div className="mt-auto pt-1">
        <RemixButton source={source}>{null}</RemixButton>
      </div>
    </div>
  );
}

export default function RemixCompare({
  userId,
  draft,
  draftText,
  layout = "side",
}: {
  userId: string;
  /** The open draft, or only the source while variations are still being written. */
  draft: Pick<DraftEntry, "source" | "remix">;
  /** The live text, so edits count. */
  draftText: string;
  /** side: Write's grid places the original left of the draft and More under both; top: one block above the slides. */
  layout?: "side" | "top";
}) {
  const source = draft.source;
  const [tab, setTab] = useUrlState("compare", "version", { allowed: COMPARE_TABS });
  const key = source?.key ?? "";
  const teardown = useMemo(() => (key ? loadTeardown(userId, key) : null), [userId, key]);
  // the source is the snapshot saved on the draft: never resolved again, so a rotated-out post still shows
  const more = useMemo(() => (source ? moreLikeThis(source, userId) : []), [userId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // the whole ad or post when this device still holds it (the dogfood's ad showed cut at "Which means replyi")
  const original = useMemo(() => (source ? fullText(source, userId) : ""), [userId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // counted on every render, so an edit shows on the next view; a 400-character caption makes it cheap
  const changed = whatChanged(draft, draftText, teardown);

  // A link or the draft line that opens a tab brings it into view: the tabs on a phone, that part on a large screen.
  const tabsRef = useRef<HTMLDivElement>(null);
  const originalRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (tab === "version") return;
    const wide = window.matchMedia?.("(min-width: 1024px)").matches;
    const el = wide ? (tab === "original" ? originalRef.current : moreRef.current) : tabsRef.current;
    const t = window.setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => window.clearTimeout(t);
  }, [tab]);

  if (!source) return null;
  const side = layout === "side";

  const parts = (
    <>
      <div ref={tabsRef} role="tablist" aria-label="Compare with the original" className="flex scroll-mt-20 gap-1 rounded-xl border border-border/60 bg-muted/20 p-1 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] flex-1 rounded-lg px-2 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* side: the column spans the draft's row, so the sticky original stops above More like this */}
      <div className={`${tab === "original" ? "" : "hidden"} min-w-0 lg:block ${side ? "lg:col-start-1 lg:row-start-1 lg:self-stretch" : ""}`}>
        <section
          ref={originalRef}
          id="compare-original"
          aria-label="Original"
          className={`scroll-mt-20 space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-card ${
            side ? "lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto" : ""
          }`}
        >
          <OriginalPane source={source} text={original} />
          <div className="space-y-2 border-t border-border/60 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">What changed</h3>
            {changed.madeWith && <p className="text-sm text-foreground">Made with: {changed.madeWith}</p>}
            {changed.hookShape && <p className="break-words text-sm text-foreground">Hook shape kept: {changed.hookShape}</p>}
            {changed.copied.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lines match the original.</p>
            ) : (
              <div className={CHIP}>
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">Shares words with the original</p>
                  <ul className="space-y-0.5">
                    {changed.copied.map((l) => (
                      <li key={l} className="break-words font-mono text-[10px]">
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {changed.claim && (
              <div className={CHIP}>
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" aria-hidden />
                <p className="font-semibold">Uses a figure or claim from the original. Check it or take it out.</p>
              </div>
            )}
          </div>
        </section>
      </div>
      <section
        ref={moreRef}
        aria-label="More like this"
        className={`${tab === "more" ? "" : "hidden"} min-w-0 scroll-mt-20 space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-card lg:block ${
          side ? "lg:col-span-2 lg:row-start-2" : ""
        }`}
      >
        {/* on a phone the selected tab already says it */}
        <h3 className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">More like this</h3>
        {more.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {more.map((s) => (
              <MoreCard key={s.key} source={s} />
            ))}
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            Nothing similar in your library yet.
            <Link to={links.swipe()} className="inline-flex items-center font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
              Browse top posts
            </Link>
          </p>
        )}
      </section>
    </>
  );

  // side: the parts are items of the page's own grid; top: one block of its own above the slides
  return side ? parts : <div className="space-y-3 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0">{parts}</div>;
}
