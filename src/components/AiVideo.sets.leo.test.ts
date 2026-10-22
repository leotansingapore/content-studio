// Leo's narrated video and montage drawing from media sets (brand-media-sets), rendered to markup in node (no effects
// run) from sets, photos and scenes kept on this device. ai-video shows none left; a set needs only a voiceover.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => ({ id: UID, email: "leo@example.com" }), useLeoOnly: () => true, leoUser: async () => null }));
vi.mock("@/lib/aiUsage", () => ({ useUsesLeft: () => (f: string) => (f === "ai-video" ? 0 : 3) }));

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
};
const local = mem();
const session = mem();
vi.stubGlobal("localStorage", local);
vi.stubGlobal("sessionStorage", session);
vi.stubGlobal("window", { localStorage: local, sessionStorage: session, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {}, location: { search: "" } });

const { default: AiVideo } = await import("./AiVideo");
const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(AiVideo, { onClose: () => undefined })));
const pressed = (markup: string, group: string) => {
  const g = markup.split(`aria-label="${group}"`)[1]?.split("</div>")[0] ?? "";
  return [...g.matchAll(/aria-pressed="true"[^>]*>([^<]*(?:<!-- -->[^<]*)*)</g)].map((m) => m[1].replace(/<!-- -->/g, ""));
};
const makeButton = (markup: string) => /<button[^>]*>Make the video<\/button>/.exec(markup)?.[0] ?? "";

const k = (n: number) => `cimg-pic00${n}`;
const photo = (n: number) => ({ key: k(n), name: `p${n}`, folder: "Work and career", alt: `office desk ${n}`, width: 1080, height: 1920, addedAt: `2026-10-1${n}` });
const clip = (n: number) => ({ key: `cvid-clip00${n}`, name: `c${n}`, folder: "City clips", alt: `city street ${n}`, width: 720, height: 1280, addedAt: `2026-10-1${n}`, kind: "video", seconds: 8 });
const SCENE = { say: "Most plans have a co-pay.", picture: "A clinic waiting room in Toa Payoh", search: "clinic", stock: null, use: "ai" };

beforeEach(() => {
  local.clear();
  session.clear();
  local.setItem(`cs-media-${UID}`, JSON.stringify([photo(1), photo(2), photo(3), clip(1), clip(2), clip(3)]));
  local.setItem(`cs-media-sets-${UID}`, JSON.stringify([{ name: "Work and career", kind: "photos", createdAt: "" }, { name: "City clips", kind: "clips", createdAt: "" }]));
  session.setItem(`cs-narrated-draft-${UID}`, JSON.stringify({
    topic: "Co-pays", script: "", link: "", seconds: 30, photosFrom: "Work and career",
    scenes: [{ ...SCENE, photo: k(2) }, { ...SCENE, photo: k(1), miss: true }, { ...SCENE, photo: k(3) }],
  }));
});

describe("a narrated video from a photo set, for Leo", () => {
  it("offers the set beside Stock first and AI only, and ?set= picks it", () => {
    expect(pressed(html("/edit?panel=ai&kind=explainer"), "Pictures")).toEqual(["Stock first"]);
    const page = html("/edit?panel=ai&kind=explainer&set=Work+and+career");
    expect(page).toContain("Work and career (free)");
    expect(pressed(page, "Pictures")).toEqual(["Work and career (free)"]);
    // a clip set is not a picture set
    expect(page).not.toContain("City clips (free)");
  });

  it("shows each scene's set photo with Swap, outlined where Jev said none fits, and makes with no AI picture while ai-video has none left", () => {
    const page = html("/edit?panel=ai&kind=explainer&set=Work+and+career");
    expect(page).toContain("Work and career: office desk 2");
    expect((page.match(/>Swap<\/button>/g) ?? []).length).toBe(3);
    const swaps = [...page.matchAll(/<button[^>]*>Swap<\/button>/g)].map((m) => m[0]);
    expect(swaps.map((b) => b.includes("border border-input"))).toEqual([false, true, false]);
    expect(page).not.toContain("AI picture</span>");
    expect(page).not.toContain("made by AI");
    expect(page).toContain("3 scenes, about 6 seconds. Uses 1 voiceover. Pictures from your set are free.");
    expect(makeButton(page)).not.toContain(`disabled=""`);
  });

  it("is today's video when Stock first or AI only is picked: AI pictures, the AI line, and Make held by ai-video", () => {
    const page = html("/edit?panel=ai&kind=explainer&visuals=ai");
    expect(page).not.toContain(">Swap</button>");
    expect(page).toContain("The people in the AI pictures are made by AI.");
    expect(makeButton(page)).toContain(`disabled=""`);
  });

  it("waits for the set's photos before Make when they came from another set", () => {
    local.setItem(`cs-media-sets-${UID}`, JSON.stringify([{ name: "Work and career", kind: "photos", createdAt: "" }, { name: "Desk", kind: "photos", createdAt: "" }]));
    local.setItem(`cs-media-${UID}`, JSON.stringify([photo(1), photo(2), photo(3), ...[4, 5, 6].map((n) => ({ ...photo(n), folder: "Desk" }))]));
    expect(makeButton(html("/edit?panel=ai&kind=explainer&set=Desk"))).toContain(`disabled=""`);
  });
});

describe("a montage from a clip set, for Leo", () => {
  it("offers Free stock and each clip set, and ?set= picks it", () => {
    expect(pressed(html("/edit?panel=ai&kind=montage"), "Clips from")).toEqual(["Free stock"]);
    const page = html("/edit?panel=ai&kind=montage&set=City+clips");
    expect(pressed(page, "Clips from")).toEqual(["City clips"]);
    expect(page).not.toContain(">Work and career<");
    expect(pressed(html("/edit?panel=ai&kind=montage&set=Work+and+career"), "Clips from")).toEqual(["Free stock"]);
  });
});
