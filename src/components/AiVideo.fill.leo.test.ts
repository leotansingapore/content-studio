// Leo's Ask each time hand-over (live-p5dog day 2, D7): a campaign's AI video post opens You speaking on its scheduled
// draft, and "What you say" opened empty because the panel was busy picking up another post's paid video. The post's
// script now fills the box from the first paint, busy or not; Make stays off while the other video is made.
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
vi.mock("@/lib/aiUsage", () => ({ useUsesLeft: () => () => 1 }));
const ai = vi.hoisted(() => ({ job: null as null | { kind: string; state: string; step: string } }));
vi.mock("@/lib/aiVideo", async (orig) => ({ ...(await orig<typeof import("@/lib/aiVideo")>()), aiJob: () => ai.job }));

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
};
const local = mem();
const session = mem();
vi.stubGlobal("localStorage", local);
vi.stubGlobal("sessionStorage", session);
vi.stubGlobal("window", { localStorage: local, sessionStorage: session, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {}, location: { search: "" } });

const { saveDrafts } = await import("@/lib/draftHistory");
const { default: AiVideo } = await import("./AiVideo");
const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(AiVideo, { onClose: () => undefined })));

const SCRIPT = "Before, follow-ups can sit apart from client chats. Now, keep them as tasks in the app you use to manage clients and chats.";
const AT = "/edit?panel=ai&kind=avatar&draft=cmp_c-1_18";
const box = (markup: string) => /<textarea[^>]*aria-label="What you say"[^>]*>([^<]*)<\/textarea>/.exec(markup)?.[1] ?? null;

beforeEach(() => {
  local.clear();
  saveDrafts(UID, [{
    id: "cmp_c-1_18", createdAt: "2026-10-23T02:58:30.000Z", hook: "Before, follow-ups can sit apart from client chats.",
    draft: `${SCRIPT}\n\n---\n\nCAPTION:\nSave this to revisit your follow-up workflow.`, pillar: "topic", pillarDetail: "", audience: "general",
    format: "short-video", platform: "instagram", ctaType: "save-share", status: "scheduled", scheduledFor: "2026-11-12T19:30",
  }]);
});

describe("You speaking opened from a post, for Leo", () => {
  it("holds the post's script while another paid video is being picked up", () => {
    ai.job = { kind: "avatar", state: "working", step: "Making your video, 1 of 2 parts ready. This takes a few minutes." };
    const markup = html(AT);
    expect(markup).toContain("Making your video, 1 of 2 parts ready.");
    expect(box(markup)).toBe(SCRIPT);
  });

  it("holds it with nothing running too", () => {
    ai.job = null;
    expect(box(html(AT))).toBe(SCRIPT);
  });
});
