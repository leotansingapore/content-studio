// The Library's four views as one switch, a compact segmented control at the end of each page's header row (the open
// one raised): Everything (/library), Posts (/drafts), Board (/board) and Grid (/grid). Each button is its icon, named
// for a screen reader and on hover. Each is still its own page and address; the switch reopens a view with the filters
// it last had in this tab, so going to Board and back does not clear a search.
import { ColumnsIcon, GridNineIcon, SquaresFourIcon, ListIcon, type Icon } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router-dom";

export const LIBRARY_VIEWS: { to: string; label: string; icon: Icon }[] = [
  { to: "/library", label: "Everything", icon: SquaresFourIcon },
  { to: "/drafts", label: "Posts", icon: ListIcon },
  { to: "/board", label: "Board", icon: ColumnsIcon },
  { to: "/grid", label: "Grid", icon: GridNineIcon },
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
    <nav aria-label="Library view" data-library-views className="inline-flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
      {LIBRARY_VIEWS.map((v) => {
        const on = pathname.replace(/\/+$/, "") === v.to;
        const cls = `inline-flex h-8 w-8 items-center justify-center rounded transition-colors [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${
          on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`;
        const inner = (
          <>
            <v.icon className="h-4 w-4 shrink-0" aria-hidden /> <span className="sr-only">{v.label}</span>
          </>
        );
        // the open view is not a link: pressing it would only drop the filters it has on
        return on ? (
          <span key={v.to} aria-current="page" title={v.label} className={cls}>
            {inner}
          </span>
        ) : (
          <Link key={v.to} to={viewHref(v.to)} title={v.label} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
