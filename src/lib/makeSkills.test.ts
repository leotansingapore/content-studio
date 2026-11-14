import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
  clear: () => store.clear(),
});
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

const { FORMATS, formatHref } = await import("@/data/formats");
const { STATIC_FORMATS } = await import("@/data/staticFormats");
const { BUILT_IN_SKILLS } = await import("@/lib/chatSkills");
const { groupedPages, section } = await import("@/lib/nav");
const { productsKey } = await import("@/lib/products");
const m = await import("./makeSkills");
const { SKILLS, KIND_TABS, agentAsk, answersFor, findSkills, loadFlow, openHref, questionsFor, saveFlow, skillById, stepOf, takesOf } = m;

const U = "6d80f027-3395-480c-86a1-8827d3d6cce3";
afterEach(() => store.clear());

describe("the make skills catalogue", () => {
  it("is derived: every Create page but the gallery, every ready format and every ready static ad is in it once", () => {
    const pages = groupedPages(section("write").pages).filter((p) => p.group === "Create" && p.to !== "/make");
    for (const p of pages) expect(SKILLS.some((s) => s.href === p.to), p.to).toBe(true);
    // a ready format is its own skill or joined to the page it is made on
    for (const f of FORMATS.filter((x) => x.ready)) {
      const href = formatHref(f);
      expect(SKILLS.some((s) => s.href === href || s.href === f.opens?.() || s.was.includes(f.name) || s.name === f.name), f.slug).toBe(true);
    }
    for (const f of STATIC_FORMATS.filter((x) => x.ready)) expect(SKILLS.some((s) => s.href === `/make/static/${f.slug}`), f.slug).toBe(true);
    // a format not ready yet is left out
    for (const f of FORMATS.filter((x) => !x.ready)) expect(SKILLS.some((s) => s.name === f.name), f.slug).toBe(false);
  });

  it("gives every skill its own id, never a ready-made chat skill's slash", () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BUILT_IN_SKILLS) expect(ids).not.toContain(b.slash);
    // Answer the page steps aside for /answer, the chat skill; the short video script for Leo's Scriptwriter
    expect(skillById("answer-a-question")?.href).toBe("/generate/answer");
    expect(skillById("script")?.href).toBe("/script");
    expect(skillById("short-video-script")?.agentFormat).toBe("script");
  });

  it("joins a format to the page it is made on, and marks the ones the agent makes itself", () => {
    expect(SKILLS.filter((s) => s.name === "Slideshow")).toHaveLength(1);
    expect(skillById("slideshow")).toMatchObject({ href: "/slideshow", agentFormat: "slideshow", poster: { slug: "slideshow" } });
    expect(skillById("post")?.agentFormat).toBe("post");
    expect(SKILLS.some((s) => s.name === "Text post")).toBe(false);
    expect(skillById("carousel")?.agentFormat).toBe("carousel");
    expect(skillById("talking-head")).toMatchObject({ agentFormat: "speaking", lengths: [8, 15, 20, 30] });
    // a static ad is the agent's layout card, with its page beside it and a 4:5 example
    expect(skillById("text-chat")).toMatchObject({ kind: "Static ads", agentFormat: "image", staticSlug: "text-chat", href: "/make/static/text-chat", poster: { ratio: "4/5" } });
    // a video format opens straight on its form in the editor, unless its own page makes it
    expect(skillById("look-clay")?.href).toBe("/edit?panel=ai&kind=explainer&look=clay");
    expect(skillById("news-anchor")).toMatchObject({ href: "/make/news-anchor", takes: { about: "topic", presenter: "who", length: "length" }, lengths: [8, 15, 20, 30] });
    expect(skillById("template-unboxing")).toMatchObject({ href: "/make/template-unboxing", takes: { product: "product", length: "length" }, lengths: [4, 8] });
    expect(skillById("template-street-interview")).toMatchObject({ href: "/make/template-street-interview", takes: { length: "length" } });
  });

  it("hands a format made on its own page the answers in that page's own params", () => {
    expect(openHref(skillById("news-anchor")!, { about: "Car insurance", presenter: "mine", length: "30" })).toBe("/make/news-anchor?topic=Car+insurance&who=mine&length=30");
    expect(openHref(skillById("template-unboxing")!, { product: "pd-brew1", length: "" })).toBe("/make/template-unboxing?product=pd-brew1");
    expect(questionsFor(skillById("stage-talk")!, U).map((q) => q.id)).toEqual(["about", "presenter", "length"]);
  });

  it("files every skill under one of the picker's tabs and finds it by a word of its name, line or old names", () => {
    expect(KIND_TABS.map((t) => t.label)).toEqual(["All", "Words", "Slides and pictures", "Video", "Static ads"]);
    for (const s of SKILLS) expect(KIND_TABS.slice(1).map((t) => t.label), s.id).toContain(s.kind);
    expect(findSkills(SKILLS, "static", "").every((s) => s.kind === "Static ads")).toBe(true);
    expect(findSkills(SKILLS, "static", "").length).toBe(STATIC_FORMATS.filter((f) => f.ready).length);
    expect(findSkills(SKILLS, "all", "whiteboard chat").map((s) => s.id)).toEqual([]);
    expect(findSkills(SKILLS, "all", "clay").map((s) => s.id)).toContain("look-clay");
    // its old name: the VSL
    expect(findSkills(SKILLS, "words", "vsl").map((s) => s.href)).toEqual(["/generate/vsl"]);
  });
});

describe("what a maker's address takes", () => {
  it("reads the editor's kinds and panels, and the pages that take a topic", () => {
    expect(takesOf("/edit?panel=ai&kind=explainer&look=clay")).toEqual({ about: "topic", length: "secs" });
    expect(takesOf("/edit?panel=ai&kind=avatar&talk=news")).toEqual({ presenter: "face" });
    expect(takesOf("/edit?panel=ai&kind=template&template=unboxing", "product-photo")).toEqual({ product: "product" });
    expect(takesOf("/edit?panel=ai&kind=template&template=food-asmr")).toEqual({});
    expect(takesOf("/edit?panel=clips")).toEqual({ about: "about" });
    expect(takesOf("/edit")).toEqual({});
    expect(takesOf("/make/static/whiteboard")).toEqual({ about: "note", angle: "angle", product: "product" });
    expect(takesOf("/clone")).toEqual({ about: "url" });
    expect(takesOf("/design")).toEqual({});
  });
});

describe("a skill's questions", () => {
  const product = (id: string, name: string) => ({ id, name, what: "", forWho: "", pictures: [], sources: [], use: true, from: "you", addedAt: "" });

  it("asks a static ad what it is about, its angle, and its product only when the brand has one", () => {
    const s = skillById("whiteboard")!;
    expect(questionsFor(s, U).map((q) => q.id)).toEqual(["about", "angle"]);
    store.set(productsKey(U), JSON.stringify({ items: [product("pd-brew1", "Cold brew")] }));
    const qs = questionsFor(s, U);
    expect(qs.map((q) => [q.id, q.required, q.typed])).toEqual([["about", true, true], ["angle", false, false], ["product", false, false]]);
    expect(qs[1].options).toHaveLength(12);
    expect(qs[2].options).toEqual([{ value: "pd-brew1", label: "Cold brew" }]);
  });

  it("asks a talking video who appears and how long, and a page with nothing to fill asks nothing", () => {
    const qs = questionsFor(skillById("talking-head")!, U);
    expect(qs.map((q) => q.id)).toEqual(["about", "presenter", "length"]);
    expect(qs[1].options.at(-1)).toEqual({ value: "presenter", label: "A new AI presenter" });
    expect(qs[2].options.map((o) => o.label)).toEqual(["8 seconds", "15 seconds", "20 seconds", "30 seconds"]);
    expect(questionsFor(skillById("video-editor")!, U)).toEqual([]);
    expect(questionsFor(skillById("answer-a-question")!, U)[0].ask).toBe("What do people ask you?");
    for (const s of SKILLS) expect(questionsFor(s, U).length, s.id).toBeLessThanOrEqual(3);
  });

  it("opens on the first question without an answer, a skip counting as one, and never past a blank required one", () => {
    const qs = questionsFor(skillById("talking-head")!, U);
    expect(stepOf(qs, {}, null)).toBe(1);
    expect(stepOf(qs, { about: "  " }, null)).toBe(1);
    expect(stepOf(qs, { about: "CPF", presenter: "" }, null)).toBe(3);
    expect(stepOf(qs, { about: "CPF", presenter: "", length: "15" }, null)).toBe(4);
    // the address may go back, never past what is answered
    expect(stepOf(qs, { about: "CPF", presenter: "" }, 1)).toBe(1);
    expect(stepOf(qs, { about: "CPF" }, 3)).toBe(2);
    expect(stepOf(qs, {}, 0)).toBe(1);
  });
});

describe("where the answers go", () => {
  it("puts them in the maker's own params, leaving skipped ones out", () => {
    expect(openHref(skillById("whiteboard")!, { about: "Lunch at the desk", angle: "Bust a myth", product: "" })).toBe("/make/static/whiteboard?note=Lunch+at+the+desk&angle=Bust+a+myth");
    expect(openHref(skillById("look-clay")!, { about: "CPF LIFE", length: "60" })).toBe("/edit?panel=ai&kind=explainer&look=clay&topic=CPF+LIFE&secs=60");
    expect(openHref(skillById("video-editor")!, {})).toBe("/edit");
  });

  it("sends the agent the format's topic, length and who appears", () => {
    expect(agentAsk(skillById("slideshow")!, { about: " three  CPF myths " })).toEqual({ text: "Slideshow: three CPF myths", topic: "three CPF myths" });
    expect(agentAsk(skillById("talking-head")!, { about: "CPF", presenter: "presenter", length: "30" })).toEqual({ text: "Talking head: CPF", topic: "CPF", length: 30, who: "presenter" });
    // a skipped length takes the talking video's default
    expect(agentAsk(skillById("talking-head")!, { about: "CPF", presenter: "", length: "" }).length).toBe(15);
  });

  it("sends a static ad's layout, angle, product and its page with the answers", () => {
    expect(agentAsk(skillById("whiteboard")!, { about: "Desks", angle: "Bust a myth", product: "" })).toEqual({
      text: "Whiteboard: Desks", topic: "Desks", layout: "whiteboard", angle: "Bust a myth", skill: "whiteboard", page: "/make/static/whiteboard?note=Desks&angle=Bust+a+myth",
    });
  });

  it("keeps one skill's answers on this device, under a synced key, and none for another skill", () => {
    expect(saveFlow(U, { skill: "whiteboard", answers: { about: "Desks" }, at: "2026-11-13T00:00:00.000Z" })).toBe(true);
    expect([...store.keys()].some((k) => k.startsWith("content-studio-makeflow-"))).toBe(true);
    expect(loadFlow(U)?.answers).toEqual({ about: "Desks" });
    expect(answersFor(U, "whiteboard")).toEqual({ about: "Desks" });
    expect(answersFor(U, "text-chat")).toEqual({});
    saveFlow(U, null);
    expect(loadFlow(U)).toBeNull();
  });
});
