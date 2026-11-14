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

  it("in Select, is one checkbox over the whole card that opens nothing, with no hover tools", () => {
    const out = html(<LibraryCard item={item()} sources={sources} picked onPick={() => undefined} />);
    expect(out).toMatch(/<label class="absolute inset-0 z-20[^"]*"><input type="checkbox" aria-label="Select Three CPF myths"[^>]*checked=""/);
    expect(out).toMatch(/<a[^>]*aria-label="Open Three CPF myths"[^>]*tabindex="-1"/);
    expect(out).not.toContain(">Schedule</a>");
    // a 44px target on a phone
    expect(out).toContain("[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11");
  });

  it("carries Add to set with the hover tools, and Remove from set when a set is open", () => {
    const out = html(<LibraryCard item={item()} sources={sources} onAddToSet={() => undefined} onRemoveFromSet={() => undefined} />);
    expect(out).toMatch(/<button[^>]*aria-label="Add to set"/);
    expect(out).toMatch(/<button[^>]*aria-label="Remove from set"/);
    expect(html(<LibraryCard item={item()} sources={sources} />)).not.toContain("Add to set");
  });

  it("shows the post it was remixed from small in the corner, named for a screen reader, and nothing without one", () => {
    const out = html(<LibraryCard item={item({ original: { cover: "https://cdn.example.com/a.jpg", by: "@kuehqueen" } })} sources={sources} />);
    expect(out).toMatch(/<img src="https:\/\/cdn.example.com\/a.jpg" alt="Remixed from @kuehqueen"[^>]*class="[^"]*absolute right-1.5 top-1.5/);
    expect(html(<LibraryCard item={item({ original: { cover: "/c.jpg", by: "" } })} sources={sources} />)).toContain('alt="Remixed from another post"');
    expect(html(<LibraryCard item={item()} sources={sources} />)).not.toContain("Remixed from");
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
    // the five formats, then Sets
    expect(out.match(/aria-pressed=/g)).toHaveLength(6);
    expect(header.indexOf(">Sets")).toBeGreaterThan(header.indexOf(">Text"));
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

  it("puts Select in the header row; ?select=1 ticks cards instead of opening them, with the count and the actions", () => {
    seed();
    expect(html(<LibraryPage />)).toMatch(/<button[^>]*>Select<\/button>/);
    const out = html(<LibraryPage />, "/library?select=1");
    expect(out).toMatch(/role="toolbar" aria-label="Selected items"/);
    expect(out).toContain("0 selected");
    expect(out).toContain("Select all");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Delete<\/button>/);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Download<\/button>/);
    expect(out).toContain(">Done</button>");
    expect(out).toContain('aria-label="Select Three CPF myths"');
    expect(out).not.toContain("Upload your own");
  });

  describe("sets", () => {
    const two = () => {
      const local = brandDevice("u1");
      const d = (id: string, hook: string) => ({ id, createdAt: "2026-11-10T00:00:00Z", hook, draft: "x", pillar: "", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "" });
      local.setItem("content-studio-drafts-u1", JSON.stringify([d("p1", "Three CPF myths"), d("p2", "Why term beats whole life")]));
      local.setItem("content-studio-sets-u1", JSON.stringify([{ id: "set-abcd", name: "Launch week", keys: ["d:p1", "d:gone"], createdAt: "" }, { id: "set-empty", name: "Later", keys: [], createdAt: "" }]));
    };

    it("lists each set at ?view=sets with its count, after a New set tile, each a link that opens it", () => {
      two();
      const out = html(<LibraryPage />, "/library?view=sets");
      expect(out).toMatch(/aria-pressed="true"[^>]*>Sets/);
      expect(out).toContain("New set");
      // a key whose piece is gone is skipped
      expect(out).toMatch(/<a[^>]*href="\/library\?set=set-abcd"[^>]*>.*?Launch week.*?1 item</);
      expect(out).toMatch(/href="\/library\?set=set-empty"[^>]*>.*?Later.*?0 items</);
      expect(out).not.toContain('aria-label="Search titles, words and captions"');
    });

    it("opens one at ?set=<id>: its items only, under its name with Rename, Delete set and the way back", () => {
      two();
      const out = html(<LibraryPage />, "/library?set=set-abcd");
      expect(out).toContain(">Launch week</h2>");
      expect(out).toMatch(/<a[^>]*href="\/library\?view=sets"[^>]*>.*?All sets<\/a>/);
      expect(out).toContain(">Rename</button>");
      expect(out).toContain(">Delete set</button>");
      expect(out).toContain("Three CPF myths");
      expect(out).not.toContain("Why term beats whole life");
      expect(out).not.toContain("Upload your own");
    });

    it("says an empty set with one way to fill it, and a set that is gone with the way back", () => {
      two();
      expect(html(<LibraryPage />, "/library?set=set-empty")).toMatch(/Nothing in this set yet.*<a[^>]*href="\/library\?select=1"[^>]*>Add items<\/a>/);
      expect(html(<LibraryPage />, "/library?set=set-zzzz")).toMatch(/That set is gone.*>All sets<\/button>/);
    });

    it("gives Select an Add to set, and Remove from set inside an open set", () => {
      two();
      expect(html(<LibraryPage />, "/library?select=1")).toMatch(/<button[^>]*disabled=""[^>]*>Add to set<\/button>/);
      expect(html(<LibraryPage />, "/library?select=1")).not.toContain("Remove from set");
      expect(html(<LibraryPage />, "/library?set=set-abcd&select=1")).toContain(">Remove from set</button>");
    });
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
