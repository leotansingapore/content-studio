// You speaking and the person templates serve everyone. Rendered to markup in node (no effects run): a session that
// isn't Leo's draws them exactly as before people-in-videos, and the Leo-only face and voice params change nothing
// (sha256 of the markup, pinned on today's code at ca211072).
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));
vi.mock("@/lib/useLeoOnly", () => ({ storedUser: () => undefined, useLeoUser: () => null, useLeoOnly: () => false }));
// the presenter look box starts on a random look
vi.spyOn(Math, "random").mockReturnValue(0);

const { default: AiVideo } = await import("./AiVideo");
const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(AiVideo, { onClose: () => undefined })));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const LEO_PARAMS = "&face=mine&voice=mine";

const AVATAR = "3500767aea23876bcc776c7c7d9fd879abd6de3324c3755966c2d1e246e7bce3";
const PERSON: Record<string, string> = {
  "ugc-creator-review": "753eec3f3eb36597ff7874a2352edeb16283692ee19cfb993bb191dc2fdd0232",
  "handheld-ugc-vlog": "e77a06c236a1068c6e8a69d4139ce3deed120f28ede9c72a9f218492ef4880bc",
  "timeline-shot-script": "b08bdfab96c74c2ce351e11151e0b8b4dd4e36f26afe19a8015a2d765d50e889",
  "character-reference-lock": "9ca582e037a475c1c923108c58729d2cf9da59f4ab3b0c3b72d3a8fe8c236327",
  "travel-city-walk": "46f30e16ace1068d5233c20f9d1dcb5472871863718656a7ecb0546a9c5e58a3",
};

describe("everyone else's You speaking", () => {
  it("draws as before: My photo and AI presenter, the premade voices, and Leo's params ignored", () => {
    const panel = html("/edit?panel=ai&kind=avatar");
    expect(panel).toContain("My photo");
    expect(panel).toContain("Use a photo of yourself, or of someone who agreed to it.");
    expect(panel).not.toContain("My face");
    expect(panel).not.toContain("My own voice");
    expect(sha(panel)).toBe(AVATAR);
    expect(html(`/edit?panel=ai&kind=avatar${LEO_PARAMS}&face=pr-lq3k9z`)).toBe(panel);
  });
});

describe("everyone else's person templates", () => {
  it("draw as before, with no Use my face, and Leo's params ignored", () => {
    for (const [t, hash] of Object.entries(PERSON)) {
      const at = `/edit?panel=ai&kind=template&template=${t}`;
      const form = html(at);
      expect(form).toContain("Photo of the person");
      expect(form).not.toContain("Use my face");
      expect(sha(form)).toBe(hash);
      expect(html(`${at}${LEO_PARAMS}`)).toBe(form);
    }
  });
});
