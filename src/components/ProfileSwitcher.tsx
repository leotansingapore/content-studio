import { deleteBioPage } from "@/lib/bioPage";
import { pauseBrandCampaigns, stopBrandTelegram } from "@/lib/brandRemoval";
import { deleteBrandLinks } from "@/lib/trackedLinks";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CaretUpDownIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { socialConnectShown } from "@/lib/socialConnect";
import { brandLogoFor } from "@/lib/carousel";
import { useLogoTile } from "@/components/onboarding/parts";
import {
  activeProfileId,
  brandGroups,
  DEFAULT_PROFILE_ID,
  loadProfiles,
  removeProfile,
  renameProfile,
  setActiveProfile,
  type Profile,
} from "@/lib/profiles";

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

function BrandMark({ logo, name, size = "h-6 w-6" }: { logo: string | null; name: string; size?: string }) {
  const tile = useLogoTile(logo);
  if (!logo) return <span className={`flex ${size} shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary`}>{initial(name)}</span>;
  return (
    <span className={`${tile} grid ${size} shrink-0 place-items-center overflow-hidden rounded-md border border-border/60`}>
      <img src={logo} alt="" className="max-h-full max-w-full object-contain p-0.5" />
    </span>
  );
}

// Which social profile the whole studio is working on. Switching reloads the
// page so every screen reads that profile's posts, plan and voice fresh.
export default function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState(DEFAULT_PROFILE_ID);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const { toast } = useToast();
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      const list = loadProfiles(id);
      setProfiles(list);
      setActiveId(activeProfileId(id));
      setLogos(Object.fromEntries(list.map((p) => [p.id, brandLogoFor(id, p.id)])));
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    // a rename left half-typed is dropped with the menu, never waiting in it next time; Escape drops the rename first
    const close = () => {
      setEditing(null);
      setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (editing ? setEditing(null) : close());
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, editing]);

  if (!userId) return null;
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];

  const switchTo = (id: string) => {
    if (id === activeId) return setOpen(false);
    setSwitching(id);
    setActiveProfile(userId, id);
    window.location.reload();
  };
  const saveRename = (id: string, name: string) => {
    setProfiles(renameProfile(userId, id, name));
    setEditing(null);
  };

  const remove = async (p: Profile) => {
    const social = socialConnectShown() ? " Its connected social accounts are disconnected." : "";
    if (!window.confirm(`Remove ${p.name}? Its posts, plan, voice, recruit kit, link-in-bio page and tracked links are deleted on every device.${social} This can't be undone.`)) return;
    const wasActive = p.id === activeId;
    setEditing(null);
    setRemoving(p.id);
    try {
      // its link-in-bio page and tracked links go too (docs/brand-isolation.md)
      setProfiles(await removeProfile(userId, p.id, async (id) => {
        await stopBrandTelegram(id);
        await pauseBrandCampaigns(id);
        await deleteBioPage(id);
        await deleteBrandLinks(id);
      }));
    } catch (e) {
      // the brand stays; its social accounts, bio page or some links may already be gone, and trying again finishes it
      toast({ title: `${p.name} was only partly removed`, description: `${e instanceof Error ? e.message : "Something didn't go through."} Try again to finish.`, variant: "destructive" });
      return;
    } finally {
      setRemoving(null);
    }
    if (wasActive) window.location.reload();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setEditing(null);
          setOpen((v) => !v);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Profile: ${active?.name}. Switch profile`}
        className={`flex items-center gap-2 rounded-lg border border-border/70 bg-background text-left transition-colors hover:border-primary/40 ${
          compact ? "h-11 px-2" : "w-full px-2.5 py-2 [@media(pointer:coarse)]:min-h-11"
        }`}
      >
        {/* the name alone, as Fastlane's workspace switcher (one line on the phone bar, up to two in the sidebar); the
            button's label says what it does */}
        <BrandMark logo={logos[activeId] ?? null} name={active?.name ?? ""} size={compact ? "h-6 w-6" : "h-7 w-7"} />
        {compact ? (
          <span className="max-w-[9rem] truncate text-sm font-semibold text-foreground">{active?.name}</span>
        ) : (
          <span className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold leading-tight text-foreground">{active?.name}</span>
        )}
        <CaretUpDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1.5 w-64 rounded-xl border border-border/70 bg-popover p-1.5 shadow-elegant ${
            compact ? "right-0" : "left-0"
          }`}
        >
          <BrandMenu
            profiles={profiles} activeId={activeId} logos={logos} switching={switching} removing={removing} editing={editing}
            onEdit={setEditing} onSwitch={switchTo} onRename={saveRename} onRemove={(p) => void remove(p)}
          />
          {/* from its website (docs/brand-isolation.md), or just a name, on its own page */}
          <a
            href="/brands/new"
            className="mt-1 flex h-9 items-center gap-1.5 border-t border-border/70 px-2.5 pt-1 text-sm font-semibold text-primary [@media(pointer:coarse)]:h-11"
          >
            <PlusIcon className="h-4 w-4" /> Add a brand
          </a>
        </div>
      )}
    </div>
  );
}

/** Past this many brands the menu opens on a search box (Leo's account holds 37, 13 Nov). */
export const SEARCH_PAST = 8;

/**
 * The open menu's rows: a search box past SEARCH_PAST brands (Enter opens the first match), your brands then the demo
 * ones, and Remove only inside a brand's edit form, so a live demo can't lose a brand to one mis-click.
 */
export function BrandMenu({ profiles, activeId, logos, switching, removing, editing, onEdit, onSwitch, onRename, onRemove }: {
  profiles: Profile[];
  activeId: string;
  logos: Record<string, string | null>;
  switching: string | null;
  removing: string | null;
  editing: string | null;
  onEdit: (id: string) => void;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (p: Profile) => void;
}) {
  const [query, setQuery] = useState("");
  const [editName, setEditName] = useState("");
  const groups = brandGroups(profiles, query);
  return (
    <>
      {profiles.length > SEARCH_PAST && (
        <form
          className="mb-1 flex items-center gap-2 border-b border-border/70 px-2"
          onSubmit={(e) => {
            e.preventDefault();
            const first = groups[0]?.rows[0];
            if (first) onSwitch(first.id);
          }}
        >
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brands"
            aria-label="Search brands"
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base"
          />
        </form>
      )}
      <div className="max-h-72 overflow-y-auto">
        {!groups.length && <p className="px-2 py-2 text-sm text-muted-foreground">No brand matches "{query.trim()}".</p>}
        {groups.map((g) => (
          <div key={g.name ?? "all"}>
            {g.name && <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{g.name}</p>}
            <ul className="space-y-0.5" aria-label={g.name ?? "Brands"}>
              {g.rows.map((p) => (
                <li key={p.id} className="flex items-center gap-1">
                  {editing === p.id ? (
                    <form
                      className="flex-1 space-y-1 p-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        onRename(p.id, editName);
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          aria-label={`New name for ${p.name}`}
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm [@media(pointer:coarse)]:h-11"
                        />
                        <button type="submit" className="h-8 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 [@media(pointer:coarse)]:h-11">
                          Save
                        </button>
                      </div>
                      {p.id !== DEFAULT_PROFILE_ID && (
                        <button
                          type="button"
                          onClick={() => onRemove(p)}
                          disabled={!!removing}
                          className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium text-destructive hover:bg-destructive/10 [@media(pointer:coarse)]:h-11"
                        >
                          <TrashIcon className="h-3.5 w-3.5" /> Remove brand
                        </button>
                      )}
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSwitch(p.id)}
                        disabled={!!switching || !!removing}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent [@media(pointer:coarse)]:min-h-11"
                      >
                        <BrandMark logo={logos[p.id] ?? null} name={p.name} />
                        <span className="min-w-0 flex-1 truncate">
                          {switching === p.id ? `Opening ${p.name}...` : removing === p.id ? `Removing ${p.name}...` : p.name}
                        </span>
                        {p.id === activeId && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEdit(p.id);
                          setEditName(p.name);
                        }}
                        aria-label={`Edit ${p.name}`}
                        title={`Edit ${p.name}`}
                        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:p-[15px]"
                      >
                        <PencilSimpleIcon className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
