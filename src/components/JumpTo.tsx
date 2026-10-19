import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { jumpList, loadRecent, searchJump, type JumpItem } from "@/lib/jumpTo";

/** "⌘K" on Apple keyboards, "Ctrl K" elsewhere. */
export const jumpShortcut = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";

/**
 * Jump to any page or start something new by typing. A native modal dialog, like the More sheet:
 * it traps focus, closes on Escape and hands focus back to whatever opened it.
 */
export default function JumpTo({ open, onClose, email }: { open: boolean; onClose: () => void; email: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      d.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Recent pages are read each time it opens, so the list shows where you have just been.
  const items = useMemo(
    () => (open ? searchJump(jumpList(email, loadRecent(), pathname), query) : []),
    [open, email, pathname, query],
  );
  const current = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`#jump-opt-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const go = (item: JumpItem) => {
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % items.length);
    } else if (e.key === "Enter" && items[current]) {
      e.preventDefault();
      go(items[current]);
    }
  };

  // The full list is grouped under headings (Recent, Create, then each section). Search results are
  // ranked, so sections interleave: they stay one flat list with the section beside each row.
  const searching = query.trim() !== "";
  const groups: { name: string; rows: { item: JumpItem; i: number }[] }[] = [];
  items.forEach((item, i) => {
    const last = groups[groups.length - 1];
    if (searching) {
      if (last) last.rows.push({ item, i });
      else groups.push({ name: "Results", rows: [{ item, i }] });
    } else if (last && last.name === item.group) last.rows.push({ item, i });
    else groups.push({ name: item.group, rows: [{ item, i }] });
  });

  return (
    <dialog
      ref={ref}
      aria-label="Jump to"
      data-nav
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto mt-[10vh] w-[min(36rem,calc(100vw-2rem))] max-w-none rounded-2xl border border-border/70 bg-background p-0 shadow-xl backdrop:bg-foreground/40"
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="jump-list"
          aria-activedescendant={items.length ? `jump-opt-${current}` : undefined}
          aria-autocomplete="list"
          placeholder="Jump to a page or start something"
          className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm [@media(pointer:coarse)]:text-base"
        />
      </div>
      <div ref={listRef} id="jump-list" role="listbox" aria-label="Pages and actions" className="max-h-[60vh] overflow-y-auto p-2">
        {groups.map((g, gi) => (
          <div key={`${gi}-${g.name}`} role="group" aria-labelledby={`jump-g-${gi}`} className="pb-1">
            <p id={`jump-g-${gi}`} className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {g.name}
            </p>
            {g.rows.map(({ item, i }) => (
              <div
                key={`${i}-${item.to}`}
                id={`jump-opt-${i}`}
                role="option"
                aria-selected={i === current}
                onClick={() => go(item)}
                onMouseMove={() => i !== current && setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm ${
                  i === current ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {searching && <span className="shrink-0 text-[11px] text-muted-foreground">{item.group}</span>}
                {i === current && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />}
              </div>
            ))}
          </div>
        ))}
        {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches "{query}".</p>}
      </div>
    </dialog>
  );
}
