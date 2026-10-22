import { describe, expect, it, vi } from "vitest";
import { formulaTemplate, hashtagAsk, insertHashtagMax, insertPlace, startersFor } from "@/lib/snippetInsert";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { blankRanges } from "@/lib/platformCounters";
import { hashtagMax } from "@/lib/brandRules";
import { capHashtags } from "../../supabase/functions/video-assist/captions.ts";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "https://x.supabase.co" }));

const draft = "Most people top up too late.\n\nHere is why.";

describe("insertPlace", () => {
  it("puts a hook first, on its own line", () => {
    expect(insertPlace("hook", draft, "I reviewed 40 plans this year.")).toEqual({
      text: "I reviewed 40 plans this year.\n\nMost people top up too late.\n\nHere is why.",
      caret: 30,
    });
  });

  it("puts an ending and a hashtag set on a new line at the end", () => {
    expect(insertPlace("ending", `${draft}\n`, "Save this.")).toEqual({ text: `${draft}\n\nSave this.`, caret: draft.length + 12 });
    expect(insertPlace("hashtags", draft, "#cpf #sg").text).toBe(`${draft}\n\n#cpf #sg`);
  });

  it("puts a line or a post template at the end, and a template fills an empty draft", () => {
    expect(insertPlace("line", draft, "Book a call.").text).toBe(`${draft} Book a call.`);
    expect(insertPlace("post", "", "Myth: [myth]\n\nFact: [fact]")).toEqual({ text: "Myth: [myth]\n\nFact: [fact]", caret: 26 });
    expect(insertPlace("hook", "  ", "Hook")).toEqual({ text: "Hook", caret: 4 });
  });

  it("a placed caret wins for every kind", () => {
    for (const kind of ["hook", "ending", "hashtags", "line", "post"] as const) {
      expect(insertPlace(kind, "Hi bye", "there", { start: 3, end: 3 })).toEqual({ text: "Hi there bye", caret: 8 });
    }
    expect(insertPlace("line", "Hi [link] bye", "wa.me/6591234567", { start: 3, end: 9 }).text).toBe("Hi wa.me/6591234567 bye");
  });
});

describe("formulaTemplate", () => {
  it("turns every {x} into an [x] blank that Write marks", () => {
    const f = HOOK_FORMULAS.find((x) => x.id === "contrarian")!;
    const t = formulaTemplate(f);
    expect(t).toBe("Most people say [common advice]. After [what you have seen], I disagree.");
    expect(blankRanges(t)).toHaveLength(2);
    for (const x of HOOK_FORMULAS) expect(formulaTemplate(x)).not.toMatch(/[{}]/);
  });
});

describe("hashtagAsk", () => {
  const eight = "#a #b #c #d #e #f #g #h";

  it("8 tags against a few policy asks, with a cut of 4", () => {
    const ask = hashtagAsk(eight, draft, hashtagMax({ hashtagPolicy: "few" }, "linkedin"));
    expect(ask).toEqual({ max: 4, n: 8, have: 0, keep: 4 });
    expect(capHashtags(eight, ask!.keep)).toBe("#a #b #c #d");
  });

  it("counts the hashtags already in the post, and asks nothing with no limit or when it fits", () => {
    expect(hashtagAsk("#a #b #c", "Post #x #y", 4)).toEqual({ max: 4, n: 3, have: 2, keep: 2 });
    expect(hashtagAsk("#a #b #c", "Post #x #y #z #w", 4)?.keep).toBe(0);
    expect(hashtagAsk(eight, draft, hashtagMax({}, "linkedin"))).toBeNull();
    expect(hashtagAsk("#a #b", draft, 4)).toBeNull();
    expect(hashtagAsk("#a", draft, 0)).toEqual({ max: 0, n: 1, have: 0, keep: 0 });
  });
});

describe("insertHashtagMax", () => {
  it("asks past 3 on LinkedIn, where Write's counter says 3 max, whatever looser limit the kit sets", () => {
    expect(insertHashtagMax(hashtagMax({}, "linkedin"), "linkedin")).toBe(3);
    expect(insertHashtagMax(hashtagMax({ hashtagPolicy: "few" }, "linkedin"), "linkedin")).toBe(3);
    expect(insertHashtagMax(hashtagMax({ hashtagPolicy: "none" }, "linkedin"), "linkedin")).toBe(0);
    // the live check's case: a 3-tag set on a LinkedIn draft that already has 4
    expect(hashtagAsk("#a #b #c", "Post #w #x #y #z", insertHashtagMax(hashtagMax({}, "linkedin"), "linkedin"))).toEqual({ max: 3, n: 3, have: 4, keep: 0 });
  });

  it("leaves the other platforms to the kit and their own caps", () => {
    expect(insertHashtagMax(hashtagMax({}, "instagram"), "instagram")).toBe(5);
    expect(insertHashtagMax(hashtagMax({ hashtagPolicy: "ten" }, "facebook"), "facebook")).toBe(10);
    expect(insertHashtagMax(hashtagMax({}, "facebook"), "facebook")).toBeUndefined();
  });
});

describe("startersFor", () => {
  it("puts the ending that matches the draft's call to action first", () => {
    expect(startersFor("book-call").map((e) => e.cta)).toEqual(["book-call", "dm-keyword", "comment-keyword", "save-share", "open-question"]);
    expect(startersFor("dm-keyword")[0].name).toBe("DM me a word");
    expect(startersFor("unknown")).toHaveLength(5);
  });
});
