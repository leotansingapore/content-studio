import { describe, expect, it } from "vitest";
import { AUDIENCE_TAGS, FEELINGS, HOOK_FAMILIES, PSYCHOLOGY, STRUCTURES, TAG_MIN, pickTag } from "./tags";

const lists = {
  HOOK_FAMILIES: HOOK_FAMILIES.map((t) => ({ id: t.id, label: t.name })),
  FEELINGS,
  AUDIENCE_TAGS,
  PSYCHOLOGY,
  STRUCTURES,
};

describe("the tag lists", () => {
  it("give every id once, with a label", () => {
    for (const [name, list] of Object.entries(lists)) {
      const ids = list.map((t) => t.id);
      expect(new Set(ids).size, name).toBe(ids.length);
      for (const t of list) expect(t.label.trim(), `${name} ${t.id}`).not.toBe("");
    }
  });

  it("hold the ids the brief names", () => {
    expect(HOOK_FAMILIES.map((t) => t.id)).toEqual(["problem", "desire", "curiosity", "proof", "audience", "offer", "instruction"]);
    expect(FEELINGS.map((t) => t.id)).toEqual(["worry", "hope", "relief", "pride", "curiosity", "urgency", "trust", "fun"]);
    expect(AUDIENCE_TAGS.map((t) => t.id)).toEqual(["fresh-grads", "young-adults", "parents", "families", "hnw", "business-owners", "advisors-recruitment", "general"]);
    expect(PSYCHOLOGY.map((t) => t.id)).toEqual(["curiosity", "fear-of-loss", "social-proof", "authority", "contrast", "identity", "story", "other"]);
    expect(STRUCTURES.map((t) => t.id)).toEqual(["list", "story", "how-to", "myth-bust", "opinion", "question", "announcement", "other"]);
    // the drop's blurb, so the drop and the scraped ads are judged on one list
    expect(HOOK_FAMILIES[0].criteria).toBe(
      "Opens on something wrong in the reader's life: regret, a gap never worked out, a number never checked, stuck or frustrated, the cost of doing nothing",
    );
    for (const t of HOOK_FAMILIES) expect(t.criteria, t.id).toMatch(/^Opens /);
  });
});

describe("pickTag", () => {
  const ids = FEELINGS.map((t) => t.id);

  it("keeps a pick at 0.5 or more", () => {
    expect(TAG_MIN).toBe(0.5);
    expect(pickTag({ choice: "worry", probabilities: { worry: 0.5, hope: 0.3 } }, ids)).toBe("worry");
    expect(pickTag({ choice: "hope", probabilities: { hope: 0.92 } }, ids)).toBe("hope");
  });

  it("gives null under 0.5", () => {
    expect(pickTag({ choice: "worry", probabilities: { worry: 0.49 } }, ids)).toBeNull();
  });

  it("gives null for an id not offered", () => {
    expect(pickTag({ choice: "anger", probabilities: { anger: 0.9 } }, ids)).toBeNull();
  });

  it("gives null with no answer or no probability for the pick", () => {
    expect(pickTag(undefined, ids)).toBeNull();
    expect(pickTag({}, ids)).toBeNull();
    expect(pickTag({ choice: "worry" }, ids)).toBeNull();
    expect(pickTag({ choice: "worry", probabilities: { hope: 0.9 } }, ids)).toBeNull();
  });

  it("takes another cut when the caller passes one", () => {
    const formulas = ["myth-bust", "none"];
    expect(pickTag({ choice: "myth-bust", probabilities: { "myth-bust": 0.42 } }, formulas, 0.4)).toBe("myth-bust");
    expect(pickTag({ choice: "myth-bust", probabilities: { "myth-bust": 0.42 } }, formulas)).toBeNull();
  });
});
