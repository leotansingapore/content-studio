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

const { default: AiVideo, topicPlaceholder } = await import("./AiVideo");
const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(AiVideo, { onClose: () => undefined })));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const PINNED = {
  "ugc-creator-review": "753eec3f3eb36597ff7874a2352edeb16283692ee19cfb993bb191dc2fdd0232",
  "product-commercial-shotlist": "aa20525b9672fe5898e65af096c1c5cbf00ebb57398fa5827ed5088a8e92855f",
  "timeline-shot-script": "b08bdfab96c74c2ce351e11151e0b8b4dd4e36f26afe19a8015a2d765d50e889",
  "food-asmr": "cdba0f1172bd2ff4a83bf24612e8b640e5935b702a592a108bb52d3142664b40",
  "pov-continuous-take": "867b811d56611f6b174d17943223b59eb8480aa27779d0d70c932ff8110d72cb",
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

describe("the topic box's example", () => {
  it("keeps the adviser's for no profession and names any other work", () => {
    expect(topicPlaceholder("")).toBe("What it explains, like why a hospital plan has a co-pay");
    expect(topicPlaceholder("coach")).toBe("What it explains, like the question a coach gets asked most");
    expect(topicPlaceholder("accountant")).toContain("an accountant");
    expect(topicPlaceholder("real estate agent")).not.toContain("hospital");
  });
});
