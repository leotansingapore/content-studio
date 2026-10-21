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
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false }));
// the presenter look box starts on a random look
vi.spyOn(Math, "random").mockReturnValue(0);

const { default: AiVideo } = await import("./AiVideo");
const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(AiVideo, { onClose: () => undefined })));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const LEO_PARAMS = "&face=mine&voice=mine";

const AVATAR = "56f249425e25a4dd4807d4bc15b22f44c685d6aa5e2f2a9e1f6e1d3395ed1697";
const PERSON: Record<string, string> = {
  "ugc-creator-review": "393ebbab882d2f7b6635dac454bfa289635e3dcfc905944bf2f691d09089d94c",
  "handheld-ugc-vlog": "d960c4ee634e68d40a69299c260e11db0ce0c7009d9c3d6e99b5c984ff99debb",
  "timeline-shot-script": "cd7c803573178e3976064f9abce93a8a2e1abefc9093e3d8177cfd75281ec37c",
  "character-reference-lock": "9755ff8fe2dc1c231429a3b7733b9fac5ebb459910417b4ac1d9c4e1e59da0f0",
  "travel-city-walk": "72724979da3e166ddf341403bfa4dbc43e726bcb575e13cb7a3a64167391e8df",
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
