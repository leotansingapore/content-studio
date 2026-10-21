// Leo's You speaking and person templates (people-in-videos): who speaks and the voice, rendered to markup in node
// (no effects run), from a saved face and presenters on this device. Stand-in pictures only, never a real person.
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
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => ({ id: UID, email: "leo@example.com" }), useLeoOnly: () => true }));
vi.spyOn(Math, "random").mockReturnValue(0);

const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: () => null, length: 0 };
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {}, location: { search: "" } });

const { default: AiVideo } = await import("./AiVideo");
const { saveFace, turnOffFace } = await import("@/lib/myFace");
const { keepPresenter, setWho } = await import("@/lib/presenters");

const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(AiVideo, { onClose: () => undefined })));
/** The pills in a group, by its label, and the pressed ones. */
const pillsIn = (markup: string, group: string, only?: "true") => {
  const g = markup.split(`aria-label="${group}"`)[1]?.split("</div>")[0] ?? "";
  return [...g.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]*(?:<!-- -->[^<]*)*)</g)].filter((m) => !only || m[1] === only).map((m) => m[2].replace(/<!-- -->/g, ""));
};
const pills = (markup: string, group: string) => pillsIn(markup, group);
const pressed = (markup: string, group: string) => pillsIn(markup, group, "true");
const FACE = `data:image/jpeg;base64,${Buffer.from("face").toString("base64")}`;
const COPY = `data:image/jpeg;base64,${Buffer.from("copy").toString("base64")}`;
const at = new Date(Date.UTC(2026, 9, 22, 1));
const face = () => saveFace(UID, { photo: FACE, photoHash: "ab".repeat(32), consent: { at: at.toISOString(), line: "I'm the person on camera.", heard: "4 8 2 1", token: "t.k" } }, at);
const keep = (name: string, s: number) => {
  const r = keepPresenter(UID, { name, look: "A Malay Singaporean woman in her 30s", url: "https://cdn.higgsfield.ai/soul/x.png", photo: COPY }, new Date(at.getTime() + s * 1000));
  if (r.ok === false) throw new Error(r.error);
  return r.presenter;
};
const AVATAR = "/edit?panel=ai&kind=avatar";

beforeEach(() => store.clear());

describe("who speaks, for Leo", () => {
  it("lists My face, each presenter and New presenter, never My photo, with the brand's Who appears pressed", () => {
    face();
    const mei = keep("Mei", 1);
    keep("Raj", 2);
    // the first kept presenter is the brand's default
    let m = html(AVATAR);
    expect(pills(m, "Who speaks")).toEqual(["My face", "Mei, AI", "Raj, AI", "New presenter"]);
    expect(pressed(m, "Who speaks")).toEqual(["Mei, AI"]);
    expect(m).toContain("The person is made by AI.");
    expect(m).not.toContain("My photo");
    expect(m).not.toContain("Use a photo of yourself");
    setWho(UID, "me");
    m = html(AVATAR);
    expect(pressed(m, "Who speaks")).toEqual(["My face"]);
    expect(m).toContain("Made by AI from your saved face.");
    expect(m).toContain(`src="${FACE}"`);
    setWho(UID, "ask");
    expect(pressed(html(AVATAR), "Who speaks")).toEqual([]);
    expect(html(AVATAR)).not.toContain("Save your face first");
    // ?face= wins over the brand's choice; one that is no longer here falls back to it
    expect(pressed(html(`${AVATAR}&face=${mei.id}`), "Who speaks")).toEqual(["Mei, AI"]);
    expect(pressed(html(`${AVATAR}&face=presenter`), "Who speaks")).toEqual(["New presenter"]);
    expect(html(`${AVATAR}&face=presenter`)).toContain("How your presenter looks");
    expect(pressed(html(`${AVATAR}&face=pr-gone`), "Who speaks")).toEqual([]);
  });

  it("offers My face only while it is on, and asks to save it first when it is picked without one", () => {
    expect(pills(html(AVATAR), "Who speaks")).toEqual(["New presenter"]);
    const m = html(`${AVATAR}&face=mine`);
    expect(pressed(m, "Who speaks")).toEqual(["My face"]);
    expect(m).toContain('href="/people?record=1"');
    expect(m).toContain("Save your face first");
    face();
    turnOffFace(UID);
    expect(pills(html(AVATAR), "Who speaks")).toEqual(["New presenter"]);
  });
});

describe("the voice, for Leo", () => {
  it("starts on alice, and My own voice swaps Make the voiceover for Record it and Upload audio", () => {
    let m = html(AVATAR);
    expect(pills(m, "Voice")[0]).toBe("My own voice");
    expect(pressed(m, "Voice")).toHaveLength(1);
    expect(pressed(m, "Voice")[0]).toMatch(/^Alice, /);
    expect(m).toContain("Make the voiceover");
    m = html(`${AVATAR}&voice=mine`);
    expect(pressed(m, "Voice")).toEqual(["My own voice"]);
    expect(m).not.toContain("Make the voiceover");
    expect(m).toContain("Record it");
    expect(m).toContain("Upload audio");
    expect(m).toContain('accept="audio/*"');
    expect(pressed(html(`${AVATAR}&voice=george`), "Voice")[0]).toMatch(/^George/);
  });
});

describe("person templates, for Leo", () => {
  it("put Use my face and Use {name} beside Photo of the person, and none beside a product", () => {
    face();
    keep("Mei", 1);
    const m = html("/edit?panel=ai&kind=template&template=handheld-ugc-vlog");
    expect(m).toContain("Photo of the person");
    expect(m).toContain("Use my face");
    expect(m).toContain("Use Mei");
    const product = html("/edit?panel=ai&kind=template&template=food-asmr");
    expect(product).not.toContain("Use my face");
    store.clear();
    expect(html("/edit?panel=ai&kind=template&template=handheld-ugc-vlog")).not.toContain("Use my face");
  });
});
