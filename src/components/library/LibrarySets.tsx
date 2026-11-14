// The Library's sets (Fastlane's Sets, 14 Nov; src/lib/librarySets.ts): the tiles at ?view=sets, the bar over an open
// set (?set=<id>) with Rename and Delete set, and the list Add to set opens from Select or a card's button.

import { useState } from "react";
import { Link } from "react-router-dom";
import { CaretLeftIcon, FolderSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import LibraryThumb, { type ThumbSources } from "@/components/library/LibraryThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryItem } from "@/lib/library";
import { MAX_SET_NAME, type LibrarySet } from "@/lib/librarySets";
import { links } from "@/lib/links";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
/** Fastlane's density: six portrait cards a row on a wide screen. The grid of cards and the grid of sets share it. */
export const LIBRARY_GRID = "grid grid-cols-2 items-start gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6";
const count = (c: number) => `${c} item${c === 1 ? "" : "s"}`;

/** What of a set still exists, in the Library's order; a key whose piece is gone is skipped. */
export const setItems = (set: LibrarySet, items: LibraryItem[]) => {
  const keys = new Set(set.keys);
  return items.filter((i) => keys.has(i.key));
};

function NameForm({ initial = "", label, submit, onSubmit, onCancel }: { initial?: string; label: string; submit: string; onSubmit: (name: string) => void; onCancel?: () => void }) {
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
        if (name) onSubmit(name);
      }}
    >
      <Input
        name="name"
        defaultValue={initial}
        aria-label={label}
        placeholder={label}
        maxLength={MAX_SET_NAME}
        required
        autoFocus
        onKeyDown={(e) => e.key === "Escape" && onCancel && (e.preventDefault(), e.stopPropagation(), onCancel())}
        className="h-9 min-w-[8rem] flex-1 [@media(pointer:coarse)]:h-11"
      />
      <Button type="submit" size="sm" className={TOUCH}>
        {submit}
      </Button>
      {onCancel && (
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} className={TOUCH}>
          Cancel
        </Button>
      )}
    </form>
  );
}

/** ?view=sets: a New set tile, then each set with its first picture, name and count. */
export function SetsGrid({ sets, items, sources, onCreate }: { sets: LibrarySet[]; items: LibraryItem[]; sources: ThumbSources; onCreate: (name: string) => void }) {
  const [naming, setNaming] = useState(false);
  return (
    <ul className={LIBRARY_GRID}>
      <li className="flex min-w-0">
        {naming ? (
          <div className="flex aspect-[4/5] w-full flex-col justify-center rounded-lg border border-dashed border-primary/40 p-2">
            <NameForm label="Set name" submit="Create" onSubmit={onCreate} onCancel={() => setNaming(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <PlusIcon className="h-5 w-5" aria-hidden />
            New set
          </button>
        )}
      </li>
      {sets.map((s) => {
        const inSet = setItems(s, items);
        return (
          <li key={s.id} className="flex min-w-0">
            <Link to={links.library({ set: s.id })} className="group/set flex w-full min-w-0 flex-col gap-1.5">
              <div className="aspect-[4/5] overflow-hidden rounded-lg border border-border/60 bg-muted transition-colors group-hover/set:border-primary/40">
                {inSet[0] ? (
                  <LibraryThumb item={inSet[0]} sources={sources} seen />
                ) : (
                  <span className="flex h-full items-center justify-center text-muted-foreground">
                    <FolderSimpleIcon className="h-6 w-6" aria-hidden />
                  </span>
                )}
              </div>
              <span className="truncate text-sm font-medium leading-snug">{s.name}</span>
              <span className="text-xs text-muted-foreground">{count(inSet.length)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Over an open set: the way back to the sets, its name and count, Rename and Delete set. */
export function SetBar({ set, size, onRename, onDelete }: { set: LibrarySet; size: number; onRename: (name: string) => void; onDelete: () => void }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="ghost" className={`gap-1 px-2 text-xs text-muted-foreground ${TOUCH}`}>
        <Link to={links.library({ view: "sets" })}>
          <CaretLeftIcon className="h-3.5 w-3.5" aria-hidden /> All sets
        </Link>
      </Button>
      {renaming ? (
        <div className="min-w-0 flex-1">
          <NameForm initial={set.name} label="Set name" submit="Save" onSubmit={(name) => (onRename(name), setRenaming(false))} onCancel={() => setRenaming(false)} />
        </div>
      ) : (
        <>
          <h2 className="min-w-0 truncate text-base font-semibold">{set.name}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{count(size)}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setRenaming(true)} className={`text-xs ${TOUCH}`}>
              Rename
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} className={`text-xs text-destructive hover:text-destructive ${TOUCH}`}>
              Delete set
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Add to set: each set with its count, then a new one by name. */
export function AddToSet({ size, sets, items, onPick, onCreate }: { size: number; sets: LibrarySet[]; items: LibraryItem[]; onPick: (set: LibrarySet) => void; onCreate: (name: string) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="pr-10 text-base font-semibold">Add {count(size)} to a set</h2>
      {sets.length > 0 && (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {sets.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="flex h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{setItems(s, items).length}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <NameForm label="New set name" submit="Create" onSubmit={onCreate} />
    </div>
  );
}
