import { useMemo, useState } from "react";
import {
  Users,
  Search,
  X as XIcon,
  ExternalLink,
  Star,
  Instagram,
} from "lucide-react";
import advisorsData from "@/data/advisors.json";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";

const ENTRIES = advisorsData as AdvisorEntry[];

// Surface the content-strategy coaches (e.g. @willislaubx) first — they're the
// most useful reference when you're deciding HOW to frame a post.
const FEATURED_IDS = ["willis-lau-instagram"];

export interface CompetitorRef {
  id: string;
  name: string;
  handle: string;
  styleNotes: string;
  platformUrl: string;
  platform: string;
}

export function toCompetitorRef(e: AdvisorEntry): CompetitorRef {
  return {
    id: e.id,
    name: e.name,
    handle: e.handle,
    styleNotes: e.style_notes,
    platformUrl: e.platform_url,
    platform: e.platform,
  };
}

export function findCompetitorByHandle(handle: string): CompetitorRef | null {
  const norm = handle.trim().toLowerCase();
  const found = ENTRIES.find(
    (e) => e.handle.toLowerCase() === norm || e.id.toLowerCase() === norm,
  );
  return found ? toCompetitorRef(found) : null;
}

/** The style directive injected into the generator when a competitor is referenced. */
export function buildCompetitorStyleReference(ref: CompetitorRef): string {
  const style = ref.styleNotes.trim()
    ? ref.styleNotes
    : "Study the angles, hooks, and formats this creator is known for.";
  return `Match the ANGLE and structure of ${ref.name} (${ref.handle}): ${style} Do not copy verbatim — adapt it to my own voice, niche, and audience.`;
}

/**
 * Parse a raw Instagram handle ("@gejiabao", "gejiabao") or profile URL
 * ("https://instagram.com/gejiabao/") into a normalized handle + URL.
 * Returns null when the input doesn't look like a valid IG handle.
 */
export function parseInstagramInput(
  raw: string,
): { handle: string; url: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const urlMatch = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const bare = (urlMatch ? urlMatch[1] : t.replace(/^@/, "")).replace(/\/$/, "");
  // Post/reel/story URLs put a content-type segment where the username goes
  // ("instagram.com/reel/xyz") — never treat those as handles.
  if (urlMatch && /^(p|reel|reels|stories|explore|tv|accounts)$/i.test(bare)) {
    return null;
  }
  // IG usernames: 1-30 chars, letters/digits/dot/underscore. Require 2+ and at
  // least one letter so plain search words don't all light up as handles.
  if (!/^[A-Za-z0-9._]{2,30}$/.test(bare) || !/[A-Za-z]/.test(bare)) return null;
  return { handle: `@${bare}`, url: `https://www.instagram.com/${bare}/` };
}

export function customInstagramRef(handle: string, url: string): CompetitorRef {
  return {
    id: `custom-${handle.replace(/^@/, "").toLowerCase()}`,
    name: handle,
    handle,
    styleNotes: "",
    platformUrl: url,
    platform: "instagram",
  };
}

interface Props {
  selectedId: string | null;
  onSelect: (ref: CompetitorRef | null) => void;
}

export default function CompetitorReference({ selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Custom IG handle awaiting an optional "what you like about them" note.
  const [pendingCustom, setPendingCustom] = useState<{
    handle: string;
    url: string;
  } | null>(null);
  const [customNote, setCustomNote] = useState("");

  const addCustom = () => {
    if (!pendingCustom) return;
    onSelect({
      ...customInstagramRef(pendingCustom.handle, pendingCustom.url),
      styleNotes: customNote.trim(),
    });
    setPendingCustom(null);
    setCustomNote("");
    setOpen(false);
    setQuery("");
  };

  const selected = useMemo(
    () => ENTRIES.find((e) => e.id === selectedId) ?? null,
    [selectedId],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...ENTRIES].sort((a, b) => {
      const af = FEATURED_IDS.includes(a.id) ? 0 : 1;
      const bf = FEATURED_IDS.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
    if (!q) return sorted.slice(0, 30);
    return sorted.filter((e) =>
      (
        e.name +
        " " +
        e.handle +
        " " +
        e.niche.join(" ") +
        " " +
        e.style_notes
      )
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  if (selected) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="space-y-0.5">
            <p className="font-semibold text-primary">
              Referencing {selected.name}{" "}
              <span className="font-mono font-normal text-muted-foreground">
                {selected.handle}
              </span>
            </p>
            <p className="text-muted-foreground">
              Drafts will borrow their angle and structure — written in your own
              voice.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={selected.platform_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-background px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
          >
            <ExternalLink className="h-3 w-3" /> View
          </a>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Reference a competitor's angle
          <span className="rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-muted-foreground/80">
            optional
          </span>
        </span>
        <span className="text-[11px] font-medium text-primary">
          {open ? "Hide" : "Browse"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, niches — or paste an Instagram handle / URL"
              className="w-full rounded-lg border border-border/70 bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary/40"
            />
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
            {(() => {
              const ig = parseInstagramInput(query);
              if (!ig) return null;
              // Only offer the custom row on explicit intent (@handle or a URL)
              // or when nothing curated matches — plain search words like
              // "willis" shouldn't all render as Instagram handles.
              const explicit =
                query.trim().startsWith("@") ||
                /instagram\.com/i.test(query);
              if (!explicit && results.length > 0) return null;
              const curated = findCompetitorByHandle(ig.handle);
              if (curated) return null;
              if (pendingCustom && pendingCustom.handle === ig.handle) {
                return (
                  <div className="space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 p-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Instagram className="h-3.5 w-3.5" /> {ig.handle}
                    </p>
                    <input
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addCustom();
                      }}
                      placeholder="What do you like about their content? (optional — sharpens the plan)"
                      className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/40"
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={addCustom}
                        className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground"
                      >
                        Add reference
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingCustom(null)}
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  onClick={() => {
                    setPendingCustom(ig);
                    setCustomNote("");
                  }}
                  className="flex w-full items-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 text-left transition-colors hover:border-primary hover:bg-primary/10"
                >
                  <Instagram className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-primary">
                      Use {ig.handle} from Instagram
                    </span>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      Not in our curated list — the plan will reference this
                      page's angle by handle.
                    </p>
                  </div>
                </button>
              );
            })()}
            {results.map((e) => {
              const featured = FEATURED_IDS.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onSelect(toCompetitorRef(e));
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg border border-border/60 bg-background p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {featured && (
                        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      <span className="truncate text-xs font-semibold text-foreground">
                        {e.name}
                      </span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {e.handle}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {e.style_notes}
                    </p>
                  </div>
                </button>
              );
            })}
            {results.length === 0 && !parseInstagramInput(query) && (
              <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
                No profiles match "{query}". Paste an Instagram handle or URL to
                reference a page outside the curated list.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
