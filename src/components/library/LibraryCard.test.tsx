// The Library after Fastlane's (11 Nov): one row of quiet chips (formats left, states right, Building among them), a
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
  it("draws Fastlane's filter row: formats in its order with Text after, states with Building, quiet chips", () => {
    const local = brandDevice("u1");
    local.setItem("content-studio-drafts-u1", JSON.stringify([{ id: "p1", createdAt: "2026-11-10T00:00:00Z", hook: "Three CPF myths", draft: "x", pillar: "", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "" }]));
    const out = html(<LibraryPage />);
    expect(out).toContain('<h1 class="sr-only">Library</h1>');
    const group = (label: string) => [...(new RegExp(`aria-label="${label}"[^>]*>(.*?)</div>`).exec(out)?.[1] ?? "").matchAll(/aria-pressed="(true|false)"[^>]*>([A-Za-z ]+)/g)].map((m) => m[2].trim());
    expect(group("Format")).toEqual(["All formats", "Video", "Slides", "Image", "Text"]);
    expect(group("Status")).toEqual(["All", "Ready", "Scheduled", "Posted", "Building", "Failed"]);
    expect(out).toContain("lg:flex-row lg:items-center lg:justify-between");
    // no chip wears a border at rest
    expect(out).not.toMatch(/aria-pressed="false"[^>]*class="[^"]*\bborder\b/);
    expect(out).toContain("xl:grid-cols-6");
    // nothing is being made: no Making now button, and no column beside the grid
    expect(out).not.toContain("Making now (");
    expect(out).not.toContain("<aside");
  });
});
