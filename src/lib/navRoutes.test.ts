// Every page the router serves must be reachable: listed in the nav (and so in Jump to), or named
// below with the reason it is not. A new route added to App.tsx without either fails here, on every
// build, instead of waiting for the weekly UX pass to find an orphan page.
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "./nav";

const EXCEPTIONS: Record<string, string> = {
  "/": "redirects to /home",
  "/auth": "sign-in page, outside the studio",
  "/roadmap": "public roadmap, linked from Feedback",
  "/review/:token": "public compliance preview link",
  "/l/:slug": "public link-in-bio page",
  "/t/report/:slug": "public tracked-link report",
  "/diagnosis": "redirects to /coach",
  "/hub": "paid hub, unlinked on purpose (e0da451)",
  "/fads/:tab": "a tab of /fads",
  "/recruit/:tab": "the tabs of /recruit (Conversations, AI agent)",
  "/inspiration/:id": "one inspiration, opened from /inspiration",
  "/profiles/:id": "one creator, opened from /profiles",
};

const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const routes = [...appSource.matchAll(/<Route\b[^>]*\bpath="(\/[^"]*)"/g)].map((m) => m[1]);
const navPaths = new Set(SECTIONS.flatMap((s) => s.pages.map((p) => p.to)));

describe("routes and the nav", () => {
  it("finds the app's routes", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it("every route is a nav page or a named exception", () => {
    const orphans = routes.filter((r) => !navPaths.has(r) && !(r in EXCEPTIONS));
    expect(orphans).toEqual([]);
  });

  it("every nav page has a route, so no link in the nav goes nowhere", () => {
    const served = new Set(routes);
    const dead = [...navPaths].filter((to) => !served.has(to) && !served.has(to.replace(/\/[^/]+$/, "/:tab")));
    expect(dead).toEqual([]);
  });

  it("lists no stale exceptions", () => {
    expect(Object.keys(EXCEPTIONS).filter((r) => !routes.includes(r))).toEqual([]);
  });
});
