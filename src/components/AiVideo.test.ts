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
  "ugc-creator-review": "2066e13268699140747137a139de40b0641b87ad17c5f4fff79e445c36f02a59",
  "product-commercial-shotlist": "6068f134eba231881a19f2b539fcb51190cffdbe92373195e44379ccfaa309e3",
  "timeline-shot-script": "fe93f385290c1974787199114203c98383bcf03933e4090b56ab2217282249c4",
  "food-asmr": "fd303bf64d9685c2f94463bfb73aa75b577d66effcd130b9ffea757c52811b81",
  "pov-continuous-take": "f02c40087f7e73208c0c84bc1b12d589766399539e72150eb08b9ff2cdb1f8c7",
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
