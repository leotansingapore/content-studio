// Leo's media sets on /media (brand-media-sets): the Sets view (?view=sets) with New photo set, New clip set and the
// starter sets sheet (?starters=1), and SetBar over an open set (?folder=<name>) with Add from your library. A set is
// a folder with a kind (src/lib/mediaSets.ts); the files and their thumbnails come from MediaPage.

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { STARTER_SETS, type StarterSet } from "@/data/starterSets";
import { links } from "@/lib/links";
import type { MediaItem } from "@/lib/mediaLibrary";
import {
  MAX_SET_NAME, MIN_SET_ITEMS, addStarter, addToSet, addable, makeSet, onStarterChange, removeSet, renameSet, restoreSet, starterAdded, starterJobs,
  type MediaSet, type SetKind, type SetWith,
} from "@/lib/mediaSets";
import { searchStock } from "@/lib/stockMedia";
import { useUrlFlag } from "@/lib/urlState";

const noun = (kind: SetKind, n: number) => `${n} ${kind === "clips" ? (n === 1 ? "clip" : "clips") : n === 1 ? "photo" : "photos"}`;
const LINK_BUTTON = "inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent [@media(pointer:coarse)]:min-h-11";

function Thumb({ url, alt, className = "" }: { url?: string; alt: string; className?: string }) {
  return <span className={`block overflow-hidden rounded-md bg-muted ${className}`}>{url ? <img src={url} alt={alt} className="h-full w-full object-cover" /> : null}</span>;
}

export default function SetsView(p: { userId: string; sets: SetWith[]; urls: Record<string, string>; onChange: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const jobs = useSyncExternalStore(onStarterChange, starterJobs);
  const [starters, setStarters] = useUrlFlag("starters", "1");
  const [naming, setNaming] = useState<SetKind | null>(null);
  const [name, setName] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renameLine, setRenameLine] = useState<string | null>(null);

  const startNaming = (kind: SetKind) => {
    setNaming(kind);
    setName("");
    setLine(null);
  };
  const make = (e: FormEvent) => {
    e.preventDefault();
    if (!naming) return;
    const r = makeSet(p.userId, name, naming);
    if ("line" in r) return setLine(r.line);
    setNaming(null);
    navigate(links.media({ folder: r.set.name }));
  };
  const rename = (e: FormEvent, from: string) => {
    e.preventDefault();
    const r = renameSet(p.userId, from, newName);
    if ("line" in r) return setRenameLine(r.line);
    setRenaming(null);
    p.onChange();
  };
  const remove = (s: MediaSet) => {
    const r = removeSet(p.userId, s.name);
    if (!r) return;
    p.onChange();
    toast({
      title: `Set removed. The ${s.kind === "clips" ? "clips" : "photos"} stay in Media.`,
      action: (
        <ToastAction altText="Undo" onClick={() => (restoreSet(p.userId, r), p.onChange())}>
          Undo
        </ToastAction>
      ),
    });
  };
  const status = STARTER_SETS.flatMap((s) => (jobs[s.id] ? [{ s, job: jobs[s.id] }] : []));

  return (
    <section aria-labelledby="media-sets" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="media-sets" className="mr-auto flex items-center gap-1.5 text-lg font-semibold">
          Sets <InfoTip label="About sets">Bundles of your photos or clips that slideshows and videos draw from.</InfoTip>
        </h2>
        <Button size="sm" variant="outline" className="gap-1.5" aria-expanded={naming === "photos"} onClick={() => startNaming("photos")}>
          <Plus className="h-4 w-4" /> New photo set
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" aria-expanded={naming === "clips"} onClick={() => startNaming("clips")}>
          <Plus className="h-4 w-4" /> New clip set
        </Button>
        <Button size="sm" variant={p.sets.length ? "outline" : "default"} aria-expanded={starters} onClick={() => setStarters(!starters)}>
          Add starter sets
        </Button>
      </div>

      {naming && (
        <form onSubmit={make} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
          <Input autoFocus value={name} maxLength={MAX_SET_NAME} onChange={(e) => (setName(e.target.value), setLine(null))} aria-label="Set name"
            placeholder={naming === "photos" ? "Name the photo set" : "Name the clip set"} className="h-10 min-w-0 flex-1 basis-48" />
          <Button type="submit" disabled={!name.trim()}>Make set</Button>
          <Button type="button" variant="ghost" onClick={() => setNaming(null)}>Cancel</Button>
          {line && <p role="alert" className="w-full text-xs text-destructive">{line}</p>}
        </form>
      )}

      {status.length > 0 && (
        <ul className="space-y-1">
          {status.map(({ s, job }) => (
            <li key={s.id} role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              {job.done ? job.line : <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Adding {s.name}: {job.n} of {job.of}</>}
            </li>
          ))}
        </ul>
      )}

      {starters && <StarterSheet userId={p.userId} sets={p.sets} onClose={() => setStarters(false)} />}

      {p.sets.length === 0 ? (
        !starters && <div className="space-y-3 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No sets yet. Add starter sets, or make one from your photos.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {p.sets.map((s) => (
            <li key={s.name} className="flex gap-3 rounded-xl border border-border/60 p-3">
              <Link to={links.media({ folder: s.name })} aria-label={`Open ${s.name}`} className="shrink-0">
                <Thumb url={s.cover && p.urls[s.cover.key]} alt="" className="h-20 w-16" />
              </Link>
              <div className="min-w-0 flex-1 space-y-1">
                {renaming === s.name ? (
                  <form onSubmit={(e) => rename(e, s.name)} className="flex flex-wrap items-center gap-1.5">
                    <Input autoFocus value={newName} maxLength={MAX_SET_NAME} aria-label={`New name for ${s.name}`}
                      onChange={(e) => (setNewName(e.target.value), setRenameLine(null))} className="h-9 min-w-0 flex-1 basis-32" />
                    <Button type="submit" size="sm" disabled={!newName.trim()}>Save</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                    {renameLine && <p role="alert" className="w-full text-xs text-destructive">{renameLine}</p>}
                  </form>
                ) : (
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {noun(s.kind, s.count)}
                  {s.starter ? " | starter" : ""}
                </p>
                {s.count < MIN_SET_ITEMS ? (
                  <p className="text-xs text-amber-800 dark:text-amber-200">Add at least 3 to use it in a video.</p>
                ) : s.undescribed > 0 ? (
                  <Link to={links.media({ folder: s.name })} className="text-xs font-semibold text-primary hover:underline">Describe them for better picks</Link>
                ) : null}
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Link to={links.media({ folder: s.name })} className={LINK_BUTTON}>Open</Link>
                  <Button size="sm" variant="ghost" className="px-2" onClick={() => (setRenaming(s.name), setNewName(s.name), setRenameLine(null))}>Rename</Button>
                  <Button size="sm" variant="ghost" className="px-2 text-muted-foreground hover:text-destructive" onClick={() => remove(s)}>Remove</Button>
                  <CopyLinkButton path={links.media({ folder: s.name })} label={`Copy link to ${s.name}`} className="h-9 w-9" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The 8 starter sets, each with 4 pictures from its first search (free; the same search within the hour counts nothing). */
function StarterSheet({ userId, sets, onClose }: { userId: string; sets: MediaSet[]; onClose: () => void }) {
  const jobs = useSyncExternalStore(onStarterChange, starterJobs);
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let live = true;
    for (const s of STARTER_SETS)
      searchStock(s.kind === "photos" ? "photo" : "video", s.queries[0], 1, "portrait").then(
        (r) => live && setPreviews((p) => ({ ...p, [s.id]: r.items.slice(0, 4).map((it) => it.thumb) })),
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, []);
  const add = (s: StarterSet) => void addStarter(userId, s.id);
  return (
    <section aria-label="Starter sets" className="space-y-1 rounded-xl border border-border/60 p-3">
      <div className="flex items-center">
        <h3 className="mr-auto text-sm font-semibold">Starter sets</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <ul className="divide-y divide-border/60">
        {STARTER_SETS.map((s) => {
          const added = starterAdded(sets, s);
          const running = jobs[s.id] && !jobs[s.id].done;
          return (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <span className="grid w-24 shrink-0 grid-cols-4 gap-0.5 sm:w-32" aria-hidden>
                {[0, 1, 2, 3].map((i) => <Thumb key={i} url={previews[s.id]?.[i]} alt="" className="aspect-[3/4]" />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.name}</span>
                <span className="block text-xs text-muted-foreground">{noun(s.kind, s.count)}</span>
              </span>
              <Button size="sm" variant={added ? "ghost" : "outline"} disabled={added || running} onClick={() => add(s)} aria-label={added ? `${s.name} added` : `Add ${s.name}`}>
                {added ? "Added" : running ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Adding" /> : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Over an open set (/media?folder=<set>): its count and Add from your library. */
export function SetBar({ userId, set, items, urls, onChange }: { userId: string; set: SetWith; items: MediaItem[]; urls: Record<string, string>; onChange: () => void }) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const offer = addable(items, set);
  const confirm = () => {
    addToSet(userId, set.name, picked);
    setPicking(false);
    setPicked([]);
    onChange();
  };
  return (
    <section aria-label={`Set ${set.name}`} className="space-y-2 rounded-xl border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto min-w-0 text-sm">
          <span className="font-semibold">{set.name}</span> <span className="text-muted-foreground">{noun(set.kind, set.count)}</span>
        </p>
        <Button size="sm" variant="outline" aria-expanded={picking} onClick={() => (setPicking(!picking), setPicked([]))}>Add from your library</Button>
      </div>
      {set.count < MIN_SET_ITEMS && <p className="text-xs text-amber-800 dark:text-amber-200">Add at least 3 to use it in a video.</p>}
      {picking &&
        (offer.length === 0 ? (
          <p className="text-xs text-muted-foreground">No other {set.kind === "clips" ? "clips" : "photos"} in Media yet.</p>
        ) : (
          <div className="space-y-2">
            <ul className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6">
              {offer.map((m) => {
                const on = picked.includes(m.key);
                return (
                  <li key={m.key}>
                    <label className={`relative block aspect-square cursor-pointer overflow-hidden rounded-md border-2 bg-muted ${on ? "border-primary" : "border-transparent"}`}>
                      {urls[m.key] ? <img src={urls[m.key]} alt={m.alt || m.name} className="h-full w-full object-cover" /> : null}
                      <input type="checkbox" checked={on} aria-label={`Add ${m.name || "this file"}`} className="absolute left-1 top-1 h-5 w-5 accent-[hsl(var(--primary))]"
                        onChange={() => setPicked((x) => (on ? x.filter((k) => k !== m.key) : [...x, m.key]))} />
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!picked.length} onClick={confirm}>Add {picked.length} to {set.name}</Button>
              <Button size="sm" variant="ghost" onClick={() => (setPicking(false), setPicked([]))}>Cancel</Button>
            </div>
          </div>
        ))}
    </section>
  );
}
