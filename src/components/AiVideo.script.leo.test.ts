// Leo's presenter script chip (formats-presenter, live check 22 Oct): after Write it for me, the chip said "9 left after
// this" with 1 of 10 used, while the voiceover chip beside it counted. useUsesLeft reads the counts again each time its
// busy goes back to false, so the panel's busy must be true while a script is being written, as it is for a voiceover.
// Rendered to markup in node (no effects run).
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
const usage = vi.hoisted(() => vi.fn((_busy: boolean) => (_f: string) => 9));
vi.mock("@/lib/aiUsage", () => ({ useUsesLeft: usage }));
const script = vi.hoisted(() => ({ job: null as null | { id: number; talk: string; state: string; topic: string } }));
vi.mock("@/lib/presenter", async (orig) => ({ ...(await orig<typeof import("@/lib/presenter")>()), talkScript: () => script.job }));

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
const AT = "/edit?panel=ai&kind=avatar&talk=news";

beforeEach(() => {
  usage.mockClear();
  script.job = null;
});

describe("the presenter's script chip, for Leo", () => {
  it("holds the counts while a script is written, so they are read again once it lands", () => {
    script.job = { id: 1, talk: "news", state: "writing", topic: "Busy days make follow-ups easy to miss" };
    expect(html(AT)).toContain("Write it for me");
    expect(usage.mock.calls.map(([busy]) => busy)).toContain(true);
  });

  it("reads them with nothing running", () => {
    expect(html(AT)).toContain("Write it for me");
    expect(usage.mock.calls.map(([busy]) => busy)).not.toContain(true);
  });
});
