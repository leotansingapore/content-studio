// The AI panel's template form serves everyone. Rendered to markup in node (no effects run): a session that isn't
// Leo's draws each product template's form exactly as it did before brand-products, a ?product= link included
// (sha256 of the markup, pinned on today's code at b65fc14f).
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

const { default: AiVideo } = await import("./AiVideo");
const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(AiVideo, { onClose: () => undefined })));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const PINNED = {
  "ugc-creator-review": "393ebbab882d2f7b6635dac454bfa289635e3dcfc905944bf2f691d09089d94c",
  "product-commercial-shotlist": "12a9cf23fa24329f581689a7fe3cb3be18db83ccf67380e06043948e20530333",
  "timeline-shot-script": "cd7c803573178e3976064f9abce93a8a2e1abefc9093e3d8177cfd75281ec37c",
  "food-asmr": "e4b3e12a19230292f35d4c5ad9404cce0ada3c03f1361d68b2bb24cf6049f56e",
  "pov-continuous-take": "7dce37740c59062d4f9b512d4ef144a44a4493d73a334313373a34cced493f79",
};

describe("everyone else's template form", () => {
  it("draws as before for every template with a product slot, with or without ?product=", () => {
    for (const [t, hash] of Object.entries(PINNED)) {
      const at = `/edit?panel=ai&kind=template&template=${t}`;
      const form = html(at);
      expect(form).toContain("Make the clip");
      expect(form).toContain("Photo of the product");
      expect(sha(form)).toBe(hash);
      expect(html(`${at}&product=pd-lq3k9z`)).toBe(form);
    }
  });
});
