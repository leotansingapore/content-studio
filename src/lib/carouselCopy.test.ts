import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
const { tightenSlides } = await import("@/lib/carouselCopy");

describe("Tighten keeps the brand kit's emoji policy", () => {
  const slides = [{ title: "Cover", body: "" }, { title: "Point", body: "" }, { title: "Point", body: "" }, { title: "DM me", body: "" }];
  invoke.mockResolvedValue({
    data: {
      slides: [{ title: "3 CPF moves 💰", body: "" }, { title: "Top up 🔑", body: "Early ✅" }, { title: "Review", body: "Yearly" }, { title: "DM me 👇", body: "" }],
      recap: { title: "Recap 📌", body: "Top up" },
    },
    error: null,
  });
  it("one at most across the carousel, the first kept", async () => {
    const out = await tightenSlides(slides, "instagram", true, "one");
    expect(out.slides.map((s) => s.title)).toEqual(["3 CPF moves 💰", "Top up", "Review", "DM me"]);
    expect(out.slides[1].body).toBe("Early");
    expect(out.recap?.title).toBe("Recap");
  });
  it("none, or left alone without a policy", async () => {
    expect((await tightenSlides(slides, "instagram", false, "none")).slides[0].title).toBe("3 CPF moves");
    expect((await tightenSlides(slides, "instagram", false)).slides[1].title).toBe("Top up 🔑");
  });
});
