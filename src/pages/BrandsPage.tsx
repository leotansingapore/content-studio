// /brands: every brand of the account as a card (opened from All brands in the brand switcher), its unfinished ones
// beside them (brandDrafts.ts), and New brand last (docs/brand-isolation.md). A card opens its brand on its calendar,
// switching the way the brand switcher does.
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { LogoTile } from "@/components/onboarding/parts";
import { Card } from "@/components/ui/card";
import { draftColour, draftLink, loadDrafts, removeDraft, type BrandDraft } from "@/lib/brandDrafts";
import { brandKitFor } from "@/lib/carousel";
import { readableOn } from "@/lib/carouselLayout";
import { activeProfileId, brandGroups, loadProfiles, setActiveProfile, type Profile } from "@/lib/profiles";
import { useSignedInUser } from "@/lib/useLeoOnly";
import { cn } from "@/lib/utils";

export type BrandRow = Profile & { logo: string | null; colour: string | null; host: string };

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const draftName = (d: BrandDraft) => d.name || d.host || "No name yet";
const calendarOf = (id: string) => `/calendar?profile=${encodeURIComponent(id)}`;

function siteHost(website: string | undefined): string {
  try {
    return website ? new URL(website).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function Mark({ logo, colour, name }: { logo: string | null; colour: string | null; name: string }) {
  if (logo) return <LogoTile src={logo} alt="" className="h-12 w-12 overflow-hidden rounded-xl border border-border/60 p-1" />;
  const hex = colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null;
  return (
    <span
      aria-hidden
      className={cn("grid h-12 w-12 place-items-center rounded-xl text-lg font-bold", !hex && "bg-primary/10 text-primary")}
      style={hex ? { backgroundColor: hex, color: readableOn(hex) } : undefined}
    >
      {initial(name)}
    </span>
  );
}

const CARD = "flex h-full min-h-36 flex-col gap-3 rounded-[20px] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TAG = "w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold";

function Names({ name, host }: { name: string; host: string }) {
  return (
    <span className="mt-auto block min-w-0">
      <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
      {host && <span className="block truncate text-xs text-muted-foreground">{host}</span>}
    </span>
  );
}

export function BrandGrid({ groups, drafts, activeId, opening, onOpen, onRemove }: {
  groups: { name: string | null; rows: BrandRow[] }[];
  drafts: BrandDraft[];
  activeId: string;
  opening: string | null;
  onOpen: (id: string, e: MouseEvent<HTMLAnchorElement>) => void;
  onRemove: (d: BrandDraft) => void;
}) {
  return (
    <div className="space-y-8">
      {groups.map((g, i) => (
        <section key={g.name ?? "all"} aria-label={g.name ?? "Brands"} className="space-y-3">
          {g.name && <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.name}</h2>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.rows.map((b) => {
              const current = b.id === activeId;
              return (
                <li key={b.id}>
                  <Card className={cn("h-full transition-colors hover:border-primary/40", current && "border-primary ring-1 ring-primary")}>
                    <a href={calendarOf(b.id)} aria-current={current ? "true" : undefined} onClick={(e) => onOpen(b.id, e)} className={CARD}>
                      <Mark logo={b.logo} colour={b.colour} name={b.name} />
                      <Names name={opening === b.id ? `Opening ${b.name}...` : b.name} host={b.host} />
                      {current && <span className={cn(TAG, "bg-primary/10 text-primary")}>Current</span>}
                    </a>
                  </Card>
                </li>
              );
            })}
            {i === 0 &&
              drafts.map((d) => (
                <li key={d.id} className="group relative">
                  <Card className="h-full transition-colors hover:border-primary/40">
                    {/* a full load, as every way into Add a brand: its Back counts history from its own first entry */}
                    <a href={draftLink(d)} className={CARD}>
                      <Mark logo={null} colour={draftColour(d)} name={draftName(d)} />
                      <Names name={draftName(d)} host={d.name ? d.host : ""} />
                      <span className={cn(TAG, "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200")}>Unfinished</span>
                    </a>
                  </Card>
                  <button
                    type="button"
                    onClick={() => onRemove(d)}
                    aria-label={`Remove unfinished brand ${draftName(d)}`}
                    title="Remove"
                    className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:opacity-100"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            {i === 0 && (
              <li>
                <a
                  href="/brands/new"
                  className={cn(CARD, "items-center justify-center border border-dashed border-border text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-accent")}
                >
                  <PlusIcon className="h-5 w-5" />
                  New brand
                </a>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function BrandsPage() {
  const uid = useSignedInUser()?.id ?? null;
  const [drafts, setDrafts] = useState<BrandDraft[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (uid) setDrafts(loadDrafts(uid));
  }, [uid]);

  const rows = useMemo<BrandRow[]>(
    () =>
      uid
        ? loadProfiles(uid).map((p) => {
            const kit = brandKitFor(uid, p.id);
            return { ...p, logo: kit?.logo ?? null, colour: kit?.color ?? null, host: siteHost(kit?.website) };
          })
        : [],
    [uid],
  );

  const open = (id: string, e: MouseEvent<HTMLAnchorElement>) => {
    // a new tab or window opens the link as it is, and switches there
    if (!uid || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setOpening(id);
    setActiveProfile(uid, id);
    window.location.assign(calendarOf(id));
  };

  const remove = (d: BrandDraft) => {
    if (!uid || !window.confirm(`Remove ${draftName(d)}? It is only an unfinished brand.`)) return;
    setDrafts(removeDraft(uid, d.id));
  };

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Brands</h1>
      {uid && <BrandGrid groups={brandGroups(rows)} drafts={drafts} activeId={activeProfileId(uid)} opening={opening} onOpen={open} onRemove={remove} />}
    </div>
  );
}
