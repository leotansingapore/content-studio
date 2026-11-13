// The one row over each of the Library's four views (Leo, 13 Nov: "Library one row"): the view's own tabs on the
// left, its search and menus in the middle, the view switch at the right end. From lg it never wraps (the tabs scroll
// sideways when there is no room); below that the tabs and the switch share the first row and the controls take a
// second, scrolling sideways inside themselves, never the page.
import type { ReactNode } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import LibraryViews from "@/components/library/LibraryViews";
import { Input } from "@/components/ui/input";
import { sectionTabs } from "@/lib/nav";

/** A select drawn as quiet words, as the chips beside it. */
export const QUIET_SELECT = "h-8 w-auto shrink-0 gap-1 border-transparent bg-transparent px-2.5 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-1 [@media(pointer:coarse)]:h-11";

/** Where an empty view's Create button goes: Studio's Create tab, as this sign-in sees it. */
export const createHref = (email: string) => sectionTabs("/studio", email).tabs.find((t) => t.label === "Create")?.to ?? "/generate";

export default function LibraryHeader({ title, left, children }: { title: string; left?: ReactNode; children?: ReactNode }) {
  return (
    <header data-library-header className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
      <h1 className="sr-only">{title}</h1>
      <div className="scrollbar-none -mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 py-0.5">{left}</div>
      {children && (
        <div className="scrollbar-none order-last -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 py-0.5 lg:order-none lg:mx-0 lg:w-auto lg:shrink-0 lg:overflow-visible lg:p-0">
          {children}
        </div>
      )}
      <LibraryViews />
    </header>
  );
}

/** The row's search box. `tight` folds it to its icon from lg until it is focused or holds words, on a view whose row is full. */
export function LibrarySearch({ value, onChange, label, tight }: { value: string; onChange: (v: string) => void; label: string; tight?: boolean }) {
  return (
    <div
      className={`relative min-w-32 flex-1 lg:flex-none ${
        tight ? "lg:w-9 lg:min-w-0 lg:transition-[width] lg:focus-within:w-44 lg:[&:has(input:not(:placeholder-shown))]:w-44 [@media(pointer:coarse)]:lg:w-11" : "lg:w-44"
      }`}
    >
      <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search" aria-label={label} title={label} className="h-9 pl-8 pr-2 [@media(pointer:coarse)]:h-11" />
    </div>
  );
}
