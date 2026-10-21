// Montage and the explainer serve everyone. Rendered to markup in node (no effects run): a session that isn't Leo's
// draws both exactly as before sets-in-video, and Leo's ?set= changes nothing (sha256 of the markup, pinned on today's
// code at 7cd872f4).
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

const MONTAGE = "22455626b40cac9e92ffbfcad0b869df47d06f51633075b011d78ae0c37d0384";
const EXPLAINER = "47eb27bb4aa3d4575ae78d029ef0e090e98daa65fac037c173164213ff08ea12";

describe("everyone else's montage and explainer", () => {
  it("draw as before, with no Clips from or set pills, and Leo's ?set= ignored", () => {
    const montage = html("/edit?panel=ai&kind=montage");
    expect(montage).toContain("Make the montage");
    expect(montage).not.toContain("Clips from");
    expect(sha(montage)).toBe(MONTAGE);
    expect(html("/edit?panel=ai&kind=montage&set=City+clips")).toBe(montage);

    const explainer = html("/edit?panel=ai&kind=explainer");
    expect(explainer).toContain("What the explainer is about");
    expect(explainer).not.toContain("(free)");
    expect(sha(explainer)).toBe(EXPLAINER);
    expect(html("/edit?panel=ai&kind=explainer&set=Work+and+career")).toBe(explainer);
  });
});
