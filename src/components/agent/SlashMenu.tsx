// The slash menu over the agent composer (docs/north-star/items/agent-skills.md, "In the agent chat"): typing "/"
// lists up to 6 skills, the ready-made ones then the person's own, whose slash or name matches what follows. A pick
// fills "/<slash> " and keeps focus; the composer owns the keys (arrows, Enter, Esc) and the open state.

export interface SlashItem {
  slash: string;
  name: string;
}

export const MAX_SLASH_ITEMS = 6;
const bare = (slash: string) => slash.replace(/^\//, "");

/** The rows for `text` (only while it is "/" and one word), or [] when the menu stays shut. */
export function slashItems(text: string, skills: SlashItem[]): SlashItem[] {
  const m = /^\/(\S*)$/.exec(text);
  if (!m) return [];
  const q = m[1].toLowerCase();
  const seen = new Set<string>();
  return skills
    .map((s) => ({ slash: bare(s.slash), name: s.name }))
    .filter((s) => s.slash && !seen.has(s.slash) && seen.add(s.slash) && (s.slash.includes(q) || s.name.toLowerCase().includes(q)))
    .slice(0, MAX_SLASH_ITEMS);
}

export default function SlashMenu({ id, items, active, onPick }: { id: string; items: SlashItem[]; active: number; onPick: (s: SlashItem) => void }) {
  if (!items.length) return null;
  return (
    <ul id={id} role="listbox" aria-label="Skills" className="mb-2 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
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
            <span className="min-w-0 truncate text-muted-foreground">{s.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
