// The Library's four views as one switch, at the top of each of the four pages: Everything (/library), Posts
// (/drafts), Board (/board) and Grid (/grid). Each is still its own page and address; the switch reopens a view with
// the filters it last had in this tab, so going to Board and back does not clear a search.
import { Columns3, Grid3x3, LayoutGrid, List, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export const LIBRARY_VIEWS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/library", label: "Everything", icon: LayoutGrid },
  { to: "/drafts", label: "Posts", icon: List },
  { to: "/board", label: "Board", icon: Columns3 },
  { to: "/grid", label: "Grid", icon: Grid3x3 },
];
export const isLibraryView = (pathname: string) => LIBRARY_VIEWS.some((v) => v.to === (pathname.replace(/\/+$/, "") || "/"));

// this tab's last address of each view (its filters and open item); a reload starts them clean
const last = new Map<string, string>();
/** Where a view's button goes: the view as it was last left in this tab. */
export const viewHref = (to: string) => to + (last.get(to) ?? "");
export const rememberView = (pathname: string, search: string) => void (isLibraryView(pathname) && last.set(pathname.replace(/\/+$/, ""), search));

export default function LibraryViews() {
  const { pathname, search } = useLocation();
  rememberView(pathname, search);
  return (
    <nav aria-label="Library view" data-library-views className="inline-flex max-w-full rounded-lg border border-border/70 bg-muted/30 p-0.5">
      {LIBRARY_VIEWS.map((v) => {
        const on = pathname.replace(/\/+$/, "") === v.to;
        const cls = `inline-flex h-9 min-w-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors sm:px-3 [@media(pointer:coarse)]:h-11 ${
          on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`;
        const inner = (
          <>
            <v.icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{v.label}</span>
          </>
        );
        // the open view is not a link: pressing it would only drop the filters it has on
        return on ? (
          <span key={v.to} aria-current="page" className={cls}>
            {inner}
          </span>
        ) : (
          <Link key={v.to} to={viewHref(v.to)} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
