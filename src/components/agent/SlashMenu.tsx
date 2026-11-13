// The slash menu over the agent composer (docs/north-star/items/agent-skills.md, "In the agent chat"): typing "/"
// lists every skill whose slash, name or old names match what follows: the ready-made ones, the person's own, then the
// make skills (makeSkills.ts), in a list that scrolls past six rows. A pick fills "/<slash> " and keeps focus, or, for a
// make skill, starts its questions; the composer owns the keys (arrows, Enter, Esc) and the open state.
import { useEffect } from "react";

export interface SlashItem {
  slash: string;
  name: string;
  /** A make skill: a pick starts its questions instead of filling the box. */
  make?: true;
  kind?: string;
  /** Its old names, matched too. */
  was?: string;
}

/** Rows shown before the list scrolls. */
export const MAX_SLASH_ITEMS = 6;
const bare = (slash: string) => slash.replace(/^\//, "");

/** The rows for `text` (only while it is "/" and one word), or [] when the menu stays shut. */
export function slashItems(text: string, skills: SlashItem[]): SlashItem[] {
  const m = /^\/(\S*)$/.exec(text);
  if (!m) return [];
  const q = m[1].toLowerCase();
  const seen = new Set<string>();
  return skills
    .map((s) => ({ ...s, slash: bare(s.slash) }))
    .filter((s) => s.slash && !seen.has(s.slash) && seen.add(s.slash) && (s.slash.includes(q) || s.name.toLowerCase().includes(q) || !!s.was?.toLowerCase().includes(q)));
}

export default function SlashMenu({ id, items, active, onPick }: { id: string; items: SlashItem[]; active: number; onPick: (s: SlashItem) => void }) {
  // the arrows move through a list longer than the box: keep the highlighted row in view
  useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [id, active]);
  if (!items.length) return null;
  return (
    <ul id={id} role="listbox" aria-label="Skills" className="mb-2 max-h-[264px] overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-lg [@media(pointer:coarse)]:max-h-[284px]">
      {items.map((s, i) => (
        <li key={s.slash} id={`${id}-${i}`} role="option" aria-selected={i === active}>
          <button
            type="button"
            tabIndex={-1}
            // mousedown, so the textarea keeps its focus
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(s);
            }}
            className={`flex min-h-10 w-full items-baseline gap-3 px-3 py-2 text-left text-sm [@media(pointer:coarse)]:min-h-11 ${i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
          >
            <span className="shrink-0 font-mono text-[13px] font-medium">/{s.slash}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name}</span>
            {s.kind && <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{s.kind}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
