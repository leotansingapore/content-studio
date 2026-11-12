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

const AVATAR = "56f249425e25a4dd4807d4bc15b22f44c685d6aa5e2f2a9e1f6e1d3395ed1697";
const PERSON: Record<string, string> = {
  "ugc-creator-review": "2066e13268699140747137a139de40b0641b87ad17c5f4fff79e445c36f02a59",
  "handheld-ugc-vlog": "bc6405390adda4b2f2d0442079378ccc241d56fbc38327a0c1baf88415379019",
  "timeline-shot-script": "fe93f385290c1974787199114203c98383bcf03933e4090b56ab2217282249c4",
  "character-reference-lock": "a84e39c6abab190a0b1d5c854a1b16224dfbf5c76907961e1df41ccc586aac57",
  "travel-city-walk": "c36a21b7bf2f4fae796706ba21f580989deceb74fd6ed6e137436406f692feda",
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
