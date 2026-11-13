// A maker beside the agent's chat (makeSkills.ts, a skill the agent doesn't make itself; Holo's side panel, H9): Back at
// the top, then the maker's OWN page component, opened at its address with the answers in its params. On phones it is a
// full-height sheet. The page runs inside its own router (the same routes App.tsx gives these pages), so its address
// changes (?draft=, a tab, a filter) stay in the panel and are mirrored to /agent's ?at=, which a reload reopens; a link
// to any other page leaves for that page as usual. Its price shows on the page before anything runs, as it always does.

import { Suspense, lazy, useContext, useEffect, useMemo, useState, type ComponentType, type LazyExoticComponent } from "react";
import {
  Route, Router, Routes, UNSAFE_LocationContext, UNSAFE_NavigationContext, UNSAFE_RouteContext, createPath, matchRoutes, parsePath, type Navigator, type To,
} from "react-router-dom";
import { ArrowSquareOutIcon, CaretLeftIcon } from "@phosphor-icons/react";

const page = (load: () => Promise<{ default: ComponentType }>) => lazy(load);
/** The maker pages a panel can hold, at the paths App.tsx routes them (makeSkills.test.ts keeps every skill's page here). */
export const PANEL_PAGES: { path: string; Page: LazyExoticComponent<ComponentType> }[] = [
  { path: "/generate", Page: page(() => import("@/pages/GeneratePage")) },
  { path: "/generate/batch", Page: page(() => import("@/pages/BatchPage")) },
  { path: "/generate/answer", Page: page(() => import("@/pages/AnswerPage")) },
  { path: "/generate/vsl", Page: page(() => import("@/pages/VslPage")) },
  { path: "/hooks", Page: page(() => import("@/pages/HooksPage")) },
  { path: "/script", Page: page(() => import("@/pages/ScriptwriterPage")) },
  { path: "/carousel", Page: page(() => import("@/pages/CarouselPage")) },
  { path: "/slideshow", Page: page(() => import("@/pages/SlideshowPage")) },
  { path: "/design", Page: page(() => import("@/pages/DesignPage")) },
  { path: "/design/campaigns", Page: page(() => import("@/pages/SlideCampaignsPage")) },
  { path: "/design/libraries", Page: page(() => import("@/pages/SlideLibrariesPage")) },
  { path: "/image", Page: page(() => import("@/pages/ImagePage")) },
  { path: "/edit", Page: page(() => import("@/pages/VideoEditPage")) },
  { path: "/clone", Page: page(() => import("@/pages/CloneReelPage")) },
  { path: "/make/static/:slug", Page: page(() => import("@/pages/StaticFormatPage")) },
  { path: "/make/:format", Page: page(() => import("@/pages/MakeFormatPage")) },
];
const ROUTES = PANEL_PAGES.map(({ path }) => ({ path }));

/** Whether an address opens inside the panel (one of its maker pages) rather than leaving /agent. */
export const inPanel = (to: string): boolean => !!matchRoutes(ROUTES, parsePath(to).pathname ?? "/");

/** A panel path from the address, only when it is one of the panel's own pages. */
export const panelPath = (at: string | null): string | null => (at && /^\/(?![/\\])/.test(at) && inPanel(at) ? at : null);

export default function MakerPanel({ name, start, onPath, onClose }: {
  name: string;
  /** The maker's address with the answers in. */
  start: string;
  /** Each address the maker moves to inside the panel. */
  onPath: (path: string) => void;
  onClose: () => void;
}) {
  const outer = useContext(UNSAFE_NavigationContext).navigator;
  const [loc, setLoc] = useState(() => ({ ...parsePath(start), state: null as unknown, key: "start" }));
  const here = createPath(loc);
  // the maker's own moves stay inside; anything else leaves for that page, as a link always did
  const navigator = useMemo<Navigator>(() => {
    const move = (to: To, state: unknown, replace: boolean) => {
      const next = typeof to === "string" ? parsePath(to) : to;
      const path = createPath({ pathname: next.pathname ?? "/", search: next.search ?? "", hash: next.hash ?? "" });
      if (!inPanel(path)) return replace ? outer.replace(to, state) : outer.push(to, state);
      setLoc({ pathname: next.pathname ?? "/", search: next.search ?? "", hash: next.hash ?? "", state, key: Math.random().toString(36).slice(2) });
    };
    return {
      createHref: (to: To) => outer.createHref(to),
      encodeLocation: outer.encodeLocation?.bind(outer),
      go: () => onClose(),
      push: (to: To, state?: unknown) => move(to, state, false),
      replace: (to: To, state?: unknown) => move(to, state, true),
    };
  }, [outer, onClose]);
  useEffect(() => {
    onPath(here);
  }, [here]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && window.matchMedia("(max-width: 1023px)").matches && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <aside aria-label={name} className="fixed inset-0 z-50 flex flex-col bg-background lg:static lg:inset-auto lg:z-auto lg:w-[56%] lg:shrink-0 lg:border-l lg:border-border/60">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-2 lg:px-4">
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-accent">
          <CaretLeftIcon className="h-4 w-4" /> Back
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground">{name}</p>
        <button type="button" onClick={() => outer.push(here)} aria-label="Open the full page" title="Open the full page" className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowSquareOutIcon className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        {/* the panel's own router: the chat's route and address are out of reach of the maker inside */}
        <UNSAFE_RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
          <UNSAFE_LocationContext.Provider value={null as never}>
            <Router location={loc} navigator={navigator}>
              <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
                <Routes>
                  {PANEL_PAGES.map(({ path, Page }) => (
                    <Route key={path} path={path} element={<Page />} />
                  ))}
                </Routes>
              </Suspense>
            </Router>
          </UNSAFE_LocationContext.Provider>
        </UNSAFE_RouteContext.Provider>
      </div>
    </aside>
  );
}
