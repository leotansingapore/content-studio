// The Library (Fastlane 11 Nov, one header row 13 Nov): formats as quiet chips, the states in one menu, a
// dense grid, and each card one link with no buttons at rest; a failure keeps Try again in words.
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { brandDevice } from "@/test/brandDevice";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined), getUser: () => new Promise(() => undefined) } } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useSignedInUser: () => ({ id: "u1", email: "someone@example.com" }), useLeoUser: () => null }));
vi.mock("@/components/library/MakingNow", () => ({ default: () => null, useLibraryJobs: () => [] }));
vi.mock("@/components/PostItForMe", () => ({ useZernioRefresh: () => undefined }));

import LibraryCard from "./LibraryCard";
import { thumbSources } from "./LibraryThumb";
import LibraryPage from "@/pages/LibraryPage";

afterEach(() => vi.unstubAllGlobals());
const html = (el: JSX.Element, path = "/library") => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>).replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
const sources = thumbSources("u1", { carousels: [], slideshows: [] }, true);
const item = (o: Partial<LibraryItem> = {}): LibraryItem => ({ key: "d:p1", format: "text", kind: "Text", status: "ready", title: "Three CPF myths", words: "", at: "2026-11-11T00:00:00Z", href: "/generate?draft=p1", scheduleHref: "/calendar?post=p1&view=month", ...o });

describe("a Library card", () => {
  it("is one link, the source first, then kind and title on one line, then when it goes out", () => {
    const out = html(<LibraryCard item={item({ source: "From @moneycoach's video" })} sources={sources} />);
    expect(out).toMatch(/<a[^>]*aria-label="Open Three CPF myths"[^>]*class="[^"]*after:absolute after:inset-0/);
    expect(out.indexOf("From @moneycoach")).toBeLessThan(out.indexOf("Three CPF myths</a>"));
    expect(out).toContain("Not scheduled yet");
    expect(out).not.toMatch(/>Open<\/a>/);
  });

  it("keeps Schedule and Copy link off the card at rest: shown on hover with a mouse, left out on touch", () => {
    const out = html(<LibraryCard item={item()} sources={sources} />);
    const tools = /<span class="([^"]*)"><a[^>]*href="\/calendar\?post=p1&view=month"[^>]*>Schedule<\/a>/.exec(out)?.[1].split(" ") ?? [];
    expect(tools).toEqual(expect.arrayContaining(["hidden", "[@media(pointer:fine)]:flex", "[@media(pointer:fine)]:opacity-0", "[@media(pointer:fine)]:group-hover/card:opacity-100", "[@media(pointer:fine)]:focus-within:opacity-100"]));
    expect(out).toContain('aria-label="Copy link to Three CPF myths"');
  });

  it("keeps a failure's Try again in words, on every screen", () => {
    const out = html(<LibraryCard item={item({ status: "failed", note: "Zernio couldn't post it.", retryHref: "/drafts?status=scheduled", scheduleHref: undefined })} sources={sources} />);
    expect(out).toMatch(/<a[^>]*class="relative z-10[^"]*"[^>]*href="\/drafts\?status=scheduled"[^>]*>Try again<\/a>|<a[^>]*href="\/drafts\?status=scheduled"[^>]*class="relative z-10[^"]*"[^>]*>Try again<\/a>/);
    expect(out).toContain("Zernio couldn't post it.");
  });
});

describe("the Library page", () => {
  const seed = () => brandDevice("u1").setItem("content-studio-drafts-u1", JSON.stringify([{ id: "p1", createdAt: "2026-11-10T00:00:00Z", hook: "Three CPF myths", draft: "x", pillar: "", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "" }]));

  it("draws one header row: formats as its tabs in Fastlane's order with Text after, then search, one status menu and the view switch", () => {
    seed();
    const out = html(<LibraryPage />);
    expect(out).toContain('<h1 class="sr-only">Library</h1>');
    const header = /<header[^>]*data-library-header[^>]*>(.*?)<\/header>/.exec(out)?.[1] ?? "";
    const formats = [...(/aria-label="Format"[^>]*>(.*?)<\/div>/.exec(header)?.[1] ?? "").matchAll(/aria-pressed="(true|false)"[^>]*>([A-Za-z ]+)/g)].map((m) => m[2].trim());
    expect(formats).toEqual(["All formats", "Video", "Slides", "Image", "Text"]);
    // the status filter is one control that says what is chosen, not a second row of chips
    expect(header).toMatch(/<button[^>]*aria-label="Status"[^>]*>.*?All statuses/);
    expect(out.match(/aria-pressed=/g)).toHaveLength(5);
    const at = ['aria-label="Format"', 'aria-label="Search titles, words and captions"', 'aria-label="Status"', 'aria-label="Library view"'].map((x) => header.indexOf(x));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // no chip wears a border at rest
    expect(out).not.toMatch(/aria-pressed="false"[^>]*class="[^"]*\bborder\b/);
    expect(out).toContain("xl:grid-cols-6");
    // nothing is being made: no Making now button, and no column beside the grid
    expect(out).not.toContain("Making now (");
    expect(out).not.toContain("<aside");
  });

  it("keeps each filter's address: an old link opens the same view, the menu showing its status and count", () => {
    seed();
    const out = html(<LibraryPage />, "/library?format=text&status=ready");
    expect(out).toMatch(/aria-pressed="true"[^>]*>Text/);
    expect(out).toMatch(/<button[^>]*aria-label="Status"[^>]*>.*?Ready \(1\)/);
    expect(out).toContain("Three CPF myths");
  });

  it("opens the grid on Upload your own, a link to the video editor, and leaves it out of a filtered grid", () => {
    seed();
    const out = html(<LibraryPage />);
    expect(out).toMatch(/<ul[^>]*xl:grid-cols-6[^>]*><li[^>]*><a[^>]*href="\/edit"[^>]*>.*?Upload your own<\/a><\/li>/);
    expect(html(<LibraryPage />, "/library?format=text")).not.toContain("Upload your own");
  });

  it("says an empty library in one heading, one sentence and one button, Create", () => {
    brandDevice("u1");
    const out = html(<LibraryPage />);
    expect(out).toContain("Nothing made yet");
    expect(out).toMatch(/<a[^>]*href="\/generate"[^>]*>Create<\/a>/);
    expect(out).not.toContain("Find a post to remix");
    expect(out).not.toContain('aria-label="Format"');
    expect(out).toContain('aria-label="Library view"');
  });

  it("says a filter with nothing in it the same way, its one button clearing the filter", () => {
    seed();
    const out = html(<LibraryPage />, "/library?format=video");
    expect(out).toContain("Nothing matches these filters");
    expect(out).toMatch(/<button[^>]*>Clear filters<\/button>/);
    expect(out).not.toContain(">Create<");
    expect(out).not.toContain("xl:grid-cols-6");
  });
});
