// The agent's Make picker (Holo's Create content picker, H11; Leo 13 Nov: every maker folded into the agent): a sheet
// from the right, full height on phones, with the type tabs (All, Words, Slides and pictures, Video, Static ads), a
// search box and a card per make skill: its example (the poster, a video format's clip playing while on screen), its
// kind, name, one line and price. Tab and search live in the address (?make=open&kind=video&q=clay, replace); a card
// starts its skill (?skill=<id>). Nothing is read from a server and nothing runs until a question card or a priced card.

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import FormatPreview from "@/components/make/FormatPreview";
import PriceChip from "@/components/PriceChip";
import { Input } from "@/components/ui/input";
import { KIND_TABS, SKILLS, findSkills, type KindSlug, type MakeSkill } from "@/lib/makeSkills";
import { cn } from "@/lib/utils";

export default function MakePicker({ open, kind, q, onKind, onSearch, onPick, onClose }: {
  open: boolean;
  kind: KindSlug;
  q: string;
  onKind: (k: KindSlug) => void;
  onSearch: (q: string) => void;
  onPick: (s: MakeSkill) => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  const shown = findSkills(SKILLS, kind, q);
  return (
    <dialog
      ref={sheet}
      aria-label="Make"
      onClose={() => open && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-full max-w-none border-l border-border/70 bg-background p-0 shadow-xl backdrop:bg-foreground/40 sm:w-[min(760px,92vw)]"
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="space-y-3 border-b border-border/60 px-4 pb-3 pt-4 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">Make</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div role="tablist" aria-label="Kinds" className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
              {KIND_TABS.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  role="tab"
                  aria-selected={kind === t.slug}
                  onClick={() => onKind(t.slug)}
                  className={cn(
                    "min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11",
                    kind === t.slug ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="relative block">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search formats" aria-label="Search formats" className="h-11 rounded-full pl-9" />
            </label>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {shown.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {shown.map((s) => (
                  <li key={s.id}>
                    <SkillCard s={s} onPick={() => onPick(s)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No format matches "{q.trim()}".</p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

function SkillCard({ s, onPick }: { s: MakeSkill; onPick: () => void }) {
  const [active, setActive] = useState(false);
  const Icon = s.icon;
  const tile = (
    <span className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      <Icon className="h-8 w-8" aria-hidden />
    </span>
  );
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      className="flex h-full w-full flex-col gap-2 rounded-2xl bg-card p-1.5 text-left shadow-card ring-1 ring-border/60 transition-shadow hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
        {s.poster ? <FormatPreview slug={s.poster.slug} video={s.poster.video} poster={s.poster.src} active={active} fallback={tile} /> : tile}
      </span>
      <span className="min-w-0 space-y-1 px-1 pb-1">
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s.kind}</span>
        <span className="block text-sm font-semibold leading-snug text-foreground">{s.name}</span>
        <span className="line-clamp-2 block text-xs text-muted-foreground">{s.blurb}</span>
        {s.price && <span className="block">{s.price() === null ? <span className="text-[11px] text-muted-foreground">No AI cost</span> : <PriceChip price={s.price()} left={null} />}</span>}
      </span>
    </button>
  );
}
